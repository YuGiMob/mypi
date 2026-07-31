import { type Theme } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, visibleWidth } from "@earendil-works/pi-tui";
import { ScrollableBase } from "./scrollable-base.js";

const CONTENT_HEIGHT = 30;

export interface ScrollableOverlayOptions {
  title: string;
  subtitle: string;
  rawText: string;
  displayLines: string[];
  theme: Theme;
  done: () => void;
}

export class ScrollableOverlay extends ScrollableBase {
  constructor(private opts: ScrollableOverlayOptions) {
    super();
  }

  protected get rawText(): string { return this.opts.rawText; }
  protected get displayLines(): string[] { return this.opts.displayLines; }
  protected get theme(): Theme { return this.opts.theme; }
  protected getVisibleLines(): number { return CONTENT_HEIGHT; }

  handleInput(data: string): void {
    if (this.handleSearchInput(data)) return;

    if (matchesKey(data, Key.escape) || data === "q") {
      this.opts.done();
      return;
    }

    if (matchesKey(data, Key.down) || data === "j") {
      this.scrollDown(1, Math.max(0, this.visualTotal - CONTENT_HEIGHT));
    } else if (matchesKey(data, Key.up) || data === "k") {
      this.scrollUp(1);
    } else if (matchesKey(data, Key.home) || data === "g") {
      this.scrollOffset = 0;
    } else if (matchesKey(data, Key.end) || data === "G") {
      this.scrollToBottom(Math.max(0, this.visualTotal - CONTENT_HEIGHT));
    } else if (matchesKey(data, Key.pageDown) || matchesKey(data, Key.ctrl("f"))) {
      this.scrollDown(CONTENT_HEIGHT - 2, Math.max(0, this.visualTotal - CONTENT_HEIGHT));
    } else if (matchesKey(data, Key.pageUp) || matchesKey(data, Key.ctrl("b"))) {
      this.scrollUp(CONTENT_HEIGHT - 2);
    } else if (matchesKey(data, Key.ctrl("d"))) {
      this.scrollDown(Math.floor(CONTENT_HEIGHT / 2), Math.max(0, this.visualTotal - CONTENT_HEIGHT));
    } else if (matchesKey(data, Key.ctrl("u"))) {
      this.scrollUp(Math.floor(CONTENT_HEIGHT / 2));
    } else if (data === "/") {
      this.searchMode = true;
      this.searchQuery = "";
      this.searchMatches = [];
      this.currentMatchIndex = -1;
    } else if (data === "n") {
      this.nextMatch();
    } else if (data === "N") {
      this.prevMatch();
    } else if (data === "y") {
      void this.copyToClipboard();
    }
  }

  render(width: number): string[] {
    const th = this.opts.theme;
    const innerW = width - 2;
    const lines: string[] = [];

    this.buildVisualLines(innerW);

    const pad = (s: string, len: number) => {
      const vis = visibleWidth(s);
      return s + " ".repeat(Math.max(0, len - vis));
    };

    const row = (content: string) => th.fg("border", "│") + pad(content, innerW) + th.fg("border", "│");
    const borderTop = th.fg("border", `╭${"─".repeat(innerW)}╮`);
    const borderSep = th.fg("border", `├${"─".repeat(innerW)}┤`);
    const borderBottom = th.fg("border", `╰${"─".repeat(innerW)}╯`);

    const title = ` ${th.fg("accent", th.bold(this.opts.title))}  ${th.fg("dim", `(${this.opts.subtitle})`)}`;
    lines.push(borderTop);
    lines.push(row(title));

    if (this.searchMode) {
      const searchContent = ` ${th.fg("accent", "/")} ${this.searchQuery}${th.fg("dim", "▏")}`;
      lines.push(row(searchContent));
    } else if (this.searchMatches.length > 0) {
      const matchInfo = ` ${th.fg("accent", "/")} ${th.fg("text", this.searchQuery)} ${th.fg("dim", "—")} ${th.fg("accent", `${this.currentMatchIndex + 1}/${this.searchMatches.length}`)}`;
      lines.push(row(matchInfo));
    } else {
      lines.push(borderSep);
    }

    const maxScroll = Math.max(0, this.visualTotal - CONTENT_HEIGHT);
    this.scrollOffset = Math.min(this.scrollOffset, maxScroll);
    this.scrollOffset = Math.max(0, this.scrollOffset);

    for (let i = 0; i < CONTENT_HEIGHT; i++) {
      const lineIdx = this.scrollOffset + i;
      if (lineIdx < this.visualTotal) {
        let line = this.visualLines[lineIdx]!;

        const logicalIdx = this.visualToLogical[lineIdx]!;
        const isCurrentMatch =
          this.searchMatches.length > 0 &&
          this.currentMatchIndex >= 0 &&
          this.searchMatches[this.currentMatchIndex] === logicalIdx;
        const isOtherMatch =
          this.searchMatches.length > 0 && this.searchMatches.includes(logicalIdx) && !isCurrentMatch;

        if (isCurrentMatch) {
          line = th.bg("selectedBg", line);
        } else if (isOtherMatch) {
          line = th.fg("warning", line);
        }

        lines.push(row(line));
      } else {
        lines.push(row(th.fg("dim", "~")));
      }
    }

    lines.push(borderSep);

    const scrollPercent =
      this.visualTotal <= CONTENT_HEIGHT
        ? "All"
        : this.scrollOffset === 0
          ? "Top"
          : this.scrollOffset >= maxScroll
            ? "Bot"
            : `${Math.round(((this.scrollOffset + CONTENT_HEIGHT) / this.visualTotal) * 100)}%`;

    let statusLeft = th.fg(
      "dim",
      ` ${this.scrollOffset + 1}-${Math.min(this.scrollOffset + CONTENT_HEIGHT, this.visualTotal)} of ${this.visualTotal} [${scrollPercent}] `,
    );

    if (this.copyFlash) {
      statusLeft += th.fg("success", "✓ Copied! ");
    }

    const helpItems = ["↑↓ scroll", "/ search", "n/N next", "y copy", "q close"];
    const helpText = th.fg("dim", helpItems.join(" · "));

    lines.push(row(statusLeft + helpText));
    lines.push(borderBottom);

    return lines;
  }
}
