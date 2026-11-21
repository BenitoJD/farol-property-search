import test from 'node:test';
import assert from 'node:assert/strict';
import { createConfig } from '../server/config.js';
import { SlidingWindowLimiter } from '../server/lib/rate-limit.js';
import { assertPublicUrl } from '../server/lib/fetch-safe.js';

test('auto mode falls back to demo without a Tavily key', () => {
  const config = createConfig({ mode: 'auto', tavilyKey: '', dbPath: ':memory:' });
  assert.equal(config.mode, 'demo');
  assert.equal(config.fx.EUR, 1);
});

test('explicit live mode without a key fails loudly', () => {
  assert.throws(
    () => createConfig({ mode: 'live', tavilyKey: '', dbPath: ':memory:' }),
    /TAVILY_API_KEY/
  );
});

test('explicit demo mode works even with a key present', () => {
  const config = createConfig({ mode: 'demo', tavilyKey: 'tvly-secret', dbPath: ':memory:' });
  assert.equal(config.mode, 'demo');
  assert.equal(config.tavilyKey, 'tvly-secret');
});

test('rate limiter enforces a sliding window and recovers', () => {
  const limiter = new SlidingWindowLimiter(2, 1000);
  const t0 = 1_000_000;
  assert.equal(limiter.take('a', t0).allowed, true);
  assert.equal(limiter.take('a', t0 + 100).allowed, true);
  const blocked = limiter.take('a', t0 + 200);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterMs > 0);
  assert.equal(limiter.take('b', t0 + 200).allowed, true);
  assert.equal(limiter.take('a', t0 + 1101).allowed, true);
});

test('SSRF guard rejects unsafe URLs before any network access', async () => {
  await assert.rejects(() => assertPublicUrl('file:///etc/passwd'), /HTTP\(S\)/);
  await assert.rejects(() => assertPublicUrl('http://localhost:4321/admin'), /not allowed/);
  await assert.rejects(() => assertPublicUrl('http://127.0.0.1/'), /Private/);
  await assert.rejects(() => assertPublicUrl('http://169.254.169.254/latest/meta-data'), /Private/);
  await assert.rejects(() => assertPublicUrl('https://user:pass@example.com/'), /credentials/);
});
