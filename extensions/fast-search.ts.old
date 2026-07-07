import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";

const conversions = new Map<string, { original: string; converted: string; notes: string[] }>();

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (isToolCallEventType("bash", event)) {
      const original = event.input.command;
      const out = rewriteCommand(original);
      if (out) {
        const notes = [...new Set(out.notes)];
        conversions.set(event.toolCallId, { original, converted: out.command, notes });
        event.input.command = out.command;
        ctx?.ui?.notify(`fast-search ⟳ ${notes.join(", ")} — ${original} → ${out.command}`, "info");
      }
      return undefined;
    }

    if (event.toolName === "grep" || event.toolName === "find") {
      return {
        block: true,
        reason: `\`${event.toolName}\` is slow on large codebases. Run it through bash instead — \`grep\`/\`find\` are auto-converted to \`rg\`/\`fd\` there.`,
      };
    }

    return undefined;
  });

  pi.on("tool_result", async (event) => {
    if (event.toolName !== "bash") return undefined;
    const conv = conversions.get(event.toolCallId);
    if (!conv) return undefined;
    conversions.delete(event.toolCallId);

    const note =
      `fast-search ⟳ ${conv.notes.join(", ")}\n` +
      `  was: ${conv.original}\n` +
      `  now: ${conv.converted}`;

    return {
      content: [{ type: "text", text: note }, ...event.content],
    };
  });
}

function rewriteCommand(command: string): { command: string; notes: string[] } | null {
  const segments = splitSegments(command);
  let changed = false;
  const notes: string[] = [];
  const parts = segments.map((seg) => {
    if (!seg.tokens.length) return seg.original;
    const { result, note } = translateSegment(seg.tokens);
    if (result === null) return seg.original;
    changed = true;
    if (note) notes.push(note);
    return `${seg.sep}${result}`;
  });
  return changed ? { command: parts.join(""), notes } : null;
}

function translateSegment(tokens: Token[]): { result: string | null; note?: string } {
  const name = basename(tokens[0].value);
  if (name === "grep" || name === "egrep" || name === "fgrep")
    return { result: translateGrep(name, tokens), note: "grep→rg" };
  if (name === "find") {
    const result = translateFind(tokens);
    return result === null ? { result: null } : { result, note: "find→fd" };
  }
  return { result: null };
}

const GREP_DROP_SHORT = new Set(["r", "R", "E", "G", "T", "u", "U", "I", "s", "y", "M"]);
const GREP_VALUE_SHORT = new Set(["A", "B", "C", "m", "e", "f"]);
const GREP_VALUE_DROP_SHORT = new Set(["d", "D"]);
const GREP_LONG_SHORT: Record<string, string> = { L: "--files-without-match" };
const GREP_XLATE_SHORT: Record<string, string> = { h: "I", Z: "0" };
const GREP_DROP_LONG = new Set([
  "recursive", "dereference-recursive", "extended-regexp", "basic-regexp", "no-messages",
  "initial-tabs", "unix-byte-offsets", "binary", "line-buffered", "null-data",
]);
const GREP_VALUE_DROP_LONG = new Set(["directories", "devices"]);

function translateGrep(cmd: string, tokens: Token[]): string {
  const out: string[] = ["rg"];
  if (cmd === "fgrep") out.push("-F");

  for (let i = 1; i < tokens.length; i++) {
    const val = tokens[i].value;

    if (val === "--") {
      out.push(tokens[i].raw);
      for (let j = i + 1; j < tokens.length; j++) out.push(tokens[j].raw);
      break;
    }

    if (val.startsWith("--")) {
      const eq = val.indexOf("=");
      const longName = eq >= 0 ? val.slice(2, eq) : val.slice(2);
      const inlineVal = eq >= 0 ? val.slice(eq + 1) : undefined;

      if (GREP_DROP_LONG.has(longName)) continue;
      if (GREP_VALUE_DROP_LONG.has(longName)) {
        if (inlineVal === undefined) ++i; // value is the next token; consume and drop it
        continue;
      }
      if (longName === "perl-regexp") { out.push("-P"); continue; }
      if (longName === "null") { out.push("--null"); continue; }
      if (longName === "with-filename" || longName === "no-filename") { out.push(tokens[i].raw); continue; }

      if (longName === "include" || longName === "exclude" || longName === "exclude-dir") {
        const glob = inlineVal ?? tokens[++i]?.value;
        if (glob === undefined) { out.push(tokens[i].raw); continue; }
        out.push("--glob", quote(longName === "include" ? glob : `!${glob}`));
        continue;
      }

      out.push(tokens[i].raw);
      continue;
    }

    if (val.startsWith("-") && val.length > 1 && val !== "-") {
      const chars = val.slice(1);
      let kept = "";
      const flushKept = () => {
        if (kept) { out.push(`-${kept}`); kept = ""; }
      };
      for (let k = 0; k < chars.length; k++) {
        const c = chars[k];
        if (c in GREP_LONG_SHORT) {
          flushKept();
          out.push(GREP_LONG_SHORT[c]);
        } else if (c in GREP_XLATE_SHORT) {
          kept += GREP_XLATE_SHORT[c];
        } else if (GREP_VALUE_DROP_SHORT.has(c)) {
          const rest = chars.slice(k + 1);
          flushKept();
          if (!rest) ++i; // value is the next token; consume and drop it
          break;
        } else if (GREP_DROP_SHORT.has(c)) {
        } else if (GREP_VALUE_SHORT.has(c)) {
          const rest = chars.slice(k + 1);
          flushKept();
          out.push(`-${c}`);
          if (rest) out.push(quote(rest));
          else {
            const next = tokens[++i]?.raw;
            if (next !== undefined) out.push(next);
          }
          break;
        } else {
          kept += c;
        }
      }
      flushKept();
      continue;
    }

    out.push(tokens[i].raw);
  }

  return out.join(" ");
}

const FIND_TYPE = /^[fdlbcps]$/;

function translateFind(tokens: Token[]): string | null {
  // -H -I: find searches hidden and gitignored files too (fd hides them by default)
  const out: string[] = ["fd", "-H", "-I"];
  const paths: string[] = [];
  let patternRaw: string | null = null;
  let pathFlag = false;
  let caseInsensitive = false;

  for (let i = 1; i < tokens.length; i++) {
    const val = tokens[i].value;

    if (val === "-name" || val === "-iname" || val === "-path" || val === "-ipath") {
      if (patternRaw !== null) return null;
      const patToken = tokens[++i];
      if (!patToken) return null;
      // keep the raw token so quoted shell vars (e.g. "$VAR") stay expandable
      patternRaw = patToken.raw;
      if (val === "-path" || val === "-ipath") pathFlag = true;
      if (val === "-iname" || val === "-ipath") caseInsensitive = true;
      continue;
    }
    if (val === "-type") {
      const t = tokens[++i]?.value;
      if (!t || !FIND_TYPE.test(t)) return null;
      out.push("-t", t);
      continue;
    }
    if (val === "-maxdepth" || val === "-mindepth") {
      const d = tokens[++i]?.value;
      if (!d || !/^\d+$/.test(d)) return null;
      out.push(val === "-maxdepth" ? "--max-depth" : "--min-depth", d);
      continue;
    }
    if (val.startsWith("-")) {
      return null;
    }
    paths.push(tokens[i].raw);
  }

  if (patternRaw !== null) out.push("--glob");
  // find -name/-path is case-sensitive; -iname/-ipath is case-insensitive.
  // fd defaults to smart-case, so force the right mode explicitly.
  if (caseInsensitive) out.push("-i");
  else if (patternRaw !== null) out.push("-s");
  if (pathFlag) out.push("-p");
  out.push(patternRaw ?? ".");
  for (const p of paths) out.push(p);
  return out.join(" ");
}

interface Token {
  raw: string;
  value: string;
}
interface Segment {
  sep: string;
  original: string;
  tokens: Token[];
}

function splitSegments(command: string): Segment[] {
  const s = command.replace(/\\\r?\n/g, " ");
  const toks: Token[] = [];
  const gaps: string[] = [];
  const newSegs: boolean[] = [];

  let i = 0;
  const n = s.length;
  let depth = 0;
  let quote: '"' | "'" | null = null;
  let gapStart = 0;
  let gapHasSep = false;
  let tokStart = -1;

  const flush = (end: number) => {
    if (tokStart < 0) return;
    toks.push({ raw: s.slice(tokStart, end), value: unquote(s.slice(tokStart, end)) });
    gaps.push(s.slice(gapStart, tokStart));
    newSegs.push(gapHasSep);
    gapStart = end;
    gapHasSep = false;
    tokStart = -1;
  };

  while (i < n) {
    const c = s[i];

    if (quote === "'") {
      if (c === "'") quote = null;
      i++;
      continue;
    }
    if (quote === '"') {
      if (c === "\\") { i += 2; continue; }
      if (c === '"') quote = null;
      i++;
      continue;
    }
    if (c === "'" || c === '"') { if (tokStart < 0) tokStart = i; quote = c; i++; continue; }
    if (c === "\\") { if (tokStart < 0) tokStart = i; i += 2; continue; }

    if (c === "$" && s[i + 1] === "(") { if (tokStart < 0) tokStart = i; depth++; i += 2; continue; }
    if (c === "`" || c === "(" || c === "{" || c === "[") { if (tokStart < 0) tokStart = i; depth++; i++; continue; }
    if (c === ")" || c === "}" || c === "]") { if (tokStart < 0) tokStart = i; if (depth > 0) depth--; i++; continue; }

    if (depth === 0 && (c === ";" || c === "&" || c === "|" || c === "\n")) {
      flush(i);
      gapHasSep = true;
      i += (c === "&" && s[i + 1] === "&") || (c === "|" && s[i + 1] === "|") ? 2 : 1;
      continue;
    }

    if (depth === 0 && (c === " " || c === "\t" || c === "\r")) {
      flush(i);
      i++;
      continue;
    }

    if (tokStart < 0) tokStart = i;
    i++;
  }
  flush(n);

  const segments: Segment[] = [];
  let cur: Token[] = [];
  let curGaps: string[] = [];
  let curSep = "";
  for (let k = 0; k < toks.length; k++) {
    if (newSegs[k] && cur.length) {
      segments.push(makeSegment(curSep, cur, curGaps));
      cur = [];
      curGaps = [];
      curSep = "";
    }
    if (cur.length === 0) curSep = gaps[k];
    curGaps.push(gaps[k]);
    cur.push(toks[k]);
  }
  if (cur.length) segments.push(makeSegment(curSep, cur, curGaps));
  return segments;
}

function makeSegment(sep: string, tokens: Token[], gaps: string[]): Segment {
  const body = tokens.map((t, idx) => (idx === 0 ? "" : gaps[idx]) + t.raw).join("");
  return { sep, original: sep + body, tokens };
}

function unquote(raw: string): string {
  let out = "";
  let i = 0;
  const n = raw.length;
  let quote: '"' | "'" | null = null;
  while (i < n) {
    const c = raw[i];
    if (quote === "'") {
      if (c === "'") quote = null;
      else out += c;
      i++;
      continue;
    }
    if (quote === '"') {
      if (c === "\\") {
        const next = raw[i + 1];
        if (next === '"' || next === "\\" || next === "$" || next === "`") { out += next; i += 2; continue; }
        out += c;
        i++;
        continue;
      }
      if (c === '"') quote = null;
      else out += c;
      i++;
      continue;
    }
    if (c === "'") { quote = "'"; i++; continue; }
    if (c === '"') { quote = '"'; i++; continue; }
    if (c === "\\") { const next = raw[i + 1]; if (next !== undefined) out += next; i += 2; continue; }
    out += c;
    i++;
  }
  return out;
}

function quote(value: string): string {
  if (value === "") return "''";
  if (/^[A-Za-z0-9@%+=:,./_-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function basename(value: string): string {
  return value.replace(/^\\+/, "").replace(/^.*\//, "");
}
