import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { CustomEditor } from "@earendil-works/pi-coding-agent";
import { getKeybindings, type AutocompleteItem, type AutocompleteProvider, type AutocompleteSuggestions, type SlashCommand } from "@earendil-works/pi-tui";

export function parseSlashCommand(textBeforeCursor: string): { commandName: string; argumentText: string } | null {
  if (!textBeforeCursor.startsWith("/")) return null;
  const spaceIndex = textBeforeCursor.indexOf(" ");
  if (spaceIndex === -1) return null;
  const commandName = textBeforeCursor.slice(1, spaceIndex);
  if (commandName === "") return null;
  return { commandName, argumentText: textBeforeCursor.slice(spaceIndex + 1) };
}

function findCommand(provider: AutocompleteProvider, name: string): SlashCommand | undefined {
  const commands = (provider as unknown as { commands?: (AutocompleteItem | SlashCommand)[] }).commands;
  if (!Array.isArray(commands)) return undefined;
  return commands.find((cmd): cmd is SlashCommand =>
    "name" in cmd && cmd.name === name && "getArgumentCompletions" in cmd && typeof cmd.getArgumentCompletions === "function",
  );
}

export function wrapProvider(provider: AutocompleteProvider): AutocompleteProvider {
  return {
    triggerCharacters: provider.triggerCharacters,
    async getSuggestions(lines, cursorLine, cursorCol, options): Promise<AutocompleteSuggestions | null> {
      const currentLine = lines[cursorLine] ?? "";
      const parsed = parseSlashCommand(currentLine.slice(0, cursorCol));
      if (parsed !== null) {
        const command = findCommand(provider, parsed.commandName);
        if (command?.getArgumentCompletions) {
          const currentArg = parsed.argumentText.split(/\s+/).pop() ?? "";
          const items = await command.getArgumentCompletions(currentArg);
          if (items && items.length > 0) return { items, prefix: currentArg };
          return null;
        }
      }
      return provider.getSuggestions(lines, cursorLine, cursorCol, options);
    },
    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      return provider.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
    },
    shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
      return provider.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
    },
  };
}

interface EditorInternals {
  autocompleteState: unknown;
  autocompleteList: { getSelectedItem(): AutocompleteItem | null } | undefined;
  autocompleteProvider: AutocompleteProvider | undefined;
  autocompletePrefix: string;
  state: { lines: string[]; cursorLine: number; cursorCol: number };
  lastAction: unknown;
  onChange?: (text: string) => void;
  pushUndoSnapshot(): void;
  setCursorCol(col: number): void;
  cancelAutocomplete(): void;
  tryTriggerAutocomplete(): void;
  getText(): string;
}

export class StickyAutocompleteEditor extends CustomEditor {
  private get internals(): EditorInternals {
    return this as unknown as EditorInternals;
  }

  override handleInput(data: string): void {
    const internals = this.internals;
    if (getKeybindings().matches(data, "tui.input.tab") && internals.autocompleteState && internals.autocompleteList) {
      const selected = internals.autocompleteList.getSelectedItem();
      if (selected && internals.autocompleteProvider) {
        internals.pushUndoSnapshot();
        internals.lastAction = null;
        const result = internals.autocompleteProvider.applyCompletion(
          internals.state.lines,
          internals.state.cursorLine,
          internals.state.cursorCol,
          selected,
          internals.autocompletePrefix,
        );
        internals.state.lines = result.lines;
        internals.state.cursorLine = result.cursorLine;
        internals.setCursorCol(result.cursorCol);
        if (internals.onChange) internals.onChange(internals.getText());
        if (this.isSlashCommandArgumentContext()) {
          this.positionForNextArgument();
          internals.tryTriggerAutocomplete();
        } else {
          internals.cancelAutocomplete();
        }
        return;
      }
    }
    super.handleInput(data);
  }

  private isSlashCommandArgumentContext(): boolean {
    const internals = this.internals;
    const line = internals.state.lines[internals.state.cursorLine] ?? "";
    return parseSlashCommand(line.slice(0, internals.state.cursorCol)) !== null;
  }

  private positionForNextArgument(): void {
    const internals = this.internals;
    const line = internals.state.lines[internals.state.cursorLine] ?? "";
    if (internals.state.cursorCol === line.length && !line.endsWith(" ")) {
      internals.state.lines[internals.state.cursorLine] = `${line} `;
      internals.setCursorCol(internals.state.cursorCol + 1);
    }
  }
}

export default function (pi: ExtensionAPI): void {
  pi.on("session_start", (_event, ctx) => {
    ctx.ui.addAutocompleteProvider(wrapProvider);
    ctx.ui.setEditorComponent((tui, theme, keybindings) => new StickyAutocompleteEditor(tui, theme, keybindings));
  });
}
