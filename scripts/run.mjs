#!/usr/bin/env node

import { start, status, result, logs, list, kill } from './job-manager.mjs';

function parseArgs(args) {
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        parsed[key] = next;
        i++;
      } else {
        parsed[key] = true;
      }
    }
  }
  return parsed;
}

function output(data) {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

function die(message) {
  output({ error: message });
  process.exit(1);
}

const [command, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);

switch (command) {
  case 'start': {
    const prompt = args.prompt;
    const cwd = args.cwd || process.cwd();
    const jobId = args['job-id'];

    if (!prompt) die('--prompt is required');
    if (!jobId) die('--job-id is required');

    const options = {};
    if (args.model) options.model = args.model;

    const res = await start(jobId, prompt, cwd, options);
    output(res);
    break;
  }

  case 'status': {
    const jobId = args['job-id'];
    if (!jobId) die('--job-id is required');
    output(await status(jobId));
    break;
  }

  case 'result': {
    const jobId = args['job-id'];
    if (!jobId) die('--job-id is required');
    output(await result(jobId));
    break;
  }

  case 'logs': {
    const jobId = args['job-id'];
    if (!jobId) die('--job-id is required');
    const tail = parseInt(args.tail, 10) || 50;
    output(await logs(jobId, tail));
    break;
  }

  case 'list': {
    output(await list());
    break;
  }

  case 'kill': {
    const jobId = args['job-id'];
    if (!jobId) die('--job-id is required');
    output(await kill(jobId));
    break;
  }

  default:
    die(
      `Unknown command: ${command || '(none)'}. ` +
        `Available: start, status, result, logs, list, kill`,
    );
}
