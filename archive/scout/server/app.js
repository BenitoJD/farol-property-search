import http from 'node:http';
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { Store } from './db.js';
import { createLogger } from './lib/logger.js';
import { createProvider } from './agent/provider.js';
import { Orchestrator } from './agent/orchestrator.js';
import { emptyReport, buildReport } from './agent/benchmark.js';
import { selectProperties } from './agent/brief.js';
import { buildReportCsv } from './lib/csv.js';
import { SlidingWindowLimiter } from './lib/rate-limit.js';
import {
  HttpError,
  badRequest,
  conflict,
  notFound,
  tooMany,
} from './lib/errors.js';
import {
  validateRunId,
  validateRunInput,
  validateSourceId,
  validateSourceInput,
  validateSourcePatch,
} from './lib/validate.js';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);
const API_PREFIX = '/api/';

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
  );
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'"
  );
}

function serialiseRun(run) {
  if (!run) return null;
  return {
    id: run.id,
    threadId: run.thread_id,
    iteration: run.iteration,
    brief: run.brief,
    filters: run.filters,
    mode: run.mode,
    status: run.status,
    phase: run.phase,
    progress: run.progress,
    stats: run.stats,
    error: run.error,
    createdAt: run.created_at,
    startedAt: run.started_at,
    finishedAt: run.finished_at,
    durationMs: run.duration_ms,
  };
}

function serialiseStep(step) {
  return {
    seq: step.seq,
    phase: step.phase,
    level: step.level,
    message: step.message,
    detail: step.detail,
    ts: step.ts,
    elapsedMs: step.elapsed_ms,
  };
}

function serialiseSource(source) {
  return {
    id: source.id,
    name: source.name,
    domain: source.domain,
    kind: source.kind,
    region: source.region,
    country: source.country,
    url: source.url,
    enabled: source.enabled,
    discoveredBy: source.discovered_by,
    reliability: source.reliability,
    notes: source.notes,
    timesUsed: source.times_used,
    lastUsedAt: source.last_used_at,
    createdAt: source.created_at,
  };
}

function serialiseProperty(property) {
  return {
    id: property.id,
    ref: property.ref,
    title: property.title,
    transaction: property.transaction,
    type: property.type,
    city: property.city,
    neighborhood: property.neighborhood,
    region: property.region,
    country: property.country,
    lat: property.lat,
    lng: property.lng,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    areaM2: property.area_m2,
    area_m2: property.area_m2,
    price: property.price,
    currency: property.currency,
    period: property.period,
    features: property.features,
    blurb: property.blurb,
    url: property.url,
    status: property.status,
  };
}

function sendJson(res, status, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  if (res.req?.method === 'HEAD') res.end();
  else res.end(body);
}

function ok(res, data, status = 200, extraHeaders = {}) {
  sendJson(res, status, { ok: true, data }, extraHeaders);
}

function fail(res, status, code, message, details = null, requestId = null) {
  sendJson(res, status, {
    ok: false,
    error: { code, message, details, requestId },
  });
}

async function readJsonBody(req, maxBytes) {
  const contentType = String(req.headers['content-type'] || '');
  if (!contentType.includes('application/json') && !contentType.includes('+json')) {
    throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json.');
  }
  const declared = Number(req.headers['content-length'] || 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
    }
    chunks.push(chunk);
  }
  if (!chunks.length) throw badRequest('Request body is empty.');
  let parsed;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw badRequest('Request body is not valid JSON.');
  }
  return parsed;
}

function clientKey(req) {
  return req.socket?.remoteAddress || 'unknown';
}

function constantTimeEqual(a, b) {
  const left = createHash('sha256').update(String(a)).digest();
  const right = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(left, right);
}

function hasValidBasicAuth(req, config) {
  if (!config.accessPassword) return true;
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Basic ')) return false;
  let decoded;
  try {
    decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  } catch {
    return false;
  }
  const separator = decoded.indexOf(':');
  if (separator === -1) return false;
  const user = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);
  return constantTimeEqual(user, config.accessUser) && constantTimeEqual(password, config.accessPassword);
}

function requestPath(url) {
  return url.pathname;
}

/**
 * Create the HTTP application. No global state: tests can run isolated
 * instances against temporary SQLite databases.
 */
export function createApp({ config, logger: suppliedLogger }) {
  const logger = suppliedLogger || createLogger(config.logLevel);
  const store = new Store(config.dbPath);
  store.markInterruptedRuns();

  const bus = new EventEmitter();
  bus.setMaxListeners(64);
  const provider = createProvider({ config, logger });
  const orchestrator = new Orchestrator({ store, provider, config, logger, bus });
  const runLimiter = new SlidingWindowLimiter(config.runsPerMinute, 60_000);
  const writeLimiter = new SlidingWindowLimiter(30, 60_000);
  const publicDir = path.resolve(config.publicDir);
  const startedAt = Date.now();

  function loadReport(runId) {
    const bundle = store.getRunBundle(runId);
    if (!bundle) return null;
    if (!TERMINAL.has(bundle.run.status)) return null;
    if (bundle.run.status !== 'completed') {
      return {
        run: serialiseRun(bundle.run),
        report: emptyReport(bundle.run, bundle.steps.map(serialiseStep)),
      };
    }
    const filters = bundle.run.filters;
    const properties = selectProperties(bundle.properties, filters);
    const report = buildReport({
      run: bundle.run,
      offers: bundle.offers,
      matches: bundle.matches,
      properties,
      sources: bundle.sources,
      steps: bundle.steps.map(serialiseStep),
    });
    report.run.stats = bundle.run.stats;
    return { run: serialiseRun(bundle.run), report };
  }

  async function handleCreateRun(req, res) {
    const limit = runLimiter.take(clientKey(req));
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(Math.ceil(limit.retryAfterMs / 1000)));
      throw tooMany('Too many scout runs. Please wait a moment before trying again.');
    }
    const body = await readJsonBody(req, config.maxBodyBytes);
    const parsed = validateRunInput(body, { fx: config.fx });
    if (store.countRunningRuns() >= config.maxConcurrentRuns) {
      throw tooMany('Scout is already running the maximum number of searches. Try again shortly.');
    }
    const run = store.createRun({
      brief: parsed.brief,
      filters: parsed.filters,
      mode: config.mode,
      threadId: parsed.threadId,
    });
    setImmediate(() => {
      orchestrator.start(run.id).catch((error) => {
        logger.error('orchestrator crashed', { runId: run.id, error: error.message });
      });
    });
    res.setHeader('Location', `/api/runs/${run.id}`);
    ok(res, { run: serialiseRun(run) }, 202);
  }

  async function handleRunEvents(req, res, runId) {
    const run = store.getRun(runId);
    if (!run) throw notFound('Run not found.');
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 1500\n\n');
    res.setTimeout(0);

    let closed = false;
    let replaying = true;
    let doneSent = false;
    let lastSeq = 0;
    const pending = [];
    const channel = `run:${runId}`;

    const writeEvent = (event, payload) => {
      if (closed) return;
      try {
        res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
      } catch {
        closed = true;
      }
    };

    const sendDone = (finalRun) => {
      if (doneSent) return;
      doneSent = true;
      writeEvent('done', { type: 'done', run: serialiseRun(finalRun) });
      cleanup();
      if (!closed) res.end();
    };

    const handlePayload = (payload) => {
      if (doneSent) return;
      if (payload.type === 'step') {
        const step = payload.step;
        if (!step || step.seq <= lastSeq) return;
        lastSeq = step.seq;
        writeEvent('step', {
          type: 'step',
          step: serialiseStep(step),
          progress: payload.progress ?? null,
          phase: payload.phase ?? step.phase,
        });
      } else if (payload.type === 'done') {
        sendDone(payload.run);
      }
    };

    const onMessage = (payload) => {
      if (closed) return;
      if (replaying) pending.push(payload);
      else handlePayload(payload);
    };

    const heartbeat = setInterval(() => {
      if (!closed) {
        try {
          res.write(': ping\n\n');
        } catch {
          closed = true;
        }
      }
    }, 20_000);
    if (heartbeat.unref) heartbeat.unref();

    function cleanup() {
      clearInterval(heartbeat);
      bus.off(channel, onMessage);
    }

    res.on('close', () => {
      closed = true;
      cleanup();
    });
    req.on('aborted', () => {
      closed = true;
      cleanup();
    });

    bus.on(channel, onMessage);

    try {
      const steps = store.listSteps(runId);
      const current = store.getRun(runId);
      for (const step of steps) {
        lastSeq = step.seq;
        writeEvent('step', {
          type: 'step',
          step: serialiseStep(step),
          progress: current?.progress ?? null,
          phase: current?.phase ?? step.phase,
        });
      }
      replaying = false;
      for (const payload of pending) handlePayload(payload);
      pending.length = 0;

      const latest = store.getRun(runId);
      if (latest && TERMINAL.has(latest.status)) {
        sendDone(latest);
      }
    } catch (error) {
      logger.error('SSE stream failed', { runId, error: error.message });
      cleanup();
      if (!closed) res.end();
    }
  }

  async function serveStatic(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
    }
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      throw badRequest('Malformed URL.');
    }
    if (pathname.includes('\0')) throw badRequest('Malformed URL.');
    let relative = pathname.replace(/^\/+/, '');
    if (!relative) relative = 'index.html';
    let filePath = path.resolve(publicDir, relative);
    if (!filePath.startsWith(`${publicDir}${path.sep}`) && filePath !== publicDir) {
      throw notFound('Not found.');
    }

    let info = await stat(filePath).catch(() => null);
    if (info?.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      relative = path.relative(publicDir, filePath);
      info = await stat(filePath).catch(() => null);
    }
    if (!info) {
      // Unknown extensionless paths fall back to the SPA shell.
      if (!path.extname(relative)) {
        filePath = path.join(publicDir, 'index.html');
        info = await stat(filePath).catch(() => null);
      }
      if (!info) throw notFound('Not found.');
    }

    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
    res.setHeader('ETag', etag);
    const revalidate = ['.html', '.js', '.mjs', '.css'].includes(ext);
    res.setHeader(
      'Cache-Control',
      revalidate ? 'no-cache' : 'public, max-age=3600, must-revalidate'
    );
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304);
      res.end();
      return;
    }
    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': body.length,
    });
    if (req.method === 'HEAD') res.end();
    else res.end(body);
  }

  async function handleApi(req, res, url, requestId) {
    const pathname = requestPath(url);
    const method = req.method || 'GET';

    if (pathname === '/api/health' && method === 'GET') {
      const overview = store.overview();
      ok(res, {
        status: 'ok',
        mode: config.mode,
        version: config.version,
        uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
        completedRuns: overview.completedRuns,
      });
      return;
    }

    if (pathname === '/api/meta' && method === 'GET') {
      ok(res, {
        appName: config.appName,
        org: config.org,
        version: config.version,
        mode: config.mode,
        liveAvailable: config.mode === 'live',
        fx: config.fx,
        overview: store.overview(),
        limits: {
          maxConcurrentRuns: config.maxConcurrentRuns,
          runsPerMinute: config.runsPerMinute,
          maxBriefChars: 1500,
        },
      });
      return;
    }

    if (pathname === '/api/properties' && method === 'GET') {
      const properties = store.listProperties();
      ok(res, { properties: properties.map(serialiseProperty), count: properties.length });
      return;
    }

    if (pathname === '/api/sources' && method === 'GET') {
      const sources = store.listSources();
      ok(res, { sources: sources.map(serialiseSource), count: sources.length });
      return;
    }

    if (pathname === '/api/sources' && method === 'POST') {
      const limit = writeLimiter.take(clientKey(req));
      if (!limit.allowed) throw tooMany('Too many catalogue changes. Please wait a moment.');
      const body = await readJsonBody(req, config.maxBodyBytes);
      const parsed = validateSourceInput(body);
      if (store.findSourceByDomain(parsed.domain)) {
        throw conflict('A source with this domain is already in the catalogue.');
      }
      const inserted = store.insertSource(parsed);
      if (!inserted.created) throw conflict('A source with this domain is already in the catalogue.');
      logger.info('source added', { sourceId: inserted.source.id, domain: parsed.domain });
      ok(res, { source: serialiseSource(inserted.source) }, 201);
      return;
    }

    const sourceMatch = pathname.match(/^\/api\/sources\/([^/]+)$/);
    if (sourceMatch) {
      const sourceId = validateSourceId(sourceMatch[1]);
      const source = store.getSource(sourceId);
      if (!source) throw notFound('Source not found.');
      if (method === 'PATCH') {
        const limit = writeLimiter.take(clientKey(req));
        if (!limit.allowed) throw tooMany('Too many catalogue changes. Please wait a moment.');
        const body = await readJsonBody(req, config.maxBodyBytes);
        const patch = validateSourcePatch(body);
        const updated = store.updateSource(sourceId, patch);
        logger.info('source updated', { sourceId, fields: Object.keys(patch) });
        ok(res, { source: serialiseSource(updated) });
        return;
      }
      if (method === 'GET') {
        ok(res, { source: serialiseSource(source) });
        return;
      }
      res.setHeader('Allow', 'GET, PATCH');
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
    }

    if (pathname === '/api/runs' && method === 'GET') {
      const limitParam = Number(url.searchParams.get('limit') || 50);
      const runs = store.listRuns(Number.isFinite(limitParam) ? limitParam : 50);
      ok(res, { runs: runs.map(serialiseRun) });
      return;
    }

    if (pathname === '/api/runs' && method === 'POST') {
      await handleCreateRun(req, res);
      return;
    }

    const runMatch = pathname.match(/^\/api\/runs\/([^/]+)(?:\/(results|events|cancel|export\.csv|export\.json))?$/);
    if (runMatch) {
      const runId = validateRunId(runMatch[1]);
      const action = runMatch[2] || null;
      const run = store.getRun(runId);
      if (!run) throw notFound('Run not found.');

      if (!action && method === 'GET') {
        ok(res, {
          run: serialiseRun(run),
          steps: store.listSteps(runId).map(serialiseStep),
        });
        return;
      }

      if (action === 'results' && method === 'GET') {
        if (!TERMINAL.has(run.status)) throw conflict('This run is still in progress.');
        const loaded = loadReport(runId);
        if (!loaded) throw notFound('Run not found.');
        ok(res, loaded.report);
        return;
      }

      if (action === 'events' && method === 'GET') {
        await handleRunEvents(req, res, runId);
        return;
      }

      if (action === 'cancel' && method === 'POST') {
        if (TERMINAL.has(run.status)) throw conflict(`Run is already ${run.status}.`);
        const result = orchestrator.cancel(runId);
        if (!result.found) throw notFound('Run not found.');
        ok(res, { run: serialiseRun(store.getRun(runId)), status: result.status }, 202);
        return;
      }

      if ((action === 'export.csv' || action === 'export.json') && method === 'GET') {
        if (run.status !== 'completed') throw conflict('Only completed runs can be exported.');
        const loaded = loadReport(runId);
        if (!loaded) throw notFound('Run not found.');
        if (action === 'export.csv') {
          const csv = buildReportCsv(loaded.report);
          res.writeHead(200, {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="scout-${runId}.csv"`,
            'Content-Length': Buffer.byteLength(csv),
            'Cache-Control': 'no-store',
          });
          res.end(csv);
          return;
        }
        const json = JSON.stringify(loaded.report, null, 2);
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="scout-${runId}.json"`,
          'Content-Length': Buffer.byteLength(json),
          'Cache-Control': 'no-store',
        });
        res.end(json);
        return;
      }

      res.setHeader('Allow', 'GET, POST');
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed for this run route.');
    }

    if (pathname === '/api/demo/reset' && method === 'POST') {
      if (config.mode !== 'demo') {
        throw new HttpError(403, 'FORBIDDEN', 'Demo reset is only available in demo mode.');
      }
      const limit = writeLimiter.take(clientKey(req));
      if (!limit.allowed) throw tooMany('Too many reset requests. Please wait a moment.');
      await readJsonBody(req, config.maxBodyBytes);
      if (store.countRunningRuns() > 0) {
        throw conflict('Wait for the current scout run to finish before resetting the demo.');
      }
      store.resetDemo();
      logger.info('demo data reset');
      ok(res, { reset: true, overview: store.overview() });
      return;
    }

    throw notFound('API route not found.');
  }

  const server = http.createServer(async (req, res) => {
    const requestId = randomUUID().slice(0, 8);
    const started = Date.now();
    setSecurityHeaders(res);
    res.setHeader('X-Request-Id', requestId);
    res.on('finish', () => {
      const duration = Date.now() - started;
      logger.info('http request', {
        method: req.method,
        path: String(req.url || '').split('?')[0],
        status: res.statusCode,
        ms: duration,
        requestId,
      });
    });

    let url;
    try {
      url = new URL(req.url || '/', 'http://scout.local');
    } catch {
      fail(res, 400, 'BAD_REQUEST', 'Malformed URL.', null, requestId);
      return;
    }

    try {
      const healthCheck = url.pathname === '/api/health';
      if (!healthCheck && !hasValidBasicAuth(req, config)) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Scout", charset="UTF-8"');
        if (url.pathname.startsWith(API_PREFIX)) {
          fail(res, 401, 'UNAUTHORIZED', 'Authentication required.', null, requestId);
        } else {
          const body = 'Authentication required.';
          res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end(body);
        }
        return;
      }
      if (url.pathname.startsWith(API_PREFIX)) {
        await handleApi(req, res, url, requestId);
      } else {
        await serveStatic(req, res, url);
      }
    } catch (error) {
      if (res.headersSent || res.writableEnded) {
        if (!res.writableEnded) res.end();
        return;
      }
      if (error instanceof HttpError) {
        if (error.status === 429 && error.details?.retryAfterSeconds) {
          res.setHeader('Retry-After', String(error.details.retryAfterSeconds));
        }
        fail(res, error.status, error.code, error.message, error.details, requestId);
        return;
      }
      logger.error('unhandled request error', {
        path: url.pathname,
        requestId,
        error: error?.message,
        stack: error?.stack,
      });
      fail(res, 500, 'INTERNAL', 'Something went wrong. Please try again.', null, requestId);
    }
  });

  server.requestTimeout = 60_000;
  server.keepAliveTimeout = 65_000;

  let closed = false;
  const app = {
    config,
    logger,
    store,
    orchestrator,
    bus,
    server,
    async listen(port = config.port, host = config.host) {
      await new Promise((resolve, reject) => {
        const onError = (error) => {
          server.off('listening', onListening);
          reject(error);
        };
        const onListening = () => {
          server.off('error', onError);
          resolve();
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, host);
      });
      return server.address();
    },
    async close() {
      if (closed) return;
      closed = true;
      for (const runId of orchestrator.activeRunIds()) {
        orchestrator.cancel(runId);
      }
      await new Promise((resolve) => {
        if (!server.listening) return resolve();
        server.close(() => resolve());
        setTimeout(() => server.closeAllConnections?.(), 25).unref();
      });
      await orchestrator.waitForIdle(3000);
      store.close();
    },
  };
  return app;
}
