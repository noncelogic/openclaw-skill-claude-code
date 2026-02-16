# Resilient Claude Code Skill

**The "Anti-Crash" Coding Runner for OpenClaw.**

Most Claude Code wrappers just run `exec('claude ...')`. If your agent turn times out, or the gateway restarts, or the API hangs—**your coding task dies.**

This skill treats coding tasks as **Persistent, Detached Jobs**.

## Why this exists

### 1. Decoupled Lifecycle
- **Problem:** Agent turns have timeouts (e.g., 900s). Coding tasks take 20+ minutes.
- **Solution:** This skill starts a `claude` process, **detaches it** from the agent session, and returns a `jobId`. The agent can check back later.

### 2. Restart Survival
- **Problem:** If you restart OpenClaw (maintenance, crash, update), child processes usually get `SIGKILL`.
- **Solution:** Spawns processes in a separate process group. Uses PID tracking files on disk. If the gateway reboots, it **re-acquires the running job** instead of killing it.

### 3. Rate Limit Intelligence
- **Problem:** Generic wrappers treat any pause as a hang.
- **Solution:** Parses logs to distinguish between "Claude is thinking" (good) and "API 429/503" (bad), bubbling precise status to the orchestrator.

## Architecture

[ Agent ] -> (Start Job) -> [ Skill Manager ] -> (Spawn & Detach) -> [ Claude Code CLI ]
                                      |
                               (Write PID/Log)
                                      v
                                 [ Disk State ]

1. Agent calls `start_coding(...)` -> gets `job_123`.
2. Agent ends turn.
3. Cron/Heartbeat calls `check_job('job_123')`.
4. Skill reads log tail and process status from disk.
5. Returns status: `running` | `completed` | `failed`.

## Usage

See [SKILL.md](SKILL.md) for tool definitions.
