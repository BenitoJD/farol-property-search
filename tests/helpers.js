import { createApp } from '../server/app.js';
import { createConfig } from '../server/config.js';
import { createLogger } from '../server/lib/logger.js';

export async function startTestApp(overrides = {}) {
  const config = createConfig({
    dbPath: ':memory:',
    host: '127.0.0.1',
    port: 0,
    stepDelayMs: 0,
    searchesPerMinute: 1000,
    writesPerMinute: 10_000,
    logLevel: 'error',
    ...overrides,
  });
  const logger = createLogger('error');
  const app = createApp({ config, logger });
  const address = await app.listen();
  const base = `http://127.0.0.1:${address.port}`;
  return { app, base, config };
}

export async function fetchJson(base, path, { method = 'GET', body = null, headers = {} } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body !== null ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== null ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { response, json, text };
}

export async function waitFor(check, { timeoutMs = 8000, intervalMs = 60 } = {}) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    last = await check();
    if (last) return last;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('Timed out waiting for condition.');
}

export function sampleClient(overrides = {}) {
  return {
    name: 'Test Client',
    email: 'test.client@example.com',
    phone: '+351 900 000 000',
    source: 'Website',
    ...overrides,
  };
}
