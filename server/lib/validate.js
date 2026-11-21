import { badRequest, unprocessable } from './errors.js';
import { clamp, safeNumber, unique } from './util.js';

export function parseEnvInt(raw, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  const rounded = Math.trunc(value);
  if (rounded < min || rounded > max) return fallback;
  return rounded;
}

export function asString(value, field, { max = 2000, required = false, trim = true } = {}) {
  if (value === undefined || value === null) {
    if (required) throw badRequest(`${field} is required.`);
    return '';
  }
  if (typeof value !== 'string') throw badRequest(`${field} must be text.`);
  const text = trim ? value.trim() : value;
  if (required && !text) throw badRequest(`${field} is required.`);
  if (text.length > max) throw badRequest(`${field} must be ${max} characters or fewer.`);
  return text;
}

export function asEmail(value, field = 'Email') {
  const email = asString(value, field, { max: 200, required: true }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw badRequest(`${field} must be a valid email address.`);
  }
  return email;
}

export function asEnum(value, field, allowed, fallback) {
  if (value === undefined || value === null || value === '') {
    if (fallback !== undefined) return fallback;
    throw badRequest(`${field} is required.`);
  }
  const text = String(value);
  if (!allowed.includes(text)) {
    throw badRequest(`${field} must be one of: ${allowed.join(', ')}.`);
  }
  return text;
}

export function asNumber(value, field, { min = -Infinity, max = Infinity, fallback = null } = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) throw badRequest(`${field} must be a number.`);
  if (number < min || number > max) throw badRequest(`${field} is outside the allowed range.`);
  return number;
}

export function asStringArray(value, field, { maxItems = 30, itemMax = 120 } = {}) {
  if (value === undefined || value === null || value === '') return [];
  if (!Array.isArray(value)) throw badRequest(`${field} must be a list.`);
  if (value.length > maxItems) throw badRequest(`${field} has too many entries.`);
  return unique(
    value.map((item) => {
      if (typeof item !== 'string') throw badRequest(`${field} entries must be text.`);
      const text = item.trim();
      if (text.length > itemMax) throw badRequest(`${field} entries must be ${itemMax} characters or fewer.`);
      return text;
    })
  );
}

export function asObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw badRequest(`${field} must be an object.`);
  }
  return value;
}

export function validateCreateCase(body = {}) {
  asObject(body, 'Request body');
  const client = body.client && typeof body.client === 'object' ? body.client : {};
  const name = asString(client.name ?? body.clientName, 'Client name', { max: 120, required: true });
  const email = asEmail(client.email ?? body.clientEmail, 'Client email');
  const phone = asString(client.phone ?? body.clientPhone, 'Client phone', { max: 40 });
  const source = asString(client.source ?? body.source, 'Enquiry source', { max: 60 }) || 'Website';
  const transaction = asEnum(body.transaction, 'Transaction', ['rent', 'sale'], 'rent');
  const brief = asString(body.brief, 'Enquiry brief', { max: 4000, required: true });
  const title = asString(body.title, 'Case title', { max: 120 });
  const owner = asString(body.owner, 'Owner', { max: 80 }) || 'Unassigned';
  const priority = asEnum(body.priority, 'Priority', ['low', 'normal', 'high'], 'normal');
  return { client: { name, email, phone, source }, transaction, brief, title, owner, priority };
}

export function validateRequirements(body = {}) {
  asObject(body, 'Request body');
  const brief = asString(body.brief, 'Brief', { max: 4000 });
  const transaction = asEnum(body.transaction, 'Transaction', ['rent', 'sale'], 'rent');
  const propertyTypes = asStringArray(body.propertyTypes, 'Property types', { maxItems: 8 });
  const locations = asStringArray(body.locations, 'Locations', { maxItems: 12 });
  const budgetMin = asNumber(body.budgetMin, 'Minimum budget', { min: 0, max: 50_000_000, fallback: null });
  const budgetMax = asNumber(body.budgetMax, 'Maximum budget', { min: 0, max: 50_000_000, fallback: null });
  if (budgetMin !== null && budgetMax !== null && budgetMin > budgetMax) {
    throw badRequest('Minimum budget cannot be greater than maximum budget.');
  }
  const bedroomsMin = asNumber(body.bedroomsMin, 'Minimum bedrooms', { min: 0, max: 20, fallback: null });
  const bedroomsMax = asNumber(body.bedroomsMax, 'Maximum bedrooms', { min: 0, max: 20, fallback: null });
  if (bedroomsMin !== null && bedroomsMax !== null && bedroomsMin > bedroomsMax) {
    throw badRequest('Minimum bedrooms cannot be greater than maximum bedrooms.');
  }
  const mustHaves = asStringArray(body.mustHaves, 'Must-haves', { maxItems: 20 });
  const niceToHaves = asStringArray(body.niceToHaves, 'Nice-to-haves', { maxItems: 20 });
  const moveIn = asString(body.moveIn, 'Move-in date', { max: 60 });
  const tenure = asString(body.tenure, 'Tenure', { max: 60 });
  const notes = asString(body.notes, 'Notes', { max: 2000 });
  const confidence = clamp(safeNumber(body.confidence, 0.7), 0, 1);
  return {
    brief,
    transaction,
    propertyTypes,
    locations,
    budgetMin,
    budgetMax,
    bedroomsMin,
    bedroomsMax,
    mustHaves,
    niceToHaves,
    moveIn,
    tenure,
    notes,
    confidence,
    confirm: body.confirm !== false,
  };
}

export function validateSource(body = {}) {
  asObject(body, 'Request body');
  const name = asString(body.name, 'Source name', { max: 100, required: true });
  let domain = asString(body.domain, 'Domain', { max: 160, required: true }).toLowerCase();
  domain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
    throw badRequest('Domain must look like example.com.');
  }
  const kind = asEnum(
    body.kind,
    'Source kind',
    ['portal', 'marketplace', 'agency', 'network', 'other'],
    'agency'
  );
  const coverage = asEnum(
    body.coverage,
    'Coverage',
    ['Algarve', 'Lisbon', 'Portugal', 'Other'],
    'Portugal'
  );
  const reliability = clamp(safeNumber(body.reliability, 0.7), 0.1, 1);
  const notes = asString(body.notes, 'Notes', { max: 500 });
  const enabled = body.enabled !== false;
  return { name, domain, kind, coverage, reliability, notes, enabled };
}

export function validateSourcePatch(body = {}) {
  asObject(body, 'Request body');
  const patch = {};
  if (body.name !== undefined) patch.name = asString(body.name, 'Source name', { max: 100, required: true });
  if (body.kind !== undefined) {
    patch.kind = asEnum(body.kind, 'Source kind', ['portal', 'marketplace', 'agency', 'network', 'other']);
  }
  if (body.coverage !== undefined) {
    patch.coverage = asEnum(body.coverage, 'Coverage', ['Algarve', 'Lisbon', 'Portugal', 'Other']);
  }
  if (body.reliability !== undefined) {
    patch.reliability = clamp(safeNumber(body.reliability, 0.7), 0.1, 1);
  }
  if (body.notes !== undefined) patch.notes = asString(body.notes, 'Notes', { max: 500 });
  if (body.enabled !== undefined) patch.enabled = Boolean(body.enabled);
  if (!Object.keys(patch).length) throw unprocessable('No supported fields to update.');
  return patch;
}

export function validateInventory(body = {}) {
  asObject(body, 'Request body');
  const system = asEnum(body.system, 'Inventory system', ['Algarve Senior Living', 'Portugal Long Lets']);
  const title = asString(body.title, 'Title', { max: 160, required: true });
  const type = asEnum(body.type, 'Property type', ['apartment', 'townhouse', 'villa', 'house', 'penthouse', 'quinta'], 'apartment');
  const city = asString(body.city, 'City', { max: 80, required: true });
  const area = asString(body.area, 'Area', { max: 80 });
  const bedrooms = asNumber(body.bedrooms, 'Bedrooms', { min: 0, max: 20, fallback: 2 });
  const bathrooms = asNumber(body.bathrooms, 'Bathrooms', { min: 0, max: 20, fallback: 1 });
  const areaM2 = asNumber(body.areaM2, 'Area m²', { min: 10, max: 5000, fallback: 80 });
  const rent = asNumber(body.rent, 'Monthly rent', { min: 0, max: 50_000, fallback: 0 });
  const availableFrom = asString(body.availableFrom, 'Available from', { max: 30 });
  const status = asEnum(body.status, 'Availability', ['available', 'reserved', 'let'], 'available');
  const features = asStringArray(body.features, 'Features', { maxItems: 20 });
  const seniorFriendly = Boolean(body.seniorFriendly);
  const description = asString(body.description, 'Description', { max: 1200 });
  return {
    system,
    title,
    type,
    city,
    area,
    bedrooms,
    bathrooms,
    areaM2,
    rent,
    availableFrom,
    status,
    features,
    seniorFriendly,
    description,
  };
}

export function validateShortlist(body = {}) {
  asObject(body, 'Request body');
  const rawItems = body.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw badRequest('Select at least one property for the shortlist.');
  }
  if (rawItems.length > 8) throw badRequest('A shortlist can hold at most eight properties.');
  const items = rawItems.map((item, index) => {
    asObject(item, `Shortlist item ${index + 1}`);
    const listingId = asString(item.listingId, 'Listing id', { max: 80, required: true });
    const rationale = asString(item.rationale, 'Rationale', { max: 400 });
    return { listingId, rationale };
  });
  const summary = asString(body.summary, 'Summary', { max: 1200 });
  return { items, summary };
}

export function validateShortlistPatch(body = {}) {
  asObject(body, 'Request body');
  const patch = {};
  if (body.summary !== undefined) patch.summary = asString(body.summary, 'Summary', { max: 1200 });
  if (body.items !== undefined) {
    if (!Array.isArray(body.items) || body.items.length === 0) {
      throw badRequest('Shortlist items must be a non-empty list.');
    }
    patch.items = body.items.map((item, index) => {
      asObject(item, `Shortlist item ${index + 1}`);
      return {
        listingId: asString(item.listingId, 'Listing id', { max: 80, required: true }),
        rationale: asString(item.rationale, 'Rationale', { max: 400 }),
      };
    });
  }
  if (!Object.keys(patch).length) throw unprocessable('No supported fields to update.');
  return patch;
}

export function validateFeedback(body = {}) {
  asObject(body, 'Request body');
  const overall = asEnum(body.overall, 'Overall response', ['accept', 'refine'], 'accept');
  const comment = asString(body.comment, 'Comment', { max: 2000 });
  const submittedBy = asString(body.submittedBy, 'Submitted by', { max: 120 }) || 'Client';
  const rawDecisions = body.decisions ?? [];
  if (!Array.isArray(rawDecisions)) throw badRequest('Decisions must be a list.');
  const decisions = rawDecisions.slice(0, 20).map((item, index) => {
    asObject(item, `Decision ${index + 1}`);
    return {
      shortlistItemId: asString(item.shortlistItemId, 'Shortlist item id', { max: 80, required: true }),
      decision: asEnum(item.decision, 'Decision', ['interested', 'not_for_us', 'question', 'pending'], 'pending'),
      comment: asString(item.comment, 'Decision comment', { max: 600 }),
    };
  });
  return { overall, comment, submittedBy, decisions };
}

export function validateListingDecision(body = {}) {
  asObject(body, 'Request body');
  return {
    decision: asEnum(body.decision, 'Decision', ['new', 'candidate', 'excluded'], 'candidate'),
    note: asString(body.note, 'Note', { max: 500 }),
  };
}

export function validateCasePatch(body = {}) {
  asObject(body, 'Request body');
  const patch = {};
  if (body.owner !== undefined) patch.owner = asString(body.owner, 'Owner', { max: 80, required: true });
  if (body.priority !== undefined) {
    patch.priority = asEnum(body.priority, 'Priority', ['low', 'normal', 'high']);
  }
  if (body.nextAction !== undefined) patch.nextAction = asString(body.nextAction, 'Next action', { max: 200 });
  if (body.title !== undefined) patch.title = asString(body.title, 'Title', { max: 120 });
  if (!Object.keys(patch).length) throw unprocessable('No supported fields to update.');
  return patch;
}

export function validateClose(body = {}) {
  asObject(body, 'Request body');
  return {
    status: asEnum(body.status, 'Outcome', ['won', 'lost'], 'won'),
    reason: asString(body.reason, 'Reason', { max: 600 }),
  };
}

export function validateIteration(body = {}) {
  asObject(body, 'Request body');
  return {
    note: asString(body.note, 'Iteration note', { max: 2000 }),
    applyFeedback: body.applyFeedback !== false,
  };
}

export function validateComparison(body = {}) {
  asObject(body, 'Request body');
  const portfolioId = asString(body.portfolioId, 'Portfolio listing', { max: 80 });
  const market = asEnum(body.market, 'Market', ['demo', 'live'], 'demo');
  if (portfolioId) return { portfolioId, market };
  const title = asString(body.title, 'Listing title', { max: 160, required: true });
  const transaction = asEnum(body.transaction, 'Transaction', ['rent', 'sale'], 'rent');
  const type = asEnum(
    body.type,
    'Property type',
    ['apartment', 'townhouse', 'villa', 'house', 'penthouse', 'quinta'],
    'apartment'
  );
  const city = asString(body.city, 'City', { max: 80, required: true });
  const area = asString(body.area, 'Area', { max: 80 });
  const bedrooms = asNumber(body.bedrooms, 'Bedrooms', { min: 0, max: 20, fallback: null });
  const bathrooms = asNumber(body.bathrooms, 'Bathrooms', { min: 0, max: 20, fallback: null });
  const areaM2 = asNumber(body.areaM2, 'Area m²', { min: 10, max: 5000, fallback: null });
  const price = asNumber(body.price, 'Asking price', { min: 1, max: 50_000_000, fallback: null });
  if (price === null) throw badRequest('Asking price is required.');
  const features = asStringArray(body.features, 'Features', { maxItems: 20 });
  const description = asString(body.description, 'Description', { max: 1500 });
  return {
    market,
    title,
    transaction,
    type,
    city,
    area,
    bedrooms,
    bathrooms,
    areaM2,
    price,
    features,
    description,
  };
}

export function validateId(value, field = 'id') {
  const text = asString(value, field, { max: 100, required: true });
  if (!/^[A-Za-z0-9_-]+$/.test(text)) throw badRequest(`${field} is not valid.`);
  return text;
}
