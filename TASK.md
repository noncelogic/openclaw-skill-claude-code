# TASK: Build Resilient Claude Code Skill for OpenClaw (#1)

## Context

This is an OpenClaw skill that wraps the `@anthropic-ai/claude-agent-sdk` (the official Claude Agent SDK) to run coding tasks as persistent, detached jobs. The current method (`exec claude --dangerously-skip-permissions`) is fragile — jobs die on gateway restart, timeouts, or API hangs.

## Architecture

```
[ OpenClaw Agent ] -> (SKILL.md instructions) -> [ exec: node scripts/run.mjs ]
                                                        |
                                                  (Spawn detached job)
                                                        |
                                                  [ Claude Agent SDK ]
                                                        |
                                                  (Write state to disk)
                                                        v
                                                  [ jobs/<jobId>/ ]
                                                    ├── meta.json    (status, timestamps, pid)
                                                    ├── output.log   (streaming output)
                                                    └── result.json  (final result when done)
```

## SDK Reference

The official SDK is `@anthropic-ai/claude-agent-sdk` (v0.2.42). TypeScript usage:

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

for await (const message of query({
  prompt: 'Fix the bug in auth.py',
  options: {
    allowedTools: ['Read', 'Edit', 'Bash', 'Glob', 'Grep'],
    permissionMode: 'acceptEdits', // Auto-approve file edits
  },
})) {
  if (message.type === 'assistant' && message.message?.content) {
    for (const block of message.message.content) {
      if ('text' in block) console.log(block.text);
      else if ('name' in block) console.log(`Tool: ${block.name}`);
    }
  } else if (message.type === 'result') {
    console.log(`Done: ${message.subtype}`);
  }
}
```

Auth: Set `ANTHROPIC_API_KEY` env var. The SDK reads it automatically.

Available tools: `Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`, `WebSearch`, `WebFetch`.

## Implementation

### 1. Package Setup

Create `package.json` with dependencies:

- `@anthropic-ai/claude-agent-sdk`
- No other runtime deps needed

### 2. Job Manager (`scripts/job-manager.mjs`)

Core module that manages job lifecycle:

```javascript
// start(jobId, prompt, cwd, options) → spawns detached process
// status(jobId) → reads meta.json, checks if PID alive
// result(jobId) → reads result.json
// logs(jobId, tail) → reads last N lines of output.log
// list() → lists all jobs with status
// kill(jobId) → sends SIGTERM to PID
```

**State directory**: `jobs/<jobId>/`

- `meta.json`: `{ jobId, pid, status, prompt, cwd, startedAt, endedAt, error }`
- `output.log`: Streaming text output from the agent
- `result.json`: Final result text (written on completion)

**Detached spawn**: The job manager spawns `node scripts/worker.mjs <jobId>` as a detached child process (`{ detached: true, stdio: 'ignore' }`) and immediately unrefs it. The worker runs independently.

**PID tracking**: On startup, `status()` checks if the PID in `meta.json` is still alive (`process.kill(pid, 0)`). If the process died without updating status, mark as `failed`.

### 3. Worker (`scripts/worker.mjs`)

Runs in a detached process. Receives `jobId` as argv:

1. Read `jobs/<jobId>/meta.json` for prompt and cwd
2. `process.chdir(cwd)`
3. Stream `query()` from the Agent SDK
4. Write each message to `output.log` (append)
5. On completion: write `result.json`, update `meta.json` status to `completed`
6. On error: update `meta.json` status to `failed`, write error details
7. Handle SIGTERM gracefully

**Rate limit detection**: Watch for 429/503 patterns in error messages. Set a `rateLimited` flag in `meta.json` so the orchestrator knows it's not a hang.

### 4. CLI Entry Points (`scripts/run.mjs`)

Simple CLI wrappers for the job manager:

```bash
# Start a job
node scripts/run.mjs start --prompt "Fix the bug" --cwd /path/to/project --job-id my-job

# Check status
node scripts/run.mjs status --job-id my-job

# Get logs (last 50 lines)
node scripts/run.mjs logs --job-id my-job --tail 50

# Get result
node scripts/run.mjs result --job-id my-job

# List all jobs
node scripts/run.mjs list

# Kill a job
node scripts/run.mjs kill --job-id my-job
```

Return JSON to stdout for structured output.

### 5. SKILL.md

Update the skill instructions to use the new scripts instead of raw `exec claude`:

```markdown
## Starting a coding task

Use `exec` to run:
\`\`\`bash
node /path/to/skill/scripts/run.mjs start \
 --prompt "Read TASK.md and implement. Run tests." \
 --cwd /path/to/project \
 --job-id task-137
\`\`\`

## Checking status

\`\`\`bash
node /path/to/skill/scripts/run.mjs status --job-id task-137
\`\`\`

## Getting results

\`\`\`bash
node /path/to/skill/scripts/run.mjs result --job-id task-137
\`\`\`
```

### 6. README.md

Update with architecture diagram, usage examples, and configuration.

## Configuration

The skill reads these env vars:

- `ANTHROPIC_API_KEY` — required (Claude API key)
- `CLAUDE_SKILL_JOBS_DIR` — optional, defaults to `<skill-dir>/jobs`
- `CLAUDE_SKILL_MODEL` — optional, defaults to SDK default

## File Structure

```
openclaw-skill-claude-code/
├── SKILL.md              # OpenClaw skill instructions
├── README.md             # Documentation
├── package.json          # Dependencies
├── scripts/
│   ├── run.mjs           # CLI entry point
│   ├── job-manager.mjs   # Job lifecycle management
│   └── worker.mjs        # Detached worker process
└── jobs/                 # Runtime state (gitignored)
    └── <jobId>/
        ├── meta.json
        ├── output.log
        └── result.json
```

## Verification

- `npm install` succeeds
- `node scripts/run.mjs start --prompt "What files are here?" --cwd . --job-id test-1` starts a job
- `node scripts/run.mjs status --job-id test-1` shows status
- `node scripts/run.mjs list` shows all jobs
- Job survives if parent process exits
- Handles missing ANTHROPIC_API_KEY gracefully (clear error message)

## Branch

`feat/1-resilient-job-manager`
