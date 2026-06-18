# mypi

My personal [pi](https://github.com/badlogic/pi-mono) configuration: extensions, models, settings, and `.gitignore`.

The repo lives at `~/.pi/agent/` (the pi config root) and is checked in directly — no symlinks.

## Layout

```
~/.pi/agent/
├── .gitignore          # Excludes secrets, sessions, binaries, etc.
├── README.md
├── models.json         # Custom model definitions
├── settings.json       # Pi settings (default model, theme, etc.)
├── extensions/         # Pi extensions (auto-discovered by pi)
│   ├── commit.ts.old   # Disabled git commit extension
│   ├── focus-caret.ts  # Custom cursor/focus management
│   ├── messages.ts     # Predefined message management
│   ├── messages.json   # Message storage
│   ├── queue.ts        # Message queuing system (with command workaround)
│   └── web-search.ts   # Web search tool integration
├── auth.json           # NOT tracked — API keys
├── bin/                # NOT tracked — local binaries (e.g. fd)
├── npm/                # NPM dependencies
└── sessions/           # NOT tracked — conversation history
```

## Setup on a new machine

```bash
git clone https://github.com/YuGiMob/mypi.git ~/.pi/agent
# auth.json is not in git; populate it manually or via /login
```

## Auth

API keys live in `~/.pi/agent/auth.json` and are excluded by `.gitignore`.

## Extensions

### Queue Extension (`queue.ts`)

The queue extension provides `/q` command for queuing messages to be sent when the agent finishes its current task.

**Workaround for Command Execution:**

Since pi doesn't expose a way to execute slash commands programmatically, the queue extension implements a workaround:

- **For `/msg` commands**: Directly reads the message from `messages.json` and sends the content (not the command)
- **For `/show-msg` commands**: Directly displays the message content via notification
- **For `/change-msg` commands**: Notifies that it requires interactive mode (cannot be executed from queue)
- **For unknown commands**: Falls back to sending as user message (won't execute as command)

**Usage:**
```bash
/q /msg 2              # Queues message 2 to be sent when agent is idle
/q /show-msg 1         # Queues display of message 1
/q Hello, world!       # Queues a regular message
```

**How it works:**
1. When you type `/q /msg 2`, the queue extension stores `/msg 2` in memory
2. When the agent becomes idle (via `agent_end` event), it waits 500ms
3. The extension parses the command and handles it directly:
   - For `/msg 2`: reads message 2 from `messages.json` and sends its content
   - For `/show-msg 1`: displays message 1 via notification
4. This bypasses the UI command processing layer that would normally execute slash commands

### Messages Extension (`messages.ts`)

Provides commands to manage and send predefined messages:

- `/msg <number>` - Send message by number
- `/change-msg <number> <content>` - Change or create a message
- `/show-msg <number>` - Display the contents of a message

Messages are persisted to `messages.json` for cross-session availability.

### Focus Caret Extension (`focus-caret.ts`)

Sets the cursor to green and keeps it visible when focused. Hides the fake caret when typing slash commands.

### Web Search Extension (`web-search.ts`)

Provides web search and content fetching tools. Uses web search APIs to find information and fetch_content to retrieve full page content.

**Configuration:** Set one of the following environment variables:
- `EXA_API_KEY` for Exa search (recommended for code/technical)
- `TAVILY_API_KEY` for Tavily
- `BRAVE_SEARCH_API_KEY` for Brave Search
- `PERPLEXITY_API_KEY` for Perplexity
