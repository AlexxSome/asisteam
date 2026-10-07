import { createApplication } from './application.js';
import { ConfigurationError, loadConfig } from './config.js';
import { SafeLogger } from './logger.js';

const logger = new SafeLogger();
let app: Awaited<ReturnType<typeof createApplication>> | undefined;
try {
  const config = loadConfig(process.env);
  app = await createApplication(config, logger);
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => {
      logger.event('error', 'shutdown_timeout');
      process.exit(1);
    }, config.SHUTDOWN_TIMEOUT_MS);
    deadline.unref();
    try {
      await app!.close();
      logger.event('info', 'runtime_stopped');
      process.exitCode = 0;
    } catch {
      logger.event('error', 'shutdown_timeout');
      process.exitCode = 1;
    } finally {
      clearTimeout(deadline);
    }
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  await app.listen(config.PORT, config.HOST);
  logger.event('info', 'runtime_started');
} catch (error) {
  logger.event('error', error instanceof ConfigurationError ? 'configuration_invalid' : 'startup_failed',
    error instanceof ConfigurationError ? { fields: error.fields } : {});
  if (app) await app.close().catch(() => {});
  process.exitCode = 1;
}
