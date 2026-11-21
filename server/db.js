import { DatabaseSync } from 'node:sqlite';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { newId, newToken, nowIso, parseJson } from './lib/util.js';
import { SOURCES, INVENTORY, imageFor } from './seed/market.js';
import { PORTFOLIO } from './seed/portfolio.js';
import { seedDemo } from './seed/demo.js';
import { seedComparisons } from './seed/comparisons.js';
import { cityKey } from './domain/pricing.js';

const SCHEMA = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    source TEXT,
    notes TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cases (
    id TEXT PRIMARY KEY,
    ref TEXT NOT NULL UNIQUE,
    client_id TEXT NOT NULL REFERENCES clients(id),
    "transaction" TEXT NOT NULL CHECK ("transaction" IN ('rent','sale')),
    stage TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    iteration INTEGER NOT NULL DEFAULT 1,
    owner TEXT NOT NULL DEFAULT 'Unassigned',
    priority TEXT NOT NULL DEFAULT 'normal',
    current_requirements_id TEXT,
    summary TEXT,
    next_action TEXT,
    source TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    stage_changed_at TEXT NOT NULL,
    shared_at TEXT,
    closed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS requirements (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    brief TEXT NOT NULL,
    "transaction" TEXT NOT NULL,
    property_types TEXT NOT NULL DEFAULT '[]',
    locations TEXT NOT NULL DEFAULT '[]',
    regions TEXT NOT NULL DEFAULT '[]',
    budget_min REAL,
    budget_max REAL,
    currency TEXT NOT NULL DEFAULT 'EUR',
    bedrooms_min INTEGER,
    bedrooms_max INTEGER,
    bathrooms_min INTEGER,
    tenure TEXT,
    move_in TEXT,
    must_haves TEXT NOT NULL DEFAULT '[]',
    nice_to_haves TEXT NOT NULL DEFAULT '[]',
    notes TEXT,
    confidence REAL NOT NULL DEFAULT 0.7,
    assumptions TEXT NOT NULL DEFAULT '[]',
    confirmed_by TEXT,
    confirmed_at TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (case_id, version)
  );

  CREATE TABLE IF NOT EXISTS inventory (
    id TEXT PRIMARY KEY,
    system TEXT NOT NULL,
    ref TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    city TEXT NOT NULL,
    city_key TEXT NOT NULL,
    area TEXT,
    bedrooms INTEGER NOT NULL,
    bathrooms INTEGER NOT NULL,
    area_m2 INTEGER NOT NULL,
    rent REAL NOT NULL,
    available_from TEXT,
    status TEXT NOT NULL DEFAULT 'available',
    senior_friendly INTEGER NOT NULL DEFAULT 0,
    features TEXT NOT NULL DEFAULT '[]',
    description TEXT,
    image TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS inventory_checks (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    requirements_id TEXT NOT NULL,
    outcome TEXT NOT NULL,
    score REAL,
    reasons TEXT NOT NULL DEFAULT '[]',
    matches TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS portfolio (
    id TEXT PRIMARY KEY,
    ref TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    "transaction" TEXT NOT NULL,
    type TEXT NOT NULL,
    city TEXT NOT NULL,
    neighborhood TEXT,
    region TEXT,
    country TEXT,
    lat REAL,
    lng REAL,
    bedrooms INTEGER NOT NULL,
    bathrooms INTEGER NOT NULL,
    area_m2 INTEGER NOT NULL,
    price REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'EUR',
    period TEXT NOT NULL,
    features TEXT NOT NULL DEFAULT '[]',
    blurb TEXT,
    image TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    domain TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL,
    coverage TEXT NOT NULL DEFAULT 'Portugal',
    country TEXT NOT NULL DEFAULT 'Portugal',
    enabled INTEGER NOT NULL DEFAULT 1,
    discovered_by TEXT NOT NULL DEFAULT 'seed',
    reliability REAL NOT NULL DEFAULT 0.7,
    notes TEXT,
    times_used INTEGER NOT NULL DEFAULT 0,
    last_used_at TEXT,
    discovered_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    requirements_id TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'search',
    iteration INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'queued',
    phase TEXT NOT NULL DEFAULT 'queued',
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

  CREATE TABLE IF NOT EXISTS listings (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    source_id TEXT REFERENCES sources(id),
    origin TEXT NOT NULL DEFAULT 'search',
    external_ref TEXT,
    title TEXT NOT NULL,
    url TEXT,
    "transaction" TEXT NOT NULL,
    type TEXT NOT NULL,
    city TEXT NOT NULL,
    city_key TEXT NOT NULL,
    area TEXT,
    bedrooms INTEGER,
    bathrooms INTEGER,
    area_m2 INTEGER,
    price REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'EUR',
    period TEXT NOT NULL,
    features TEXT NOT NULL DEFAULT '[]',
    description TEXT,
    agent TEXT,
    available TEXT,
    image TEXT,
    confidence REAL NOT NULL DEFAULT 0.8,
    fingerprint TEXT,
    duplicate_group TEXT,
    canonical INTEGER NOT NULL DEFAULT 1,
    mirror_count INTEGER NOT NULL DEFAULT 0,
    mirror_note TEXT,
    match_score REAL,
    match_reasons TEXT NOT NULL DEFAULT '[]',
    reject_reason TEXT,
    included INTEGER NOT NULL DEFAULT 0,
    rank INTEGER,
    price_check TEXT,
    decision TEXT NOT NULL DEFAULT 'new',
    decision_note TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS shortlists (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    run_id TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    token TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'draft',
    summary TEXT,
    created_by TEXT,
    shared_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS shortlist_items (
    id TEXT PRIMARY KEY,
    shortlist_id TEXT NOT NULL REFERENCES shortlists(id) ON DELETE CASCADE,
    listing_id TEXT NOT NULL REFERENCES listings(id),
    position INTEGER NOT NULL,
    rationale TEXT,
    client_decision TEXT NOT NULL DEFAULT 'pending',
    client_comment TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    shortlist_id TEXT NOT NULL REFERENCES shortlists(id) ON DELETE CASCADE,
    overall TEXT NOT NULL,
    comment TEXT,
    submitted_by TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    actor TEXT NOT NULL DEFAULT 'Team',
    message TEXT NOT NULL,
    detail TEXT,
    ts TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS comparisons (
    id TEXT PRIMARY KEY,
    ref TEXT NOT NULL UNIQUE,
    mode TEXT NOT NULL DEFAULT 'demo',
    subject_source TEXT NOT NULL DEFAULT 'portfolio',
    portfolio_id TEXT,
    subject_ref TEXT,
    title TEXT NOT NULL,
    "transaction" TEXT NOT NULL,
    type TEXT NOT NULL,
    city TEXT NOT NULL,
    area TEXT,
    bedrooms INTEGER,
    bathrooms INTEGER,
    area_m2 INTEGER,
    price REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'EUR',
    period TEXT NOT NULL DEFAULT 'month',
    features TEXT NOT NULL DEFAULT '[]',
    image TEXT,
    description TEXT,
    url TEXT,
    status TEXT NOT NULL DEFAULT 'queued',
    stats TEXT,
    report TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT,
    duration_ms INTEGER
  );

  CREATE TABLE IF NOT EXISTS comparison_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    comparison_id TEXT NOT NULL REFERENCES comparisons(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    phase TEXT NOT NULL,
    level TEXT NOT NULL DEFAULT 'info',
    message TEXT NOT NULL,
    detail TEXT,
    ts TEXT NOT NULL,
    elapsed_ms INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_cases_stage ON cases(stage, status);
  CREATE INDEX IF NOT EXISTS idx_cases_updated ON cases(updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_requirements_case ON requirements(case_id, version DESC);
  CREATE INDEX IF NOT EXISTS idx_checks_case ON inventory_checks(case_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_runs_case ON runs(case_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_steps_run ON run_steps(run_id, seq);
  CREATE INDEX IF NOT EXISTS idx_listings_run ON listings(run_id, canonical, included);
  CREATE INDEX IF NOT EXISTS idx_shortlists_case ON shortlists(case_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_shortlist_items ON shortlist_items(shortlist_id, position);
  CREATE INDEX IF NOT EXISTS idx_feedback_case ON feedback(case_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_events_case ON events(case_id, ts DESC);
  CREATE INDEX IF NOT EXISTS idx_comparisons_created ON comparisons(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_comparison_steps ON comparison_steps(comparison_id, seq);
`;

const CASE_STAGES = ['enquiry', 'requirements', 'inventory', 'ai_search', 'review', 'client', 'closed'];
const CASE_STATUSES = ['active', 'won', 'lost', 'on_hold'];

function bool(value) {
  return Boolean(value);
}

function mapCase(row) {
  if (!row) return null;
  return {
    ...row,
    iteration: Number(row.iteration || 1),
    priority: row.priority || 'normal',
  };
}

function mapRequirement(row) {
  if (!row) return null;
  const propertyTypes = parseJson(row.property_types, []);
  const locations = parseJson(row.locations, []);
  const regions = parseJson(row.regions, []);
  const mustHaves = parseJson(row.must_haves, []);
  const niceToHaves = parseJson(row.nice_to_haves, []);
  const assumptions = parseJson(row.assumptions, []);
  const budgetMin = row.budget_min === null ? null : Number(row.budget_min);
  const budgetMax = row.budget_max === null ? null : Number(row.budget_max);
  const bedroomsMin = row.bedrooms_min === null ? null : Number(row.bedrooms_min);
  const bedroomsMax = row.bedrooms_max === null ? null : Number(row.bedrooms_max);
  const bathroomsMin = row.bathrooms_min === null ? null : Number(row.bathrooms_min);
  return {
    ...row,
    version: Number(row.version || 1),
    property_types: propertyTypes,
    locations,
    regions,
    must_haves: mustHaves,
    nice_to_haves: niceToHaves,
    assumptions,
    confidence: Number(row.confidence || 0),
    bedrooms_min: bedroomsMin,
    bedrooms_max: bedroomsMax,
    bathrooms_min: bathroomsMin,
    budget_min: budgetMin,
    budget_max: budgetMax,
    // Camel-case aliases used by the search and pricing engines.
    propertyTypes,
    mustHaves,
    niceToHaves,
    budgetMin,
    budgetMax,
    bedroomsMin,
    bedroomsMax,
    bathroomsMin,
    moveIn: row.move_in,
    tenure: row.tenure,
    currency: row.currency,
  };
}

function mapSource(row) {
  if (!row) return null;
  return {
    ...row,
    enabled: Boolean(row.enabled),
    reliability: Number(row.reliability || 0),
    times_used: Number(row.times_used || 0),
  };
}

function mapInventory(row) {
  if (!row) return null;
  return {
    ...row,
    features: parseJson(row.features, []),
    senior_friendly: Boolean(row.senior_friendly),
    seniorFriendly: Boolean(row.senior_friendly),
    bedrooms: Number(row.bedrooms),
    bathrooms: Number(row.bathrooms),
    area_m2: Number(row.area_m2),
    areaM2: Number(row.area_m2),
    rent: Number(row.rent),
    availableFrom: row.available_from,
    cityKey: row.city_key,
  };
}

function mapPortfolio(row) {
  if (!row) return null;
  return {
    ...row,
    features: parseJson(row.features, []),
    bedrooms: Number(row.bedrooms),
    bathrooms: Number(row.bathrooms),
    area_m2: Number(row.area_m2),
    price: Number(row.price),
  };
}

function mapRun(row) {
  if (!row) return null;
  return {
    ...row,
    iteration: Number(row.iteration || 1),
    progress: Number(row.progress || 0),
    stats: parseJson(row.stats, null),
    duration_ms: row.duration_ms === null ? null : Number(row.duration_ms),
  };
}

function mapStep(row) {
  return { ...row, seq: Number(row.seq), elapsed_ms: Number(row.elapsed_ms || 0) };
}

function mapListing(row) {
  if (!row) return null;
  return {
    ...row,
    features: parseJson(row.features, []),
    match_reasons: parseJson(row.match_reasons, []),
    price_check: parseJson(row.price_check, null),
    canonical: Boolean(row.canonical),
    included: Boolean(row.included),
    confidence: Number(row.confidence || 0),
    match_score: row.match_score === null ? null : Number(row.match_score),
    mirror_count: Number(row.mirror_count || 0),
    price: Number(row.price),
    bedrooms: row.bedrooms === null ? null : Number(row.bedrooms),
    bathrooms: row.bathrooms === null ? null : Number(row.bathrooms),
    area_m2: row.area_m2 === null ? null : Number(row.area_m2),
  };
}

function mapShortlist(row) {
  if (!row) return null;
  return { ...row, version: Number(row.version || 1) };
}

function mapShortlistItem(row) {
  if (!row) return null;
  return { ...row, position: Number(row.position || 0) };
}

function mapEvent(row) {
  if (!row) return null;
  return { ...row, detail: parseJson(row.detail, null) };
}

function mapComparison(row) {
  if (!row) return null;
  return {
    ...row,
    bedrooms: row.bedrooms === null ? null : Number(row.bedrooms),
    bathrooms: row.bathrooms === null ? null : Number(row.bathrooms),
    area_m2: row.area_m2 === null ? null : Number(row.area_m2),
    price: Number(row.price),
    duration_ms: row.duration_ms === null ? null : Number(row.duration_ms),
    features: parseJson(row.features, []),
    stats: parseJson(row.stats, null),
    report: parseJson(row.report, null),
  };
}

function mapComparisonStep(row) {
  return row ? { ...row, seq: Number(row.seq), elapsed_ms: Number(row.elapsed_ms || 0) } : null;
}

function mapInventoryCheck(row) {
  if (!row) return null;
  return {
    ...row,
    score: row.score === null ? null : Number(row.score),
    reasons: parseJson(row.reasons, []),
    matches: parseJson(row.matches, []),
  };
}

export class Store {
  constructor(path) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(SCHEMA);
    try {
      this.db.exec('ALTER TABLE comparisons ADD COLUMN subject_ref TEXT');
    } catch {
      /* column already exists */
    }
    this.seedIfEmpty();
  }

  close() {
    try {
      this.db.close();
    } catch {
      /* already closed */
    }
  }

  // -------------------------------------------------------------------------
  // Seeding

  seedIfEmpty() {
    const sourceCount = this.db.prepare('SELECT COUNT(*) AS c FROM sources').get().c;
    if (!sourceCount) this.seedSources();
    const portfolioCount = this.db.prepare('SELECT COUNT(*) AS c FROM portfolio').get().c;
    if (!portfolioCount) this.seedPortfolio();
    const inventoryCount = this.db.prepare('SELECT COUNT(*) AS c FROM inventory').get().c;
    if (!inventoryCount) this.seedInventory();
    const caseCount = this.db.prepare('SELECT COUNT(*) AS c FROM cases').get().c;
    if (!caseCount) seedDemo(this);
    const comparisonCount = this.db.prepare('SELECT COUNT(*) AS c FROM comparisons').get().c;
    if (!comparisonCount) seedComparisons(this);
  }

  seedSources() {
    const insert = this.db.prepare(`
      INSERT INTO sources (
        id, name, domain, kind, coverage, country, enabled, discovered_by,
        reliability, notes, times_used, last_used_at, discovered_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'seed', ?, ?, 0, NULL, NULL, ?)
    `);
    this.db.exec('BEGIN');
    try {
      for (const source of SOURCES) {
        if (source.discovery) continue;
        const createdAt = new Date(Date.now() - (source.weeksAgo || 4) * 7 * 86400000).toISOString();
        insert.run(
          source.id,
          source.name,
          source.domain,
          source.kind,
          source.coverage,
          source.coverage === 'Other' ? 'Spain' : 'Portugal',
          source.enabled === false ? 0 : 1,
          source.reliability,
          source.notes ?? null,
          createdAt
        );
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  seedPortfolio() {
    const insert = this.db.prepare(`
      INSERT INTO portfolio (
        id, ref, title, "transaction", type, city, neighborhood, region, country,
        lat, lng, bedrooms, bathrooms, area_m2, price, currency, period, features,
        blurb, image, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `);
    this.db.exec('BEGIN');
    try {
      const createdAt = nowIso();
      for (const property of PORTFOLIO) {
        insert.run(
          property.id,
          property.ref,
          property.title,
          property.transaction,
          property.type,
          property.city,
          property.neighborhood ?? null,
          property.region ?? null,
          property.country ?? 'Portugal',
          property.lat ?? null,
          property.lng ?? null,
          property.bedrooms,
          property.bathrooms,
          property.area_m2,
          property.price,
          property.currency ?? 'EUR',
          property.period,
          JSON.stringify(property.features ?? []),
          property.blurb ?? null,
          property.image ?? imageFor(property),
          createdAt
        );
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  seedInventory() {
    const insert = this.db.prepare(`
      INSERT INTO inventory (
        id, system, ref, title, type, city, city_key, area, bedrooms, bathrooms,
        area_m2, rent, available_from, status, senior_friendly, features,
        description, image, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.db.exec('BEGIN');
    try {
      const updatedAt = nowIso();
      for (const item of INVENTORY) {
        insert.run(
          item.id,
          item.system,
          item.ref,
          item.title,
          item.type,
          item.city,
          cityKey(item.city),
          item.area ?? null,
          item.bedrooms,
          item.bathrooms,
          item.areaM2,
          item.rent,
          item.availableFrom ?? null,
          item.status,
          item.seniorFriendly ? 1 : 0,
          JSON.stringify(item.features ?? []),
          item.description ?? null,
          imageFor(item),
          updatedAt
        );
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  resetDemo() {
    this.db.exec('BEGIN');
    try {
      this.db.exec('DELETE FROM comparison_steps');
      this.db.exec('DELETE FROM comparisons');
      this.db.exec('DELETE FROM shortlist_items');
      this.db.exec('DELETE FROM feedback');
      this.db.exec('DELETE FROM shortlists');
      this.db.exec('DELETE FROM run_steps');
      this.db.exec('DELETE FROM listings');
      this.db.exec('DELETE FROM runs');
      this.db.exec('DELETE FROM inventory_checks');
      this.db.exec('DELETE FROM requirements');
      this.db.exec('DELETE FROM events');
      this.db.exec('DELETE FROM cases');
      this.db.exec('DELETE FROM clients');
      this.db.exec('DELETE FROM sources');
      this.db.exec('DELETE FROM inventory');
      this.db.exec('DELETE FROM portfolio');
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    this.seedSources();
    this.seedPortfolio();
    this.seedInventory();
    seedDemo(this);
    seedComparisons(this);
  }

  // -------------------------------------------------------------------------
  // Cases

  listCases({ stage = null, status = null, query = null, limit = 100 } = {}) {
    const conditions = [];
    const values = [];
    if (stage) {
      conditions.push('c.stage = ?');
      values.push(stage);
    }
    if (status) {
      conditions.push('c.status = ?');
      values.push(status);
    }
    if (query) {
      conditions.push('(LOWER(cl.name) LIKE ? OR LOWER(c.ref) LIKE ? OR LOWER(c.summary) LIKE ?)');
      const like = `%${String(query).toLowerCase()}%`;
      values.push(like, like, like);
    }
    const sql = `
      SELECT c.*, cl.name AS client_name, cl.email AS client_email, cl.phone AS client_phone
      FROM cases c JOIN clients cl ON cl.id = c.client_id
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY
        CASE c.status WHEN 'active' THEN 0 ELSE 1 END,
        c.updated_at DESC
      LIMIT ?
    `;
    values.push(Math.max(1, Math.min(200, Number(limit) || 100)));
    return this.db.prepare(sql).all(...values).map((row) => ({
      ...mapCase(row),
      client: { id: row.client_id, name: row.client_name, email: row.client_email, phone: row.client_phone },
    }));
  }

  getCase(idOrRef) {
    const row = this.db
      .prepare(
        `SELECT c.*, cl.name AS client_name, cl.email AS client_email,
                cl.phone AS client_phone, cl.source AS client_source, cl.notes AS client_notes,
                cl.created_at AS client_created_at
         FROM cases c JOIN clients cl ON cl.id = c.client_id
         WHERE c.id = ? OR c.ref = ?`
      )
      .get(idOrRef, idOrRef);
    if (!row) return null;
    return {
      ...mapCase(row),
      client: {
        id: row.client_id,
        name: row.client_name,
        email: row.client_email,
        phone: row.client_phone,
        source: row.client_source,
        notes: row.client_notes,
        created_at: row.client_created_at,
      },
    };
  }

  nextCaseRef() {
    const row = this.db.prepare("SELECT ref FROM cases WHERE ref LIKE 'FRL-%' ORDER BY ref DESC LIMIT 1").get();
    const next = row ? Number(row.ref.split('-')[1]) + 1 : 2401;
    return `FRL-${next}`;
  }

  createCase({
    id = null,
    ref = null,
    client,
    transaction,
    brief,
    title,
    owner = 'Unassigned',
    priority = 'normal',
    source = 'Website',
    createdAt = null,
    stage = 'enquiry',
    status = 'active',
    summary = null,
    nextAction = 'Confirm the brief with the client',
  }) {
    const caseId = id || newId('case');
    const clientId = newId('cli');
    const caseRef = ref || this.nextCaseRef();
    const ts = createdAt || nowIso();
    this.db.exec('BEGIN');
    try {
      this.db
        .prepare(
          `INSERT INTO clients (id, name, email, phone, source, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          clientId,
          client.name,
          client.email ?? null,
          client.phone ?? null,
          client.source ?? source,
          client.notes ?? null,
          ts
        );
      this.db
        .prepare(
          `INSERT INTO cases (
            id, ref, client_id, "transaction", stage, status, iteration, owner, priority,
            current_requirements_id, summary, next_action, source, created_at, updated_at,
            stage_changed_at, shared_at, closed_at
          ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL, NULL)`
        )
        .run(
          caseId,
          caseRef,
          clientId,
          transaction,
          stage,
          status,
          owner,
          priority,
          summary ?? brief.slice(0, 180),
          nextAction,
          source,
          ts,
          ts,
          ts
        );
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.getCase(caseId);
  }

  updateCase(id, patch = {}) {
    const allowed = [
      'stage', 'status', 'owner', 'priority', 'current_requirements_id',
      'summary', 'next_action', 'shared_at', 'closed_at', 'stage_changed_at', 'iteration',
    ];
    const sets = [];
    const values = [];
    for (const [key, value] of Object.entries(patch)) {
      if (!allowed.includes(key)) continue;
      sets.push(`${key} = ?`);
      values.push(value);
    }
    if (!sets.length) return this.getCase(id);
    sets.push('updated_at = ?');
    values.push(nowIso(), id);
    this.db.prepare(`UPDATE cases SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return this.getCase(id);
  }

  countActiveCases() {
    return Number(
      this.db.prepare("SELECT COUNT(*) AS c FROM cases WHERE status = 'active'").get().c
    );
  }

  // -------------------------------------------------------------------------
  // Requirements

  addRequirements(caseId, data, {
    confirmed = true,
    confirmedBy = 'Team',
    confirmedAt = null,
    createdBy = 'Team',
    createdAt = null,
    id = null,
    version = null,
  } = {}) {
    const row = this.db
      .prepare('SELECT COALESCE(MAX(version), 0) AS v FROM requirements WHERE case_id = ?')
      .get(caseId);
    const nextVersion = version || Number(row.v) + 1;
    const reqId = id || newId('req');
    const ts = createdAt || nowIso();
    const confirmedTs = confirmed ? confirmedAt || ts : null;
    this.db
      .prepare(
        `INSERT INTO requirements (
          id, case_id, version, brief, "transaction", property_types, locations, regions,
          budget_min, budget_max, currency, bedrooms_min, bedrooms_max, bathrooms_min,
          tenure, move_in, must_haves, nice_to_haves, notes, confidence, assumptions,
          confirmed_by, confirmed_at, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EUR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        reqId,
        caseId,
        nextVersion,
        data.brief,
        data.transaction,
        JSON.stringify(data.propertyTypes ?? []),
        JSON.stringify(data.locations ?? []),
        JSON.stringify(data.regions ?? []),
        data.budgetMin ?? null,
        data.budgetMax ?? null,
        data.bedroomsMin ?? null,
        data.bedroomsMax ?? null,
        data.bathroomsMin ?? null,
        data.tenure ?? null,
        data.moveIn ?? null,
        JSON.stringify(data.mustHaves ?? []),
        JSON.stringify(data.niceToHaves ?? []),
        data.notes ?? null,
        data.confidence ?? 0.7,
        JSON.stringify(data.assumptions ?? []),
        confirmed ? confirmedBy : null,
        confirmedTs,
        createdBy,
        ts
      );
    if (confirmed) {
      this.db
        .prepare('UPDATE cases SET current_requirements_id = ?, updated_at = ? WHERE id = ?')
        .run(reqId, ts, caseId);
    }
    return this.getRequirement(reqId);
  }

  getRequirement(id) {
    return mapRequirement(this.db.prepare('SELECT * FROM requirements WHERE id = ?').get(id));
  }

  listRequirements(caseId) {
    return this.db
      .prepare('SELECT * FROM requirements WHERE case_id = ? ORDER BY version DESC')
      .all(caseId)
      .map(mapRequirement);
  }

  getCurrentRequirements(caseRow) {
    if (!caseRow?.current_requirements_id) return null;
    return this.getRequirement(caseRow.current_requirements_id);
  }

  // -------------------------------------------------------------------------
  // Inventory

  listInventory({ system = null, status = null, query = null } = {}) {
    const conditions = [];
    const values = [];
    if (system) {
      conditions.push('system = ?');
      values.push(system);
    }
    if (status) {
      conditions.push('status = ?');
      values.push(status);
    }
    if (query) {
      conditions.push('(LOWER(title) LIKE ? OR LOWER(city) LIKE ? OR LOWER(ref) LIKE ?)');
      const like = `%${String(query).toLowerCase()}%`;
      values.push(like, like, like);
    }
    return this.db
      .prepare(
        `SELECT * FROM inventory ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
         ORDER BY system, status = 'available' DESC, rent ASC`
      )
      .all(...values)
      .map(mapInventory);
  }

  getInventory(id) {
    return mapInventory(this.db.prepare('SELECT * FROM inventory WHERE id = ?').get(id));
  }

  createInventory(data) {
    const id = newId('inv');
    const refRow = this.db
      .prepare('SELECT COUNT(*) AS c FROM inventory WHERE system = ?')
      .get(data.system);
    const prefix = data.system === 'Algarve Senior Living' ? 'ASL' : 'PLL';
    const ref = `${prefix}-${900 + Number(refRow.c) + 1}`;
    this.db
      .prepare(
        `INSERT INTO inventory (
          id, system, ref, title, type, city, city_key, area, bedrooms, bathrooms,
          area_m2, rent, available_from, status, senior_friendly, features,
          description, image, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        data.system,
        ref,
        data.title,
        data.type,
        data.city,
        cityKey(data.city),
        data.area ?? null,
        data.bedrooms,
        data.bathrooms,
        data.areaM2,
        data.rent,
        data.availableFrom ?? null,
        data.status,
        data.seniorFriendly ? 1 : 0,
        JSON.stringify(data.features ?? []),
        data.description ?? null,
        imageFor({ type: data.type }),
        nowIso()
      );
    return this.getInventory(id);
  }

  updateInventory(id, patch = {}) {
    const allowed = ['status', 'rent', 'available_from', 'description'];
    const sets = [];
    const values = [];
    for (const [key, value] of Object.entries(patch)) {
      if (!allowed.includes(key)) continue;
      sets.push(`${key} = ?`);
      values.push(value);
    }
    if (!sets.length) return this.getInventory(id);
    sets.push('updated_at = ?');
    values.push(nowIso(), id);
    this.db.prepare(`UPDATE inventory SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return this.getInventory(id);
  }

  addInventoryCheck(data) {
    const id = newId('chk');
    this.db
      .prepare(
        `INSERT INTO inventory_checks (id, case_id, requirements_id, outcome, score, reasons, matches, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        data.caseId,
        data.requirementsId,
        data.outcome,
        data.score ?? null,
        JSON.stringify(data.reasons ?? []),
        JSON.stringify(data.matches ?? []),
        data.createdAt || nowIso()
      );
    return this.getInventoryCheck(id);
  }

  getInventoryCheck(id) {
    return mapInventoryCheck(this.db.prepare('SELECT * FROM inventory_checks WHERE id = ?').get(id));
  }

  getLatestInventoryCheck(caseId) {
    return mapInventoryCheck(
      this.db
        .prepare('SELECT * FROM inventory_checks WHERE case_id = ? ORDER BY created_at DESC LIMIT 1')
        .get(caseId)
    );
  }

  // -------------------------------------------------------------------------
  // Portfolio

  listPortfolio() {
    return this.db
      .prepare(`SELECT * FROM portfolio WHERE status = 'active' ORDER BY "transaction", city, price`)
      .all()
      .map(mapPortfolio);
  }

  // -------------------------------------------------------------------------
  // Sources

  listSources({ enabledOnly = false } = {}) {
    const sql = enabledOnly
      ? 'SELECT * FROM sources WHERE enabled = 1 ORDER BY reliability DESC, name'
      : "SELECT * FROM sources ORDER BY discovered_by = 'agent' DESC, reliability DESC, name";
    return this.db.prepare(sql).all().map(mapSource);
  }

  getSource(id) {
    return mapSource(this.db.prepare('SELECT * FROM sources WHERE id = ?').get(id));
  }

  findSourceByDomain(domain) {
    return mapSource(this.db.prepare('SELECT * FROM sources WHERE domain = ?').get(domain));
  }

  createSource(data) {
    const existing = this.findSourceByDomain(data.domain);
    if (existing) return { created: false, source: existing };
    const id = data.id || newId('src');
    this.db
      .prepare(
        `INSERT INTO sources (
          id, name, domain, kind, coverage, country, enabled, discovered_by,
          reliability, notes, times_used, last_used_at, discovered_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)`
      )
      .run(
        id,
        data.name,
        data.domain,
        data.kind,
        data.coverage,
        data.country ?? 'Portugal',
        data.enabled === false ? 0 : 1,
        data.discovered_by ?? 'team',
        data.reliability ?? 0.7,
        data.notes ?? null,
        data.discovered_by === 'agent' ? nowIso() : null,
        nowIso()
      );
    return { created: true, source: this.getSource(id) };
  }

  updateSource(id, patch) {
    const allowed = ['name', 'kind', 'coverage', 'notes', 'enabled', 'reliability'];
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
    const statement = this.db.prepare(
      'UPDATE sources SET last_used_at = ?, times_used = times_used + 1 WHERE id = ?'
    );
    const ts = nowIso();
    for (const id of ids) statement.run(ts, id);
  }

  // -------------------------------------------------------------------------
  // Runs

  createRun({
    id = null,
    caseId,
    requirementsId,
    kind = 'search',
    iteration = 1,
    status = 'queued',
    createdAt = null,
  }) {
    const runId = id || newId('run');
    this.db
      .prepare(
        `INSERT INTO runs (id, case_id, requirements_id, kind, iteration, status, phase, progress, stats, error, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'queued', 0, NULL, NULL, ?)`
      )
      .run(runId, caseId, requirementsId, kind, iteration, status, createdAt || nowIso());
    return this.getRun(runId);
  }

  getRun(id) {
    return mapRun(this.db.prepare('SELECT * FROM runs WHERE id = ?').get(id));
  }

  listRuns({ caseId = null, limit = 50 } = {}) {
    const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
    if (caseId) {
      return this.db
        .prepare('SELECT * FROM runs WHERE case_id = ? ORDER BY created_at DESC LIMIT ?')
        .all(caseId, safeLimit)
        .map(mapRun);
    }
    return this.db
      .prepare('SELECT * FROM runs ORDER BY created_at DESC LIMIT ?')
      .all(safeLimit)
      .map(mapRun);
  }

  listRunsWithCase(limit = 50) {
    return this.db
      .prepare(
        `SELECT r.*, c.ref AS case_ref, c."transaction", cl.name AS client_name
         FROM runs r
         JOIN cases c ON c.id = r.case_id
         JOIN clients cl ON cl.id = c.client_id
         ORDER BY r.created_at DESC LIMIT ?`
      )
      .all(Math.max(1, Math.min(200, Number(limit) || 50)))
      .map((row) => ({ ...mapRun(row), case_ref: row.case_ref, client_name: row.client_name }));
  }

  updateRun(id, patch = {}) {
    const allowed = ['status', 'phase', 'progress', 'stats', 'error', 'started_at', 'finished_at', 'duration_ms'];
    const sets = [];
    const values = [];
    for (const [key, value] of Object.entries(patch)) {
      if (!allowed.includes(key)) continue;
      sets.push(`${key} = ?`);
      values.push(value);
    }
    if (!sets.length) return this.getRun(id);
    values.push(id);
    this.db.prepare(`UPDATE runs SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return this.getRun(id);
  }

  addRunStep(runId, { seq, phase, level = 'info', message, detail = null, ts = null, elapsedMs = 0 }) {
    this.db
      .prepare(
        `INSERT INTO run_steps (run_id, seq, phase, level, message, detail, ts, elapsed_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(runId, seq, phase, level, message, detail, ts || nowIso(), Math.round(elapsedMs));
    const row = this.db
      .prepare('SELECT * FROM run_steps WHERE run_id = ? ORDER BY id DESC LIMIT 1')
      .get(runId);
    return mapStep(row);
  }

  listRunSteps(runId) {
    return this.db
      .prepare('SELECT * FROM run_steps WHERE run_id = ? ORDER BY seq ASC')
      .all(runId)
      .map(mapStep);
  }

  countRunningRuns() {
    return Number(
      this.db
        .prepare("SELECT COUNT(*) AS c FROM runs WHERE status IN ('queued','running')")
        .get().c
    );
  }

  markInterruptedRuns() {
    this.db
      .prepare(
        `UPDATE runs SET status = 'failed', phase = 'interrupted',
          error = 'The server restarted while this search was running. Run it again.',
          finished_at = ?
         WHERE status IN ('queued','running')`
      )
      .run(nowIso());
  }

  insertListings(runId, listings) {
    if (!listings.length) return;
    const insert = this.db.prepare(`
      INSERT INTO listings (
        id, run_id, source_id, origin, external_ref, title, url, "transaction", type,
        city, city_key, area, bedrooms, bathrooms, area_m2, price, currency, period,
        features, description, agent, available, image, confidence, fingerprint,
        duplicate_group, canonical, mirror_count, mirror_note, match_score,
        match_reasons, reject_reason, included, rank, price_check, decision, decision_note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EUR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', NULL, ?)
    `);
    const ts = nowIso();
    this.db.exec('BEGIN');
    try {
      for (const listing of listings) {
        insert.run(
          listing.id,
          runId,
          listing.sourceId ?? null,
          listing.origin ?? 'search',
          listing.externalRef ?? null,
          listing.title,
          listing.transaction,
          listing.type,
          listing.city,
          listing.cityKey ?? listing.city,
          listing.area ?? null,
          listing.bedrooms ?? null,
          listing.bathrooms ?? null,
          listing.areaM2 ?? null,
          listing.price,
          listing.period,
          JSON.stringify(listing.features ?? []),
          listing.description ?? null,
          listing.agent ?? null,
          listing.available ?? null,
          listing.image ?? null,
          listing.confidence ?? 0.8,
          listing.fingerprint ?? null,
          listing.duplicateGroup ?? listing.fingerprint ?? null,
          listing.canonical ? 1 : 0,
          listing.mirrorCount ?? 0,
          listing.mirrorNote ?? null,
          listing.matchScore ?? null,
          JSON.stringify(listing.matchReasons ?? []),
          listing.rejectReason ?? null,
          listing.included ? 1 : 0,
          listing.rank ?? null,
          listing.priceCheck ? JSON.stringify(listing.priceCheck) : null,
          ts
        );
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  listRunListings(runId) {
    return this.db
      .prepare('SELECT * FROM listings WHERE run_id = ? ORDER BY canonical DESC, rank ASC, price ASC')
      .all(runId)
      .map(mapListing);
  }

  getListing(id) {
    return mapListing(this.db.prepare('SELECT * FROM listings WHERE id = ?').get(id));
  }

  updateListingDecision(id, decision, note) {
    this.db
      .prepare('UPDATE listings SET decision = ?, decision_note = ? WHERE id = ?')
      .run(decision, note ?? null, id);
    return this.getListing(id);
  }

  // -------------------------------------------------------------------------
  // Shortlists

  createShortlist({ caseId, runId, summary = '', createdBy = 'Team', status = 'draft', sharedAt = null, id = null, token = null, version = null, createdAt = null }) {
    const row = this.db
      .prepare('SELECT COALESCE(MAX(version), 0) AS v FROM shortlists WHERE case_id = ?')
      .get(caseId);
    const shortlistId = id || newId('sht');
    const shortlistToken = token || newToken(24);
    const ts = createdAt || nowIso();
    this.db
      .prepare(
        `INSERT INTO shortlists (id, case_id, run_id, version, token, status, summary, created_by, shared_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        shortlistId,
        caseId,
        runId,
        version || Number(row.v) + 1,
        shortlistToken,
        status,
        summary,
        createdBy,
        sharedAt,
        ts,
        ts
      );
    return this.getShortlist(shortlistId);
  }

  getShortlist(id) {
    return mapShortlist(this.db.prepare('SELECT * FROM shortlists WHERE id = ?').get(id));
  }

  getShortlistByToken(token) {
    return mapShortlist(this.db.prepare('SELECT * FROM shortlists WHERE token = ?').get(token));
  }

  getLatestShortlist(caseId) {
    return mapShortlist(
      this.db
        .prepare('SELECT * FROM shortlists WHERE case_id = ? ORDER BY created_at DESC LIMIT 1')
        .get(caseId)
    );
  }

  listShortlists(caseId) {
    return this.db
      .prepare('SELECT * FROM shortlists WHERE case_id = ? ORDER BY created_at DESC')
      .all(caseId)
      .map(mapShortlist);
  }

  addShortlistItem(shortlistId, { listingId, rationale = '', position, id = null }) {
    const itemId = id || newId('sli');
    this.db
      .prepare(
        `INSERT INTO shortlist_items (id, shortlist_id, listing_id, position, rationale, client_decision, client_comment, created_at)
         VALUES (?, ?, ?, ?, ?, 'pending', NULL, ?)`
      )
      .run(itemId, shortlistId, listingId, position, rationale, nowIso());
    return this.getShortlistItem(itemId);
  }

  getShortlistItem(id) {
    return mapShortlistItem(this.db.prepare('SELECT * FROM shortlist_items WHERE id = ?').get(id));
  }

  listShortlistItems(shortlistId) {
    return this.db
      .prepare('SELECT * FROM shortlist_items WHERE shortlist_id = ? ORDER BY position ASC')
      .all(shortlistId)
      .map(mapShortlistItem);
  }

  updateShortlist(id, patch = {}) {
    const allowed = ['summary', 'status', 'shared_at'];
    const sets = [];
    const values = [];
    for (const [key, value] of Object.entries(patch)) {
      if (!allowed.includes(key)) continue;
      sets.push(`${key} = ?`);
      values.push(value);
    }
    if (!sets.length) return this.getShortlist(id);
    sets.push('updated_at = ?');
    values.push(nowIso(), id);
    this.db.prepare(`UPDATE shortlists SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return this.getShortlist(id);
  }

  replaceShortlistItems(shortlistId, items) {
    this.db.exec('BEGIN');
    try {
      this.db.prepare('DELETE FROM shortlist_items WHERE shortlist_id = ?').run(shortlistId);
      let position = 1;
      for (const item of items) {
        this.db
          .prepare(
            `INSERT INTO shortlist_items (id, shortlist_id, listing_id, position, rationale, client_decision, client_comment, created_at)
             VALUES (?, ?, ?, ?, ?, 'pending', NULL, ?)`
          )
          .run(newId('sli'), shortlistId, item.listingId, position, item.rationale ?? '', nowIso());
        position += 1;
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.listShortlistItems(shortlistId);
  }

  updateShortlistItemDecision(id, decision, comment) {
    this.db
      .prepare('UPDATE shortlist_items SET client_decision = ?, client_comment = ? WHERE id = ?')
      .run(decision, comment ?? null, id);
    return this.getShortlistItem(id);
  }

  addFeedback({ caseId, shortlistId, overall, comment, submittedBy = 'Client', createdAt = null }) {
    const id = newId('fbk');
    this.db
      .prepare(
        `INSERT INTO feedback (id, case_id, shortlist_id, overall, comment, submitted_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, caseId, shortlistId, overall, comment ?? null, submittedBy, createdAt || nowIso());
    return this.getFeedback(id);
  }

  getFeedback(id) {
    return this.db.prepare('SELECT * FROM feedback WHERE id = ?').get(id);
  }

  listFeedback(caseId) {
    return this.db
      .prepare('SELECT * FROM feedback WHERE case_id = ? ORDER BY created_at DESC')
      .all(caseId);
  }

  // -------------------------------------------------------------------------
  // Events

  addEvent({ caseId, type, actor = 'Team', message, detail = null, ts = null }) {
    const id = newId('evt');
    this.db
      .prepare('INSERT INTO events (id, case_id, type, actor, message, detail, ts) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, caseId, type, actor, message, detail ? JSON.stringify(detail) : null, ts || nowIso());
    return mapEvent(this.db.prepare('SELECT * FROM events WHERE id = ?').get(id));
  }

  listEvents(caseId, limit = 100) {
    return this.db
      .prepare('SELECT * FROM events WHERE case_id = ? ORDER BY ts DESC LIMIT ?')
      .all(caseId, Math.max(1, Math.min(200, limit)))
      .map(mapEvent);
  }

  listRecentEvents(limit = 12) {
    return this.db
      .prepare(
        `SELECT e.*, c.ref AS case_ref, cl.name AS client_name
         FROM events e JOIN cases c ON c.id = e.case_id JOIN clients cl ON cl.id = c.client_id
         ORDER BY e.ts DESC LIMIT ?`
      )
      .all(Math.max(1, Math.min(50, limit)))
      .map((row) => ({ ...mapEvent(row), case_ref: row.case_ref, client_name: row.client_name }));
  }

  // -------------------------------------------------------------------------
  // Listing comparisons

  nextComparisonRef() {
    const row = this.db
      .prepare("SELECT ref FROM comparisons WHERE ref LIKE 'ANL-%' ORDER BY ref DESC LIMIT 1")
      .get();
    const next = row ? Number(row.ref.split('-')[1]) + 1 : 1001;
    return `ANL-${next}`;
  }

  createComparison(data) {
    const id = data.id || newId('cmp');
    const ref = data.ref || this.nextComparisonRef();
    const createdAt = data.createdAt || nowIso();
    this.db
      .prepare(
        `INSERT INTO comparisons (
          id, ref, mode, subject_source, portfolio_id, subject_ref, title, "transaction", type,
          city, area, bedrooms, bathrooms, area_m2, price, currency, period,
          features, image, description, url, status, stats, report, error,
          created_at, started_at, finished_at, duration_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)`
      )
      .run(
        id,
        ref,
        data.mode || 'demo',
        data.subjectSource || 'portfolio',
        data.portfolioId || null,
        data.subjectRef || null,
        data.title,
        data.transaction,
        data.type,
        data.city,
        data.area || null,
        data.bedrooms ?? null,
        data.bathrooms ?? null,
        data.areaM2 ?? null,
        data.price,
        data.currency || 'EUR',
        data.period || (data.transaction === 'rent' ? 'month' : 'total'),
        JSON.stringify(data.features || []),
        data.image || null,
        data.description || null,
        data.url || null,
        data.status || 'queued',
        data.stats ? JSON.stringify(data.stats) : null,
        data.report ? JSON.stringify(data.report) : null,
        data.error || null,
        createdAt
      );
    return this.getComparison(id);
  }

  getComparison(id) {
    return mapComparison(this.db.prepare('SELECT * FROM comparisons WHERE id = ? OR ref = ?').get(id, id));
  }

  listComparisons(limit = 30) {
    return this.db
      .prepare('SELECT * FROM comparisons ORDER BY created_at DESC LIMIT ?')
      .all(Math.max(1, Math.min(100, Number(limit) || 30)))
      .map(mapComparison);
  }

  updateComparison(id, patch = {}) {
    const allowed = [
      'status', 'stats', 'report', 'error', 'started_at', 'finished_at', 'duration_ms',
    ];
    const sets = [];
    const values = [];
    for (const [key, value] of Object.entries(patch)) {
      if (!allowed.includes(key)) continue;
      sets.push(`${key} = ?`);
      values.push(value);
    }
    if (!sets.length) return this.getComparison(id);
    values.push(id);
    this.db.prepare(`UPDATE comparisons SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return this.getComparison(id);
  }

  addComparisonStep(comparisonId, { seq, phase, level = 'info', message, detail = null, ts = null, elapsedMs = 0 }) {
    this.db
      .prepare(
        `INSERT INTO comparison_steps (comparison_id, seq, phase, level, message, detail, ts, elapsed_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(comparisonId, seq, phase, level, message, detail, ts || nowIso(), Math.round(elapsedMs));
    const row = this.db
      .prepare('SELECT * FROM comparison_steps WHERE comparison_id = ? ORDER BY id DESC LIMIT 1')
      .get(comparisonId);
    return mapComparisonStep(row);
  }

  listComparisonSteps(comparisonId) {
    return this.db
      .prepare('SELECT * FROM comparison_steps WHERE comparison_id = ? ORDER BY seq ASC')
      .all(comparisonId)
      .map(mapComparisonStep);
  }

  countRunningComparisons() {
    return Number(
      this.db.prepare("SELECT COUNT(*) AS c FROM comparisons WHERE status IN ('queued','running')").get().c
    );
  }

  markInterruptedComparisons() {
    this.db
      .prepare(
        `UPDATE comparisons SET status = 'failed', error = 'The server restarted while this analysis was running.',
          finished_at = ? WHERE status IN ('queued', 'running')`
      )
      .run(nowIso());
  }

  // -------------------------------------------------------------------------
  // Aggregates

  pipelineCounts() {
    const rows = this.db
      .prepare("SELECT stage, COUNT(*) AS count FROM cases WHERE status = 'active' GROUP BY stage")
      .all();
    const counts = Object.fromEntries(CASE_STAGES.map((stage) => [stage, 0]));
    for (const row of rows) counts[row.stage] = Number(row.count);
    return counts;
  }

  getMetrics() {
    const active = Number(this.db.prepare("SELECT COUNT(*) AS c FROM cases WHERE status = 'active'").get().c);
    const withClient = Number(
      this.db.prepare("SELECT COUNT(*) AS c FROM cases WHERE status = 'active' AND stage = 'client'").get().c
    );
    const won = Number(this.db.prepare("SELECT COUNT(*) AS c FROM cases WHERE status = 'won'").get().c);
    const lost = Number(this.db.prepare("SELECT COUNT(*) AS c FROM cases WHERE status = 'lost'").get().c);
    const runs = this.db
      .prepare("SELECT status, COUNT(*) AS c, AVG(duration_ms) AS avg_ms FROM runs GROUP BY status")
      .all();
    const runStats = { total: 0, completed: 0, failed: 0, avg_ms: null };
    for (const row of runs) {
      runStats.total += Number(row.c);
      if (row.status === 'completed') {
        runStats.completed += Number(row.c);
        if (row.avg_ms !== null) runStats.avg_ms = Math.round(Number(row.avg_ms));
      }
      if (row.status === 'failed' || row.status === 'cancelled') runStats.failed += Number(row.c);
    }
    const sources = this.db
      .prepare('SELECT COUNT(*) AS total, SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) AS enabled, SUM(CASE WHEN discovered_by = \'agent\' THEN 1 ELSE 0 END) AS discovered, SUM(times_used) AS uses FROM sources')
      .get();
    const longList = Number(
      this.db.prepare('SELECT COUNT(*) AS c FROM listings WHERE canonical = 1 AND included = 1').get().c
    );
    const shortlistItems = Number(this.db.prepare('SELECT COUNT(*) AS c FROM shortlist_items').get().c);
    const shared = Number(
      this.db.prepare("SELECT COUNT(*) AS c FROM shortlists WHERE status IN ('shared','feedback')").get().c
    );
    const feedbackCount = Number(this.db.prepare('SELECT COUNT(*) AS c FROM feedback').get().c);
    const discoveryCount = Number(
      this.db.prepare("SELECT COUNT(*) AS c FROM listings WHERE canonical = 1 AND duplicate_group IS NOT NULL AND mirror_count > 0").get().c
    );
    const searchRuns = Number(this.db.prepare("SELECT COUNT(*) AS c FROM runs WHERE kind = 'search'").get().c);
    const sumScanned = this.db.prepare("SELECT SUM(json_extract(stats, '$.extracted')) AS s FROM runs WHERE status = 'completed'").get();
    return {
      activeCases: active,
      withClient,
      won,
      lost,
      runStats,
      sources: {
        total: Number(sources.total || 0),
        enabled: Number(sources.enabled || 0),
        discovered: Number(sources.discovered || 0),
        uses: Number(sources.uses || 0),
      },
      longList,
      shortlistItems,
      sharedShortlists: shared,
      feedbackCount,
      duplicateGroups: discoveryCount,
      searchRuns,
      listingsScanned: Number(sumScanned.s || 0),
    };
  }

  catalogueGrowth(weeks = 8) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay());
    start.setDate(start.getDate() - (weeks - 1) * 7);
    const rows = this.db
      .prepare('SELECT created_at FROM sources ORDER BY created_at ASC')
      .all();
    const result = [];
    let running = 0;
    for (const row of rows) {
      if (new Date(row.created_at) < start) running += 1;
    }
    for (let index = 0; index < weeks; index += 1) {
      const weekStart = new Date(start);
      weekStart.setDate(weekStart.getDate() + index * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const added = rows.filter((row) => {
        const date = new Date(row.created_at);
        return date >= weekStart && date < weekEnd;
      }).length;
      running += added;
      result.push({
        week: weekStart.toISOString(),
        label: weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        added,
        total: running,
      });
    }
    return result;
  }

  stageTimings() {
    return this.db
      .prepare(
        `SELECT iteration, status, duration_ms, created_at, finished_at,
                json_extract(stats, '$.extracted') AS extracted,
                json_extract(stats, '$.longList') AS long_list
         FROM runs WHERE status = 'completed' ORDER BY created_at DESC`
      )
      .all();
  }

  priceVerdictCounts() {
    const rows = this.db
      .prepare(
        `SELECT json_extract(price_check, '$.verdict') AS verdict, COUNT(*) AS count
         FROM listings
         WHERE canonical = 1 AND included = 1 AND price_check IS NOT NULL
         GROUP BY verdict`
      )
      .all();
    const counts = { above: 0, at: 0, below: 0, unknown: 0 };
    for (const row of rows) {
      const key = row.verdict || 'unknown';
      counts[key] = (counts[key] || 0) + Number(row.count);
    }
    return counts;
  }

  averageDaysToShortlist() {
    const row = this.db
      .prepare(
        `SELECT AVG(julianday(shared_at) - julianday(created_at)) AS days
         FROM cases WHERE shared_at IS NOT NULL AND status != 'lost'`
      )
      .get();
    return row?.days === null || row?.days === undefined ? null : Math.max(0, Number(row.days));
  }

  averageDaysToClose() {
    const row = this.db
      .prepare(
        `SELECT AVG(julianday(closed_at) - julianday(created_at)) AS days
         FROM cases WHERE closed_at IS NOT NULL`
      )
      .get();
    return row?.days === null || row?.days === undefined ? null : Math.max(0, Number(row.days));
  }

  sourceReuseCount() {
    return Number(
      this.db.prepare('SELECT COUNT(*) AS c FROM sources WHERE times_used > 1').get().c
    );
  }

  getLatestFeedback(caseId) {
    return this.db
      .prepare('SELECT * FROM feedback WHERE case_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(caseId);
  }

  countCasesBySource() {
    return this.db
      .prepare('SELECT source, COUNT(*) AS count FROM cases GROUP BY source ORDER BY count DESC')
      .all()
      .map((row) => ({ source: row.source || 'Unknown', count: Number(row.count) }));
  }

  countListingsByVerdict() {
    return this.priceVerdictCounts();
  }

  countShortlistDecisions() {
    const rows = this.db
      .prepare('SELECT client_decision, COUNT(*) AS count FROM shortlist_items GROUP BY client_decision')
      .all();
    const counts = { interested: 0, not_for_us: 0, question: 0, pending: 0 };
    for (const row of rows) counts[row.client_decision] = Number(row.count);
    return counts;
  }
}

export { CASE_STAGES, CASE_STATUSES };
