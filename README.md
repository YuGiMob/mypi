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
│   ├── commit.ts
│   ├── focus-caret.ts
│   ├── queue.ts
│   ├── start-message.txt
│   ├── start.ts
│   └── web-search.ts
├── auth.json           # NOT tracked — API keys
├── bin/                # NOT tracked — local binaries (e.g. fd)
└── sessions/           # NOT tracked — conversation history
```

## Setup on a new machine

```bash
git clone https://github.com/YuGiMob/mypi.git ~/.pi/agent
# auth.json is not in git; populate it manually or via /login
```

## Auth

API keys live in `~/.pi/agent/auth.json` and are excluded by `.gitignore`.
