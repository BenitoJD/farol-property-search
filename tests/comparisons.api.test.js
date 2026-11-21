import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { fetchJson, startTestApp, waitFor } from './helpers.js';

let ctx;
let base;

before(async () => {
  ctx = await startTestApp();
  base = ctx.base;
});

after(async () => {
  await ctx.app.close();
});

test('compare options expose portfolio subjects, coverage and seeded analyses', async () => {
  const { response, json } = await fetchJson(base, '/api/compare/options');
  assert.equal(response.status, 200);
  const data = json.data;
  assert.equal(data.mode, 'demo');
  assert.equal(data.portfolio.length, 20);
  assert.ok(data.market.uniqueListings > 50);
  assert.equal(data.market.sources, 20);
  assert.ok(data.recent.length >= 2);
  assert.ok(data.recent.every((item) => item.subject && item.stats));
  assert.ok(data.recent.some((item) => item.stats.verdict === 'below'));
});

test('the seeded report contains competitor and comparable evidence', async () => {
  const { response, json } = await fetchJson(base, '/api/comparisons/ANL-1001');
  assert.equal(response.status, 200);
  const { comparison, steps } = json.data;
  assert.equal(comparison.status, 'completed');
  assert.equal(comparison.subject.ref, 'PBR-1042');
  assert.equal(comparison.report.check.verdict, 'below');
  assert.equal(comparison.report.check.count, 5);
  assert.equal(comparison.report.check.median, 2100);
  assert.ok(comparison.report.competitors.length >= 3);
  assert.ok(comparison.report.comps.length === 5);
  assert.ok(comparison.report.coverage.sourcesWithComps >= 2);
  assert.equal(comparison.report.coverage.selfExcluded, 1);
  assert.ok(steps.length >= 9);
  assert.ok(steps.some((step) => step.phase === 'value'));
  assert.ok(comparison.report.narrative.bullets.length >= 3);
});

test('running a portfolio listing streams to a completed value report', async () => {
  const created = await fetchJson(base, '/api/comparisons', {
    method: 'POST',
    body: { portfolioId: 'p_1042' },
  });
  assert.equal(created.response.status, 202);
  const id = created.json.data.comparison.id;
  assert.ok(id);

  const completed = await waitFor(async () => {
    const result = await fetchJson(base, `/api/comparisons/${id}`);
    return result.json.data.comparison.status === 'completed' ? result.json.data : null;
  });
  assert.equal(completed.comparison.status, 'completed');
  assert.ok(completed.comparison.report);
  assert.ok(completed.comparison.report.check.available);
  assert.ok(completed.comparison.report.comps.length >= 3);
  assert.ok(completed.steps.length >= 9);
  assert.equal(completed.comparison.subject.portfolioId, 'p_1042');
});

test('a manual listing can be valued through the same API', async () => {
  const created = await fetchJson(base, '/api/comparisons', {
    method: 'POST',
    body: {
      title: 'Two-bedroom apartment with sea view, Lagos',
      transaction: 'rent',
      type: 'apartment',
      city: 'Lagos',
      area: 'Meia Praia',
      bedrooms: 2,
      bathrooms: 2,
      areaM2: 95,
      price: 2100,
      features: ['Sea view', 'Pool', 'Furnished'],
    },
  });
  assert.equal(created.response.status, 202);
  const id = created.json.data.comparison.id;
  const completed = await waitFor(async () => {
    const result = await fetchJson(base, `/api/comparisons/${id}`);
    return result.json.data.comparison.status === 'completed' ? result.json.data : null;
  });
  assert.equal(completed.comparison.subject.source, 'manual');
  assert.equal(completed.comparison.subject.price, 2100);
  assert.ok(completed.comparison.report.check.count >= 3);
  assert.ok(['above', 'at', 'below'].includes(completed.comparison.report.check.verdict));
});

test('comparison exports use the comparable evidence', async () => {
  const csv = await fetch(`${base}/api/comparisons/ANL-1001/export.csv`);
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  const text = await csv.text();
  assert.match(text, /Comparable/);
  assert.match(text, /Source/);
  assert.match(text, /Idealista/);

  const json = await fetch(`${base}/api/comparisons/ANL-1001/export.json`);
  assert.equal(json.status, 200);
  const payload = await json.json();
  assert.equal(payload.data.comparison.ref, 'ANL-1001');
  assert.ok(payload.data.comparison.report.comps.length === 5);
});

test('comparison input validation rejects a missing price', async () => {
  const missing = await fetchJson(base, '/api/comparisons', {
    method: 'POST',
    body: {
      title: 'No price',
      transaction: 'rent',
      type: 'apartment',
      city: 'Lagos',
      bedrooms: 2,
      areaM2: 90,
    },
  });
  assert.equal(missing.response.status, 400);
});

test('reset restores the seeded analyses', async () => {
  const reset = await fetchJson(base, '/api/demo/reset', { method: 'POST', body: {} });
  assert.equal(reset.response.status, 200);
  const list = await fetchJson(base, '/api/comparisons');
  assert.equal(list.response.status, 200);
  assert.equal(list.json.data.comparisons.length, 2);
  assert.ok(list.json.data.comparisons.every((item) => item.status === 'completed'));
});
