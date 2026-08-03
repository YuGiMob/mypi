import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock("@earendil-works/pi-coding-agent", () => ({}));

const MSG1 = "Read the entirety of the codebase";
const MSG2 = "inform me about all of the improvements";
const MSG3 = "Are these improvements actually adding value";
const MSG6 = "Implement all of the changes worth implementing";
const MSG5 = "take a look at the git status and git diff";
const MSG8 = "take a closer look at all of the changes";
const MSG9 = "If your review found any issues with the staged changes, fix them now";

const MESSAGES = { "1": MSG1, "2": MSG2, "3": MSG3, "6": MSG6, "5": MSG5, "8": MSG8, "9": MSG9 };

function userEntry(id: string, text: string) {
  return {
    id,
    type: "message",
    parentId: null,
    timestamp: "1",
    message: { role: "user", content: text },
  };
}

function assistantEntry(id: string) {
  return {
    id,
    type: "message",
    parentId: null,
    timestamp: "1",
    message: { role: "assistant", content: "response" },
  };
}

function toolResultEntry(id: string) {
  return {
    id,
    type: "message",
    parentId: null,
    timestamp: "1",
    message: { role: "toolResult", content: [{ type: "text", text: "result" }] },
  };
}

function fullPhaseA() {
  return [
    userEntry("u1", MSG1),
    assistantEntry("a1"),
    userEntry("u2", MSG2),
    assistantEntry("a2"),
    userEntry("u3", MSG3),
    assistantEntry("a3"),
    userEntry("u6", MSG6),
    assistantEntry("a6"),
    userEntry("u5", MSG5),
    assistantEntry("a5"),
  ];
}

function createCtx(entries: any[] = [], overrides: Record<string, any> = {}) {
  holder.branch = [...entries];
  holder.state.active = false;
  return {
    hasUI: true,
    ui: { notify: vi.fn(), setWorkingMessage: vi.fn() },
    isIdle: vi.fn(() => !holder.state.active),
    waitForIdle: vi.fn(async () => {
      holder.state.active = false;
    }),
    navigateTree: vi.fn(async () => ({ cancelled: false })),
    sessionManager: { getBranch: vi.fn(() => holder.branch) },
    ...overrides,
  };
}

const holder: { branch: any[]; state: { active: boolean } } = { branch: [], state: { active: false } };
describe("workflow extension", () => {
  let pi: any;
  let command: any;

  beforeEach(async () => {
    pi = {
      registerCommand: vi.fn((name: string, cmd: any) => {
        command = { name, cmd };
      }),
      sendUserMessage: vi.fn((content: string) => {
        const id = String(holder.branch.length);
        holder.branch.push(userEntry(`u${id}`, content));
        holder.branch.push(assistantEntry(`a${id}`));
        holder.state.active = true;
      }),
      exec: vi.fn(async () => ({ code: 0, stdout: "", stderr: "" })),
    };
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(MESSAGES));
    const mod = await import("../workflow.js");
    mod.default(pi);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("registers a command named workflow", () => {
    expect(command.name).toBe("workflow");
  });

  it("requires interactive mode", async () => {
    const ctx = createCtx([], { hasUI: false });
    await command.cmd.handler("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith("/workflow requires interactive mode", "error");
  });

  it("aborts when required messages are missing", async () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ "1": MSG1, "2": MSG2 }));
    const ctx = createCtx();
    await command.cmd.handler("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("Missing messages"), "error");
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
  });

  it("sends the full analysis phase when nothing is present yet", async () => {
    const ctx = createCtx([]);
    await command.cmd.handler("", ctx);
    const sent = pi.sendUserMessage.mock.calls.map((c: any[]) => c[0]);
    expect(sent).toEqual([MSG1, MSG2, MSG3, MSG6, MSG5, MSG8, MSG9, MSG8, MSG9]);
  });

  it("waits for pending turns before each send and before detection", async () => {
    const ctx = createCtx([]);
    await command.cmd.handler("", ctx);
    const sends = pi.sendUserMessage.mock.invocationCallOrder;
    const waits = ctx.waitForIdle.mock.invocationCallOrder;
    expect(sends).toHaveLength(9);
    expect(waits).toHaveLength(10);
    for (let i = 0; i < sends.length; i++) {
      expect(waits[i]).toBeLessThan(sends[i]!);
      expect(sends[i]).toBeLessThan(waits[i + 1]!);
    }
  });

  it("skips the analysis phase when all messages are already present", async () => {
    const ctx = createCtx(fullPhaseA());
    await command.cmd.handler("", ctx);
    const sent = pi.sendUserMessage.mock.calls.map((c: any[]) => c[0]);
    expect(sent).toEqual([MSG8, MSG9, MSG8, MSG9]);
  });

  it("continues the analysis phase from where it left off", async () => {
    const entries = [userEntry("u1", MSG1), assistantEntry("a1"), userEntry("u2", MSG2), assistantEntry("a2")];
    const ctx = createCtx(entries);
    await command.cmd.handler("", ctx);
    const sent = pi.sendUserMessage.mock.calls.map((c: any[]) => c[0]);
    expect(sent).toEqual([MSG3, MSG6, MSG5, MSG8, MSG9, MSG8, MSG9]);
  });

  it("stages changes and resets context before each review round", async () => {
    const ctx = createCtx(fullPhaseA());
    await command.cmd.handler("", ctx);
    expect(pi.exec).toHaveBeenCalledTimes(2);
    expect(pi.exec).toHaveBeenCalledWith("git", ["add", "."]);
    expect(ctx.navigateTree).toHaveBeenCalledTimes(2);
    expect(ctx.navigateTree).toHaveBeenCalledWith("a1", { summarize: false });
  });

  it("runs the requested number of rounds", async () => {
    const ctx = createCtx(fullPhaseA());
    await command.cmd.handler("3", ctx);
    expect(pi.exec).toHaveBeenCalledTimes(3);
    expect(ctx.navigateTree).toHaveBeenCalledTimes(3);
    const sent = pi.sendUserMessage.mock.calls.map((c: any[]) => c[0]);
    expect(sent).toEqual([MSG8, MSG9, MSG8, MSG9, MSG8, MSG9]);
  });

  it("uses the default round count for invalid arguments", async () => {
    const ctx = createCtx(fullPhaseA());
    await command.cmd.handler("abc", ctx);
    expect(pi.exec).toHaveBeenCalledTimes(2);
  });

  it("clamps rounds to the maximum", async () => {
    const ctx = createCtx(fullPhaseA());
    await command.cmd.handler("99", ctx);
    expect(pi.exec).toHaveBeenCalledTimes(5);
  });

  it("aborts when git add fails", async () => {
    pi.exec = vi.fn(async () => ({ code: 1, stdout: "", stderr: "boom" }));
    const ctx = createCtx(fullPhaseA());
    await command.cmd.handler("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("git add failed"), "error");
    expect(ctx.navigateTree).not.toHaveBeenCalled();
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
  });

  it("aborts when navigation is cancelled", async () => {
    const ctx = createCtx(fullPhaseA(), {
      navigateTree: vi.fn(async () => ({ cancelled: true })),
    });
    await command.cmd.handler("", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith("Workflow cancelled", "warning");
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
  });

  it("anchors to the last entry before the next user message", async () => {
    const entries = [
      userEntry("u1", MSG1),
      assistantEntry("a1a"),
      toolResultEntry("t1"),
      assistantEntry("a1b"),
      userEntry("u2", MSG2),
      assistantEntry("a2"),
    ];
    const ctx = createCtx(entries);
    await command.cmd.handler("", ctx);
    expect(ctx.navigateTree).toHaveBeenCalledWith("a1b", { summarize: false });
  });

  it("anchors to the response of the sent analysis message when message 1 is absent", async () => {
    const entries = [
      userEntry("x1", "unrelated conversation"),
      assistantEntry("x2"),
      userEntry("x3", "more conversation"),
      assistantEntry("x4"),
    ];
    const ctx = createCtx(entries);
    await command.cmd.handler("", ctx);
    expect(ctx.navigateTree).toHaveBeenCalledWith("a4", { summarize: false });
  });

  it("retries and reports failure when a message cannot be sent", async () => {
    vi.useFakeTimers();
    try {
      pi.sendUserMessage = vi.fn((content: string) => {
        if (content !== MSG9) {
          const id = String(holder.branch.length);
          holder.branch.push(userEntry(`u${id}`, content));
          holder.branch.push(assistantEntry(`a${id}`));
          holder.state.active = true;
        }
      });
      const ctx = createCtx(fullPhaseA());
      const handlerPromise = command.cmd.handler("", ctx);
      await vi.advanceTimersByTimeAsync(16_000);
      await handlerPromise;
      expect(pi.sendUserMessage).toHaveBeenCalledWith(MSG8, { deliverAs: "followUp" });
      expect(pi.sendUserMessage).toHaveBeenCalledWith(MSG9, { deliverAs: "followUp" });
      expect(pi.sendUserMessage).toHaveBeenCalledTimes(4);
      expect(ctx.ui.notify).toHaveBeenCalledWith("Failed to send message 9", "error");
      expect(ctx.navigateTree).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("restores the default working message after completion", async () => {
    const ctx = createCtx(fullPhaseA());
    await command.cmd.handler("", ctx);
    expect(ctx.ui.setWorkingMessage).toHaveBeenLastCalledWith();
  });
});
