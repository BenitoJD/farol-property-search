import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, fetchJson } from './helpers.js';
import { parseCsv, csvToObjects } from '../server/lib/csv.js';
import { SlidingWindowLimiter } from '../server/lib/rate-limit.js';
import { createConfig } from '../server/config.js';

let ctx;
let base;

before(async () => {
  ctx = await startTestApp();
  base = ctx.base;
});

after(async () => {
  await ctx.app.close();
});

test('serves the app shell with security headers', async () => {
  const response = await fetch(`${base}/`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.match(response.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  const html = await response.text();
  assert.match(html, /Farol/);
  assert.match(html, /Property Buy or Rent/);
});

test('serves static assets and a client portal shell fallback', async () => {
  const css = await fetch(`${base}/styles.css`);
  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-type'), /text\/css/);
  const js = await fetch(`${base}/js/app.js`);
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /javascript/);
  const svg = await fetch(`${base}/assets/property-villa.svg`);
  assert.equal(svg.status, 200);
  assert.match(svg.headers.get('content-type'), /image\/svg\+xml/);

  const portalShell = await fetch(`${base}/portal/anything`);
  assert.equal(portalShell.status, 200);
  assert.match(await portalShell.text(), /Farol/);
});

test('unknown API routes and runs return JSON errors', async () => {
  const missing = await fetchJson(base, '/api/not-a-route');
  assert.equal(missing.response.status, 404);
  assert.equal(missing.json.ok, false);
  assert.equal(missing.json.error.code, 'NOT_FOUND');

  const missingRun = await fetchJson(base, '/api/runs/events?runId=does_not_exist');
  assert.equal(missingRun.response.status, 404);
});

test('blocks path traversal attempts', async () => {
  const response = await fetch(`${base}/..%2F..%2Fserver%2Fapp.js`);
  assert.ok([403, 404].includes(response.status));
});

test('CSV parsing handles quotes, commas and CRLF', () => {
  const rows = parseCsv('name,notes\r\n"Algarve, Homes","A ""good"" agency"\r\nSimple,none\r\n');
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], ['name', 'notes']);
  assert.deepEqual(rows[1], ['Algarve, Homes', 'A "good" agency']);
  const objects = csvToObjects('Name,Domain\nExample,example.pt\n');
  assert.deepEqual(objects, [{ name: 'Example', domain: 'example.pt' }]);
});

test('sliding-window limiter enforces its budget and recovers', () => {
  const limiter = new SlidingWindowLimiter(2, 80);
  assert.equal(limiter.take('a').allowed, true);
  assert.equal(limiter.take('a').allowed, true);
  const blocked = limiter.take('a');
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterMs > 0);
  assert.equal(limiter.take('b').allowed, true);
});

test('configuration validates access passwords and ports', () => {
  assert.throws(() => createConfig({ accessPassword: 'short' }), /at least 8 characters/);
  const config = createConfig({ port: 0, dbPath: ':memory:', accessPassword: 'longenough' });
  assert.equal(config.port, 0);
  assert.equal(config.accessUser, 'farol');
});

test('optional basic authentication protects team APIs but not the client portal', async () => {
  const secured = await startTestApp({ accessPassword: 'farol-demo-pass' });
  try {
    const anonymous = await fetchJson(secured.base, '/api/dashboard');
    assert.equal(anonymous.response.status, 401);
    assert.match(anonymous.response.headers.get('www-authenticate') || '', /Basic/);

    const credentials = Buffer.from('farol:farol-demo-pass').toString('base64');
    const authenticated = await fetchJson(secured.base, '/api/dashboard', {
      headers: { Authorization: `Basic ${credentials}` },
    });
    assert.equal(authenticated.response.status, 200);

    const portal = await fetchJson(secured.base, '/api/portal/not-a-token');
    assert.equal(portal.response.status, 404);
  } finally {
    await secured.app.close();
  }
});
