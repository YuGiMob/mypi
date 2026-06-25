import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

// Resolve rg and fd binary paths (handle non-standard PATH in execSync)
function resolveBinary(name: string): string {
  const commonPaths = [
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    `${process.env.HOME}/.pi/agent/bin`,
    `${process.env.HOME}/.local/bin`,
    `${process.env.HOME}/.cargo/bin`,
  ];
  // Check PATH first
  const pathEnv = process.env.PATH || "";
  for (const dir of [...pathEnv.split(":"), ...commonPaths]) {
    const full = `${dir}/${name}`;
    if (existsSync(full)) return full;
  }
  return name; // fallback, let it fail with a clear error
}

const RG_BIN = resolveBinary("rg");
const FD_BIN = resolveBinary("fd");
export default function (pi: ExtensionAPI) {
  // ── Register `rg` (ripgrep) as a first-class tool ──────────────
  pi.registerTool({
    name: "rg",
    label: "Ripgrep",
    description:
      "Search file contents using ripgrep (rg). Fast alternative to grep. Supports regex patterns, glob filtering, and context lines.",
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
      const args: string[] = ["--no-heading", "--color", "never"];

      if (params.ignoreCase) args.push("-i");
      if (params.fixedStrings) args.push("-F");
      if (params.glob) {
        args.push("--glob", params.glob);
      }
      if (params.context) {
        args.push("-C", String(params.context));
      }
      if (params.maxResults) {
        args.push("-m", String(params.maxResults));
      }

      args.push(params.pattern);
      if (params.path) {
        args.push(params.path);
      }

      const escapedCmd = `${RG_BIN} ${args.map(escapeArg).join(" ")}`;
      const displayCmd = `rg ${args.map(a => a.includes("*") || a.includes(" ") ? `'${a}'` : a).join(" ")}`;

      try {
        const stdout = execSync(escapedCmd, {
          cwd: ctx.cwd,
          encoding: "utf-8",
          maxBuffer: 10 * 1024 * 1024, // 10MB
          timeout: 30_000,
          stdio: ["ignore", "pipe", "pipe"],
        });

        const lines = stdout.split("\n").filter(Boolean);
        const result =
          lines.length > 500
            ? lines.slice(0, 500).join("\n") +
              `\n\n... (${lines.length - 500} more lines truncated)`
            : stdout;

        return {
          content: [
            {
              type: "text",
              text: `$ ${displayCmd}\n${result || "(no matches found)"}`,
            },
          ],
          details: { command: displayCmd, matchCount: lines.length },
        };
      } catch (err: unknown) {
        const error = err as { stderr?: string; message?: string; status?: number };
        // rg exits with code 1 when no matches found — that's not an error
        if (error.status === 1) {
          return {
            content: [{ type: "text", text: `$ ${displayCmd}\n(no matches found)` }],
            details: { command: displayCmd, matchCount: 0 },
          };
        }
        return {
          content: [
            {
              type: "text",
              text: `$ ${displayCmd}\nrg error: ${error.stderr?.trim() || error.message || "unknown error"}`,
            },
          ],
          details: { command: displayCmd },
          isError: true,
        };
      }
    },
  });

  // ── Register `fd` (fd-find) as a first-class tool ──────────────
  pi.registerTool({
    name: "fd",
    label: "Fd-find",
    description:
      "Find files and directories using fd (fd-find). Fast alternative to find. Supports glob patterns, file type filtering, and extension filtering.",
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
      if (params.path) {
        args.push(params.path);
      }

      const escapedCmd = `${FD_BIN} ${args.map(escapeArg).join(" ")}`;
      const displayCmd = `fd ${args.map(a => a.includes("*") || a.includes(" ") ? `'${a}'` : a).join(" ")}`;

      try {
        const stdout = execSync(escapedCmd, {
          cwd: ctx.cwd,
          encoding: "utf-8",
          maxBuffer: 10 * 1024 * 1024, // 10MB
          timeout: 30_000,
          stdio: ["ignore", "pipe", "pipe"],
        });

        const lines = stdout.split("\n").filter(Boolean);
        const result =
          lines.length > 500
            ? lines.slice(0, 500).join("\n") +
              `\n\n... (${lines.length - 500} more results truncated)`
            : stdout;

        return {
          content: [
            {
              type: "text",
              text: `$ ${displayCmd}\n${result || "(no files found)"}`,
            },
          ],
          details: { command: displayCmd, matchCount: lines.length },
        };
      } catch (err: unknown) {
        const error = err as { stderr?: string; message?: string; status?: number };
        if (error.status === 1) {
          return {
            content: [{ type: "text", text: `$ ${displayCmd}\n(no files found)` }],
            details: { command: displayCmd, matchCount: 0 },
          };
        }
        return {
          content: [
            {
              type: "text",
              text: `$ ${displayCmd}\nfd error: ${error.stderr?.trim() || error.message || "unknown error"}`,
            },
          ],
          details: { command: displayCmd },
          isError: true,
        };
      }
    },
  });

  // ── Block the slow built-in tools and bash commands ──────────
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

    // Also block bash commands that use grep or find directly
    if (event.toolName === "bash") {
      const cmd = (event.input as { command?: string }).command || "";
      // Check if the command starts with or pipes to grep/find
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

/** Shell-escape a single argument for execSync */
function escapeArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}
