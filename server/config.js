import { parseEnvInt } from './lib/validate.js';
import { fileURLToPath } from 'node:url';

/**
 * Runtime configuration. Tests pass overrides instead of mutating the environment.
 */
export function createConfig(overrides = {}) {
  const env = process.env;
  const port = parseEnvInt(overrides.port ?? env.FAROL_PORT ?? env.PORT, 4400, {
    min: 0,
    max: 65535,
  });
  const stepDelayMs = parseEnvInt(overrides.stepDelayMs ?? env.FAROL_STEP_DELAY_MS, 150, {
    min: 0,
    max: 2000,
  });
  const accessPassword = String(overrides.accessPassword ?? env.FAROL_ACCESS_PASSWORD ?? '');
  if (accessPassword && accessPassword.length < 8) {
    const error = new Error('FAROL_ACCESS_PASSWORD must be at least 8 characters when enabled.');
    error.code = 'CONFIG_INVALID';
    throw error;
  }

  return {
    version: '1.0.0',
    appName: 'Farol',
    org: 'Property Buy or Rent',
    mode: 'demo',
    port,
    host: overrides.host ?? env.HOST ?? '127.0.0.1',
    dbPath: overrides.dbPath ?? env.FAROL_DB_PATH ?? './data/farol.db',
    publicDir: overrides.publicDir ?? fileURLToPath(new URL('../public', import.meta.url)),
    stepDelayMs,
    maxConcurrentRuns: parseEnvInt(overrides.maxConcurrentRuns ?? env.FAROL_MAX_CONCURRENT_RUNS, 2, {
      min: 1,
      max: 20,
    }),
    searchesPerMinute: parseEnvInt(
      overrides.searchesPerMinute ?? env.FAROL_SEARCHES_PER_MINUTE,
      6,
      { min: 1, max: 300 }
    ),
    writesPerMinute: parseEnvInt(overrides.writesPerMinute ?? env.FAROL_WRITES_PER_MINUTE, 90, {
      min: 1,
      max: 5000,
    }),
    maxBodyBytes: 256 * 1024,
    maxCsvBytes: 192 * 1024,
    accessUser: String(overrides.accessUser ?? env.FAROL_ACCESS_USER ?? 'farol'),
    accessPassword,
    logLevel: overrides.logLevel ?? env.FAROL_LOG_LEVEL ?? 'info',
    userAgent: 'FarolPropertySearch/1.0 (+https://propertybuyorrent.com)',
  };
}
