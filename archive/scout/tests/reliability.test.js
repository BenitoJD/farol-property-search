import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { createConfig } from '../server/config.js';
import { createLogger } from '../server/lib/logger.js';

const logger = createLogger('silent');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const BRIEF = 'Long-term rental for a retired couple: 2–3 bedroom apartment with sea view around Lagos, up to €2,200/month.';
const runTerminal = new Set(['completed', 'failed', 'cancelled']);

async function waitRun(base, id, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetch(`${base}/api/runs/${id}`);
    const payload = await response.json();
    if (runTerminal.has(payload.data.run.status)) return payload.data;
    await sleep(25);
  }
  throw new Error('run did not settle');
}

function testConfig(dir, overrides = {}) {
  return createConfig({
    dbPath: path.join(dir, 'scout.db'),
    mode: 'demo',
    stepDelayMs: 0,
    port: 0,
    host: '127.0.0.1',
    logLevel: 'silent',
    runsPerMinute: 1000,
    maxConcurrentRuns: 10,
    ...overrides,
  });
}

test('reports survive a server restart and can be rebuilt from SQLite', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'scout-persist-'));
  try {
    let app = createApp({ config: testConfig(dir), logger });
    let address = await app.listen(0, '127.0.0.1');
    let base = `http://127.0.0.1:${address.port}`;
    const created = await (await fetch(`${base}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ brief: BRIEF }),
    })).json();
    const settled = await waitRun(base, created.data.run.id);
    assert.equal(settled.run.status, 'completed');
    const before = await (await fetch(`${base}/api/runs/${created.data.run.id}/results`)).json();
    assert.ok(before.data.offers.length > 0);
    const firstOfferCount = before.data.offers.length;
    await app.close();

    app = createApp({ config: testConfig(dir), logger });
    address = await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${address.port}`;
    const run = await (await fetch(`${base}/api/runs/${created.data.run.id}`)).json();
    assert.equal(run.data.run.status, 'completed');
    const after = await (await fetch(`${base}/api/runs/${created.data.run.id}/results`)).json();
    assert.equal(after.data.run.id, before.data.run.id);
    assert.equal(after.data.offers.length, firstOfferCount);
    assert.equal(after.data.overview.uniqueOffers, firstOfferCount);
    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('graceful shutdown cancels an active run instead of leaving it running', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'scout-shutdown-'));
  try {
    let app = createApp({ config: testConfig(dir, { stepDelayMs: 30 }), logger });
    let address = await app.listen(0, '127.0.0.1');
    let base = `http://127.0.0.1:${address.port}`;
    const created = await (await fetch(`${base}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ brief: BRIEF }),
    })).json();
    const runId = created.data.run.id;
    await sleep(150);
    await app.close();

    app = createApp({ config: testConfig(dir), logger });
    address = await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${address.port}`;
    const run = await (await fetch(`${base}/api/runs/${runId}`)).json();
    assert.equal(run.data.run.status, 'cancelled');
    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('startup marks stale running and queued runs as failed', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'scout-stale-'));
  try {
    let app = createApp({ config: testConfig(dir), logger });
    await app.listen(0, '127.0.0.1');
    const run = app.store.createRun({ brief: BRIEF, filters: { transaction: 'rent' }, mode: 'demo' });
    app.store.updateRun(run.id, { status: 'running' });
    await app.close();

    app = createApp({ config: testConfig(dir), logger });
    const address = await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${address.port}`;
    const fetched = await (await fetch(`${base}/api/runs/${run.id}`)).json();
    assert.equal(fetched.data.run.status, 'failed');
    assert.match(fetched.data.run.error, /restart/i);
    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run creation is rate limited with a Retry-After hint', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'scout-rate-'));
  try {
    const app = createApp({
      config: testConfig(dir, { runsPerMinute: 1, maxConcurrentRuns: 5, stepDelayMs: 80 }),
      logger,
    });
    const address = await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${address.port}`;
    const first = await fetch(`${base}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ brief: BRIEF }),
    });
    assert.equal(first.status, 202);
    const second = await fetch(`${base}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ brief: BRIEF }),
    });
    assert.equal(second.status, 429);
    assert.ok(Number(second.headers.get('retry-after')) >= 1);
    assert.equal((await second.json()).error.code, 'RATE_LIMITED');
    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('body limits, malformed JSON and static caching behave correctly', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'scout-http-'));
  try {
    const app = createApp({ config: testConfig(dir), logger });
    const address = await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${address.port}`;

    const tooLarge = await fetch(`${base}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ brief: 'x'.repeat(70_000) }),
    });
    assert.equal(tooLarge.status, 413);

    const malformed = await fetch(`${base}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    assert.equal(malformed.status, 400);

    const asset = await fetch(`${base}/js/app.js`);
    assert.equal(asset.status, 200);
    const etag = asset.headers.get('etag');
    assert.ok(etag);
    assert.match(asset.headers.get('cache-control'), /no-cache/);
    const cached = await fetch(`${base}/js/app.js`, { headers: { 'If-None-Match': etag } });
    assert.equal(cached.status, 304);
    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
