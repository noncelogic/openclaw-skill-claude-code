# Resilient Claude Code Skill

**Persistent, detached coding jobs for OpenClaw.**

Most Claude Code wrappers run `exec('claude ...')`. If your agent turn times out, the gateway restarts, or the API hangs — your coding task dies.

This skill treats coding tasks as **persistent, detached jobs** using the `@anthropic-ai/claude-agent-sdk`.

## Why This Exists

### Decoupled Lifecycle
Agent turns have timeouts (e.g., 900s). Coding tasks take 20+ minutes. This skill starts a Claude agent process, **detaches it** from the agent session, and returns a `jobId`. The agent checks back later.

### Restart Survival
If you restart OpenClaw (maintenance, crash, update), child processes usually get killed. This skill spawns processes in a separate process group with PID tracking on disk. On reboot, it **re-acquires running jobs** instead of losing them.

### Rate Limit Intelligence
Generic wrappers treat any pause as a hang. This skill distinguishes between "Claude is thinking" and "API 429/503", bubbling precise status to the orchestrator.

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

1. Agent calls `start` — gets a `jobId` and `pid`.
2. Agent turn ends. The coding job keeps running.
3. Agent polls `status` on next turn.
4. Skill reads process status and log tail from disk.
5. Returns: `running` | `completed` | `failed` | `killed`.

## Usage

### Start a job

```bash
node scripts/run.mjs start \
  --prompt "Read TASK.md and implement. Run tests." \
  --cwd /path/to/project \
  --job-id task-137
```

### Check status

```bash
node scripts/run.mjs status --job-id task-137
```

### Get logs

```bash
node scripts/run.mjs logs --job-id task-137 --tail 50
```

### Get result

```bash
node scripts/run.mjs result --job-id task-137
```

### List all jobs

```bash
node scripts/run.mjs list
```

### Kill a job

```bash
node scripts/run.mjs kill --job-id task-137
```

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

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | Yes | — | Claude API key |
| `CLAUDE_SKILL_JOBS_DIR` | No | `<skill-dir>/jobs` | Directory for job state |
| `CLAUDE_SKILL_MODEL` | No | SDK default | Override the model |

## How It Works

**Job Manager** (`scripts/job-manager.mjs`): Manages the job lifecycle — `start`, `status`, `result`, `logs`, `list`, `kill`. Spawns workers as detached processes and tracks them by PID on disk.

**Worker** (`scripts/worker.mjs`): Runs in a detached process. Streams the Claude Agent SDK `query()` iterator, writing output to `output.log` and final results to `result.json`. Handles SIGTERM gracefully and detects rate limits.

**CLI** (`scripts/run.mjs`): Thin command-line wrapper over the job manager. All output is structured JSON.
