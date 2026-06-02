/**
 * Git Commit Extension
 *
 * 1. Blocks ALL git mutative commands - model must use git_commit tool
 * 2. Blocks user bash (!git, !!git) commands
 * 3. Provides /commit command that stages files, shows diff, then commits via tool
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const COMMIT_TYPES = ["FIX", "IMPROVE", "NEW"] as const;

export default function (pi: ExtensionAPI) {
	// Track if git_commit was just used (to prevent re-use)
	let gitCommitUsed = false;

	// Helper to check if command contains blocked git operations
	// Blocks: add, commit, push, merge, rebase, reset, clean, stash, pull, fetch, rm
	// Allows: status, log, diff, show, branch, checkout (without -b), restore
	const containsBlockedGitCommand = (command: string): boolean => {
		const blockedCommands = /\bgit\s+(add|commit|push|pull|fetch|merge|rebase|reset|clean|stash|rm|restore|checkout(?:\s+-[Bb])?|init|clone)/;
		return blockedCommands.test(command);
	};

	// Block ALL git commands from LLM bash tool calls
	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "bash") return undefined;

		const command = (event.input.command as string).trim();
		if (containsBlockedGitCommand(command)) {
			return { block: true, reason: "Mutative git commands are blocked" };
		}

		return undefined;
	});

	// Custom git_commit tool for committing
	pi.registerTool({
		name: "git_commit",
		label: "Git Commit",
		description: "Commit staged changes. Run /commit first to see the diff and decide on type/message.",
		parameters: Type.Object({
			type: Type.Union([Type.Literal("FIX"), Type.Literal("IMPROVE"), Type.Literal("NEW")]),
			message: Type.String({
				description: "Commit message (imperative mood). Multi-line allowed for detailed changes.",
			}),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			// Prevent re-use after successful commit
			if (gitCommitUsed) {
				return {
					content: [{ type: "text", text: "Tool already used. Run /commit again to commit more changes." }],
					details: {},
				};
			}

			const { type, message } = params;

			// Validate type
			if (!COMMIT_TYPES.includes(type as typeof COMMIT_TYPES[number])) {
				return {
					content: [{ type: "text", text: `Invalid type: ${type}. Must be one of: ${COMMIT_TYPES.join(", ")}` }],
					details: {},
					isError: true,
				};
			}

			const fullMessage = `${type}: ${message}`;

			// Check if there are staged files
			const status = await pi.exec("git", ["status", "--porcelain"], { signal });
			const hasStaged = status.stdout.split("\n").some((line) => line.trim());

			if (!hasStaged) {
				pi.setActiveTools(pi.getActiveTools().filter((t) => t !== "git_commit"));
				return {
					content: [{ type: "text", text: "No staged files. Run /commit first." }],
					details: {},
				};
			}

			// Execute commit
			const result = await pi.exec("git", ["commit", "-m", fullMessage], { signal });

			if (result.code !== 0) {
				pi.setActiveTools(pi.getActiveTools().filter((t) => t !== "git_commit"));
				return {
					content: [{ type: "text", text: `Commit failed: ${result.stderr}` }],
					details: {},
				};
			}

			// Mark as used and disable tool to prevent re-use
			gitCommitUsed = true;
			pi.setActiveTools(pi.getActiveTools().filter((t) => t !== "git_commit"));

			return {
				content: [{ type: "text", text: `✓ Committed: ${fullMessage}` }],
				details: {},
			};
		},
	});

	// Remove git_commit from active tools by default (only enabled during /commit)
	pi.on("session_start", () => {
		pi.setActiveTools(pi.getActiveTools().filter((t) => t !== "git_commit"));
	});

	// /commit command
	pi.registerCommand("commit", {
		description: "Stage files and show diff for commit",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("commit requires interactive mode", "error");
				return;
			}

			// git add .
			await ctx.ui.setWorkingMessage("Staging files...");
			const addResult = await pi.exec("git", ["add", "."]);

			if (addResult.code !== 0) {
				ctx.ui.notify(`git add failed: ${addResult.stderr}`, "error");
				return;
			}

			// git diff --staged
			await ctx.ui.setWorkingMessage("Getting diff...");
			const diffResult = await pi.exec("git", ["diff", "--staged"]);

			if (diffResult.code !== 0) {
				ctx.ui.notify(`git diff failed: ${diffResult.stderr}`, "error");
				return;
			}

			// Check for empty diff (nothing to commit)
			if (!diffResult.stdout.trim()) {
				ctx.ui.notify("Nothing to commit (empty diff). Stage files first.", "warning");
				return;
			}

			const diff = diffResult.stdout || "(no changes staged)";

			// Reset the used flag and enable git_commit tool
			gitCommitUsed = false;
			const activeTools = pi.getActiveTools();
			if (!activeTools.includes("git_commit")) {
				pi.setActiveTools([...activeTools, "git_commit"]);
			}

			// Send diff to LLM for analysis
			const prompt = `DO NOT use bash for git. Use ONLY the \`git_commit\` tool.\n\nReview staged changes:\n\`\`\`diff\n${diff}\`\`\`\n\nUse \`git_commit\` tool with:\n- type: FIX (bug fix), IMPROVE (improvement), or NEW (new feature)\n- message: brief description (imperative mood). Multi-line allowed for detailed changes.`;

				pi.sendUserMessage(prompt);
		},
	});

	// Clear state on session shutdown
	pi.on("session_shutdown", () => {
		gitCommitUsed = false;
	});
}
