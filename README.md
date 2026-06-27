# mypi

My personal [pi](https://github.com/badlogic/pi-mono) configuration: extensions, providers, settings, and `.gitignore`.

The repo lives at `~/.pi/agent/` (the pi config root) and is checked in directly — no symlinks.

## Layout

```
~/.pi/agent/
├── .gitignore          # Excludes secrets, sessions, binaries, deps, builds
├── README.md
├── settings.json       # Pi settings (default model/provider, theme, compaction, packages)
├── extensions/         # Pi extensions (auto-discovered by pi)
│   ├── commit.ts       # /commit command + git_commit tool; blocks mutative git in bash
│   ├── error-retry.ts  # Auto-retry auth (401) errors from cloud relays
│   ├── fast-search.ts  # Auto-rewrites grep→rg and find→fd inside bash commands
│   ├── focus-caret.ts  # Green visible cursor; hides caret while typing slash commands
│   ├── freetheai.ts    # FreeTheAI provider
│   ├── messages.ts     # /msg, /change-msg, /show-msg commands
│   ├── messages.json   # Storage for predefined messages
│   ├── ollama-cloud.ts # Ollama Cloud provider
│   ├── queue.ts        # /q — queue a message for when the agent is idle
│   ├── vsllm.ts        # VSLLM providers (OpenAI + Anthropic)
│   └── web-search.ts   # web_search tool (Exa/Brave/Tavily/Perplexity fallback)
├── auth.json           # NOT tracked — API keys
├── bin/                # NOT tracked — local binaries (e.g. fd)
├── npm/                # NOT tracked — npm dependencies
└── sessions/           # NOT tracked — conversation history
```

## Setup on a new machine

```bash
git clone https://github.com/YuGiMob/mypi.git ~/.pi/agent
# auth.json is not in git; populate it manually or via /login
```

## Auth

API keys live in `~/.pi/agent/auth.json` and are excluded by `.gitignore`.

## Settings

`settings.json` sets the default model/provider, enables compaction, and pulls in the
`pi-hashline-edit-pro` package:

```json
{
  "defaultModel": "glm-5.2-anthropic",
  "defaultProvider": "vsllm-anthropic",
  "packages": ["npm:pi-hashline-edit-pro"],
  "compaction": { "enabled": true },
  "retry": { "baseDelayMs": 5000 },
  "theme": "dark"
}
```

## Extensions

Extensions are auto-discovered TypeScript files loaded by pi via [jiti](https://github.com/unjs/jiti),
so TypeScript works without a build step. Each file exports a default factory
`(pi: ExtensionAPI) => void` (async for providers).

### Tools

#### `fast-search.ts` — transparent `grep`→`rg` / `find`→`fd` rewriting
Instead of registering separate `rg`/`fd` tools and blocking `grep`/`find` (which forces the
model to reformulate the command), this extension rewrites `grep`/`egrep`/`fgrep` → `rg` and
`find` → `fd` **in place** inside `bash` commands before they run, via pi's mutable
`tool_call` input. The few flags that differ dangerously are handled explicitly (verified
against rg 13 / fd 10) — notably `grep -r` is dropped because `rg -r` means `--replace`, and
`grep -E`/`-G`/`-P`(-P kept) and the regex/`--include`/`--exclude` flags are normalized. `find`
expressions using modelled primaries (`-name`/`-iname`/`-path`/`-type`/`-maxdepth`/`-mindepth`)
are translated to `fd`; anything else (`-exec`, `-delete`, boolean logic, …) is left untouched so
it still runs correctly. The built-in `grep`/`find` tools remain blocked as a safety net.

#### `commit.ts` — `/commit` + `git_commit`
Stages changes and shows the diff via `/commit`, then exposes a single-use `git_commit` tool
(`type: FIX | IMPROVE | NEW`). Mutative git commands (`git add|commit|push|...`) are blocked in
`bash` so commits go through the tool.

#### `web-search.ts` — `web_search`
Web search with a provider fallback chain. Set **one** of:
- `EXA_API_KEY` (Exa — recommended for code/technical)
- `BRAVE_SEARCH_API_KEY` (Brave Search)
- `TAVILY_API_KEY` (Tavily)
- `PERPLEXITY_API_KEY` (Perplexity)

### Providers

Each provider discovers its model list from the vendor API at load time and augments it with a
hardcoded `KNOWN_MODELS` metadata map (reasoning/vision flags, context window, max tokens).

- **`freetheai.ts`** — [FreeTheAI](https://freetheai.xyz) (`$FREETHEAI_API_KEY`).
- **`ollama-cloud.ts`** — [Ollama Cloud](https://ollama.com) (`$OLLAMA_API_KEY`).
- **`vsllm.ts`** — [VSLLM](https://vsllm.com) (`$VSLLM_API_KEY`, required). Splits models into
  OpenAI-compatible and Anthropic-compatible providers.

### Reliability

#### `error-retry.ts` — auth-error auto-retry
Retries transient auth errors (`401` / `unauthorized` / `invalid api key`) from the cloud relays
listed in `RELAY_PROVIDERS` (vsllm, vsllm-anthropic, freetheai, ollama-cloud by default). It reads
the failing message's own `provider` / `stopReason` / `errorMessage` fields, backs off
exponentially (5s → 30s), and resends up to `MAX_ATTEMPTS` (5) times. The attempt counter only
stays raised across consecutive 401 retries and resets as soon as a turn ends any other way
(success, abort, non-auth error, or after exhausting retries) — driven from `agent_end`, since
`before_agent_start` does not fire for followUp-triggered turns. Reload is required after
editing: pi loads extensions only at
startup (or after `/reload`); run `/retry-status` to confirm this extension is active.

Transient errors (5xx / overloaded / rate-limit) are **not** handled here — pi's built-in
agent-level retry covers those. Tune its speed in `settings.json` via `retry.baseDelayMs`
(default 2000 ms → 2s/4s/8s backoff):

```json
"retry": { "baseDelayMs": 5000 }
```

### Commands & UX

- **`messages.ts`** — `/msg <n>`, `/change-msg <n> "<text>"`, `/show-msg <n>`. Messages persist to
  `messages.json`. All three commands support argument autocompletion.
- **`queue.ts`** — `/q <message>` queues a message sent as a follow-up when the agent is idle.
- **`focus-caret.ts`** — Makes the cursor green and keeps it visible while focused; hides the fake
  caret while typing slash commands.
