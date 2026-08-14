# Agent Rules

## No comments — ever

Do not write comments in any code you produce. Not inline comments, not block comments, not docstrings, not TODO comments, not explanatory comments, not commented-out code. No exceptions.

If you are asked to add a comment, refuse. If you are shown code with comments, do not add more. If you are fixing a bug, do not add a comment explaining the fix. If you are refactoring, do not add a comment describing the refactor.

The code itself must be self-documenting: clear names, small functions, obvious logic. If the code is not clear enough to read without comments, make the code clearer — do not add a comment.

This rule applies to all languages: JavaScript, TypeScript, Python, Go, Rust, Java, C++, Ruby, Shell, SQL, YAML, JSON, Markdown, HTML, CSS — every file you write or edit.

## DRY (Don't Repeat Yourself)

Extract shared logic when you see the same pattern three or more times, or when two instances are substantial, structurally identical, and the abstraction is simpler than either copy.
