---
name: claude-code
description: Run coding tasks as persistent, detached jobs using the Claude Agent SDK. Jobs survive agent timeouts, gateway restarts, and API hangs.
---

# Claude Code Skill

This skill runs coding tasks as **persistent, detached jobs** using the `@anthropic-ai/claude-agent-sdk`. Unlike raw `exec claude` calls, jobs survive agent turn timeouts, gateway restarts, and API rate limits.

## Starting a coding task

Use `exec` to start a detached job. It returns immediately with a `jobId`.

```bash
node {{skill_dir}}/scripts/run.mjs start \
  --prompt "Read TASK.md and implement. Run tests." \
  --cwd /path/to/project \
  --job-id task-137
```

**Arguments:**
- `--prompt` (required): The task description for Claude.
- `--cwd` (required): The working directory for the coding task.
- `--job-id` (required): A unique identifier for this job.
- `--model` (optional): Override the model (defaults to SDK default).

**Returns JSON:**
```json
{ "jobId": "task-137", "pid": 12345, "status": "running" }
```

## Checking status

Poll job status to see if it's still running, completed, or failed.

```bash
node {{skill_dir}}/scripts/run.mjs status --job-id task-137
```

**Returns JSON:**
```json
{
  "jobId": "task-137",
  "pid": 12345,
  "status": "running",
  "startedAt": "2025-01-01T00:00:00.000Z",
  "endedAt": null,
  "error": null,
  "rateLimited": false
}
```

**Status values:** `running`, `completed`, `failed`, `killed`, `not_found`

If `rateLimited` is `true`, the job hit API rate limits — this is a temporary condition, not a hang.

## Getting logs

Read the last N lines of streaming output from the job.

```bash
node {{skill_dir}}/scripts/run.mjs logs --job-id task-137 --tail 50
```

## Getting the result

Once status is `completed`, retrieve the final result.

```bash
node {{skill_dir}}/scripts/run.mjs result --job-id task-137
```

**Returns JSON:**
```json
{
  "jobId": "task-137",
  "status": "completed",
  "result": "...",
  "cost_usd": 0.05,
  "duration_ms": 120000,
  "num_turns": 8
}
```

## Listing all jobs

```bash
node {{skill_dir}}/scripts/run.mjs list
```

## Killing a job

```bash
node {{skill_dir}}/scripts/run.mjs kill --job-id task-137
```

## Best Practices

- **Unique job IDs**: Use descriptive IDs like `issue-42` or `feat-auth-v2` to track jobs.
- **Poll status**: After starting a job, check status periodically. Jobs can take 5-30 minutes.
- **Check logs on failure**: If status is `failed`, read logs to understand what went wrong.
- **Rate limits are normal**: If `rateLimited` is true, the SDK is handling retries automatically.
- **Verification**: Include "Run tests" in your prompt to have Claude verify its own changes.

## Environment

- `ANTHROPIC_API_KEY` — required (the skill checks for this and fails fast with a clear error if missing).
- `CLAUDE_SKILL_JOBS_DIR` — optional, defaults to `<skill_dir>/jobs`.
- `CLAUDE_SKILL_MODEL` — optional, overrides the default model.
