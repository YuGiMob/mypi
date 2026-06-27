import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";

/**
 * fast-search — transparent grep→rg / find→fd rewriting.
 *
 * Instead of registering separate rg/fd tools and blocking grep/find (which
 * forces a costly round-trip where the model reformulates the command), this
 * extension rewrites grep/egrep/fgrep → rg and find → fd directly inside bash
 * commands before they run. The model and the user never have to notice.
 *
 * How: pi's `tool_call` event lets handlers mutate `event.input` in place. We
 * parse the bash command into shell tokens (quote- and bracket-aware), translate
 * any grep/find segments, and write the result back. Translation is conservative:
 * if a find expression uses primaries we don't model, that segment is left
 * untouched (it still runs correctly, just slower).
 *
 * Flag compatibility is the tricky part — rg and grep share many flags but a few
 * differ dangerously, e.g. `grep -r` (recursive) vs `rg -r` (--replace, which
 * silently swallows the next argument). Those few are handled explicitly
 * (verified against rg 13 / fd 10); the rest pass through verbatim.
 *
 * Built-in `grep`/`find` tools are still blocked as a safety net: they are slow
 * and, with the rg/fd tools gone, there is nothing to convert them into.
 */

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (isToolCallEventType("bash", event)) {
      const out = rewriteCommand(event.input.command);
      if (out) {
        event.input.command = out.command;
        const tools = [...new Set(out.notes)].join(", ");
        ctx?.ui?.notify(`fast-search ⟳ ${tools} → ${out.command}`.slice(0, 120), "info");
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
}

// ---------------------------------------------------------------------------
// Command rewriting
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// grep → rg
// ---------------------------------------------------------------------------

/** grep short flags that are incompatible or change meaning in rg → drop. */
const GREP_DROP_SHORT = new Set(["r", "R", "E", "G", "T", "u", "U", "I", "L", "s", "d", "D", "y", "M"]);
/** grep short flags that take the next argument (or rest of the bundle) as a value. */
const GREP_VALUE_SHORT = new Set(["A", "B", "C", "m", "e", "f"]);
/** grep short flag → a different rg short flag (e.g. -h no-filename → rg -I). */
const GREP_XLATE_SHORT: Record<string, string> = { h: "I", Z: "0" };
/** grep long flags to drop (rg equivalents differ or are absent). */
const GREP_DROP_LONG = new Set([
  "recursive", "dereference-recursive", "extended-regexp", "basic-regexp", "no-messages",
  "initial-tabs", "unix-byte-offsets", "binary", "directories", "line-buffered", "null-data",
]);

function translateGrep(cmd: string, tokens: Token[]): string {
  const out: string[] = ["rg"];
  if (cmd === "fgrep") out.push("-F");

  for (let i = 1; i < tokens.length; i++) {
    const val = tokens[i].value;

    if (val === "--") {
      // Everything after `--` is positional; emit verbatim and stop processing.
      out.push(tokens[i].raw);
      for (let j = i + 1; j < tokens.length; j++) out.push(tokens[j].raw);
      break;
    }

    if (val.startsWith("--")) {
      const eq = val.indexOf("=");
      const longName = eq >= 0 ? val.slice(2, eq) : val.slice(2);
      const inlineVal = eq >= 0 ? val.slice(eq + 1) : undefined;

      if (GREP_DROP_LONG.has(longName)) continue;
      if (longName === "perl-regexp") { out.push("-P"); continue; }
      if (longName === "null") { out.push("--null"); continue; }
      if (longName === "with-filename" || longName === "no-filename") { out.push(tokens[i].raw); continue; }

      if (longName === "include" || longName === "exclude" || longName === "exclude-dir") {
        const glob = inlineVal ?? tokens[++i]?.value;
        if (glob === undefined) { out.push(tokens[i].raw); continue; }
        out.push("--glob", quote(longName === "include" ? glob : `!${glob}`));
        continue;
      }

      out.push(tokens[i].raw); // unknown long flag: pass through (rg errors visibly if unsupported)
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
        if (c in GREP_XLATE_SHORT) {
          kept += GREP_XLATE_SHORT[c];
        } else if (GREP_DROP_SHORT.has(c)) {
          // dropped
        } else if (GREP_VALUE_SHORT.has(c)) {
          const rest = chars.slice(k + 1);
          flushKept();
          out.push(`-${c}`);
          if (rest) out.push(quote(rest)); // e.g. -C2 → -C 2
          else {                              // e.g. -C 2 → -C 2 (value is the next token)
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

    out.push(tokens[i].raw); // positional (pattern / file) — keep verbatim
  }

  return out.join(" ");
}

// ---------------------------------------------------------------------------
// find → fd  (common primaries only; unknown expressions are left as `find`)
// ---------------------------------------------------------------------------

const FIND_TYPE = /^[fdlbcps]$/;

function translateFind(tokens: Token[]): string | null {
  const out: string[] = ["fd"];
  const paths: string[] = [];
  let pattern: string | null = null;
  let pathFlag = false;

  for (let i = 1; i < tokens.length; i++) {
    const val = tokens[i].value;

    if (val === "-name" || val === "-iname" || val === "-path") {
      if (pattern !== null) return null; // multiple patterns: bail out
      const p = tokens[++i]?.value;
      if (p === undefined) return null;
      pattern = p;
      if (val === "-path") pathFlag = true;
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
      // Any other primary/option we don't model → leave the whole command as find.
      return null;
    }
    paths.push(val); // positional search path(s)
  }

  // find -name/-iname/-path are globs; fd is regex by default, so request glob mode.
  if (pattern !== null) out.push("--glob");
  if (pathFlag) out.push("-p");
  out.push(pattern !== null ? quote(pattern) : ".");
  for (const p of paths) out.push(quote(p));
  return out.join(" ");
}

// ---------------------------------------------------------------------------
// Shell tokenizer (quote- and bracket-aware)
// ---------------------------------------------------------------------------

interface Token {
  raw: string; // original substring, quotes/escapes intact
  value: string; // unquoted value
}
interface Segment {
  sep: string; // operator + whitespace preceding this segment
  original: string; // `sep` + the segment body, verbatim (used when untranslated)
  tokens: Token[];
}

function splitSegments(command: string): Segment[] {
  const s = command.replace(/\\\r?\n/g, " "); // join line continuations
  const toks: Token[] = [];
  const gaps: string[] = []; // substring preceding each token
  const newSegs: boolean[] = []; // does that substring contain a command separator?

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
      gapHasSep = true; // the gap before the next token contains a separator
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

// ---------------------------------------------------------------------------
// Quoting / dequoting helpers
// ---------------------------------------------------------------------------

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

/** Command name from a token value, stripping a leading path and/or backslash escapes. */
function basename(value: string): string {
  return value.replace(/^\\+/, "").replace(/^.*\//, "");
}
