import http from 'node:http';
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { Store } from './db.js';
import { createLogger } from './lib/logger.js';
import { Orchestrator } from './agent/orchestrator.js';
import { ComparisonOrchestrator } from './agent/comparison-orchestrator.js';
import { CaseService } from './service/cases.js';
import { ComparisonService } from './service/comparisons.js';
import { SlidingWindowLimiter } from './lib/rate-limit.js';
import { HttpError, badRequest, conflict, notFound, tooMany } from './lib/errors.js';
import { toCsv } from './lib/csv.js';
import {
  asEnum,
  asNumber,
  asString,
  validateCasePatch,
  validateClose,
  validateComparison,
  validateCreateCase,
  validateFeedback,
  validateId,
  validateInventory,
  validateIteration,
  validateListingDecision,
  validateRequirements,
  validateShortlist,
  validateShortlistPatch,
  validateSource,
  validateSourcePatch,
} from './lib/validate.js';
import { CASE_STAGES } from './db.js';

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

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'"
  );
}

function sendJson(res, status, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(body);
}

function ok(res, data, status = 200, extraHeaders = {}) {
  sendJson(res, status, { ok: true, data }, extraHeaders);
}

function fail(res, status, code, message, details = null, requestId = null) {
  sendJson(res, status, { ok: false, error: { code, message, details, requestId } });
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
    if (size > maxBytes) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
    chunks.push(chunk);
  }
  if (!chunks.length) throw badRequest('Request body is empty.');
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw badRequest('Request body is not valid JSON.');
  }
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

function slug(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function fmtMoney(value) {
  return Number.isFinite(Number(value)) ? Math.round(Number(value)) : '';
}

export function createApp({ config, logger: suppliedLogger }) {
  const logger = suppliedLogger || createLogger(config.logLevel);
  const store = new Store(config.dbPath);
  store.markInterruptedRuns();
  store.markInterruptedComparisons();

  const bus = new EventEmitter();
  bus.setMaxListeners(120);
  const orchestrator = new Orchestrator({ store, config, logger, bus });
  const comparisonOrchestrator = new ComparisonOrchestrator({ store, config, logger, bus });
  const service = new CaseService({ store, orchestrator, config, logger });
  const comparisons = new ComparisonService({
    store,
    orchestrator: comparisonOrchestrator,
    config,
    logger,
  });
  const searchLimiter = new SlidingWindowLimiter(config.searchesPerMinute, 60_000);
  const writeLimiter = new SlidingWindowLimiter(config.writesPerMinute, 60_000);
  const publicDir = path.resolve(config.publicDir);
  const startedAt = Date.now();

  function writeLimit(req) {
    const limit = writeLimiter.take(clientKey(req));
    if (!limit.allowed) {
      throw tooMany('Too many changes in a short window. Please wait a moment.');
    }
  }

  function searchLimit(req) {
    const limit = searchLimiter.take(clientKey(req));
    if (!limit.allowed) {
      throw tooMany('Too many searches in a short window. Please wait a moment.');
    }
  }

  async function serveStatic(req, res, pathname) {
    let relative = pathname === '/' ? '/index.html' : pathname;
    if (relative.startsWith('/portal/')) relative = '/index.html';
    const filePath = path.resolve(publicDir, `.${relative}`);
    if (filePath !== publicDir && !filePath.startsWith(`${publicDir}${path.sep}`)) {
      throw notFound('Not found.');
    }
    let fileStat;
    try {
      fileStat = await stat(filePath);
    } catch {
      if (!path.extname(relative)) {
        const fallback = path.join(publicDir, 'index.html');
        const body = await readFile(fallback);
        res.writeHead(200, {
          'Content-Type': MIME_TYPES['.html'],
          'Content-Length': body.length,
          'Cache-Control': 'no-cache',
        });
        res.end(body);
        return;
      }
      throw notFound('Not found.');
    }
    if (!fileStat.isFile()) throw notFound('Not found.');
    const body = await readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': ['.html', '.js', '.css'].includes(extension) ? 'no-cache' : 'public, max-age=300',
    });
    res.end(body);
  }

  function streamRunEvents(req, res, runId) {
    const run = store.getRun(runId);
    if (!run) throw notFound('Run not found.');
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(`retry: 1500\n\n`);

    const send = (payload) => {
      try {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch {
        /* client disconnected */
      }
    };

    const steps = store.listRunSteps(runId);
    for (const step of steps) {
      send({
        type: 'step',
        runId,
        step: {
          seq: step.seq,
          phase: step.phase,
          level: step.level,
          message: step.message,
          detail: step.detail,
          ts: step.ts,
          elapsedMs: step.elapsed_ms,
        },
        progress: run.progress,
      });
    }
    send({ type: 'status', runId, status: run.status, phase: run.phase, progress: run.progress });

    if (['completed', 'failed', 'cancelled'].includes(run.status)) {
      send({ type: 'done', runId, run: { id: run.id, status: run.status, stats: run.stats, error: run.error } });
      res.end();
      return;
    }

    const channel = `run:${runId}`;
    const onEvent = (payload) => {
      send(payload);
      if (payload.type === 'done' || payload.type === 'error') {
        cleanup();
        res.end();
      }
    };
    const heartbeat = setInterval(() => {
      try {
        res.write(`: heartbeat ${Date.now()}\n\n`);
      } catch {
        cleanup();
      }
    }, 15_000);
    heartbeat.unref?.();
    const cleanup = () => {
      clearInterval(heartbeat);
      bus.off(channel, onEvent);
    };
    bus.on(channel, onEvent);
    res.on('close', cleanup);
  }

  function streamComparisonEvents(req, res, comparisonId) {
    const comparison = store.getComparison(comparisonId);
    if (!comparison) throw notFound('Comparison not found.');
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 1500\n\n');
    const send = (payload) => {
      try {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch {
        /* disconnected */
      }
    };
    for (const step of store.listComparisonSteps(comparisonId)) {
      send({
        type: 'step',
        comparisonId,
        step: {
          seq: step.seq,
          phase: step.phase,
          level: step.level,
          message: step.message,
          detail: step.detail,
          ts: step.ts,
          elapsedMs: step.elapsed_ms,
        },
      });
    }
    send({ type: 'status', comparisonId, status: comparison.status });
    if (['completed', 'failed'].includes(comparison.status)) {
      send({ type: 'done', comparisonId, status: comparison.status });
      res.end();
      return;
    }

    const channel = `comparison:${comparisonId}`;
    const onEvent = (payload) => {
      send(payload);
      if (payload.type === 'done' || payload.type === 'error') {
        cleanup();
        res.end();
      }
    };
    const heartbeat = setInterval(() => {
      try {
        res.write(`: heartbeat ${Date.now()}\n\n`);
      } catch {
        cleanup();
      }
    }, 15_000);
    heartbeat.unref?.();
    const cleanup = () => {
      clearInterval(heartbeat);
      bus.off(channel, onEvent);
    };
    bus.on(channel, onEvent);
    res.on('close', cleanup);
  }

  function caseExportCsv(bundle) {
    const shortlist = bundle.shortlist;
    const rows = shortlist?.items?.length
      ? shortlist.items.map((item) => ({ ...item.listing, shortlistRationale: item.rationale, clientDecision: item.clientDecision }))
      : bundle.listings.filter((listing) => listing.included && listing.canonical);
    const columns = [
      { label: 'Rank', value: (row) => row.rank ?? '' },
      { label: 'Property', value: (row) => row.title },
      { label: 'City', value: (row) => row.city },
      { label: 'Type', value: (row) => row.type },
      { label: 'Bedrooms', value: (row) => row.bedrooms ?? '' },
      { label: 'Area m2', value: (row) => row.areaM2 ?? '' },
      { label: 'Price EUR', value: (row) => fmtMoney(row.price) },
      { label: 'Period', value: (row) => (row.period === 'month' ? 'month' : 'total') },
      { label: 'Source', value: (row) => row.sourceName },
      { label: 'Match score', value: (row) => row.matchScore ?? '' },
      { label: 'Comparable median', value: (row) => fmtMoney(row.priceCheck?.median) },
      { label: 'Delta vs median %', value: (row) => row.priceCheck?.deltaPct ?? '' },
      { label: 'Price read', value: (row) => row.priceCheck?.verdictLabel ?? '' },
      { label: 'Suggested offer', value: (row) => fmtMoney(row.priceCheck?.suggestedOffer) },
      { label: 'Rationale', value: (row) => row.rationale ?? row.shortlistRationale ?? '' },
      { label: 'Client decision', value: (row) => row.clientDecision ?? '' },
    ];
    return toCsv(rows, columns);
  }

  async function handleApi(req, res, url) {
    const method = req.method;
    const pathname = url.pathname;
    const requestId = randomUUID().slice(0, 8);
    const quote = (value) => decodeURIComponent(value);

    if (pathname === '/api/health' && method === 'GET') {
      return ok(res, {
        status: 'ok',
        uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
        mode: config.mode,
        version: config.version,
        cases: store.listCases({ limit: 500 }).length,
      });
    }

    if (pathname === '/api/meta' && method === 'GET') {
      const metrics = store.getMetrics();
      return ok(res, {
        app: config.appName,
        org: config.org,
        version: config.version,
        mode: config.mode,
        stages: CASE_STAGES,
        limits: {
          maxConcurrentRuns: config.maxConcurrentRuns,
          searchesPerMinute: config.searchesPerMinute,
        },
        counts: {
          activeCases: metrics.activeCases,
          comparisons: store.listComparisons(100).length,
          sources: metrics.sources.total,
          inventory: store.listInventory().length,
          portfolio: store.listPortfolio().length,
          cases: store.listCases({ limit: 500 }).length,
        },
        demo: true,
      });
    }

    if (pathname === '/api/dashboard' && method === 'GET') {
      return ok(res, service.getDashboard());
    }

    if (pathname === '/api/compare/options' && method === 'GET') {
      return ok(res, comparisons.options());
    }

    if (pathname === '/api/comparisons' && method === 'GET') {
      return ok(res, { comparisons: comparisons.list(Number(url.searchParams.get('limit')) || 30) });
    }

    if (pathname === '/api/comparisons' && method === 'POST') {
      writeLimit(req);
      searchLimit(req);
      const body = await readJsonBody(req, config.maxBodyBytes);
      const result = comparisons.create(validateComparison(body));
      return ok(res, result, 202, { Location: `/api/comparisons/${result.comparison.id}` });
    }

    const comparisonEventsMatch = pathname.match(/^\/api\/comparisons\/([^/]+)\/events$/);
    if (comparisonEventsMatch && method === 'GET') {
      return streamComparisonEvents(req, res, quote(comparisonEventsMatch[1]));
    }

    const comparisonExportCsvMatch = pathname.match(/^\/api\/comparisons\/([^/]+)\/export\.csv$/);
    if (comparisonExportCsvMatch && method === 'GET') {
      const id = quote(comparisonExportCsvMatch[1]);
      const csv = comparisons.exportCsv(id);
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${comparisons.exportFilename(id)}-comparables.csv"`,
        'Cache-Control': 'no-store',
      });
      res.end(csv);
      return;
    }

    const comparisonExportJsonMatch = pathname.match(/^\/api\/comparisons\/([^/]+)\/export\.json$/);
    if (comparisonExportJsonMatch && method === 'GET') {
      const id = quote(comparisonExportJsonMatch[1]);
      const bundle = comparisons.get(id);
      return sendJson(res, 200, { ok: true, data: bundle }, {
        'Content-Disposition': `attachment; filename="${comparisons.exportFilename(id)}.json"`,
        'Cache-Control': 'no-store',
      });
    }

    const comparisonMatch = pathname.match(/^\/api\/comparisons\/([^/]+)$/);
    if (comparisonMatch && method === 'GET') {
      return ok(res, comparisons.get(quote(comparisonMatch[1])));
    }

    const comparisonRetryMatch = pathname.match(/^\/api\/comparisons\/([^/]+)\/retry$/);
    if (comparisonRetryMatch && method === 'POST') {
      writeLimit(req);
      searchLimit(req);
      return ok(res, comparisons.start(quote(comparisonRetryMatch[1])), 202);
    }

    if (pathname === '/api/cases' && method === 'GET') {
      const cases = service.listCases({
        stage: url.searchParams.get('stage') || undefined,
        status: url.searchParams.get('status') || undefined,
        query: url.searchParams.get('q') || undefined,
        limit: Number(url.searchParams.get('limit')) || 100,
      });
      return ok(res, { cases });
    }

    if (pathname === '/api/cases' && method === 'POST') {
      writeLimit(req);
      const body = await readJsonBody(req, config.maxBodyBytes);
      const input = validateCreateCase(body);
      const bundle = service.createCase(input, 'Team');
      return ok(res, bundle, 201, { Location: `/api/cases/${bundle.case.id}` });
    }

    if (pathname === '/api/runs/events' && method === 'GET') {
      const runId = validateId(url.searchParams.get('runId') || '', 'runId');
      return streamRunEvents(req, res, runId);
    }

    const caseMatch = pathname.match(/^\/api\/cases\/([^/]+)$/);
    if (caseMatch) {
      const caseId = quote(caseMatch[1]);
      if (method === 'GET') return ok(res, service.getBundle(caseId));
      if (method === 'PATCH') {
        writeLimit(req);
        const body = await readJsonBody(req, config.maxBodyBytes);
        return ok(res, service.updateCase(caseId, validateCasePatch(body)));
      }
    }

    const requirementsMatch = pathname.match(/^\/api\/cases\/([^/]+)\/requirements$/);
    if (requirementsMatch && method === 'POST') {
      writeLimit(req);
      const body = await readJsonBody(req, config.maxBodyBytes);
      return ok(res, service.confirmRequirements(quote(requirementsMatch[1]), validateRequirements(body)));
    }

    const inventoryMatch = pathname.match(/^\/api\/cases\/([^/]+)\/inventory-check$/);
    if (inventoryMatch && method === 'POST') {
      writeLimit(req);
      searchLimit(req);
      const result = await service.runInventoryCheck(quote(inventoryMatch[1]));
      return ok(res, result, 202);
    }

    const searchMatch = pathname.match(/^\/api\/cases\/([^/]+)\/search$/);
    if (searchMatch && method === 'POST') {
      writeLimit(req);
      searchLimit(req);
      const result = service.startSearch(quote(searchMatch[1]));
      return ok(res, result, 202, { Location: `/api/runs/events?runId=${result.run.id}` });
    }

    const cancelMatch = pathname.match(/^\/api\/cases\/([^/]+)\/runs\/([^/]+)\/cancel$/);
    if (cancelMatch && method === 'POST') {
      writeLimit(req);
      return ok(res, service.cancelRun(quote(cancelMatch[1]), quote(cancelMatch[2])));
    }

    const decisionMatch = pathname.match(/^\/api\/cases\/([^/]+)\/listings\/([^/]+)\/decision$/);
    if (decisionMatch && method === 'POST') {
      writeLimit(req);
      const body = await readJsonBody(req, config.maxBodyBytes);
      const input = validateListingDecision(body);
      return ok(
        res,
        service.updateListingDecision(
          quote(decisionMatch[1]),
          quote(decisionMatch[2]),
          input.decision,
          input.note
        )
      );
    }

    const shortlistCreateMatch = pathname.match(/^\/api\/cases\/([^/]+)\/shortlist$/);
    if (shortlistCreateMatch && method === 'POST') {
      writeLimit(req);
      const body = await readJsonBody(req, config.maxBodyBytes);
      return ok(res, service.createShortlist(quote(shortlistCreateMatch[1]), validateShortlist(body)), 201);
    }

    const shortlistPatchMatch = pathname.match(/^\/api\/cases\/([^/]+)\/shortlists\/([^/]+)$/);
    if (shortlistPatchMatch && method === 'PATCH') {
      writeLimit(req);
      const body = await readJsonBody(req, config.maxBodyBytes);
      return ok(
        res,
        service.updateShortlist(
          quote(shortlistPatchMatch[1]),
          quote(shortlistPatchMatch[2]),
          validateShortlistPatch(body)
        )
      );
    }

    const shareMatch = pathname.match(/^\/api\/cases\/([^/]+)\/shortlists\/([^/]+)\/share$/);
    if (shareMatch && method === 'POST') {
      writeLimit(req);
      return ok(res, service.shareShortlist(quote(shareMatch[1]), quote(shareMatch[2])));
    }

    const iterateMatch = pathname.match(/^\/api\/cases\/([^/]+)\/iterate$/);
    if (iterateMatch && method === 'POST') {
      writeLimit(req);
      const body = await readJsonBody(req, config.maxBodyBytes);
      return ok(res, service.iterateCase(quote(iterateMatch[1]), validateIteration(body)), 201);
    }

    const closeMatch = pathname.match(/^\/api\/cases\/([^/]+)\/close$/);
    if (closeMatch && method === 'POST') {
      writeLimit(req);
      const body = await readJsonBody(req, config.maxBodyBytes);
      return ok(res, service.closeCase(quote(closeMatch[1]), validateClose(body)));
    }

    const exportJsonMatch = pathname.match(/^\/api\/cases\/([^/]+)\/export\.json$/);
    if (exportJsonMatch && method === 'GET') {
      const bundle = service.getBundle(quote(exportJsonMatch[1]));
      return sendJson(res, 200, { ok: true, data: bundle }, {
        'Content-Disposition': `attachment; filename="${slug(bundle.case.ref)}.json"`,
        'Cache-Control': 'no-store',
      });
    }

    const exportCsvMatch = pathname.match(/^\/api\/cases\/([^/]+)\/export\.csv$/);
    if (exportCsvMatch && method === 'GET') {
      const bundle = service.getBundle(quote(exportCsvMatch[1]));
      const csv = caseExportCsv(bundle);
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${slug(bundle.case.ref)}-shortlist.csv"`,
        'Cache-Control': 'no-store',
      });
      res.end(csv);
      return;
    }

    if (pathname === '/api/inventory' && method === 'GET') {
      return ok(res, service.listInventory());
    }

    if (pathname === '/api/inventory' && method === 'POST') {
      writeLimit(req);
      const body = await readJsonBody(req, config.maxBodyBytes);
      return ok(res, service.addInventory(validateInventory(body)), 201);
    }

    const inventoryPatchMatch = pathname.match(/^\/api\/inventory\/([^/]+)$/);
    if (inventoryPatchMatch && method === 'PATCH') {
      writeLimit(req);
      const body = await readJsonBody(req, config.maxBodyBytes);
      const patch = {};
      if (body.status !== undefined) {
        patch.status = asEnum(body.status, 'Status', ['available', 'reserved', 'let']);
      }
      if (body.rent !== undefined) {
        patch.rent = asNumber(body.rent, 'Rent', { min: 0, max: 50_000 });
      }
      if (body.availableFrom !== undefined) {
        patch.available_from = asString(body.availableFrom, 'Available from', { max: 30 });
      }
      if (body.description !== undefined) {
        patch.description = asString(body.description, 'Description', { max: 1200 });
      }
      if (!Object.keys(patch).length) throw badRequest('No supported fields to update.');
      return ok(res, service.updateInventory(quote(inventoryPatchMatch[1]), patch));
    }

    if (pathname === '/api/sources' && method === 'GET') {
      return ok(res, service.listSources());
    }

    if (pathname === '/api/sources' && method === 'POST') {
      writeLimit(req);
      const body = await readJsonBody(req, config.maxBodyBytes);
      return ok(res, service.addSource(validateSource(body)), 201);
    }

    if (pathname === '/api/sources/import' && method === 'POST') {
      writeLimit(req);
      const body = await readJsonBody(req, config.maxBodyBytes);
      const csv = asString(body.csv, 'CSV', { max: config.maxCsvBytes, required: true });
      return ok(res, service.importSources(csv));
    }

    if (pathname === '/api/sources/export.csv' && method === 'GET') {
      const sources = store.listSources();
      const csv = toCsv(sources, [
        { label: 'name', value: (row) => row.name },
        { label: 'domain', value: (row) => row.domain },
        { label: 'kind', value: (row) => row.kind },
        { label: 'coverage', value: (row) => row.coverage },
        { label: 'reliability', value: (row) => row.reliability },
        { label: 'enabled', value: (row) => (row.enabled ? 'true' : 'false') },
        { label: 'discovered_by', value: (row) => row.discovered_by },
        { label: 'notes', value: (row) => row.notes ?? '' },
      ]);
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="farol-source-catalogue.csv"',
        'Cache-Control': 'no-store',
      });
      res.end(csv);
      return;
    }

    const sourcePatchMatch = pathname.match(/^\/api\/sources\/([^/]+)$/);
    if (sourcePatchMatch && method === 'PATCH') {
      writeLimit(req);
      const body = await readJsonBody(req, config.maxBodyBytes);
      return ok(res, service.updateSource(quote(sourcePatchMatch[1]), validateSourcePatch(body)));
    }

    if (pathname === '/api/portfolio' && method === 'GET') {
      return ok(res, service.getPortfolio());
    }

    if (pathname === '/api/outputs' && method === 'GET') {
      return ok(res, service.getOutputs());
    }

    if (pathname === '/api/systems' && method === 'GET') {
      return ok(res, service.getSystems());
    }

    const portalMatch = pathname.match(/^\/api\/portal\/([^/]+)$/);
    if (portalMatch && method === 'GET') {
      return ok(res, service.getPortal(quote(portalMatch[1])));
    }

    const portalFeedbackMatch = pathname.match(/^\/api\/portal\/([^/]+)\/feedback$/);
    if (portalFeedbackMatch && method === 'POST') {
      writeLimit(req);
      const body = await readJsonBody(req, config.maxBodyBytes);
      return ok(res, service.submitFeedback(quote(portalFeedbackMatch[1]), validateFeedback(body)));
    }

    if (pathname === '/api/demo/reset' && method === 'POST') {
      if (config.mode !== 'demo') throw conflict('Demo reset is only available in demo mode.');
      if (store.countRunningRuns() > 0 || store.countRunningComparisons() > 0) {
        throw conflict('Wait for the running analyses to finish before resetting the demo.');
      }
      store.resetDemo();
      return ok(res, { reset: true, cases: store.listCases({ limit: 10 }).length });
    }

    throw notFound('API route not found.');
  }

  async function handler(req, res) {
    setSecurityHeaders(res);
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const requestId = randomUUID().slice(0, 8);
    try {
      if (url.pathname.startsWith('/api/')) {
        if (
          config.accessPassword &&
          !url.pathname.startsWith('/api/portal/') &&
          !hasValidBasicAuth(req, config)
        ) {
          res.setHeader('WWW-Authenticate', 'Basic realm="Farol"');
          throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
        }
        await handleApi(req, res, url);
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
      }
      await serveStatic(req, res, url.pathname);
    } catch (error) {
      if (res.headersSent) {
        try {
          res.end();
        } catch {
          /* already closed */
        }
        return;
      }
      if (error instanceof HttpError) {
        fail(res, error.status, error.code, error.message, error.details, requestId);
        return;
      }
      logger.error('request failed', {
        requestId,
        method: req.method,
        path: url.pathname,
        error: error.message,
        stack: error.stack,
      });
      fail(res, 500, 'INTERNAL', 'Something went wrong on our side.', null, requestId);
    }
  }

  const server = http.createServer((req, res) => {
    handler(req, res).catch((error) => {
      logger.error('unhandled request error', { error: error.message });
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: { code: 'INTERNAL', message: 'Unexpected error.' } }));
      }
    });
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 35_000;

  return {
    store,
    server,
    listen() {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(config.port, config.host, () => {
          server.off('error', reject);
          resolve(server.address());
        });
      });
    },
    async close() {
      await new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections?.();
      });
      store.close();
    },
  };
}
