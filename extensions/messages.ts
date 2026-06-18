/**
 * Message Extension
 *
 * Provides commands to manage and send predefined messages:
 * - /msg <number> - Send message by number
 * - /change-msg <number> <content> - Change or create a message
 * - /show-msg <number> - Display the contents of a message
 *
 * Messages are persisted to a JSON file for cross-session availability.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const MESSAGES_FILE = join(
	process.env.HOME || "",
	".pi",
	"agent",
	"extensions",
	"messages.json"
);

const DEFAULT_MESSAGES: Record<string, string> = {
	"1": "Analyze the codebase of the project in this folder to be able to understand it's architecture, code patterns and standards, so that you are better able to handle the upcoming tasks"
};

function getMessages(): Record<string, string> {
	if (existsSync(MESSAGES_FILE)) {
		try {
			const content = readFileSync(MESSAGES_FILE, "utf-8").trim();
			return JSON.parse(content);
		} catch (err) {
			console.error("Failed to read messages:", err);
			return { ...DEFAULT_MESSAGES };
		}
	}
	return { ...DEFAULT_MESSAGES };
}

function setMessages(messages: Record<string, string>): void {
	writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2), "utf-8");
}

export default function (pi: ExtensionAPI) {
	// /msg <number> - send a predefined message
	pi.registerCommand("msg", {
		description: "Send a predefined message by number",
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

			const messages = getMessages();
			const message = messages[num];

			if (!message) {
				ctx.ui.notify(`Message ${num} does not exist. Use /change-msg ${num} "content" to create it.`, "warning");
				return;
			}

			pi.sendUserMessage(message);
		},
	});

	// /change-msg <number> <content> - change or create a message
	pi.registerCommand("change-msg", {
		description: "Change or create a predefined message",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("/change-msg requires interactive mode", "error");
				return;
			}

			if (!args.trim()) {
				ctx.ui.notify("Usage: /change-msg <number> <content>", "warning");
				return;
			}

			// Parse: number followed by content (content may be quoted)
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

	// /show-msg <number> - display a message
	pi.registerCommand("show-msg", {
		description: "Display the contents of a predefined message",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("/show-msg requires interactive mode", "error");
				return;
			}

			const num = args.trim();
			if (!num) {
				ctx.ui.notify("Usage: /show-msg <number>", "warning");
				return;
			}

			const messages = getMessages();
			const message = messages[num];

			if (!message) {
				ctx.ui.notify(`Message ${num} does not exist.`, "warning");
				return;
			}

			ctx.ui.notify(`Message ${num}: ${message}`, "info");
		},
	});
}
