import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const COMMIT_TYPES = ["FIX", "IMPROVE", "NEW"] as const;

export default function (pi: ExtensionAPI) {
	let gitCommitUsed = false;

	const containsBlockedGitCommand = (command: string): boolean => {
		const blockedCommands = /\bgit\s+(add|commit|push|pull|fetch|merge|rebase|reset|clean|stash|rm|restore|checkout(?:\s+-[Bb])?|init|clone)/;
		return blockedCommands.test(command);
	};

	pi.on("tool_call", async (event) => {
		if (event.toolName !== "bash") return undefined;
		const command = (event.input.command as string).trim();
		if (containsBlockedGitCommand(command)) {
			return { block: true, reason: "Mutative git commands are blocked" };
		}
		return undefined;
	});

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
			if (gitCommitUsed) {
				return { content: [{ type: "text", text: "Tool already used. Run /commit again to commit more changes." }], details: {} };
			}

			const { type, message } = params;
			if (!COMMIT_TYPES.includes(type as typeof COMMIT_TYPES[number])) {
				return { content: [{ type: "text", text: `Invalid type: ${type}. Must be one of: ${COMMIT_TYPES.join(", ")}` }], details: {}, isError: true };
			}

			const fullMessage = `${type}: ${message}`;

			const status = await pi.exec("git", ["status", "--porcelain"], { signal });
			const hasStaged = status.stdout.split("\n").some((line) => line.trim());
			if (!hasStaged) {
				pi.setActiveTools(pi.getActiveTools().filter((t) => t !== "git_commit"));
				return { content: [{ type: "text", text: "No staged files. Run /commit first." }], details: {} };
			}

			const result = await pi.exec("git", ["commit", "-m", fullMessage], { signal });
			if (result.code !== 0) {
				pi.setActiveTools(pi.getActiveTools().filter((t) => t !== "git_commit"));
				return { content: [{ type: "text", text: `Commit failed: ${result.stderr}` }], details: {} };
			}

			gitCommitUsed = true;
			pi.setActiveTools(pi.getActiveTools().filter((t) => t !== "git_commit"));
			return { content: [{ type: "text", text: `✓ Committed: ${fullMessage}` }], details: {} };
		},
	});

	pi.on("session_start", () => {
		pi.setActiveTools(pi.getActiveTools().filter((t) => t !== "git_commit"));
	});

	pi.registerCommand("commit", {
		description: "Stage files and show diff for commit",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("commit requires interactive mode", "error");
				return;
			}

			await ctx.ui.setWorkingMessage("Staging files...");
			const addResult = await pi.exec("git", ["add", "."]);
			if (addResult.code !== 0) {
				ctx.ui.notify(`git add failed: ${addResult.stderr}`, "error");
				return;
			}

			await ctx.ui.setWorkingMessage("Getting diff...");
			const diffResult = await pi.exec("git", ["diff", "--staged"]);
			if (diffResult.code !== 0) {
				ctx.ui.notify(`git diff failed: ${diffResult.stderr}`, "error");
				return;
			}

			if (!diffResult.stdout.trim()) {
				ctx.ui.notify("Nothing to commit (empty diff). Stage files first.", "warning");
				return;
			}

			const diff = diffResult.stdout || "(no changes staged)";

			gitCommitUsed = false;
			const activeTools = pi.getActiveTools();
			if (!activeTools.includes("git_commit")) {
				pi.setActiveTools([...activeTools, "git_commit"]);
			}

			const prompt = `DO NOT use bash for git. Use ONLY the \`git_commit\` tool.\n\nReview staged changes:\n\`\`\`diff\n${diff}\`\`\`\n\nUse \`git_commit\` tool with:\n- type: FIX (bug fix), IMPROVE (improvement), or NEW (new feature)\n- message: brief description (imperative mood). Multi-line allowed for detailed changes.`;
			pi.sendUserMessage(prompt);
		},
	});

	pi.on("session_shutdown", () => {
		gitCommitUsed = false;
	});
}
