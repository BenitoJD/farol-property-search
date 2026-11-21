import { LOCATION_OPTIONS, PROPERTY_TYPES, parseBrief } from '../agent/brief.js';
import { normalizeUrl, shortHash, slugify } from './util.js';
import { isPlainObject } from './values.js';
import { unprocessable } from './errors.js';

const LOCATION_VALUES = new Set(LOCATION_OPTIONS.map((option) => option.value).filter(Boolean));
const TRANSACTIONS = new Set(['auto', 'rent', 'sale']);
const SOURCE_KINDS = new Set(['portal', 'marketplace', 'agency', 'other']);
const COUNTRIES = new Set(['Portugal', 'Spain', 'Other']);

function numberField(value, { min, max, label }) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) throw unprocessable(`${label} must be a number.`);
  if (n < min || n > max) throw unprocessable(`${label} must be between ${min} and ${max}.`);
  return n;
}

function stringField(value, { min = 0, max = 200, label }) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw unprocessable(`${label} must be text.`);
  const trimmed = value.trim();
  if (trimmed.length < min) throw unprocessable(`${label} must be at least ${min} characters.`);
  if (trimmed.length > max) throw unprocessable(`${label} must be at most ${max} characters.`);
  return trimmed;
}

export function validateRunInput(body, { fx }) {
  if (!isPlainObject(body)) throw unprocessable('Request body must be a JSON object.');
  const brief = stringField(body.brief, { min: 3, max: 1500, label: 'Brief' });
  const rawOverrides = body.overrides && isPlainObject(body.overrides) ? body.overrides : {};
  const overrides = {};

  if (rawOverrides.transaction !== undefined && rawOverrides.transaction !== '') {
    if (!TRANSACTIONS.has(rawOverrides.transaction)) {
      throw unprocessable('Transaction must be auto, rent or sale.');
    }
    if (rawOverrides.transaction !== 'auto') overrides.transaction = rawOverrides.transaction;
  }

  if (rawOverrides.location) {
    if (!LOCATION_VALUES.has(rawOverrides.location)) {
      throw unprocessable('Unknown location filter.');
    }
    overrides.location = rawOverrides.location;
  }

  if (rawOverrides.budget !== undefined && rawOverrides.budget !== '' && rawOverrides.budget !== null) {
    const budget = numberField(rawOverrides.budget, { min: 100, max: 50_000_000, label: 'Budget' });
    if (budget !== null) overrides.budget = Math.round(budget);
  }

  const bedsMin = numberField(rawOverrides.bedsMin, { min: 0, max: 10, label: 'Minimum bedrooms' });
  const bedsMax = numberField(rawOverrides.bedsMax, { min: 0, max: 10, label: 'Maximum bedrooms' });
  if (bedsMin !== null) overrides.bedsMin = Math.round(bedsMin);
  if (bedsMax !== null) overrides.bedsMax = Math.round(bedsMax);
  if (bedsMin !== null && bedsMax !== null && bedsMin > bedsMax) {
    throw unprocessable('Minimum bedrooms cannot exceed maximum bedrooms.');
  }

  if (rawOverrides.types !== undefined && rawOverrides.types !== null) {
    const list = Array.isArray(rawOverrides.types)
      ? rawOverrides.types
      : typeof rawOverrides.types === 'string'
        ? rawOverrides.types.split(',')
        : null;
    if (!list) throw unprocessable('Types must be a list.');
    const types = [...new Set(list.map((type) => String(type).trim()).filter(Boolean))];
    if (types.some((type) => !PROPERTY_TYPES.includes(type))) {
      throw unprocessable(`Property types must be one of: ${PROPERTY_TYPES.join(', ')}.`);
    }
    if (types.length) overrides.types = types;
  }

  let threadId = null;
  if (body.threadId) {
    if (typeof body.threadId !== 'string' || !/^thr_[a-z0-9]{6,32}$/.test(body.threadId)) {
      throw unprocessable('Invalid search thread.');
    }
    threadId = body.threadId;
  }

  const filters = parseBrief(brief, { overrides, fx });
  if (!filters.locations.length && !filters.regions.length) {
    // parseBrief always supplies a default, but keep the check explicit.
    throw unprocessable('Could not determine a market from this brief.');
  }
  return { brief, filters, threadId };
}

export function validateSourceInput(body) {
  if (!isPlainObject(body)) throw unprocessable('Request body must be a JSON object.');
  const name = stringField(body.name, { min: 2, max: 80, label: 'Source name' });
  let domain = stringField(body.domain, { min: 3, max: 120, label: 'Domain' }).toLowerCase();
  domain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  if (!/^(?!-)([a-z0-9-]{1,63}\.)+[a-z]{2,24}$/.test(domain)) {
    throw unprocessable('Domain must be a valid hostname, for example idealista.pt.');
  }
  const kind = body.kind || 'agency';
  if (!SOURCE_KINDS.has(kind)) throw unprocessable('Kind must be portal, marketplace, agency or other.');
  const country = body.country || 'Portugal';
  if (!COUNTRIES.has(country)) throw unprocessable('Country must be Portugal, Spain or Other.');
  const region = stringField(body.region, { max: 40, label: 'Region' }) || null;
  const notes = stringField(body.notes, { max: 500, label: 'Notes' }) || null;
  const reliability = numberField(body.reliability, { min: 0, max: 1, label: 'Reliability' });
  const url = normalizeUrl(body.url || `https://${domain}`) || `https://${domain}`;
  return {
    name,
    domain,
    kind,
    country,
    region,
    notes,
    reliability: reliability === null ? 0.65 : reliability,
    url,
    enabled: body.enabled !== false,
    discovered_by: 'manual',
    id: `src_${slugify(domain).replace(/-/g, '_').slice(0, 26)}_${shortHash(domain, 4)}`,
  };
}

export function validateSourcePatch(body) {
  if (!isPlainObject(body)) throw unprocessable('Request body must be a JSON object.');
  const patch = {};
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== 'boolean') throw unprocessable('Enabled must be true or false.');
    patch.enabled = body.enabled;
  }
  if (body.name !== undefined) patch.name = stringField(body.name, { min: 2, max: 80, label: 'Source name' });
  if (body.kind !== undefined) {
    if (!SOURCE_KINDS.has(body.kind)) throw unprocessable('Unknown source kind.');
    patch.kind = body.kind;
  }
  if (body.region !== undefined) patch.region = stringField(body.region, { max: 40, label: 'Region' }) || null;
  if (body.notes !== undefined) patch.notes = stringField(body.notes, { max: 500, label: 'Notes' }) || null;
  if (body.reliability !== undefined) {
    patch.reliability = numberField(body.reliability, { min: 0, max: 1, label: 'Reliability' });
  }
  if (!Object.keys(patch).length) throw unprocessable('No supported fields to update.');
  return patch;
}

export function validateRunId(runId) {
  if (typeof runId !== 'string' || !/^run_[a-z0-9]{6,40}$/.test(runId)) {
    throw unprocessable('Invalid run id.');
  }
  return runId;
}

export function validateSourceId(sourceId) {
  if (typeof sourceId !== 'string' || !/^src_[a-z0-9_]{3,60}$/.test(sourceId)) {
    throw unprocessable('Invalid source id.');
  }
  return sourceId;
}
