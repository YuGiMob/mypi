import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@earendil-works/pi-coding-agent", () => ({
  Type: {},
}));

describe("queue extension", () => {
  let pi: any;
  let capturedCommand: any;

  beforeEach(async () => {
    pi = {
      registerCommand: vi.fn((name: string, cmd: any) => {
        capturedCommand = { name, cmd };
      }),
      sendUserMessage: vi.fn(),
    };

    const mod = await import("../queue.js");
    mod.default(pi);
  });

  describe("/q command", () => {
    it("registers a command named q", () => {
      expect(capturedCommand.name).toBe("q");
    });

    it("sends a follow-up message", async () => {
      const ctx = { hasUI: true, ui: { notify: vi.fn() } };

      await capturedCommand.cmd.handler("Hello agent", ctx);

      expect(pi.sendUserMessage).toHaveBeenCalledWith("Hello agent", { deliverAs: "followUp" });
      expect(ctx.ui.notify).toHaveBeenCalledWith("Follow-up message sent.", "info");
    });

    it("shows usage when no message provided", async () => {
      const ctx = { hasUI: true, ui: { notify: vi.fn() } };

      await capturedCommand.cmd.handler("", ctx);

      expect(ctx.ui.notify).toHaveBeenCalledWith(
        "Usage: /q <message> - sends a follow-up message to the agent",
        "warning",
      );
    });

    it("shows usage for whitespace-only message", async () => {
      const ctx = { hasUI: true, ui: { notify: vi.fn() } };

      await capturedCommand.cmd.handler("   ", ctx);

      expect(ctx.ui.notify).toHaveBeenCalledWith(
        "Usage: /q <message> - sends a follow-up message to the agent",
        "warning",
      );
    });

    it("trims the message before sending", async () => {
      const ctx = { hasUI: true, ui: { notify: vi.fn() } };

      await capturedCommand.cmd.handler("  Hello  ", ctx);

      expect(pi.sendUserMessage).toHaveBeenCalledWith("Hello", { deliverAs: "followUp" });
    });
  });
});
