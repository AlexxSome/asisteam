import { setTimeout as wait } from 'node:timers/promises';
import { SafeLogger } from '@asisteam/api/worker-services';
import { loadConfig } from './config.js';
import { createWorker } from './application.js';
import { MajorityWorker } from './worker.js';
const logger = new SafeLogger();
try {
  const config = loadConfig(process.env), app = await createWorker(config, logger), worker = app.get(MajorityWorker);
  let stopping = false;
  const controller = new AbortController();
  const stop = () => { stopping = true; controller.abort(); };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  logger.event('info', 'runtime_started');
  while (!stopping) { await worker.tick(); if (!stopping) { try { await wait(config.POLL_MS, undefined, { signal: controller.signal }); } catch { stopping = true; } } }
  await app.close(); logger.event('info', 'runtime_stopped');
} catch { logger.event('error', 'startup_failed'); process.exitCode = 1; }
