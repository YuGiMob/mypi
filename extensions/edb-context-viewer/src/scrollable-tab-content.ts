import type { Theme } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey } from "@earendil-works/pi-tui";
import type { TabContent } from "./tabbed-overlay.js";
import { CONTENT_HEIGHT } from "./tabbed-overlay.js";
import { ScrollableBase } from "./scrollable-base.js";

export interface ScrollableTabContentOptions {
  rawText: string;
  displayLines: string[];
  theme: Theme;
}

export class ScrollableTabContent extends ScrollableBase implements TabContent {
  constructor(
    private opts: ScrollableTabContentOptions,
    public readonly name: string = "",
  ) {
    super();
  }

  protected get rawText(): string { return this.opts.rawText; }
  protected get displayLines(): string[] { return this.opts.displayLines; }
  protected get theme(): Theme { return this.opts.theme; }
  protected getVisibleLines(): number { return CONTENT_HEIGHT; }

  getAboveContentLine(_innerWidth: number): string | null {
    const th = this.opts.theme;
    if (this.searchMode) {
      return ` ${th.fg("accent", "/")} ${this.searchQuery}${th.fg("dim", "▏")}`;
    }
    if (this.searchMatches.length > 0) {
      return ` ${th.fg("accent", "/")} ${th.fg("text", this.searchQuery)} ${th.fg("dim", "—")} ${th.fg("accent", `${this.currentMatchIndex + 1}/${this.searchMatches.length}`)}`;
    }
    return null;
  }

  getFooterLeft(): string {
    const th = this.opts.theme;
    const total = this.visualTotal > 0 ? this.visualTotal : this.opts.displayLines.length;
    const maxScroll = Math.max(0, total - 1);
    const visibleEnd = Math.min(this.scrollOffset + 1, total);

    const scrollPercent =
      total === 0
        ? "All"
        : this.scrollOffset === 0
          ? "Top"
          : this.scrollOffset >= maxScroll
            ? "Bot"
            : `${Math.round(((this.scrollOffset + 1) / total) * 100)}%`;

    let left = `${visibleEnd}/${total} [${scrollPercent}]`;
    if (this.copyFlash) {
      left += th.fg("success", " ✓ Copied!");
    }
    return left;
  }

  readonly footerHints = "↑↓ scroll · / search · n/N next · y copy";

  handleInput(data: string): boolean {
    if (this.handleSearchInput(data)) return true;

    if (matchesKey(data, Key.down) || data === "j") {
      this.scrollDown(1, Math.max(0, this.visualTotal - 1));
      return true;
    }
    if (matchesKey(data, Key.up) || data === "k") {
      this.scrollUp(1);
      return true;
    }
    if (matchesKey(data, Key.home) || data === "g") {
      this.scrollOffset = 0;
      return true;
    }
    if (matchesKey(data, Key.end) || data === "G") {
      this.scrollToBottom(Math.max(0, this.visualTotal - 1));
      return true;
    }
    if (matchesKey(data, Key.pageDown) || matchesKey(data, Key.ctrl("f"))) {
      this.scrollDown(28, Math.max(0, this.visualTotal - 1));
      return true;
    }
    if (matchesKey(data, Key.pageUp) || matchesKey(data, Key.ctrl("b"))) {
      this.scrollUp(28);
      return true;
    }
    if (matchesKey(data, Key.ctrl("d"))) {
      this.scrollDown(14, Math.max(0, this.visualTotal - 1));
      return true;
    }
    if (matchesKey(data, Key.ctrl("u"))) {
      this.scrollUp(14);
      return true;
    }
    if (data === "/") {
      this.searchMode = true;
      this.searchQuery = "";
      this.searchMatches = [];
      this.currentMatchIndex = -1;
      return true;
    }
    if (data === "n") {
      this.nextMatch();
      return true;
    }
    if (data === "N") {
      this.prevMatch();
      return true;
    }
    if (data === "y") {
      void this.copyToClipboard();
      return true;
    }

    return false;
  }

  renderContent(innerWidth: number, height: number): string[] {
    this.buildVisualLines(innerWidth);
    const th = this.opts.theme;
    const lines: string[] = [];

    const maxScroll = Math.max(0, this.visualTotal - height);
    this.scrollOffset = Math.min(this.scrollOffset, maxScroll);
    this.scrollOffset = Math.max(0, this.scrollOffset);

    for (let i = 0; i < height; i++) {
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

        lines.push(line);
      } else {
        lines.push(th.fg("dim", "~"));
      }
    }

    return lines;
  }
}
