import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { createConfig } from '../server/config.js';
import { createLogger } from '../server/lib/logger.js';

function basic(user, password) {
  return `Basic ${Buffer.from(`${user}:${password}`, 'utf8').toString('base64')}`;
}

test('optional HTTP Basic Auth protects all routes except health', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'scout-auth-'));
  const config = createConfig({
    dbPath: path.join(dir, 'auth.db'),
    mode: 'demo',
    stepDelayMs: 0,
    port: 0,
    host: '127.0.0.1',
    logLevel: 'silent',
    accessUser: 'ops',
    accessPassword: 'correct-horse-battery',
  });
  const app = createApp({ config, logger: createLogger('silent') });
  const address = await app.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const home = await fetch(`${base}/`);
    assert.equal(home.status, 401);
    assert.match(home.headers.get('www-authenticate'), /Basic realm="Scout"/);

    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);

    const metaAnonymous = await fetch(`${base}/api/meta`);
    assert.equal(metaAnonymous.status, 401);
    assert.equal((await metaAnonymous.json()).error.code, 'UNAUTHORIZED');

    const metaWrong = await fetch(`${base}/api/meta`, {
      headers: { Authorization: basic('ops', 'wrong-password') },
    });
    assert.equal(metaWrong.status, 401);

    const metaAuthorized = await fetch(`${base}/api/meta`, {
      headers: { Authorization: basic('ops', 'correct-horse-battery') },
    });
    assert.equal(metaAuthorized.status, 200);
    assert.equal((await metaAuthorized.json()).data.mode, 'demo');

    const options = await fetch(`${base}/api/meta`, { method: 'OPTIONS' });
    assert.equal(options.status, 401);
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('short access passwords are rejected by configuration', () => {
  assert.throws(
    () => createConfig({ mode: 'demo', dbPath: ':memory:', accessPassword: 'short' }),
    /at least 8 characters/
  );
});
