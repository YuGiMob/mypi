import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock("@earendil-works/pi-coding-agent", () => ({
  Type: {},
}));

vi.mock("@earendil-works/pi-tui", () => ({}));

describe("messages extension", () => {
  let extension: any;
  let pi: any;
  let capturedCommands: any[];

  beforeEach(async () => {
    capturedCommands = [];
    pi = {
      on: vi.fn(),
      registerTool: vi.fn(),
      registerCommand: vi.fn((name: string, cmd: any) => {
        capturedCommands.push({ name, cmd });
      }),
      sendUserMessage: vi.fn(),
    };

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      "1": "Test message one",
      "2": "Test message two with longer content",
    }));

    const mod = await import("../messages.js");
    extension = mod.default;
    extension(pi);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("command registrations", () => {
    it("registers /msg command", () => {
      const cmd = capturedCommands.find((c: any) => c.name === "msg");
      expect(cmd).toBeDefined();
    });

    it("registers /change-msg command", () => {
      const cmd = capturedCommands.find((c: any) => c.name === "change-msg");
      expect(cmd).toBeDefined();
    });

    it("registers /show-msg command", () => {
      const cmd = capturedCommands.find((c: any) => c.name === "show-msg");
      expect(cmd).toBeDefined();
    });
  });

  describe("/msg command", () => {
    it("sends a predefined message by number", async () => {
      const cmd = capturedCommands.find((c: any) => c.name === "msg");
      const ctx = { hasUI: true, ui: { notify: vi.fn() } };

      await cmd.cmd.handler("1", ctx);

      expect(pi.sendUserMessage).toHaveBeenCalledWith("Test message one", { deliverAs: "followUp" });
      expect(ctx.ui.notify).toHaveBeenCalledWith("Message 1 sent", "info");
    });

    it("shows warning for non-existent message", async () => {
      const cmd = capturedCommands.find((c: any) => c.name === "msg");
      const ctx = { hasUI: true, ui: { notify: vi.fn() } };

      await cmd.cmd.handler("99", ctx);

      expect(ctx.ui.notify).toHaveBeenCalledWith(
        "Message 99 does not exist. Use /change-msg 99 \"content\" to create it.",
        "warning",
      );
    });

    it("shows warning when no number provided", async () => {
      const cmd = capturedCommands.find((c: any) => c.name === "msg");
      const ctx = { hasUI: true, ui: { notify: vi.fn() } };

      await cmd.cmd.handler("", ctx);

      expect(ctx.ui.notify).toHaveBeenCalledWith("Usage: /msg <number>", "warning");
    });

    it("requires interactive mode", async () => {
      const cmd = capturedCommands.find((c: any) => c.name === "msg");
      const ctx = { hasUI: false, ui: { notify: vi.fn() } };

      await cmd.cmd.handler("1", ctx);

      expect(ctx.ui.notify).toHaveBeenCalledWith("/msg requires interactive mode", "error");
    });
  });

  describe("/change-msg command", () => {
    it("creates or updates a message", async () => {
      const cmd = capturedCommands.find((c: any) => c.name === "change-msg");
      const ctx = { hasUI: true, ui: { notify: vi.fn() } };

      await cmd.cmd.handler('3 "New test message"', ctx);

      expect(writeFileSync).toHaveBeenCalled();
      expect(ctx.ui.notify).toHaveBeenCalledWith("Message 3 updated", "info");
    });

    it("shows warning for short messages", async () => {
      const cmd = capturedCommands.find((c: any) => c.name === "change-msg");
      const ctx = { hasUI: true, ui: { notify: vi.fn() } };

      await cmd.cmd.handler('3 "ab"', ctx);

      expect(ctx.ui.notify).toHaveBeenCalledWith("Message must be at least 5 characters", "warning");
    });

    it("shows usage when no args provided", async () => {
      const cmd = capturedCommands.find((c: any) => c.name === "change-msg");
      const ctx = { hasUI: true, ui: { notify: vi.fn() } };

      await cmd.cmd.handler("", ctx);

      expect(ctx.ui.notify).toHaveBeenCalledWith("Usage: /change-msg <number> <content>", "warning");
    });
  });

  describe("/show-msg command", () => {
    it("displays a specific message", async () => {
      const cmd = capturedCommands.find((c: any) => c.name === "show-msg");
      const ctx = { hasUI: true, ui: { notify: vi.fn() } };

      await cmd.cmd.handler("1", ctx);

      expect(ctx.ui.notify).toHaveBeenCalledWith("Message 1: Test message one", "info");
    });

    it("shows warning for non-existent message", async () => {
      const cmd = capturedCommands.find((c: any) => c.name === "show-msg");
      const ctx = { hasUI: true, ui: { notify: vi.fn() } };

      await cmd.cmd.handler("99", ctx);

      expect(ctx.ui.notify).toHaveBeenCalledWith("Message 99 does not exist.", "warning");
    });

    it("lists all messages when no number given", async () => {
      const cmd = capturedCommands.find((c: any) => c.name === "show-msg");
      const ctx = { hasUI: true, ui: { notify: vi.fn() } };

      await cmd.cmd.handler("", ctx);

      expect(ctx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining("Messages:"),
        "info",
      );
    });

    it("shows info when no messages defined", async () => {
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({}));
      const cmd = capturedCommands.find((c: any) => c.name === "show-msg");
      const ctx = { hasUI: true, ui: { notify: vi.fn() } };

      await cmd.cmd.handler("", ctx);

      expect(ctx.ui.notify).toHaveBeenCalledWith("No messages defined.", "info");
    });
  });

  describe("autocomplete", () => {
    it("provides completions for message numbers", () => {
      const cmd = capturedCommands.find((c: any) => c.name === "msg");
      const completions = cmd.cmd.getArgumentCompletions("1");

      expect(completions).toHaveLength(1);
      expect(completions[0]!.value).toBe("1");
    });

    it("returns empty array for non-matching prefix", () => {
      const cmd = capturedCommands.find((c: any) => c.name === "msg");
      const completions = cmd.cmd.getArgumentCompletions("9");

      expect(completions).toEqual([]);
    });
  });
});
