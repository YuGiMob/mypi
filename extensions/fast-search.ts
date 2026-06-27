import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";

const execFileAsync = promisify(execFile);

const RG_BIN = resolveBinary("rg");
const FD_BIN = resolveBinary("fd");

const MAX_LINES = 500;
const MAX_BUFFER = 10 * 1024 * 1024;
const TIMEOUT_MS = 30_000;

function resolveBinary(name: string): string {
  const commonPaths = [
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    `${process.env.HOME}/.pi/agent/bin`,
    `${process.env.HOME}/.local/bin`,
    `${process.env.HOME}/.cargo/bin`,
  ];
  const pathEnv = process.env.PATH || "";
  for (const dir of [...pathEnv.split(":"), ...commonPaths]) {
    const full = `${dir}/${name}`;
    if (existsSync(full)) return full;
  }
  return name;
}

interface SearchOutcome {
  text: string;
  matchCount: number;
}

/**
 * Run a search binary (rg/fd) and return truncated stdout (≤ MAX_LINES lines).
 * Exit code 1 means "no matches", which is reported as an empty result, not an error.
 */
async function runSearch(bin: string, args: string[], cwd: string, emptyMsg: string): Promise<SearchOutcome> {
  try {
    const { stdout } = await execFileAsync(bin, args, {
      cwd,
      encoding: "utf-8",
      maxBuffer: MAX_BUFFER,
      timeout: TIMEOUT_MS,
    });
    const lines = stdout.split("\n").filter(Boolean);
    const text =
      lines.length > MAX_LINES
        ? lines.slice(0, MAX_LINES).join("\n") + `\n\n... (${lines.length - MAX_LINES} more lines truncated)`
        : stdout;
    return { text: text || emptyMsg, matchCount: lines.length };
  } catch (err: unknown) {
    const error = err as { code?: number | string; stderr?: string; message?: string };
    if (error.code === 1) {
      return { text: emptyMsg, matchCount: 0 };
    }
    throw new Error(error.stderr?.trim() || error.message || "unknown error");
  }
}

/** Quote an arg for human-readable display only (execution uses an arg array, no shell). */
function quoteForDisplay(arg: string): string {
  return arg.includes("*") || arg.includes(" ") ? `'${arg}'` : arg;
}

function displayCmd(name: string, args: string[]): string {
  return `${name} ${args.map(quoteForDisplay).join(" ")}`;
}

/** Shared result/error handling for the rg and fd tools. */
async function executeSearch(name: string, bin: string, args: string[], cwd: string, emptyMsg: string) {
  const command = displayCmd(name, args);
  try {
    const { text, matchCount } = await runSearch(bin, args, cwd, emptyMsg);
    return {
      content: [{ type: "text" as const, text }],
      details: { command, matchCount },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown error";
    return {
      content: [{ type: "text" as const, text: `${name} error: ${message}` }],
      details: { command },
      isError: true,
    };
  }
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "rg",
    label: "Ripgrep",
    description:
      "Search file contents using ripgrep (rg). Fast alternative to grep. Supports regex patterns, glob filtering, and context lines.",
    promptSnippet: "Search file contents using rg (ripgrep) — prefer this over bash+grep",
    promptGuidelines: [
      "Always use the `rg` tool instead of bash+grep — it's orders of magnitude faster",
      "Use rg for all file content searches; do NOT fall back to grep in bash",
    ],
    parameters: Type.Object({
      pattern: Type.String({ description: "Search pattern (regex supported)" }),
      path: Type.Optional(
        Type.String({
          description: "Directory or file to search in (default: current directory)",
        }),
      ),
      glob: Type.Optional(
        Type.String({
          description: "File glob pattern to filter (e.g., '*.ts', '*.rs', '*.py')",
        }),
      ),
      context: Type.Optional(
        Type.Number({
          description: "Show N lines of context before and after each match",
        }),
      ),
      maxResults: Type.Optional(
        Type.Number({
          description: "Maximum number of matching lines to return",
        }),
      ),
      ignoreCase: Type.Optional(
        Type.Boolean({ description: "Case-insensitive search (default: false)" }),
      ),
      fixedStrings: Type.Optional(
        Type.Boolean({
          description: "Treat pattern as a literal string, not a regex (default: false)",
        }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const args: string[] = ["-n", "--heading", "--color", "never"];

      if (params.ignoreCase) args.push("-i");
      if (params.fixedStrings) args.push("-F");
      if (params.glob) args.push("--glob", params.glob);
      if (params.context) args.push("-C", String(params.context));
      if (params.maxResults) args.push("-m", String(params.maxResults));

      args.push(params.pattern);
      if (params.path) args.push(params.path);

      return executeSearch("rg", RG_BIN, args, ctx.cwd, "(no matches found)");
    },
  });

  pi.registerTool({
    name: "fd",
    label: "Fd-find",
    description:
      "Find files and directories using fd (fd-find). Fast alternative to find. Supports glob patterns, file type filtering, and extension filtering.",
    promptSnippet: "Find files using fd (fd-find) — prefer this over bash+find",
    promptGuidelines: [
      "Always use the `fd` tool instead of bash+find — it's much faster",
      "Use fd for all file/directory searches; do NOT fall back to find in bash",
    ],
    parameters: Type.Object({
      pattern: Type.Optional(
        Type.String({ description: "File name pattern to search for (optional if extension is provided)" }),
      ),
      path: Type.Optional(
        Type.String({
          description: "Directory to search in (default: current directory)",
        }),
      ),
      type: Type.Optional(
        Type.String({
          description: "File type filter: 'f' (file), 'd' (directory), 'l' (symlink)",
        }),
      ),
      extension: Type.Optional(
        Type.String({
          description: "Filter by file extension (e.g., 'ts', 'rs', 'py')",
        }),
      ),
      maxResults: Type.Optional(
        Type.Number({ description: "Maximum number of results to return" }),
      ),
      hidden: Type.Optional(
        Type.Boolean({ description: "Search hidden files and directories (default: false)" }),
      ),
      caseSensitive: Type.Optional(
        Type.Boolean({ description: "Case-sensitive search (default: false)" }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!params.pattern && !params.extension) {
        return {
          content: [{ type: "text", text: "Provide at least one of `pattern` or `extension`." }],
          details: {},
          isError: true,
        };
      }

      const args: string[] = ["--color", "never"];

      if (params.type) args.push("-t", params.type);
      if (params.extension) args.push("-e", params.extension);
      if (params.maxResults) args.push("--max-results", String(params.maxResults));
      if (params.hidden) args.push("--hidden");
      if (params.caseSensitive) args.push("--case-sensitive");

      args.push(params.pattern || ".");
      if (params.path) args.push(params.path);

      return executeSearch("fd", FD_BIN, args, ctx.cwd, "(no files found)");
    },
  });

  pi.on("tool_call", async (event) => {
    if (event.toolName === "grep") {
      return {
        block: true,
        reason:
          "`grep` is too slow on large codebases. Use the `rg` tool instead — it's orders of magnitude faster and supports regex, globs, and context lines.",
      };
    }

    if (event.toolName === "find") {
      return {
        block: true,
        reason:
          "`find` is too slow on large codebases. Use the `fd` tool instead — it's much faster and supports globs, file type filtering, and extension filtering.",
      };
    }

    if (event.toolName === "bash") {
      const cmd = (event.input as { command?: string }).command || "";
      const grepFindPattern = /(?:^|[|;&])\s*(grep|find)\b/;
      if (grepFindPattern.test(cmd)) {
        return {
          block: true,
          reason:
            "Don't use `grep` or `find` in bash — they're too slow on large codebases. Use the `rg` tool (for searching file contents) or the `fd` tool (for finding files) instead.",
        };
      }
    }
  });
}
