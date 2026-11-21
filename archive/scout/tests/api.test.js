import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { createConfig } from '../server/config.js';
import { createLogger } from '../server/lib/logger.js';

const BRIEF =
  'Long-term rental for a retired couple: 2–3 bedroom apartment or townhouse with sea view and pool access, around Lagos or Portimão, budget up to €2,200/month. Prefer walkable to amenities.';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('Scout HTTP API and agent pipeline', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'scout-test-'));
  const dbPath = path.join(dir, 'scout.db');
  const config = createConfig({
    dbPath,
    mode: 'demo',
    stepDelayMs: 0,
    port: 0,
    host: '127.0.0.1',
    logLevel: 'silent',
    runsPerMinute: 1000,
    maxConcurrentRuns: 10,
  });
  const app = createApp({ config, logger: createLogger('silent') });
  const address = await app.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${address.port}`;

  async function request(pathname, { method = 'GET', body, headers = {} } = {}) {
    const options = { method, headers: { Accept: 'application/json', ...headers } };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const response = await fetch(`${base}${pathname}`, options);
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // not JSON (CSV / HTML)
    }
    return { response, text, json };
  }

  async function waitForRun(runId, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const { response, json } = await request(`/api/runs/${runId}`);
      assert.equal(response.status, 200);
      const run = json.data.run;
      if (['completed', 'failed', 'cancelled'].includes(run.status)) return json.data;
      await sleep(25);
    }
    throw new Error('run did not finish in time');
  }

  try {
    await t.test('serves the application and security headers', async () => {
      const response = await fetch(`${base}/`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /text\/html/);
      assert.match(response.headers.get('content-security-policy'), /default-src 'self'/);
      assert.equal(response.headers.get('x-frame-options'), 'DENY');
      const html = await response.text();
      assert.match(html, /Scout/);
    });

    await t.test('exposes health and catalogue metadata', async () => {
      const health = await request('/api/health');
      assert.equal(health.response.status, 200);
      assert.equal(health.json.data.status, 'ok');
      assert.equal(health.json.data.mode, 'demo');

      const meta = await request('/api/meta');
      assert.equal(meta.response.status, 200);
      assert.equal(meta.json.data.mode, 'demo');
      assert.equal(meta.json.data.overview.properties, 20);
      assert.equal(meta.json.data.overview.sources, 14);
      assert.equal(meta.json.data.liveAvailable, false);

      const properties = await request('/api/properties');
      assert.equal(properties.json.data.count, 20);
      assert.ok(properties.json.data.properties.every((property) => property.ref.startsWith('PBR-')));

      const sources = await request('/api/sources');
      assert.equal(sources.json.data.count, 14);
      assert.ok(sources.json.data.sources.some((source) => source.id === 'src_idealista_pt'));
    });

    await t.test('validates bad requests', async () => {
      const noType = await fetch(`${base}/api/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ brief: BRIEF }),
      });
      assert.equal(noType.status, 415);

      const tooShort = await request('/api/runs', { method: 'POST', body: { brief: 'x' } });
      assert.equal(tooShort.response.status, 422);

      const badLocation = await request('/api/runs', {
        method: 'POST',
        body: { brief: '2 bedroom rental in Lisbon', overrides: { location: 'Atlantis' } },
      });
      assert.equal(badLocation.response.status, 422);
      assert.match(badLocation.json.error.message, /location/i);

      const missing = await request('/api/runs/run_do/notexist');
      assert.equal(missing.response.status, 404);
    });

    let firstRun;
    await t.test('runs a brief end to end and persists a report', async () => {
      const created = await request('/api/runs', { method: 'POST', body: { brief: BRIEF } });
      assert.equal(created.response.status, 202);
      firstRun = created.json.data.run;
      assert.equal(firstRun.status, 'queued');
      assert.match(firstRun.threadId, /^thr_/);

      const completed = await waitForRun(firstRun.id);
      assert.equal(completed.run.status, 'completed', completed.run.error);
      assert.equal(completed.run.filters.transaction, 'rent');
      assert.equal(completed.run.stats.ownListingsInScope, 4);
      assert.equal(completed.run.stats.ownListingsBenchmarked, 4);
      assert.ok(completed.run.stats.uniqueOffers >= 25);
      assert.ok(completed.run.stats.mirrors >= 1);
      assert.ok(completed.run.stats.duplicatesCollapsed >= 1);
      assert.equal(completed.run.stats.failedSourceIds.length, 0);
      assert.ok(completed.run.stats.headline.includes('benchmarked'));
      assert.ok(completed.steps.length >= 8);

      const results = await request(`/api/runs/${firstRun.id}/results`);
      assert.equal(results.response.status, 200);
      const report = results.json.data;
      assert.equal(report.run.status, 'completed');
      assert.equal(report.positions.length, 4);
      assert.equal(report.offers.length, report.overview.uniqueOffers);
      assert.ok(report.offers.every((offer) => Number.isFinite(offer.price_eur)));
      assert.ok(report.recommendations.length >= 1);
      assert.ok(report.recommendations.every((rec) => rec.title && rec.message));
      assert.ok(report.sources.length >= 8);
      assert.equal(report.discoveredSources.length, completed.run.stats.newSources);
      assert.ok(report.duplicates.length >= 1);
      const mirrorOffers = report.offers.filter((offer) => offer.comparison?.kind === 'same_listing');
      assert.equal(mirrorOffers.length, report.overview.mirrors);
      assert.ok(mirrorOffers.some((offer) => offer.comparison.deltaPct !== null));
    });

    await t.test('exports CSV and JSON reports', async () => {
      const csvResponse = await fetch(`${base}/api/runs/${firstRun.id}/export.csv`);
      assert.equal(csvResponse.status, 200);
      assert.match(csvResponse.headers.get('content-type'), /text\/csv/);
      assert.match(csvResponse.headers.get('content-disposition'), /attachment/);
      const bytes = Buffer.from(await csvResponse.arrayBuffer());
      assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
      const csvText = bytes.toString('utf8');
      assert.match(csvText, /Record type,Property ref/);
      assert.match(csvText, /Portfolio/);
      assert.ok(csvText.split('\r\n').length > 10);

      const json = await request(`/api/runs/${firstRun.id}/export.json`);
      assert.equal(json.response.status, 200);
      assert.match(json.response.headers.get('content-type'), /application\/json/);
      assert.equal(json.json.run.id, firstRun.id);
      assert.ok(Array.isArray(json.json.offers));
    });

    await t.test('streams replayable SSE progress and a terminal event', async () => {
      const controller = new AbortController();
      const response = await fetch(`${base}/api/runs/${firstRun.id}/events`, { signal: controller.signal });
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /text\/event-stream/);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let text = '';
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline && !(text.includes('event: step') && text.includes('event: done'))) {
        const { value, done } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
      }
      controller.abort();
      assert.match(text, /event: step/);
      assert.match(text, /"type":"step"/);
      assert.match(text, /event: done/);
      assert.match(text, /"type":"done"/);
    });

    await t.test('creates a second iteration in the same thread', async () => {
      const created = await request('/api/runs', {
        method: 'POST',
        body: { brief: BRIEF.replace('€2,200', '€2,100'), threadId: firstRun.threadId },
      });
      assert.equal(created.response.status, 202);
      assert.equal(created.json.data.run.iteration, 2);
      assert.equal(created.json.data.run.threadId, firstRun.threadId);
      const completed = await waitForRun(created.json.data.run.id);
      assert.equal(completed.run.status, 'completed');

      const runs = await request('/api/runs?limit=10');
      assert.equal(runs.response.status, 200);
      assert.ok(runs.json.data.runs.length >= 2);
      assert.ok(runs.json.data.runs.some((run) => run.iteration === 2));
    });

    await t.test('manages the source catalogue', async () => {
      const sources = await request('/api/sources');
      const target = sources.json.data.sources.find((source) => source.id === 'src_olx');
      const disabled = await request(`/api/sources/${target.id}`, { method: 'PATCH', body: { enabled: false } });
      assert.equal(disabled.response.status, 200);
      assert.equal(disabled.json.data.source.enabled, false);
      const reenabled = await request(`/api/sources/${target.id}`, { method: 'PATCH', body: { enabled: true } });
      assert.equal(reenabled.json.data.source.enabled, true);

      const added = await request('/api/sources', {
        method: 'POST',
        body: {
          name: 'Test Coastal Homes',
          domain: 'testcoastalhomes.pt',
          kind: 'agency',
          country: 'Portugal',
          region: 'Algarve',
          reliability: 0.7,
          notes: 'Added by the integration test.',
        },
      });
      assert.equal(added.response.status, 201);
      assert.equal(added.json.data.source.domain, 'testcoastalhomes.pt');
      assert.equal(added.json.data.source.enabled, true);

      const duplicate = await request('/api/sources', {
        method: 'POST',
        body: { name: 'Duplicate', domain: 'idealista.pt', kind: 'portal', country: 'Portugal' },
      });
      assert.equal(duplicate.response.status, 409);
    });

    await t.test('resets demo data without losing the portfolio or seed sources', async () => {
      const reset = await request('/api/demo/reset', { method: 'POST', body: {} });
      assert.equal(reset.response.status, 200);
      assert.equal(reset.json.data.reset, true);

      const runs = await request('/api/runs');
      assert.equal(runs.json.data.runs.length, 0);
      const sources = await request('/api/sources');
      assert.equal(sources.json.data.sources.length, 14);
      assert.ok(!sources.json.data.sources.some((source) => source.domain === 'testcoastalhomes.pt'));
      const properties = await request('/api/properties');
      assert.equal(properties.json.data.count, 20);
    });
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
