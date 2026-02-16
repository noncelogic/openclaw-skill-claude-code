import { readFile, writeFile, appendFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = join(__dirname, "..");
const JOBS_DIR = process.env.CLAUDE_SKILL_JOBS_DIR || join(SKILL_DIR, "jobs");

const jobId = process.argv[2];
if (!jobId) {
  console.error("Usage: node worker.mjs <jobId>");
  process.exit(1);
}

const metaFile = join(JOBS_DIR, jobId, "meta.json");
const outputFile = join(JOBS_DIR, jobId, "output.log");
const resultFile = join(JOBS_DIR, jobId, "result.json");

async function readMeta() {
  return JSON.parse(await readFile(metaFile, "utf-8"));
}

async function writeMeta(meta) {
  await writeFile(metaFile, JSON.stringify(meta, null, 2) + "\n");
}

async function log(text) {
  await appendFile(outputFile, text + "\n");
}

let shuttingDown = false;

process.on("SIGTERM", async () => {
  shuttingDown = true;
  await log("[worker] Received SIGTERM, shutting down gracefully...");
  const meta = await readMeta();
  meta.status = "killed";
  meta.endedAt = new Date().toISOString();
  await writeMeta(meta);
  process.exit(0);
});

async function run() {
  const meta = await readMeta();

  if (!process.env.ANTHROPIC_API_KEY) {
    meta.status = "failed";
    meta.error = "ANTHROPIC_API_KEY environment variable is not set";
    meta.endedAt = new Date().toISOString();
    await writeMeta(meta);
    await log("[worker] ERROR: ANTHROPIC_API_KEY not set");
    process.exit(1);
  }

  await log(`[worker] Starting job ${jobId}`);
  await log(`[worker] Prompt: ${meta.prompt}`);
  await log(`[worker] CWD: ${meta.cwd}`);

  let queryFn;
  try {
    const sdk = await import("@anthropic-ai/claude-agent-sdk");
    queryFn = sdk.query;
  } catch (err) {
    meta.status = "failed";
    meta.error = `Failed to load SDK: ${err.message}`;
    meta.endedAt = new Date().toISOString();
    await writeMeta(meta);
    await log(`[worker] ERROR: ${meta.error}`);
    process.exit(1);
  }

  const options = {
    cwd: meta.cwd,
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
  };

  if (meta.model) {
    options.model = meta.model;
  }

  if (meta.allowedTools) {
    options.allowedTools = meta.allowedTools;
  }

  let resultText = "";

  try {
    const q = queryFn({ prompt: meta.prompt, options });

    for await (const message of q) {
      if (shuttingDown) break;

      if (message.type === "assistant" && message.message?.content) {
        for (const block of message.message.content) {
          if ("text" in block) {
            await log(block.text);
            resultText += block.text + "\n";
          } else if ("name" in block) {
            await log(`[tool] ${block.name}`);
          }
        }
      } else if (message.type === "result") {
        if (message.subtype === "success") {
          await log(`[worker] Completed successfully`);
          resultText = message.result || resultText;

          const resultData = {
            jobId,
            status: "completed",
            result: resultText,
            cost_usd: message.total_cost_usd,
            duration_ms: message.duration_ms,
            num_turns: message.num_turns,
          };
          await writeFile(resultFile, JSON.stringify(resultData, null, 2) + "\n");

          meta.status = "completed";
          meta.endedAt = new Date().toISOString();
          await writeMeta(meta);
        } else {
          const errorMsg = message.errors?.join("; ") || message.subtype;
          await log(`[worker] Error: ${errorMsg}`);

          meta.status = "failed";
          meta.error = errorMsg;
          meta.endedAt = new Date().toISOString();
          await writeMeta(meta);

          const resultData = {
            jobId,
            status: "failed",
            error: errorMsg,
            result: resultText || null,
            cost_usd: message.total_cost_usd,
            duration_ms: message.duration_ms,
          };
          await writeFile(resultFile, JSON.stringify(resultData, null, 2) + "\n");
        }
      } else if (message.type === "assistant" && message.error) {
        const errType = message.error;
        if (errType === "rate_limit") {
          meta.rateLimited = true;
          await writeMeta(meta);
          await log("[worker] Rate limited, SDK will retry...");
        }
      }
    }
  } catch (err) {
    const errMsg = err.message || String(err);
    await log(`[worker] Fatal error: ${errMsg}`);

    const isRateLimit = /429|rate.limit|503|overloaded/i.test(errMsg);
    meta.status = "failed";
    meta.error = errMsg;
    meta.rateLimited = isRateLimit;
    meta.endedAt = new Date().toISOString();
    await writeMeta(meta);

    const resultData = {
      jobId,
      status: "failed",
      error: errMsg,
      result: resultText || null,
    };
    await writeFile(resultFile, JSON.stringify(resultData, null, 2) + "\n");
    process.exit(1);
  }
}

run().catch(async (err) => {
  try {
    const meta = await readMeta();
    meta.status = "failed";
    meta.error = err.message || String(err);
    meta.endedAt = new Date().toISOString();
    await writeMeta(meta);
    await log(`[worker] Unhandled error: ${meta.error}`);
  } catch {
    // Can't even write meta, just exit
  }
  process.exit(1);
});
