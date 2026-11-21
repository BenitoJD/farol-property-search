import { parseEnvInt } from './lib/values.js';
import { fileURLToPath } from 'node:url';

const DEFAULT_FX = { EUR: 1, GBP: 1.17, USD: 0.92 };

function parseFx(raw) {
  if (!raw) return { ...DEFAULT_FX };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
    const fx = { EUR: 1 };
    for (const [code, rate] of Object.entries(parsed)) {
      const value = Number(rate);
      if (/^[A-Z]{3}$/.test(code) && Number.isFinite(value) && value > 0) fx[code] = value;
    }
    return fx;
  } catch {
    return { ...DEFAULT_FX };
  }
}

/**
 * Resolve runtime configuration. Tests pass overrides instead of mutating env.
 */
export function createConfig(overrides = {}) {
  const env = process.env;
  const requestedMode = String(overrides.mode ?? env.SCOUT_MODE ?? 'auto').toLowerCase();
  const tavilyKey = overrides.tavilyKey ?? env.TAVILY_API_KEY ?? '';

  let mode = requestedMode;
  if (mode !== 'demo' && mode !== 'live') mode = 'auto';
  if (mode === 'auto') mode = tavilyKey ? 'live' : 'demo';
  if (mode === 'live' && !tavilyKey) {
    const err = new Error(
      'SCOUT_MODE=live requires TAVILY_API_KEY. Set the key, or use SCOUT_MODE=demo to run the simulated market.'
    );
    err.code = 'CONFIG_INVALID';
    throw err;
  }

  const port = parseEnvInt(overrides.port ?? env.PORT, 4321, { min: 0, max: 65535 });
  const stepDelayMs = parseEnvInt(overrides.stepDelayMs ?? env.SCOUT_STEP_DELAY_MS, 190, {
    min: 0,
    max: 5000,
  });
  const accessPassword = String(overrides.accessPassword ?? env.SCOUT_ACCESS_PASSWORD ?? '');
  if (accessPassword && accessPassword.length < 8) {
    const err = new Error('SCOUT_ACCESS_PASSWORD must be at least 8 characters when enabled.');
    err.code = 'CONFIG_INVALID';
    throw err;
  }

  return {
    version: '1.0.0',
    appName: 'Scout',
    org: 'Property Buy or Rent',
    mode,
    port,
    host: overrides.host ?? env.HOST ?? '127.0.0.1',
    dbPath: overrides.dbPath ?? env.SCOUT_DB_PATH ?? './data/scout.db',
    publicDir: overrides.publicDir ?? fileURLToPath(new URL('../public', import.meta.url)),
    stepDelayMs,
    maxConcurrentRuns: parseEnvInt(overrides.maxConcurrentRuns ?? env.SCOUT_MAX_CONCURRENT_RUNS, 3, {
      min: 1,
      max: 50,
    }),
    runsPerMinute: parseEnvInt(overrides.runsPerMinute ?? env.SCOUT_RUNS_PER_MINUTE, 8, {
      min: 1,
      max: 600,
    }),
    maxBodyBytes: 64 * 1024,
    fx: { ...DEFAULT_FX, ...parseFx(env.SCOUT_FX), ...(overrides.fx ?? {}) },
    tavilyKey,
    llm: {
      url: overrides.llmUrl ?? env.SCOUT_LLM_URL ?? '',
      key: overrides.llmKey ?? env.SCOUT_LLM_KEY ?? '',
      model: overrides.llmModel ?? env.SCOUT_LLM_MODEL ?? '',
    },
    userAgent: env.SCOUT_USER_AGENT ?? 'ScoutPriceBot/1.0 (+https://propertybuyorrent.com)',
    logLevel: overrides.logLevel ?? env.SCOUT_LOG_LEVEL ?? 'info',
    accessUser: String(overrides.accessUser ?? env.SCOUT_ACCESS_USER ?? 'scout'),
    accessPassword,
    liveDiscovery: overrides.liveDiscovery ?? true,
    chaos: overrides.chaos ?? env.SCOUT_CHAOS === '1',
  };
}
