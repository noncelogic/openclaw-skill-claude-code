import { spawn } from 'node:child_process';
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = join(__dirname, '..');
const JOBS_DIR = process.env.CLAUDE_SKILL_JOBS_DIR || join(SKILL_DIR, 'jobs');

const jobId = process.argv[2];
if (!jobId) {
  console.error('Usage: node cli-worker.mjs <jobId>');
  process.exit(1);
}

const metaFile = join(JOBS_DIR, jobId, 'meta.json');
const outputFile = join(JOBS_DIR, jobId, 'output.log');
const resultFile = join(JOBS_DIR, jobId, 'result.json');

async function readMeta() {
  return JSON.parse(await readFile(metaFile, 'utf-8'));
}

async function writeMeta(meta) {
  await writeFile(metaFile, JSON.stringify(meta, null, 2) + '\n');
}

async function log(text) {
  await appendFile(outputFile, text);
}

let shuttingDown = false;
let childProcess = null;

process.on('SIGTERM', async () => {
  shuttingDown = true;
  await log('\n[worker] Received SIGTERM, stopping child...\n');
  if (childProcess) {
    childProcess.kill('SIGTERM');
  }
  const meta = await readMeta();
  meta.status = 'killed';
  meta.endedAt = new Date().toISOString();
  await writeMeta(meta);
  process.exit(0);
});

async function run() {
  const meta = await readMeta();
  await log(`[worker] Starting CLI job ${jobId}\n`);

  // Resolve 'claude' binary path. Prefer user configured, then local pnpm, then PATH.
  // We assume 'claude' is in PATH on lnx-orion (~/.local/bin/claude is standard there).
  const claudeBin = process.env.CLAUDE_BINARY_PATH || 'claude';

  // Construct arguments
  const args = [
    '--no-session-persistence', // Crucial: avoid zombie session resume
    '--dangerously-skip-permissions', // Automated mode
    '--print', // Non-interactive mode (print output stream)
    meta.prompt,
  ];

  await log(`[worker] Cmd: ${claudeBin} ${args.join(' ')}\n`);
  await log(`[worker] CWD: ${meta.cwd}\n`);

  // Spawn the CLI
  // Note: We use 'sh -c' to ensure PATH resolution if needed, but spawn usually handles it.
  // We do NOT use 'shell: true' to avoid extra shell wrapping if possible, but for PATH lookup it helps.
  // Actually, let's try direct spawn first.

  childProcess = spawn(claudeBin, args, {
    cwd: meta.cwd,
    env: { ...process.env, CI: 'true', FORCE_COLOR: '0' }, // Disable color for cleaner logs
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let outputBuffer = '';

  childProcess.stdout.on('data', async (data) => {
    const text = data.toString();
    outputBuffer += text;
    await log(text);
  });

  childProcess.stderr.on('data', async (data) => {
    const text = data.toString();
    await log(`[stderr] ${text}`);
  });

  childProcess.on('error', async (err) => {
    const msg = `Failed to start claude: ${err.message}`;
    await log(`\n[worker] ERROR: ${msg}\n`);
    meta.status = 'failed';
    meta.error = msg;
    meta.endedAt = new Date().toISOString();
    await writeMeta(meta);
  });

  childProcess.on('close', async (code) => {
    const endTime = new Date().toISOString();
    await log(`\n[worker] Process exited with code ${code}\n`);

    if (shuttingDown) return;

    if (code === 0) {
      meta.status = 'completed';

      // Try to parse cost/duration from output if Claude prints it
      // Claude Code output often ends with cost summary.
      // We'll just save the raw text as result for now.

      const resultData = {
        jobId,
        status: 'completed',
        result: outputBuffer,
        exitCode: code,
      };
      await writeFile(resultFile, JSON.stringify(resultData, null, 2) + '\n');
    } else {
      meta.status = 'failed';
      meta.error = `CLI exited with code ${code}`;

      const resultData = {
        jobId,
        status: 'failed',
        result: outputBuffer,
        exitCode: code,
      };
      await writeFile(resultFile, JSON.stringify(resultData, null, 2) + '\n');
    }

    meta.endedAt = endTime;
    await writeMeta(meta);
  });
}

run().catch(async (err) => {
  await log(`[worker] Unhandled exception: ${err.message}\n`);
  process.exit(1);
});
