---
name: claude-code
description: Run coding tasks using the Claude Code CLI. Use this skill when you need to perform complex coding tasks, refactoring, or multi-file edits that require an agentic coding loop.
---

# Claude Code Skill

This skill provides a wrapper around the `claude` CLI tool to execute agentic coding tasks.

## Usage

To run a coding task:

1.  **Define the task**: Create a detailed `TASK.md` file in the project root if the task is complex.
2.  **Run Claude Code**: Use the `exec` tool to invoke the wrapper command.

### Command Pattern

```bash
~/.local/bin/claude --dangerously-skip-permissions -p "YOUR PROMPT HERE"
```

**Crucial Arguments:**
- `--dangerously-skip-permissions`: Required to run without interactive confirmation prompts.
- `-p "..."`: The prompt describing the task.

### Best Practices

- **Context**: Claude Code automatically reads files in the current directory. Ensure you are in the correct project root before running.
- **Verification**: Claude Code can run tests. Include "Run tests" in your prompt to verify changes.
- **Timeout**: Agentic coding takes time. When calling `exec`, set a long `yieldMs` (e.g., `120000` or more) to allow the process to run in the background.

## Examples

**Fixing a bug:**
```bash
~/.local/bin/claude --dangerously-skip-permissions -p "Fix the race condition in src/api/client.ts. Run npm test to verify."
```

**Implementing a feature from a spec:**
```bash
~/.local/bin/claude --dangerously-skip-permissions -p "Read TASK.md and implement the user profile API. Use the existing patterns in lib/trpc."
```
