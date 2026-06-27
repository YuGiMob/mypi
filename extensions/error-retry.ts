import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Centralized auto-retry for transient AUTH errors (401 / "unauthorized" /
 * "身份验证失败" / "invalid api key") from cloud relays. These relays occasionally
 * return a 401 as a glitch rather than a genuine bad-key failure, so a short
 * backoff can recover — pi's built-in retry only covers transient errors
 * (5xx / overloaded / rate-limit), NOT auth, so 401s would otherwise just fail.
 *
 * IMPORTANT: pi loads extensions only at startup (or after `/reload`). Editing
 * this file does NOT affect a running session until you `/reload`. Run
 * `/retry-status` to confirm this extension is loaded.
 *
 * The provider is read from the failing message's own `provider` field, which is
 * always populated (unlike `ctx.model`, which is not guaranteed at `agent_end`).
 *
 * Tune RELAY_PROVIDERS to your providers, or set it to null to retry 401s from
 * every provider.
 */
const RELAY_PROVIDERS: ReadonlySet<string> | null = new Set([
  "vsllm",
  "vsllm-anthropic",
  "freetheai",
  "ollama-cloud",
]);

const AUTH_ERR =
  /\b401\b|"type"\s*:\s*"<nil>"|unauthorized|invalid[\s_-]?api[\s_-]?key|身份验证失败/i;

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 5_000;
const MAX_DELAY_MS = 30_000;
const RETRY_MESSAGES = ["ok", "continue"];

let attempts = 0;
let resending = false;
let lastProvider = "(none)";
let lastError = "(none)";

function backoffMs(attempt: number): number {
  return Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS);
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    ctx.ui.notify(
      `error-retry active — retrying auth (401) errors from: ${RELAY_PROVIDERS ? [...RELAY_PROVIDERS].join(", ") : "all providers"}`,
      "info",
    );
  });

  pi.registerCommand("retry-status", {
    description: "Show whether the error-retry extension is loaded and its current state",
    handler: async (_args, ctx) => {
      ctx.ui.notify(
        `error-retry loaded. attempts=${attempts}/${MAX_ATTEMPTS} · last=${lastProvider}: ${lastError.slice(0, 80)}`,
        "info",
      );
    },
  });

  pi.on("agent_end", async (event, ctx) => {
    const msgs = event.messages ?? [];
    let lastAssistant:
      | { role?: string; provider?: string; stopReason?: string; errorMessage?: string }
      | undefined;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === "assistant") {
        lastAssistant = msgs[i];
        break;
      }
    }
    if (!lastAssistant || lastAssistant.stopReason !== "error") return;

    const provider = lastAssistant.provider ?? "(unknown)";
    const errorMessage = String(lastAssistant.errorMessage ?? "");
    lastProvider = provider;
    lastError = errorMessage;

    if (!AUTH_ERR.test(errorMessage)) {
      console.error(
        `[error-retry] non-auth error from ${provider}, not retrying: ${errorMessage.slice(0, 140)}`,
      );
      return;
    }
    if (RELAY_PROVIDERS && !RELAY_PROVIDERS.has(provider)) {
      console.error(`[error-retry] auth error from ${provider} not in relay set, not retrying`);
      return;
    }

    if (attempts >= MAX_ATTEMPTS) {
      ctx.ui.notify(
        `Auth error from ${provider} after ${MAX_ATTEMPTS} auto-retries. Check the API key or resend manually.`,
        "error",
      );
      return;
    }

    attempts++;
    const delayMs = backoffMs(attempts);
    const msg = `Auth error (401) from ${provider} — auto-retry ${attempts}/${MAX_ATTEMPTS} in ${Math.round(delayMs / 1000)}s…`;
    ctx.ui.notify(msg, "warning");
    ctx.ui.setStatus("error-retry", msg);
    await new Promise((r) => setTimeout(r, delayMs));
    ctx.ui.setStatus("error-retry", undefined);

    resending = true;
    pi.sendUserMessage(RETRY_MESSAGES[(attempts - 1) % RETRY_MESSAGES.length], { deliverAs: "followUp" });
  });

  pi.on("before_agent_start", () => {
    if (resending) {
      // This turn is our auto-retry; keep the attempt count rolling.
      resending = false;
    } else {
      // A genuine user turn; reset the retry counter.
      attempts = 0;
    }
  });
}
