import { DatabaseSync } from 'node:sqlite';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { newId } from './lib/util.js';
import { SEED_PROPERTIES, SEED_SOURCES } from './seed/data.js';

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function nowIso() {
  return new Date().toISOString();
}

const SCHEMA = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS properties (
    id TEXT PRIMARY KEY,
    ref TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    "transaction" TEXT NOT NULL CHECK ("transaction" IN ('rent','sale')),
    type TEXT NOT NULL,
    city TEXT NOT NULL,
    neighborhood TEXT,
    region TEXT NOT NULL,
    country TEXT NOT NULL,
    lat REAL,
    lng REAL,
    bedrooms INTEGER NOT NULL,
    bathrooms INTEGER NOT NULL,
    area_m2 INTEGER NOT NULL,
    price REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'EUR',
    period TEXT NOT NULL CHECK (period IN ('month','total')),
    features TEXT NOT NULL DEFAULT '[]',
    blurb TEXT,
    url TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    domain TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL,
    region TEXT,
    country TEXT,
    url TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    discovered_by TEXT NOT NULL DEFAULT 'seed',
    reliability REAL NOT NULL DEFAULT 0.7,
    notes TEXT,
    times_used INTEGER NOT NULL DEFAULT 0,
    last_used_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    iteration INTEGER NOT NULL DEFAULT 1,
    brief TEXT NOT NULL,
    filters TEXT NOT NULL,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    phase TEXT,
    progress INTEGER NOT NULL DEFAULT 0,
    stats TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT,
    duration_ms INTEGER
  );

  CREATE TABLE IF NOT EXISTS run_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    phase TEXT NOT NULL,
    level TEXT NOT NULL DEFAULT 'info',
    message TEXT NOT NULL,
    detail TEXT,
    ts TEXT NOT NULL,
    elapsed_ms INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS offers (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    source_id TEXT NOT NULL,
    external_id TEXT,
    title TEXT NOT NULL,
    url TEXT,
    "transaction" TEXT NOT NULL,
    type TEXT NOT NULL,
    city TEXT NOT NULL,
    neighborhood TEXT,
    region TEXT,
    country TEXT,
    lat REAL,
    lng REAL,
    bedrooms INTEGER,
    bathrooms INTEGER,
    area_m2 INTEGER,
    price REAL NOT NULL,
    currency TEXT NOT NULL,
    price_eur REAL NOT NULL,
    period TEXT NOT NULL,
    features TEXT NOT NULL DEFAULT '[]',
    seller TEXT,
    snippet TEXT,
    confidence REAL NOT NULL DEFAULT 0.8,
    fingerprint TEXT,
    duplicate_group TEXT,
    canonical INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    offer_id TEXT NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
    property_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('same_listing','comparable')),
    score REAL NOT NULL,
    delta_abs REAL,
    delta_pct REAL,
    reasons TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_steps_run ON run_steps(run_id, seq);
  CREATE INDEX IF NOT EXISTS idx_offers_run ON offers(run_id);
  CREATE INDEX IF NOT EXISTS idx_matches_run ON matches(run_id);
  CREATE INDEX IF NOT EXISTS idx_runs_thread ON runs(thread_id, iteration);
  CREATE INDEX IF NOT EXISTS idx_runs_created ON runs(created_at DESC);
`;

function mapProperty(row) {
  return {
    ...row,
    features: parseJson(row.features, []),
    lat: row.lat ?? null,
    lng: row.lng ?? null,
  };
}

function mapSource(row) {
  return {
    ...row,
    enabled: Boolean(row.enabled),
    reliability: Number(row.reliability),
    times_used: Number(row.times_used || 0),
  };
}

function mapRun(row) {
  return {
    ...row,
    iteration: Number(row.iteration || 1),
    progress: Number(row.progress || 0),
    filters: parseJson(row.filters, null),
    stats: parseJson(row.stats, null),
    duration_ms: row.duration_ms === null ? null : Number(row.duration_ms),
  };
}

function mapOffer(row) {
  return {
    ...row,
    features: parseJson(row.features, []),
    canonical: Boolean(row.canonical),
    price: Number(row.price),
    price_eur: Number(row.price_eur),
    confidence: Number(row.confidence),
  };
}

function mapMatch(row) {
  return {
    ...row,
    score: Number(row.score),
    reasons: parseJson(row.reasons, []),
  };
}

function mapStep(row) {
  return {
    ...row,
    seq: Number(row.seq),
    elapsed_ms: Number(row.elapsed_ms || 0),
  };
}

export class Store {
  constructor(path) {
    if (path !== ':memory:') {
      mkdirSync(dirname(path), { recursive: true });
    }
    this.db = new DatabaseSync(path);
    this.db.exec(SCHEMA);
    this.seedIfEmpty();
  }

  close() {
    try {
      this.db.close();
    } catch {
      /* already closed */
    }
  }

  seedIfEmpty() {
    const propertyCount = this.db.prepare('SELECT COUNT(*) AS c FROM properties').get().c;
    if (!propertyCount) {
      const insert = this.db.prepare(`
        INSERT INTO properties (
          id, ref, title, "transaction", type, city, neighborhood, region, country,
          lat, lng, bedrooms, bathrooms, area_m2, price, currency, period,
          features, blurb, url, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
      `);
      this.db.exec('BEGIN');
      try {
        const ts = nowIso();
        for (const p of SEED_PROPERTIES) {
          insert.run(
            p.id,
            p.ref,
            p.title,
            p.transaction,
            p.type,
            p.city,
            p.neighborhood,
            p.region,
            p.country,
            p.lat,
            p.lng,
            p.bedrooms,
            p.bathrooms,
            p.area_m2,
            p.price,
            p.currency,
            p.period,
            JSON.stringify(p.features),
            p.blurb,
            p.url,
            ts
          );
        }
        this.db.exec('COMMIT');
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
    }

    const sourceCount = this.db.prepare('SELECT COUNT(*) AS c FROM sources').get().c;
    if (!sourceCount) {
      const insert = this.db.prepare(`
        INSERT INTO sources (
          id, name, domain, kind, region, country, url, enabled, discovered_by,
          reliability, notes, times_used, last_used_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)
      `);
      this.db.exec('BEGIN');
      try {
        const ts = nowIso();
        for (const s of SEED_SOURCES) {
          insert.run(
            s.id,
            s.name,
            s.domain,
            s.kind,
            s.region,
            s.country,
            s.url,
            s.enabled ?? 1,
            s.discovered_by ?? 'seed',
            s.reliability ?? 0.7,
            s.notes ?? null,
            ts
          );
        }
        this.db.exec('COMMIT');
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
    }
  }

  listProperties() {
    return this.db
      .prepare("SELECT * FROM properties WHERE status = 'active' ORDER BY ref")
      .all()
      .map(mapProperty);
  }

  getProperty(idOrRef) {
    const row = this.db
      .prepare('SELECT * FROM properties WHERE id = ? OR ref = ?')
      .get(idOrRef, idOrRef);
    return row ? mapProperty(row) : null;
  }

  listSources({ enabledOnly = false } = {}) {
    const sql = enabledOnly
      ? 'SELECT * FROM sources WHERE enabled = 1 ORDER BY reliability DESC, name'
      : 'SELECT * FROM sources ORDER BY discovered_by = \'agent\' DESC, reliability DESC, name';
    return this.db.prepare(sql).all().map(mapSource);
  }

  getSource(id) {
    const row = this.db.prepare('SELECT * FROM sources WHERE id = ?').get(id);
    return row ? mapSource(row) : null;
  }

  findSourceByDomain(domain) {
    const row = this.db.prepare('SELECT * FROM sources WHERE domain = ?').get(domain);
    return row ? mapSource(row) : null;
  }

  insertSource(source) {
    const existing = this.findSourceByDomain(source.domain);
    if (existing) return { created: false, source: existing };
    const id = source.id || newId('src');
    this.db
      .prepare(
        `INSERT INTO sources (
          id, name, domain, kind, region, country, url, enabled, discovered_by,
          reliability, notes, times_used, last_used_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)`
      )
      .run(
        id,
        source.name,
        source.domain,
        source.kind,
        source.region ?? null,
        source.country ?? null,
        source.url ?? `https://${source.domain}`,
        source.enabled === false ? 0 : 1,
        source.discovered_by ?? 'seed',
        Number(source.reliability ?? 0.7),
        source.notes ?? null,
        nowIso()
      );
    return { created: true, source: this.getSource(id) };
  }

  updateSource(id, patch) {
    const allowed = ['name', 'kind', 'region', 'country', 'notes', 'enabled', 'reliability', 'url'];
    const sets = [];
    const values = [];
    for (const [key, value] of Object.entries(patch)) {
      if (!allowed.includes(key)) continue;
      sets.push(`${key} = ?`);
      values.push(key === 'enabled' ? (value ? 1 : 0) : value);
    }
    if (!sets.length) return this.getSource(id);
    values.push(id);
    this.db.prepare(`UPDATE sources SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return this.getSource(id);
  }

  touchSources(ids) {
    if (!ids.length) return;
    const stmt = this.db.prepare(
      'UPDATE sources SET last_used_at = ?, times_used = times_used + 1 WHERE id = ?'
    );
    const ts = nowIso();
    for (const id of ids) stmt.run(ts, id);
  }

  createRun({ brief, filters, mode, threadId = null }) {
    const id = newId('run');
    let thread = threadId;
    let iteration = 1;
    if (thread) {
      const row = this.db
        .prepare('SELECT COALESCE(MAX(iteration), 0) AS maxIteration FROM runs WHERE thread_id = ?')
        .get(thread);
      iteration = Number(row.maxIteration || 0) + 1;
    } else {
      thread = newId('thr');
    }
    this.db
      .prepare(
        `INSERT INTO runs (
          id, thread_id, iteration, brief, filters, mode, status, phase, progress,
          stats, error, created_at, started_at, finished_at, duration_ms
        ) VALUES (?, ?, ?, ?, ?, ?, 'queued', 'queued', 0, NULL, NULL, ?, NULL, NULL, NULL)`
      )
      .run(id, thread, iteration, brief, JSON.stringify(filters), mode, nowIso());
    return this.getRun(id);
  }

  getRun(id) {
    const row = this.db.prepare('SELECT * FROM runs WHERE id = ?').get(id);
    return row ? mapRun(row) : null;
  }

  listRuns(limit = 50) {
    const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
    return this.db
      .prepare('SELECT * FROM runs ORDER BY created_at DESC LIMIT ?')
      .all(safeLimit)
      .map(mapRun);
  }

  updateRun(id, patch) {
    const allowed = [
      'status',
      'phase',
      'progress',
      'stats',
      'error',
      'started_at',
      'finished_at',
      'duration_ms',
    ];
    const sets = [];
    const values = [];
    for (const [key, value] of Object.entries(patch)) {
      if (!allowed.includes(key)) continue;
      sets.push(`${key} = ?`);
      values.push(key === 'stats' && value !== null ? JSON.stringify(value) : value);
    }
    if (!sets.length) return this.getRun(id);
    values.push(id);
    this.db.prepare(`UPDATE runs SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return this.getRun(id);
  }

  markInterruptedRuns() {
    this.db
      .prepare(
        `UPDATE runs SET status = 'failed', phase = 'failed',
          error = 'Run interrupted by a server restart. Please launch a new scout.',
          finished_at = ?
        WHERE status IN ('queued','running')`
      )
      .run(nowIso());
  }

  appendStep(runId, { phase, level = 'info', message, detail = null, elapsedMs = 0 }) {
    const next = this.db
      .prepare('SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM run_steps WHERE run_id = ?')
      .get(runId).seq;
    const ts = nowIso();
    this.db
      .prepare(
        `INSERT INTO run_steps (run_id, seq, phase, level, message, detail, ts, elapsed_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(runId, next, phase, level, message, detail, ts, Math.round(elapsedMs));
    return {
      run_id: runId,
      seq: Number(next),
      phase,
      level,
      message,
      detail,
      ts,
      elapsed_ms: Math.round(elapsedMs),
    };
  }

  listSteps(runId, afterSeq = 0) {
    return this.db
      .prepare('SELECT * FROM run_steps WHERE run_id = ? AND seq > ? ORDER BY seq')
      .all(runId, Number(afterSeq) || 0)
      .map(mapStep);
  }

  insertOffers(runId, offers) {
    if (!offers.length) return;
    const stmt = this.db.prepare(
      `INSERT INTO offers (
        id, run_id, source_id, external_id, title, url, "transaction", type, city,
        neighborhood, region, country, lat, lng, bedrooms, bathrooms, area_m2,
        price, currency, price_eur, period, features, seller, snippet, confidence,
        fingerprint, duplicate_group, canonical, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const ts = nowIso();
    this.db.exec('BEGIN');
    try {
      for (const offer of offers) {
        stmt.run(
          offer.id,
          runId,
          offer.source_id,
          offer.external_id ?? null,
          offer.title,
          offer.url ?? null,
          offer.transaction,
          offer.type,
          offer.city,
          offer.neighborhood ?? null,
          offer.region ?? null,
          offer.country ?? null,
          offer.lat ?? null,
          offer.lng ?? null,
          offer.bedrooms ?? null,
          offer.bathrooms ?? null,
          offer.area_m2 ?? null,
          offer.price,
          offer.currency,
          offer.price_eur,
          offer.period,
          JSON.stringify(offer.features || []),
          offer.seller ?? null,
          offer.snippet ?? null,
          offer.confidence,
          offer.fingerprint ?? null,
          offer.duplicate_group ?? null,
          offer.canonical ? 1 : 0,
          ts
        );
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  insertMatches(runId, matches) {
    if (!matches.length) return;
    const stmt = this.db.prepare(
      `INSERT INTO matches (
        id, run_id, offer_id, property_id, kind, score, delta_abs, delta_pct,
        reasons, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const ts = nowIso();
    this.db.exec('BEGIN');
    try {
      for (const match of matches) {
        stmt.run(
          match.id,
          runId,
          match.offer_id,
          match.property_id,
          match.kind,
          match.score,
          match.delta_abs ?? null,
          match.delta_pct ?? null,
          JSON.stringify(match.reasons || []),
          ts
        );
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  listOffers(runId) {
    return this.db
      .prepare('SELECT * FROM offers WHERE run_id = ? ORDER BY price_eur ASC')
      .all(runId)
      .map(mapOffer);
  }

  listMatches(runId) {
    return this.db.prepare('SELECT * FROM matches WHERE run_id = ?').all(runId).map(mapMatch);
  }

  getRunBundle(runId) {
    const run = this.getRun(runId);
    if (!run) return null;
    return {
      run,
      steps: this.listSteps(runId),
      offers: this.listOffers(runId),
      matches: this.listMatches(runId),
      properties: this.listProperties(),
      sources: this.listSources(),
    };
  }

  countRunningRuns() {
    return Number(
      this.db.prepare("SELECT COUNT(*) AS c FROM runs WHERE status IN ('queued','running')").get().c
    );
  }

  overview() {
    const properties = this.db
      .prepare(`SELECT COUNT(*) AS total,
        SUM("transaction" = 'rent') AS rentals,
        SUM("transaction" = 'sale') AS sales
        FROM properties WHERE status = 'active'`)
      .get();
    const sources = this.db
      .prepare('SELECT COUNT(*) AS total, SUM(enabled = 1) AS enabled, SUM(discovered_by = \'agent\') AS discovered FROM sources')
      .get();
    const runs = this.db
      .prepare("SELECT COUNT(*) AS total FROM runs WHERE status = 'completed'")
      .get();
    const lastRun = this.db
      .prepare("SELECT * FROM runs WHERE status = 'completed' ORDER BY finished_at DESC LIMIT 1")
      .get();
    return {
      properties: Number(properties.total || 0),
      rentals: Number(properties.rentals || 0),
      sales: Number(properties.sales || 0),
      sources: Number(sources.total || 0),
      enabledSources: Number(sources.enabled || 0),
      discoveredSources: Number(sources.discovered || 0),
      completedRuns: Number(runs.total || 0),
      lastRun: lastRun ? mapRun(lastRun) : null,
    };
  }

  resetDemo() {
    this.db.exec('BEGIN');
    try {
      this.db.exec('DELETE FROM matches');
      this.db.exec('DELETE FROM offers');
      this.db.exec('DELETE FROM run_steps');
      this.db.exec('DELETE FROM runs');
      this.db.exec("DELETE FROM sources WHERE discovered_by != 'seed'");
      this.db.exec('UPDATE sources SET times_used = 0, last_used_at = NULL');
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}

export function openStore(path) {
  return new Store(path);
}
