import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = join(__dirname, "..");
const JOBS_DIR = process.env.CLAUDE_SKILL_JOBS_DIR || join(SKILL_DIR, "jobs");

async function ensureJobDir(jobId) {
  const dir = join(JOBS_DIR, jobId);
  await mkdir(dir, { recursive: true });
  return dir;
}

function metaPath(jobId) {
  return join(JOBS_DIR, jobId, "meta.json");
}

function outputPath(jobId) {
  return join(JOBS_DIR, jobId, "output.log");
}

function resultPath(jobId) {
  return join(JOBS_DIR, jobId, "result.json");
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path) {
  const data = await readFile(path, "utf-8");
  return JSON.parse(data);
}

async function writeJson(path, data) {
  await writeFile(path, JSON.stringify(data, null, 2) + "\n");
}

export async function start(jobId, prompt, cwd, options = {}) {
  const dir = await ensureJobDir(jobId);

  const meta = {
    jobId,
    pid: null,
    status: "starting",
    prompt,
    cwd,
    model: options.model || process.env.CLAUDE_SKILL_MODEL || undefined,
    allowedTools: options.allowedTools || undefined,
    startedAt: new Date().toISOString(),
    endedAt: null,
    error: null,
    rateLimited: false,
  };

  await writeJson(metaPath(jobId), meta);
  await writeFile(outputPath(jobId), "");

  const workerPath = join(__dirname, "worker.mjs");
  const child = spawn("node", [workerPath, jobId], {
    detached: true,
    stdio: "ignore",
    cwd: SKILL_DIR,
    env: { ...process.env },
  });

  child.unref();

  meta.pid = child.pid;
  meta.status = "running";
  await writeJson(metaPath(jobId), meta);

  return { jobId, pid: child.pid, status: "running" };
}

export async function status(jobId) {
  let meta;
  try {
    meta = await readJson(metaPath(jobId));
  } catch {
    return { jobId, status: "not_found" };
  }

  if (meta.status === "running" && meta.pid) {
    if (!isPidAlive(meta.pid)) {
      meta.status = "failed";
      meta.error = "Process exited unexpectedly";
      meta.endedAt = new Date().toISOString();
      await writeJson(metaPath(jobId), meta);
    }
  }

  return {
    jobId: meta.jobId,
    pid: meta.pid,
    status: meta.status,
    startedAt: meta.startedAt,
    endedAt: meta.endedAt,
    error: meta.error,
    rateLimited: meta.rateLimited,
  };
}

export async function result(jobId) {
  try {
    return await readJson(resultPath(jobId));
  } catch {
    const s = await status(jobId);
    return { jobId, status: s.status, result: null };
  }
}

export async function logs(jobId, tail = 50) {
  try {
    const content = await readFile(outputPath(jobId), "utf-8");
    const lines = content.split("\n");
    const sliced = lines.slice(-tail).join("\n");
    return { jobId, lines: lines.length, tail: sliced };
  } catch {
    return { jobId, lines: 0, tail: "" };
  }
}

export async function list() {
  let entries;
  try {
    entries = await readdir(JOBS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }

  const jobs = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const s = await status(entry.name);
      jobs.push(s);
    }
  }
  return jobs;
}

export async function kill(jobId) {
  let meta;
  try {
    meta = await readJson(metaPath(jobId));
  } catch {
    return { jobId, killed: false, error: "Job not found" };
  }

  if (!meta.pid) {
    return { jobId, killed: false, error: "No PID recorded" };
  }

  if (!isPidAlive(meta.pid)) {
    return { jobId, killed: false, error: "Process already dead" };
  }

  try {
    process.kill(meta.pid, "SIGTERM");
    meta.status = "killed";
    meta.endedAt = new Date().toISOString();
    await writeJson(metaPath(jobId), meta);
    return { jobId, killed: true };
  } catch (err) {
    return { jobId, killed: false, error: err.message };
  }
}
