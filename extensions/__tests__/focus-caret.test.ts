import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@earendil-works/pi-coding-agent", () => ({
  CustomEditor: class CustomEditor {
    handleInput(_data: string): void {}
    getText(): string { return ""; }
    getCursor(): { line: number; col: number } { return { line: 0, col: 0 }; }
  },
}));

vi.mock("@earendil-works/pi-tui", () => ({}));

describe("focus-caret extension", () => {
  let stdoutWriteSpy: any;

  beforeEach(() => {
    stdoutWriteSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutWriteSpy.mockRestore();
    vi.clearAllMocks();
  });

  describe("extension registration", () => {
    it("registers session_start and session_shutdown handlers", async () => {
      const pi = {
        on: vi.fn(),
      };

      const mod = await import("../focus-caret.js");
      mod.default(pi as any);

      expect(pi.on).toHaveBeenCalledWith("session_start", expect.any(Function));
      expect(pi.on).toHaveBeenCalledWith("session_shutdown", expect.any(Function));
    });
  });

  describe("FocusAwareEditor", () => {
    it("hides cursor when typing a command", async () => {
      const mod = await import("../focus-caret.js");

      const { FocusAwareEditor } = mod as any;
      const editor = new FocusAwareEditor({}, {}, {});

      editor.getText = vi.fn(() => "/commit");
      editor.getCursor = vi.fn(() => ({ line: 0, col: 7 }));

      editor.handleInput("/");

      expect(stdoutWriteSpy).toHaveBeenCalledWith("\x1b[?25l");
    });

    it("shows cursor when not typing a command", async () => {
      const mod = await import("../focus-caret.js");

      const { FocusAwareEditor } = mod as any;
      const editor = new FocusAwareEditor({}, {}, {});

      editor.getText = vi.fn(() => "hello");
      editor.getCursor = vi.fn(() => ({ line: 0, col: 5 }));

      editor.handleInput("h");

      expect(stdoutWriteSpy).toHaveBeenCalledWith("\x1b]12;rgb:00/ff/00\x07");
      expect(stdoutWriteSpy).toHaveBeenCalledWith("\x1b[?25h");
    });

    it("shows cursor when transitioning from command to non-command", async () => {
      const mod = await import("../focus-caret.js");

      const { FocusAwareEditor } = mod as any;
      const editor = new FocusAwareEditor({}, {}, {});

      editor.getText = vi.fn(() => "/com");
      editor.getCursor = vi.fn(() => ({ line: 0, col: 5 }));

      editor.handleInput("/");

      const hideCalls = stdoutWriteSpy.mock.calls.filter((c: any) => c[0] === "\x1b[?25l").length;
      expect(hideCalls).toBeGreaterThan(0);
    });
  });

  describe("cursor state deduplication", () => {
    it("does not write escape sequences while idle", async () => {
      vi.useFakeTimers();
      try {
        const handlers = new Map<string, (...args: any[]) => any>();
        const pi = {
          on: vi.fn((event: string, handler: (...args: any[]) => any) => {
            handlers.set(event, handler);
          }),
        };

        const mod = await import("../focus-caret.js");
        mod.default(pi as any);

        const ctx = {
          ui: {
            onTerminalInput: vi.fn(() => undefined),
            setEditorComponent: vi.fn(),
          },
        };
        handlers.get("session_start")!(undefined, ctx);
        stdoutWriteSpy.mockClear();

        vi.advanceTimersByTime(100);

        expect(stdoutWriteSpy).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
