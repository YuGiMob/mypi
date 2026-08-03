import type { ExtensionAPI, SessionEntry } from "@earendil-works/pi-coding-agent";
import { getMessages } from "./lib/messages.js";

const ANALYSIS_PHASE = ["1", "2", "3", "6", "5"];
const REVIEW_SEQUENCE = ["8", "9"];
const DEFAULT_ROUNDS = 2;
const MAX_ROUNDS = 5;
const SEND_START_TIMEOUT_MS = 5000;
const SEND_MAX_ATTEMPTS = 3;
const SEND_POLL_INTERVAL_MS = 25;

function parseRounds(args: string): number {
  const value = Number.parseInt(args.trim(), 10);
  if (!Number.isFinite(value) || value < 1) return DEFAULT_ROUNDS;
  return Math.min(value, MAX_ROUNDS);
}

function userMessageText(entry: SessionEntry): string | undefined {
  if (entry.type !== "message" || entry.message.role !== "user") return undefined;
  const content = entry.message.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return (content as any[])
      .filter((block: any) => block?.type === "text")
      .map((block: any) => block.text ?? "")
      .join("");
  }
  return undefined;
}

function countLeadingPhaseMatches(entries: SessionEntry[], expected: string[]): number {
  let matched = 0;
  for (const entry of entries) {
    const text = userMessageText(entry);
    if (text !== undefined && matched < expected.length && text === expected[matched]) {
      matched++;
    }
  }
  return matched;
}

function findPostAnalysisAnchor(entries: SessionEntry[], analysisText: string): SessionEntry | undefined {
  let firstUserIndex = -1;
  let analysisIndex = -1;
  for (let i = 0; i < entries.length; i++) {
    const text = userMessageText(entries[i]);
    if (text === undefined) continue;
    if (firstUserIndex === -1) firstUserIndex = i;
    if (analysisIndex === -1 && text === analysisText) analysisIndex = i;
  }
  const anchorIndex = analysisIndex !== -1 ? analysisIndex : firstUserIndex;
  if (anchorIndex === -1) return undefined;
  for (let i = anchorIndex + 1; i < entries.length; i++) {
    if (userMessageText(entries[i]) !== undefined) {
      return entries[i - 1];
    }
  }
}

function countUserTextMatches(entries: SessionEntry[], text: string): number {
  return entries.filter((entry) => userMessageText(entry) === text).length;
}

async function sendAndWaitForTurn(
  pi: ExtensionAPI,
  ctx: { isIdle(): boolean; waitForIdle(): Promise<void>; sessionManager: { getBranch(): SessionEntry[] } },
  text: string,
): Promise<boolean> {
  for (let attempt = 0; attempt < SEND_MAX_ATTEMPTS; attempt++) {
    const before = countUserTextMatches(ctx.sessionManager.getBranch(), text);
    pi.sendUserMessage(text, { deliverAs: "followUp" });
    const deadline = Date.now() + SEND_START_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (countUserTextMatches(ctx.sessionManager.getBranch(), text) > before) {
        await ctx.waitForIdle();
        return true;
      }
      if (!ctx.isIdle()) {
        await ctx.waitForIdle();
        if (countUserTextMatches(ctx.sessionManager.getBranch(), text) > before) return true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, SEND_POLL_INTERVAL_MS));
    }
  }
  return false;
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("workflow", {
    description: "Run the improvement workflow: analysis messages 1-3, 6, 5, then review rounds of messages 8-9 with context resets",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("/workflow requires interactive mode", "error");
        return;
      }
      const messages = getMessages();
      const missing = [...ANALYSIS_PHASE, ...REVIEW_SEQUENCE].filter((num) => !messages[num]);
      if (missing.length > 0) {
        ctx.ui.notify(`Missing messages in messages.json: ${missing.join(", ")}`, "error");
        return;
      }
      const rounds = parseRounds(args);
      try {
        ctx.ui.setWorkingMessage("Waiting for queued messages to complete...");
        await ctx.waitForIdle();
        const analysisTexts = ANALYSIS_PHASE.map((num) => messages[num]!);
        const matched = countLeadingPhaseMatches(ctx.sessionManager.getBranch(), analysisTexts);
        for (const num of ANALYSIS_PHASE.slice(matched)) {
          ctx.ui.setWorkingMessage(`Sending message ${num}...`);
          const sent = await sendAndWaitForTurn(pi, ctx, messages[num]!);
          if (!sent) {
            ctx.ui.notify(`Failed to send message ${num}`, "error");
            return;
          }
        }
        const anchor = findPostAnalysisAnchor(ctx.sessionManager.getBranch(), messages["1"]!);
        if (!anchor) {
          ctx.ui.notify("Could not find the analysis phase in the session", "error");
          return;
        }
        for (let round = 1; round <= rounds; round++) {
          ctx.ui.setWorkingMessage(`Round ${round}/${rounds}: staging changes...`);
          const addResult = await pi.exec("git", ["add", "."]);
          if (addResult.code !== 0) {
            ctx.ui.notify(`git add failed: ${addResult.stderr}`, "error");
            return;
          }
          ctx.ui.setWorkingMessage(`Round ${round}/${rounds}: resetting context to post-analysis state...`);
          const navigation = await ctx.navigateTree(anchor.id, { summarize: false });
          if (navigation.cancelled) {
            ctx.ui.notify("Workflow cancelled", "warning");
            return;
          }
          for (const num of REVIEW_SEQUENCE) {
            ctx.ui.setWorkingMessage(`Round ${round}/${rounds}: sending message ${num}...`);
            const sent = await sendAndWaitForTurn(pi, ctx, messages[num]!);
            if (!sent) {
              ctx.ui.notify(`Failed to send message ${num}`, "error");
              return;
            }
          }
        }
        ctx.ui.notify(`Workflow complete: ${rounds} review round${rounds === 1 ? "" : "s"}`, "info");
      } finally {
        ctx.ui.setWorkingMessage();
      }
    },
  });
}
