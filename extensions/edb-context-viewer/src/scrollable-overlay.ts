import { type Theme } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey } from "@earendil-works/pi-tui";
import { ScrollableBase } from "./scrollable-base.js";
import { createBorderHelpers, createTitle } from "./utils.js";

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
    if (this.handleScrollKey(data)) return;
    if (matchesKey(data, Key.escape) || data === "q") {
      this.opts.done();
    }
  }

  render(width: number): string[] {
    const th = this.opts.theme;
    const innerW = width - 2;
    const lines: string[] = [];

    this.buildVisualLines(innerW);

    const { row, borderTop, borderSep, borderBottom } = createBorderHelpers(th, innerW);
    const title = createTitle(th, this.opts.title, this.opts.subtitle);
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

    const visibleLines = this.getVisibleLines();
    const maxScroll = Math.max(0, this.visualTotal - visibleLines);
    this.scrollOffset = Math.min(this.scrollOffset, maxScroll);
    this.scrollOffset = Math.max(0, this.scrollOffset);

    for (let i = 0; i < visibleLines; i++) {
      const lineIdx = this.scrollOffset + i;
      if (lineIdx < this.visualTotal) {
        let line = this.visualLines[lineIdx]!

        const logicalIdx = this.visualToLogical[lineIdx]!
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
      this.visualTotal <= visibleLines
        ? "All"
        : this.scrollOffset === 0
          ? "Top"
          : this.scrollOffset >= maxScroll
            ? "Bot"
            : `${Math.round(((this.scrollOffset + visibleLines) / this.visualTotal) * 100)}%`;

    let statusLeft = th.fg(
      "dim",
      ` ${this.scrollOffset + 1}-${Math.min(this.scrollOffset + visibleLines, this.visualTotal)} of ${this.visualTotal} [${scrollPercent}] `,
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
