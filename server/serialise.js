import { parseJson } from './lib/util.js';

function nullDate(value) {
  return value || null;
}

export function serialiseClient(client) {
  if (!client) return null;
  return {
    id: client.id,
    name: client.name,
    email: client.email,
    phone: client.phone,
    source: client.source,
    notes: client.notes,
    createdAt: client.created_at,
  };
}

export function serialiseCase(row) {
  if (!row) return null;
  return {
    id: row.id,
    ref: row.ref,
    clientId: row.client_id,
    client: serialiseClient(row.client || {
      id: row.client_id,
      name: row.client_name,
      email: row.client_email,
      phone: row.client_phone,
    }),
    transaction: row.transaction,
    stage: row.stage,
    status: row.status,
    iteration: Number(row.iteration || 1),
    owner: row.owner,
    priority: row.priority,
    summary: row.summary,
    nextAction: row.next_action,
    source: row.source,
    currentRequirementsId: row.current_requirements_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    stageChangedAt: row.stage_changed_at,
    sharedAt: nullDate(row.shared_at),
    closedAt: nullDate(row.closed_at),
  };
}

export function serialiseRequirement(row) {
  if (!row) return null;
  return {
    id: row.id,
    caseId: row.case_id,
    version: Number(row.version || 1),
    brief: row.brief,
    transaction: row.transaction,
    propertyTypes: parseJson(row.property_types, []),
    locations: parseJson(row.locations, []),
    regions: parseJson(row.regions, []),
    budgetMin: row.budget_min === null ? null : Number(row.budget_min),
    budgetMax: row.budget_max === null ? null : Number(row.budget_max),
    currency: row.currency,
    bedroomsMin: row.bedrooms_min === null ? null : Number(row.bedrooms_min),
    bedroomsMax: row.bedrooms_max === null ? null : Number(row.bedrooms_max),
    bathroomsMin: row.bathrooms_min === null ? null : Number(row.bathrooms_min),
    tenure: row.tenure,
    moveIn: row.move_in,
    mustHaves: parseJson(row.must_haves, []),
    niceToHaves: parseJson(row.nice_to_haves, []),
    notes: row.notes,
    confidence: Number(row.confidence || 0),
    assumptions: parseJson(row.assumptions, []),
    confirmedBy: row.confirmed_by,
    confirmedAt: row.confirmed_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export function serialiseSource(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    domain: row.domain,
    kind: row.kind,
    coverage: row.coverage,
    country: row.country,
    enabled: Boolean(row.enabled),
    discoveredBy: row.discovered_by,
    reliability: Number(row.reliability || 0),
    notes: row.notes,
    timesUsed: Number(row.times_used || 0),
    lastUsedAt: row.last_used_at,
    discoveredAt: row.discovered_at,
    createdAt: row.created_at,
  };
}

export function serialiseInventory(row) {
  if (!row) return null;
  return {
    id: row.id,
    system: row.system,
    ref: row.ref,
    title: row.title,
    type: row.type,
    city: row.city,
    area: row.area,
    bedrooms: Number(row.bedrooms),
    bathrooms: Number(row.bathrooms),
    areaM2: Number(row.area_m2),
    rent: Number(row.rent),
    availableFrom: row.available_from,
    status: row.status,
    seniorFriendly: Boolean(row.senior_friendly),
    features: parseJson(row.features, []),
    description: row.description,
    image: row.image,
    updatedAt: row.updated_at,
  };
}

export function serialiseRun(row) {
  if (!row) return null;
  return {
    id: row.id,
    caseId: row.case_id,
    requirementsId: row.requirements_id,
    kind: row.kind,
    iteration: Number(row.iteration || 1),
    status: row.status,
    phase: row.phase,
    progress: Number(row.progress || 0),
    stats: parseJson(row.stats, null),
    error: row.error,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms === null ? null : Number(row.duration_ms),
  };
}

export function serialiseStep(row) {
  if (!row) return null;
  return {
    seq: Number(row.seq),
    phase: row.phase,
    level: row.level,
    message: row.message,
    detail: row.detail,
    ts: row.ts,
    elapsedMs: Number(row.elapsed_ms || 0),
  };
}

export function serialiseListing(row, sourceMap = new Map()) {
  if (!row) return null;
  const source = row.source_id ? sourceMap.get(row.source_id) : null;
  return {
    id: row.id,
    runId: row.run_id,
    sourceId: row.source_id,
    sourceName: source?.name || row.agent || (row.origin === 'inventory' ? 'Existing inventory' : 'Source'),
    origin: row.origin,
    externalRef: row.external_ref,
    title: row.title,
    transaction: row.transaction,
    type: row.type,
    city: row.city,
    area: row.area,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    areaM2: row.area_m2,
    price: Number(row.price),
    currency: row.currency,
    period: row.period,
    features: parseJson(row.features, []),
    description: row.description,
    agent: row.agent,
    available: row.available,
    image: row.image,
    confidence: Number(row.confidence || 0),
    canonical: Boolean(row.canonical),
    mirrorCount: Number(row.mirror_count || 0),
    mirrorNote: row.mirror_note,
    matchScore: row.match_score === null ? null : Number(row.match_score),
    matchReasons: parseJson(row.match_reasons, []),
    rejectReason: row.reject_reason,
    included: Boolean(row.included),
    rank: row.rank,
    priceCheck: parseJson(row.price_check, null),
    decision: row.decision,
    decisionNote: row.decision_note,
  };
}

export function serialiseShortlist(row, items = []) {
  if (!row) return null;
  return {
    id: row.id,
    caseId: row.case_id,
    runId: row.run_id,
    version: Number(row.version || 1),
    token: row.token,
    status: row.status,
    summary: row.summary,
    createdBy: row.created_by,
    sharedAt: row.shared_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: items.map((item) => ({
      id: item.id,
      listingId: item.listing_id,
      position: Number(item.position),
      rationale: item.rationale,
      clientDecision: item.client_decision,
      clientComment: item.client_comment,
      createdAt: item.created_at,
      listing: item.listing ?? null,
    })),
  };
}

export function serialiseFeedback(row) {
  if (!row) return null;
  return {
    id: row.id,
    caseId: row.case_id,
    shortlistId: row.shortlist_id,
    overall: row.overall,
    comment: row.comment,
    submittedBy: row.submitted_by,
    createdAt: row.created_at,
  };
}

export function serialiseEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    caseId: row.case_id,
    type: row.type,
    actor: row.actor,
    message: row.message,
    detail: parseJson(row.detail, null),
    ts: row.ts,
    caseRef: row.case_ref,
    clientName: row.client_name,
  };
}

export function serialiseInventoryCheck(row) {
  if (!row) return null;
  return {
    id: row.id,
    caseId: row.case_id,
    requirementsId: row.requirements_id,
    outcome: row.outcome,
    score: row.score === null ? null : Number(row.score),
    reasons: parseJson(row.reasons, []),
    matches: parseJson(row.matches, []),
    createdAt: row.created_at,
  };
}

export function serialisePortfolio(row) {
  if (!row) return null;
  return {
    id: row.id,
    ref: row.ref,
    title: row.title,
    transaction: row.transaction,
    type: row.type,
    city: row.city,
    neighborhood: row.neighborhood,
    region: row.region,
    country: row.country,
    bedrooms: Number(row.bedrooms),
    bathrooms: Number(row.bathrooms),
    areaM2: Number(row.area_m2),
    price: Number(row.price),
    currency: row.currency,
    period: row.period,
    features: parseJson(row.features, []),
    blurb: row.blurb,
    image: row.image,
  };
}


export function serialiseComparison(row) {
  if (!row) return null;
  return {
    id: row.id,
    ref: row.ref,
    mode: row.mode,
    subjectSource: row.subject_source,
    portfolioId: row.portfolio_id,
    subject: {
      source: row.subject_source,
      portfolioId: row.portfolio_id,
      ref: row.subject_ref || (row.subject_source === 'manual' ? 'Your listing' : row.portfolio_id),
      title: row.title,
      transaction: row.transaction,
      type: row.type,
      city: row.city,
      area: row.area,
      bedrooms: row.bedrooms,
      bathrooms: row.bathrooms,
      areaM2: row.area_m2,
      price: Number(row.price),
      currency: row.currency,
      period: row.period,
      features: parseJson(row.features, []),
      image: row.image,
      description: row.description,
      url: row.url,
    },
    status: row.status,
    stats: parseJson(row.stats, null),
    report: parseJson(row.report, null),
    error: row.error,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms === null ? null : Number(row.duration_ms),
  };
}

export function serialiseComparisonStep(row) {
  if (!row) return null;
  return {
    seq: Number(row.seq),
    phase: row.phase,
    level: row.level,
    message: row.message,
    detail: row.detail,
    ts: row.ts,
    elapsedMs: Number(row.elapsed_ms || 0),
  };
}

export function serialiseComparisonSummary(row) {
  const data = serialiseComparison(row);
  if (!data) return null;
  const stats = data.stats || {};
  return {
    id: data.id,
    ref: data.ref,
    mode: data.mode,
    status: data.status,
    subject: data.subject,
    stats: {
      comps: stats.comps ?? 0,
      median: stats.median ?? null,
      deltaPct: stats.deltaPct ?? null,
      verdict: stats.verdict || 'unknown',
      confidence: stats.confidence || 'none',
      suggestedPrice: stats.suggestedPrice ?? null,
      competitors: stats.competitors ?? 0,
    },
    createdAt: data.createdAt,
    durationMs: data.durationMs,
    error: data.error,
  };
}
