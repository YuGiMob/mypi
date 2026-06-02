/**
 * Start Message Extension
 *
 * Provides /start command to send a predefined analysis message
 * and /change-start to modify the predefined message.
 * The message is persisted to a file for cross-session availability.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const START_MESSAGE_FILE = join(
	process.env.HOME || "",
	".pi",
	"agent",
	"extensions",
	"start-message.txt"
);

const DEFAULT_START_MESSAGE =
	"Analyze the entirety of the codebase to be able to understand architecture, code patterns and standards, as well as flow.";

function getStartMessage(): string {
	if (existsSync(START_MESSAGE_FILE)) {
		try {
			return readFileSync(START_MESSAGE_FILE, "utf-8").trim();
		} catch (err) {
			console.error("Failed to read start message:", err);
			return DEFAULT_START_MESSAGE;
		}
	}
	return DEFAULT_START_MESSAGE;
}

function setStartMessage(message: string): void {
	writeFileSync(START_MESSAGE_FILE, message, "utf-8");
}

export default function (pi: ExtensionAPI) {
	// /change-start command - change the predefined start message
	pi.registerCommand("change-start", {
		description: "Change the predefined /start message",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("change-start requires interactive mode", "error");
				return;
			}

			if (!args.trim()) {
				ctx.ui.notify("Usage: /change-start <new message>", "warning");
				return;
			}

			const trimmedMessage = args.trim();
			if (trimmedMessage.length < 5) {
				ctx.ui.notify("Message must be at least 5 characters", "warning");
				return;
			}

			setStartMessage(trimmedMessage);
			ctx.ui.notify("Start message updated", "info");
		},
	});

	// /start command - send the predefined message
	pi.registerCommand("start", {
		description: "Send the predefined analysis message",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("start requires interactive mode", "error");
				return;
			}

			const message = getStartMessage();
			pi.sendUserMessage(message);
		},
	});

	// /view-start command - show the current predefined message
	pi.registerCommand("view-start", {
		description: "View the current predefined /start message",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("view-start requires interactive mode", "error");
				return;
			}

			const message = getStartMessage();
			ctx.ui.notify(`Current start message: ${message}`, "info");
		},
	});
}
