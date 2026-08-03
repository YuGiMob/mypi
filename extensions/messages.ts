import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { getMessages, setMessages } from "./lib/messages.js";

function messageCompletions(prefix: string): AutocompleteItem[] {
  const messages = getMessages();
  const items = Object.keys(messages).map((num) => ({
    value: num,
    label: `Message ${num}: ${messages[num].substring(0, 50)}${messages[num].length > 50 ? '...' : ''}`,
  }));
  const filtered = items.filter((i) => i.value.startsWith(prefix));
  return filtered.length > 0 ? filtered : [];
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("msg", {
    description: "Send a predefined message by number",
    getArgumentCompletions: messageCompletions,
    handler: async (args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("/msg requires interactive mode", "error");
        return;
      }
      const num = args.trim();
      if (!num) {
        ctx.ui.notify("Usage: /msg <number>", "warning");
        return;
      }
      const message = getMessages()[num];
      if (!message) {
        ctx.ui.notify(`Message ${num} does not exist. Use /change-msg ${num} "content" to create it.`, "warning");
        return;
      }
      pi.sendUserMessage(message, { deliverAs: "followUp" });
      ctx.ui.notify(`Message ${num} sent`, "info");
    },
  });

  pi.registerCommand("change-msg", {
    description: "Change or create a predefined message",
    getArgumentCompletions: messageCompletions,
    handler: async (args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("/change-msg requires interactive mode", "error");
        return;
      }
      if (!args.trim()) {
        ctx.ui.notify("Usage: /change-msg <number> <content>", "warning");
        return;
      }
      const match = args.trim().match(/^(\d+)\s+(?:"([^"]*)"|'([^']*)'|(.+))$/);
      if (!match) {
        ctx.ui.notify("Usage: /change-msg <number> \"<content>\"", "warning");
        return;
      }
      const num = match[1];
      const content = match[2] ?? match[3] ?? match[4];
      if (content.length < 5) {
        ctx.ui.notify("Message must be at least 5 characters", "warning");
        return;
      }
      const messages = getMessages();
      messages[num] = content;
      setMessages(messages);
      ctx.ui.notify(`Message ${num} updated`, "info");
    },
  });

  pi.registerCommand("show-msg", {
    description: "Display the contents of a predefined message",
    getArgumentCompletions: messageCompletions,
    handler: async (args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("/show-msg requires interactive mode", "error");
        return;
      }
      const num = args.trim();
      if (!num) {
        const messages = getMessages();
        const keys = Object.keys(messages);
        if (keys.length === 0) {
          ctx.ui.notify("No messages defined.", "info");
          return;
        }
        const list = keys.map((k) => `  ${k}: ${messages[k].substring(0, 200)}${messages[k].length > 200 ? "..." : ""}`).join("\n");
        ctx.ui.notify(`Messages:\n${list}`, "info");
        return;
      }
      const message = getMessages()[num];
      if (!message) {
        ctx.ui.notify(`Message ${num} does not exist.`, "warning");
        return;
      }
      ctx.ui.notify(`Message ${num}: ${message}`, "info");
    },
  });
}
