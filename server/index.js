import { createApp } from './app.js';
import { createConfig } from './config.js';
import { createLogger } from './lib/logger.js';

async function main() {
  let config;
  try {
    config = createConfig();
  } catch (error) {
    console.error(`Farol configuration error: ${error.message}`);
    process.exit(1);
  }

  const logger = createLogger(config.logLevel);
  const app = createApp({ config, logger });

  try {
    const address = await app.listen();
    const host = address.address === '0.0.0.0' || address.address === '::' ? 'localhost' : address.address;
    logger.info('Farol is running', {
      url: `http://${host}:${address.port}`,
      mode: config.mode,
      database: config.dbPath,
      cases: app.store.listCases({ limit: 100 }).length,
      sources: app.store.listSources().length,
    });
    logger.info('default catalogue: deterministic demo market; Live market mode fetches public Imovirtual search results on request');
  } catch (error) {
    logger.error('failed to start server', { error: error.message });
    await app.close();
    process.exit(1);
  }

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('shutting down', { signal });
    const hardExit = setTimeout(() => process.exit(1), 8000);
    hardExit.unref();
    try {
      await app.close();
      clearTimeout(hardExit);
      process.exit(0);
    } catch (error) {
      logger.error('shutdown failed', { error: error.message });
      process.exit(1);
    }
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error('unhandled promise rejection', {
      error: reason instanceof Error ? reason.message : String(reason),
    });
  });
  process.on('uncaughtException', (error) => {
    logger.error('uncaught exception', { error: error.message, stack: error.stack });
    shutdown('uncaughtException');
  });
}

main();
