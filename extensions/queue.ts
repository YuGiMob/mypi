/**
 * Queue Command - /q <message>
 *
 * Queues a user message to be sent when the agent finishes its current task.
 * Unlike sending a message directly (which may interrupt the agent mid-stream),
 * this waits until the agent is idle before delivering the message.
 *
 * For commands (starting with /), they are always queued and executed when the agent
 * becomes idle (via agent_end event) with a 500ms delay.
 *
 * WORKAROUND: Since pi doesn't expose a way to execute slash commands programmatically,
 * this extension directly handles known commands (like /msg) by implementing their logic.
 * For unknown commands, it falls back to sending them as user messages (which won't execute
 * as commands, but at least won't break).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Path to messages.json (same as in messages.ts)
const MESSAGES_FILE = join(
	process.env.HOME || "",
	".pi",
	"agent",
	"extensions",
	"messages.json"
);

// Helper function to get messages (same as in messages.ts)
function getMessages(): Record<string, string> {
	if (existsSync(MESSAGES_FILE)) {
		try {
			const content = readFileSync(MESSAGES_FILE, "utf-8").trim();
			return JSON.parse(content);
		} catch (err) {
			console.error("Failed to read messages:", err);
			return {};
		}
	}
	return {};
}

// Helper function to parse command and arguments
function parseCommand(text: string): { command: string; args: string } {
	const trimmed = text.trim();
	const spaceIndex = trimmed.indexOf(' ');
	if (spaceIndex === -1) {
		return { command: trimmed, args: '' };
	}
	return {
		command: trimmed.substring(0, spaceIndex),
		args: trimmed.substring(spaceIndex + 1).trim()
	};
}

export default function (pi: ExtensionAPI) {
	const queuedCommands: string[] = [];

	// Execute queued commands when agent becomes idle
	pi.on("agent_end", async (_event, ctx) => {
		if (queuedCommands.length === 0) return;
		
		// Wait 500ms for agent to be truly idle
		await new Promise(resolve => setTimeout(resolve, 500));
		
		// Process one command at a time with retries
		const command = queuedCommands.shift()!;
		ctx.ui.notify(`Executing queued command: ${command}`, "info");
		
		// Parse the command
		const { command: cmd, args } = parseCommand(command);
		
		// Handle known commands directly
		try {
			if (cmd === '/msg') {
				// Handle /msg command directly
				await handleMsgCommand(args, pi, ctx);
			} else if (cmd === '/show-msg') {
				// Handle /show-msg command directly
				await handleShowMsgCommand(args, ctx);
			} else if (cmd === '/change-msg') {
				// For /change-msg, we can't execute it properly without UI
				// So we'll send it as a user message (won't work as command)
				ctx.ui.notify(`Cannot execute /change-msg from queue (requires interactive mode)`, "warning");
			} else {
				// For unknown commands, try to send as user message
				// This won't execute as a command, but at least won't break
				await sendAsUserMessage(command, pi, ctx);
			}
		} catch (error) {
			ctx.ui.notify(`Failed to execute queued command: ${command}`, "error");
			// Re-queue the command
			queuedCommands.unshift(command);
		}
	});

	// Helper function to handle /msg command
	async function handleMsgCommand(args: string, pi: ExtensionAPI, ctx: any) {
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

		// Send the actual message content (not the command)
		// Use deliverAs: "followUp" to queue the message properly
		pi.sendUserMessage(message, { deliverAs: "followUp" });
	}

	// Helper function to handle /show-msg command
	async function handleShowMsgCommand(args: string, ctx: any) {
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
	}

	// Helper function to send as user message (fallback)
	async function sendAsUserMessage(message: string, pi: ExtensionAPI, ctx: any) {
		// Try to send the command with retries
		let success = false;
		for (let i = 0; i < 10; i++) {
			try {
				pi.sendUserMessage(message, { deliverAs: "followUp" });
				success = true;
				break;
			} catch (error) {
				if (error instanceof Error && error.message.includes("already processing")) {
					await new Promise(resolve => setTimeout(resolve, 200));
				} else {
					throw error;
				}
			}
		}
		
		if (!success) {
			throw new Error("Failed to send message after retries");
		}
	}

	// Helper function to execute a command immediately
	async function executeCommandImmediately(command: string, pi: ExtensionAPI, ctx: any) {
		// Parse the command
		const { command: cmd, args } = parseCommand(command);
		
		// Handle known commands directly
		try {
			if (cmd === '/msg') {
				// Handle /msg command directly
				await handleMsgCommand(args, pi, ctx);
			} else if (cmd === '/show-msg') {
				// Handle /show-msg command directly
				await handleShowMsgCommand(args, ctx);
			} else if (cmd === '/change-msg') {
				// For /change-msg, we can't execute it properly without UI
				// So we'll send it as a user message (won't work as command)
				ctx.ui.notify(`Cannot execute /change-msg from queue (requires interactive mode)`, "warning");
			} else {
				// For unknown commands, try to send as user message
				// This won't execute as a command, but at least won't break
				await sendAsUserMessage(command, pi, ctx);
			}
		} catch (error) {
			ctx.ui.notify(`Failed to execute command: ${command}`, "error");
		}
	}

	pi.registerCommand("q", {
		description: "Queue a message to be sent when the agent finishes its current task",
		handler: async (args, ctx) => {
			if (!args || !args.trim()) {
				ctx.ui.notify("Usage: /q <message> - queues a message for when the agent is idle", "warning");
				return;
			}

			const message = args.trim();
			const isCommand = message.startsWith("/");

			if (isCommand) {
				// Check if agent is idle
				if (ctx.isIdle()) {
					// Agent is idle, execute immediately
					ctx.ui.notify(`Executing command immediately: ${message}`, "info");
					await executeCommandImmediately(message, pi, ctx);
				} else {
					// Agent is busy, queue the command
					queuedCommands.push(message);
					ctx.ui.notify(`Queued command: ${message}. Will execute when agent is idle.`, "info");
				}
			} else {
				// Regular messages can be queued as followUp
				ctx.ui.notify("Queued. Will send when agent is idle.", "info");
				pi.sendUserMessage(message, { deliverAs: "followUp" });
			}
		},
	});
}
