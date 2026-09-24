# Agent Rules

## No comments — ever

- Never write comments: no inline or block comments, no docstrings, no TODO lines, no explanatory comments, no commented-out code.
- Applies to every language and file type, Markdown and HTML included (no `<!-- -->`, no commented-out prose). Documentation text that is a file's real content — a README, this file — is not a comment.
- Self-documenting code: clear names, small functions, obvious logic. If code needs a comment to make sense, change the code.
- One exception: the user explicitly asks for a comment or docstring in that request. An explicit request overrides this rule; comply instead of refusing.

## DRY (Don't Repeat Yourself)

Two copies of the same pattern are fine. On the third occurrence, extract the shared logic; a premature abstraction costs more than one duplicate.

## Git usage

- Read-only git commands (`status`, `log`, `diff`, `show`, `blame`) are always allowed.
- Mutative git commands — anything that writes to the repo or index (`add`, `commit`, `amend`, `reset`, `checkout`, `rebase`, `push`) — only when the user explicitly asks for them, or when the harness explicitly allows them after the user reenables mutative git commands.
