import { CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { TUI, EditorTheme } from "@earendil-works/pi-tui";
import type { KeybindingsManager } from "@earendil-works/pi-coding-agent";

const SHOW_CURSOR = "\x1b[?25h";
const HIDE_CURSOR = "\x1b[?25l";
const CURSOR_GREEN = "\x1b]12;rgb:00/ff/00\x07";

let hasFocus = true;
let unsubscribe: (() => void) | undefined;
let interval: ReturnType<typeof setInterval> | undefined;
let shouldHideCaret = false;

function showCursor() {
  if (shouldHideCaret) return;
  process.stdout.write(CURSOR_GREEN);
  process.stdout.write(SHOW_CURSOR);
}

function hideCursorForCommand() {
  process.stdout.write(HIDE_CURSOR);
}

function updateCursor() {
  if (shouldHideCaret || !hasFocus) {
    hideCursorForCommand();
  } else {
    showCursor();
  }
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    if (interval) clearInterval(interval);
    unsubscribe?.();
    showCursor();
    interval = setInterval(updateCursor, 20);

    unsubscribe = ctx.ui.onTerminalInput((data: string) => {
      if (data === "\x1b[O") {
        hasFocus = false;
        process.stdout.write(HIDE_CURSOR);
      } else if (data === "\x1b[I") {
        hasFocus = true;
        showCursor();
      }
    });

    ctx.ui.setEditorComponent((tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) => {
      return new FocusAwareEditor(tui, theme, keybindings);
    });
  });

  pi.on("session_shutdown", () => {
    if (interval) clearInterval(interval);
    unsubscribe?.();
    process.stdout.write(SHOW_CURSOR);
  });
}

class FocusAwareEditor extends CustomEditor {
  override handleInput(data: string): void {
    super.handleInput(data);

    const textAfter = this.getText();
    const cursorAfter = this.getCursor();
    const textBeforeCursor = cursorAfter.line === 0 && cursorAfter.col > 0
      ? textAfter.substring(0, cursorAfter.col)
      : textAfter;

    const isTypingCommand = textBeforeCursor.trimStart().startsWith("/");
    if (isTypingCommand) {
      shouldHideCaret = true;
      updateCursor();
    } else if (shouldHideCaret) {
      shouldHideCaret = false;
      updateCursor();
    }
  }
}
