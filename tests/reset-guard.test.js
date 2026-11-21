import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { fetchJson, startTestApp, waitFor } from './helpers.js';

let ctx;

before(async () => {
  ctx = await startTestApp({ stepDelayMs: 120 });
});

after(async () => {
  await ctx.app.close();
});

test('reset is blocked while an analysis is running and allowed afterwards', async () => {
  const created = await fetchJson(ctx.base, '/api/comparisons', {
    method: 'POST',
    body: { portfolioId: 'p_1042', market: 'demo' },
  });
  assert.equal(created.response.status, 202);
  const id = created.json.data.comparison.id;

  const blocked = await fetchJson(ctx.base, '/api/demo/reset', { method: 'POST', body: {} });
  assert.equal(blocked.response.status, 409);
  assert.match(blocked.json.error.message, /running analyses/i);

  await waitFor(async () => {
    const result = await fetchJson(ctx.base, `/api/comparisons/${id}`);
    return result.json.data.comparison.status === 'completed' ? true : null;
  });

  const reset = await fetchJson(ctx.base, '/api/demo/reset', { method: 'POST', body: {} });
  assert.equal(reset.response.status, 200);
  const list = await fetchJson(ctx.base, '/api/comparisons');
  assert.equal(list.json.data.comparisons.length, 2);
});
