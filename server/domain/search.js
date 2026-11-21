import { newId } from '../lib/util.js';
import { fold } from './requirements.js';
import { marketListings, canonicalMarket, INVENTORY, SOURCES as DISCOVERY_POOL } from '../seed/market.js';
import { cityKey, priceCheck } from './pricing.js';

/**
 * The AI-assisted search engine.
 *
 * It searches the source catalogue, discovers new sources, extracts listings,
 * rejects off-brief results, collapses cross-posted duplicates, ranks the
 * remaining homes and attaches a comparable-price read to each one. The engine
 * is deterministic for a given catalogue and requirement set, which makes the
 * demo auditable and the tests meaningful.
 */

const ALGARVE = new Set([
  'Lagos', 'Portimão', 'Alvor', 'Praia da Luz', 'Tavira', 'Faro', 'Vilamoura',
  'Albufeira', 'Carvoeiro', 'Loulé', 'Olhão', 'Ferragudo', 'Silves', 'Sagres',
  'Salema', 'Armação de Pêra', 'Quinta do Lago', 'Vale do Lobo',
  'São Brás de Alportel', 'Castro Marim', 'Vila Real de Santo António', 'Monchique',
]);

const LISBON = new Set(['Lisbon', 'Cascais', 'Estoril', 'Oeiras', 'Sintra', 'Comporta']);
const ANDALUSIA = new Set(['Marbella', 'Estepona']);

const NEARBY = {
  Lagos: new Set(['Lagos', 'Praia da Luz']),
  Portimão: new Set(['Portimão', 'Alvor', 'Ferragudo']),
  Tavira: new Set(['Tavira']),
  Faro: new Set(['Faro']),
  Lisbon: new Set(['Lisbon']),
  Cascais: new Set(['Cascais', 'Estoril']),
};

export function regionForCity(city) {
  const key = cityKey(city);
  if (ALGARVE.has(key)) return 'Algarve';
  if (LISBON.has(key)) return 'Lisbon';
  if (ANDALUSIA.has(key)) return 'Andalusia';
  return 'Other';
}

function sourceMatchesRegion(source, regions) {
  if (!regions.length) return source.coverage !== 'Other';
  if (source.coverage === 'Portugal') return true;
  return regions.includes(source.coverage);
}

function locationMatches(listing, requirements) {
  const locations = requirements.locations ?? [];
  if (!locations.length) return true;
  const listingCity = cityKey(listing.city);
  const listingRegion = regionForCity(listing.city);
  for (const location of locations) {
    if (location === 'Algarve') {
      if (listingRegion === 'Algarve') return true;
      continue;
    }
    if (location === 'Lisbon') {
      if (listingCity === 'Lisbon') return true;
      continue;
    }
    if (listingCity === location) return true;
    const nearby = NEARBY[location];
    if (nearby && nearby.has(listingCity)) return true;
    if (location === listingCity) return true;
  }
  return false;
}

function monthValue(value) {
  if (!value) return null;
  const text = String(value);
  if (/^\d{4}-\d{2}/.test(text)) return text.slice(0, 7);
  return null;
}

function availableBy(available, moveIn) {
  if (!available || !moveIn) return true;
  const availableMonth = monthValue(available);
  const wantedMonth = monthValue(moveIn);
  if (!availableMonth || !wantedMonth) return true;
  return availableMonth <= wantedMonth;
}

function hasFeature(features, wanted) {
  const target = fold(wanted);
  return features.some((feature) => fold(feature) === target);
}

function missingFeatures(features, wanted) {
  return wanted.filter((feature) => !hasFeature(features, feature));
}

function scoreMatch(listing, requirements, { locationQuality = 'exact' } = {}) {
  let score = 0;
  const reasons = [];

  score += locationQuality === 'exact' ? 25 : 21;
  reasons.push(`In ${listing.city}`);

  const budget = requirements.budgetMax;
  if (Number.isFinite(budget) && budget > 0) {
    if (listing.price <= budget) {
      score += 20;
      const gap = Math.round(budget - listing.price);
      reasons.push(gap > 0 ? `€${gap.toLocaleString('en-GB')} under budget` : 'On budget');
    } else if (listing.price <= budget * 1.04) {
      score += 14;
      reasons.push(`${Math.round(((listing.price - budget) / budget) * 100)}% over budget`);
    } else {
      score += 8;
      reasons.push(`${Math.round(((listing.price - budget) / budget) * 100)}% over budget`);
    }
  } else {
    score += 12;
  }

  const min = requirements.bedroomsMin;
  const max = requirements.bedroomsMax;
  if (min !== null || max !== null) {
    const beds = Number(listing.bedrooms);
    const lower = min ?? 0;
    const upper = max ?? min;
    if (beds >= lower && beds <= upper) {
      score += 15;
      reasons.push(`${beds} bedrooms`);
    } else if (beds === upper + 1) {
      score += 10;
      reasons.push(`${beds} bedrooms — one more than asked`);
    } else {
      score += 4;
      reasons.push(`${beds} bedrooms`);
    }
  } else {
    score += 10;
  }

  const types = requirements.propertyTypes ?? [];
  if (!types.length) {
    score += 8;
  } else if (types.includes(listing.type)) {
    score += 10;
    reasons.push(titleCase(listing.type));
  } else {
    score += 4;
  }

  const must = requirements.mustHaves ?? [];
  if (must.length) {
    const matched = must.filter((feature) => hasFeature(listing.features, feature));
    score += (matched.length / must.length) * 20;
    if (matched.length) reasons.push(matched.join(' · '));
  } else {
    score += 10;
  }

  const nice = requirements.niceToHaves ?? [];
  if (nice.length) {
    const matched = nice.filter((feature) => hasFeature(listing.features, feature));
    score += (matched.length / nice.length) * 5;
    if (matched.length) reasons.push(matched.join(' · '));
  } else {
    score += 2;
  }

  if (Number.isFinite(listing.listedDaysAgo)) {
    score += Math.max(0, 5 - Math.floor(listing.listedDaysAgo / 10));
  } else {
    score += 2;
  }

  return { score: Math.round(Math.min(100, score)), reasons: [...new Set(reasons)] };
}

function titleCase(value) {
  return String(value).charAt(0).toUpperCase() + String(value).slice(1);
}

function rejectReason(listing, requirements) {
  if (listing.transaction !== requirements.transaction) return 'Wrong transaction type';
  if (!locationMatches(listing, requirements)) return 'Outside the requested area';

  const budget = requirements.budgetMax;
  if (Number.isFinite(budget) && budget > 0 && listing.price > budget * 1.08) {
    return `${Math.round(((listing.price - budget) / budget) * 100)}% over budget`;
  }

  const types = requirements.propertyTypes ?? [];
  if (types.length && !types.includes(listing.type)) {
    return `Not a ${types.join(' or ')}`;
  }

  const beds = Number(listing.bedrooms);
  const min = requirements.bedroomsMin;
  const max = requirements.bedroomsMax;
  if (min !== null && min !== undefined && Number.isFinite(beds) && beds < min - 1) {
    return `Only ${beds} bedrooms`;
  }
  if (max !== null && max !== undefined && Number.isFinite(beds) && beds > max + 1) {
    return `${beds} bedrooms — more than asked`;
  }

  const missing = missingFeatures(listing.features, requirements.mustHaves ?? []);
  if (missing.length) return `Missing ${missing.join(' + ')}`;

  if (requirements.transaction === 'rent' && !availableBy(listing.available, requirements.moveIn)) {
    return 'Available after the requested move-in date';
  }
  return null;
}

function queryLabels(requirements) {
  const location = requirements.locations?.[0] || 'Portugal';
  const type = requirements.propertyTypes?.[0] || 'property';
  const beds = requirements.bedroomsMin ? `${requirements.bedroomsMin}-bed ` : '';
  const budget = requirements.budgetMax
    ? ` under €${Math.round(requirements.budgetMax).toLocaleString('en-GB')}`
    : '';
  return [
    `${beds}${type} ${requirements.transaction === 'rent' ? 'to rent' : 'for sale'} in ${location}${budget}`,
    `${(requirements.mustHaves ?? []).slice(0, 2).join(' ') || 'long let'} ${location} ${requirements.transaction === 'rent' ? 'monthly' : 'asking price'}`,
  ];
}

function selectSources(requirements, sources, { max = 12 } = {}) {
  const regions = requirements.regions ?? [];
  const eligible = sources
    .filter((source) => source.enabled !== false)
    .filter((source) => sourceMatchesRegion(source, regions))
    .sort((a, b) => b.reliability - a.reliability);
  return eligible.slice(0, max);
}

function pickDiscoveries(requirements, sources, { max = 2 } = {}) {
  const regions = requirements.regions ?? [];
  const existing = new Set(sources.map((source) => source.domain));
  return sourcesFromPool()
    .filter((source) => source.discovery)
    .filter((source) => !existing.has(source.domain))
    .filter((source) => sourceMatchesRegion(source, regions))
    .sort((a, b) => b.reliability - a.reliability)
    .slice(0, max);
}

// Discovery candidates come from the same seed catalogue, but are absent from
// the seeded source table until a run surfaces them.
function sourcesFromPool() {
  return DISCOVERY_POOL;
}

function toListing(candidate) {
  return {
    id: newId('lst'),
    sourceId: candidate.sourceId,
    externalRef: candidate.reference,
    origin: 'search',
    title: candidate.title,
    transaction: candidate.transaction,
    type: candidate.type,
    city: candidate.city,
    cityKey: candidate.cityKey ?? cityKey(candidate.city),
    area: candidate.area,
    bedrooms: candidate.bedrooms,
    bathrooms: candidate.bathrooms,
    areaM2: candidate.areaM2,
    price: candidate.price,
    period: candidate.transaction === 'rent' ? 'month' : 'total',
    features: candidate.features,
    description: candidate.blurb,
    agent: candidate.agent ?? candidate.sourceName,
    available: candidate.available,
    image: candidate.image,
    confidence: Math.round((candidate.reliability ?? 0.8) * 100) / 100,
    listedDaysAgo: candidate.listedDaysAgo,
    fingerprint: candidate.cluster,
    duplicateGroup: candidate.cluster,
    canonical: true,
    mirrorCount: 0,
    mirrorNote: null,
    matchScore: null,
    matchReasons: [],
    rejectReason: null,
    included: false,
    rank: null,
    priceCheck: null,
    originSourceName: candidate.sourceName,
  };
}

function buildQueries(requirements, sources) {
  const labels = queryLabels(requirements);
  const queries = [];
  for (const source of sources) {
    for (const label of labels) {
      queries.push({ sourceId: source.id, sourceName: source.name, label: `site:${source.domain} ${label}` });
    }
  }
  return queries;
}

/**
 * Prepare a full search result without touching the database. The orchestrator
 * streams it; the demo seeder persists the same structure.
 */
export function prepareSearch({ requirements, sources, caseIteration = 1 }) {
  const selected = selectSources(requirements, sources);
  const discoveries = pickDiscoveries(requirements, sources);
  const activeSources = [...selected, ...discoveries.map((source) => ({ ...source, enabled: true }))];
  const queries = buildQueries(requirements, activeSources);
  const activeIds = new Set(activeSources.map((source) => source.id));

  const candidates = marketListings().filter((listing) => {
    if (!activeIds.has(listing.sourceId)) return false;
    if (listing.transaction !== requirements.transaction) return false;
    const regions = requirements.regions ?? [];
    if (regions.length && !regions.includes(regionForCity(listing.city))) return false;
    return true;
  });

  const sourceCounts = new Map();
  for (const candidate of candidates) {
    sourceCounts.set(candidate.sourceId, (sourceCounts.get(candidate.sourceId) || 0) + 1);
  }

  const extracted = candidates.map(toListing);
  const eligible = [];
  const rejected = [];
  for (const listing of extracted) {
    const reason = rejectReason(listing, requirements);
    if (reason) {
      listing.rejectReason = reason;
      listing.canonical = false;
      rejected.push(listing);
    } else {
      eligible.push(listing);
    }
  }

  // Collapse cross-posted duplicates: pick the most reliable copy, keep the
  // others as evidence and surface the price range.
  const groups = new Map();
  for (const listing of eligible) {
    const key = listing.fingerprint;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(listing);
  }
  const canonical = [];
  const duplicates = [];
  for (const [, group] of groups) {
    const sorted = [...group].sort((a, b) => {
      const sourceA = activeSources.find((source) => source.id === a.sourceId);
      const sourceB = activeSources.find((source) => source.id === b.sourceId);
      return (sourceB?.reliability ?? 0) - (sourceA?.reliability ?? 0) || a.price - b.price;
    });
    const primary = sorted[0];
    const prices = sorted.map((item) => item.price);
    primary.mirrorCount = sorted.length - 1;
    primary.mirrorNote =
      sorted.length > 1
        ? `${sorted.length} copies · €${Math.min(...prices).toLocaleString('en-GB')}–€${Math.max(...prices).toLocaleString('en-GB')} · ${sorted
            .map((item) => activeSources.find((source) => source.id === item.sourceId)?.name ?? 'Source')
            .join(', ')}`
        : null;
    const scored = scoreMatch(primary, requirements);
    primary.matchScore = scored.score;
    primary.matchReasons = scored.reasons;
    primary.canonical = true;
    canonical.push(primary);
    for (const duplicate of sorted.slice(1)) {
      duplicate.canonical = false;
      duplicate.matchScore = scored.score;
      duplicate.matchReasons = scored.reasons;
      duplicates.push(duplicate);
    }
  }

  // Rejected copies of the same listing should not inflate the extracted count;
  // store one canonical rejection per duplicate group.
  const rejectedGroups = new Map();
  for (const listing of rejected) {
    if (!rejectedGroups.has(listing.fingerprint)) rejectedGroups.set(listing.fingerprint, listing);
  }
  const rejectedUnique = [...rejectedGroups.values()];

  canonical.sort((a, b) => b.matchScore - a.matchScore || a.price - b.price);
  const longList = canonical.filter((listing) => listing.matchScore >= 50).slice(0, 12);
  longList.forEach((listing, index) => {
    listing.included = true;
    listing.rank = index + 1;
  });
  for (const listing of canonical) {
    if (!listing.included) {
      listing.rejectReason = listing.rejectReason || 'Below the long-list match threshold';
    }
  }

  // Price intelligence: compare each candidate with the whole canonical market,
  // not only the homes that happen to fit this brief. A comparable is a similar
  // home, not another search result.
  const pricePool = canonicalMarket();
  for (const listing of canonical) {
    listing.priceCheck = priceCheck(
      {
        id: listing.id,
        cluster: listing.fingerprint,
        city: listing.city,
        type: listing.type,
        transaction: listing.transaction,
        bedrooms: listing.bedrooms,
        areaM2: listing.areaM2,
        price: listing.price,
        features: listing.features,
        listedDaysAgo: listing.listedDaysAgo,
      },
      pricePool
    );
  }
  const priced = canonical.filter((listing) => listing.priceCheck?.available);
  const aboveMarket = priced.filter((listing) => listing.priceCheck.verdict === 'above').length;
  const belowMarket = priced.filter((listing) => listing.priceCheck.verdict === 'below').length;
  const atMarket = priced.length - aboveMarket - belowMarket;

  const stats = {
    sourcesQueried: activeSources.length,
    queries: queries.length,
    extracted: extracted.length,
    offBrief: rejected.length,
    duplicates: duplicates.length,
    uniqueListings: canonical.length,
    uniqueRejected: rejectedUnique.length,
    longList: longList.length,
    discovered: discoveries.length,
    priceChecked: priced.length,
    aboveMarket,
    belowMarket,
    atMarket,
    coverage: requirements.regions?.join(' + ') || 'Portugal',
    iteration: caseIteration,
    comparisons: canonical.reduce((sum, listing) => sum + (listing.priceCheck?.count || 0), 0),
  };

  return {
    requirements,
    sources: activeSources,
    selectedSourceIds: activeSources.map((source) => source.id),
    discoveries,
    queries,
    sourceCounts: [...sourceCounts.entries()].map(([sourceId, count]) => ({
      sourceId,
      sourceName: activeSources.find((source) => source.id === sourceId)?.name ?? 'Source',
      count,
    })),
    listings: [...canonical, ...duplicates, ...rejectedUnique],
    canonical,
    duplicates,
    rejected: rejectedUnique,
    longList,
    stats,
    coverageLabel: requirements.regions?.length
      ? requirements.regions.join(' + ')
      : 'Portugal',
    searchSummary: {
      sources: activeSources.length,
      homes: canonical.length,
      longList: longList.length,
      aboveMarket,
      belowMarket,
      atMarket,
    },
  };
}

export function describeSearchSteps(result) {
  const steps = [];
  const stats = result.stats;
  steps.push({
    phase: 'catalogue',
    message: 'Loaded the master source catalogue',
    detail: `${result.sources.length - result.discoveries.length} active sources · seed list and discovered agencies · ${stats.coverage} coverage`,
  });
  steps.push({
    phase: 'plan',
    message: `Planned a ${result.coverageLabel} ${result.requirements.transaction === 'rent' ? 'long-let' : 'sales'} search`,
    detail: `${result.sources.length} sources · ${result.queries.length} queries · ${result.requirements.propertyTypes?.join(' / ') || 'all property types'}`,
  });
  const sourceResults = result.sourceCounts;
  for (const source of sourceResults) {
    steps.push({
      phase: 'search',
      message: `Queried ${source.sourceName}`,
      detail: `${source.count} result${source.count === 1 ? '' : 's'} returned`,
    });
  }
  for (const discovery of result.discoveries) {
    steps.push({
      phase: 'discover',
      message: `Discovered ${discovery.name}`,
      detail: `${discovery.domain} · ${discovery.coverage} · added to the source catalogue`,
      level: 'discovery',
    });
  }
  steps.push({
    phase: 'extract',
    message: `Extracted ${stats.extracted} listing candidates`,
    detail: 'Structured fields, asking price, size, features and availability captured',
  });
  steps.push({
    phase: 'filter',
    message: `${stats.uniqueListings} unique homes are on brief`,
    detail: `${stats.offBrief} results excluded — ${summariseRejections(result.rejected)}`,
  });
  steps.push({
    phase: 'dedupe',
    message: `Collapsed ${stats.duplicates} cross-posted mirrors`,
    detail: `${stats.uniqueListings} unique homes remain · ${stats.duplicates} duplicate copies retained as evidence`,
  });
  steps.push({
    phase: 'rank',
    message: `Ranked the shortlist candidates`,
    detail: `${stats.uniqueListings} homes scored · ${stats.longList} made the long list`,
  });
  steps.push({
    phase: 'price',
    message: 'Price-checked every long-list home',
    detail: `${stats.priceChecked} comparable sets built · ${stats.aboveMarket} above market · ${stats.atMarket} at market · ${stats.belowMarket} below`,
    level: 'insight',
  });
  steps.push({
    phase: 'catalogue',
    message: 'Updated the source catalogue and search history',
    detail: `${stats.discovered} new source${stats.discovered === 1 ? '' : 's'} retained · ${result.sources.length} sources refreshed for the next search`,
    level: 'success',
  });
  steps.push({
    phase: 'complete',
    message: 'Long list ready for human review',
    detail: `${stats.longList} homes and ${stats.priceChecked} price checks handed to the property finder team`,
    level: 'success',
  });
  return steps;
}

function summariseRejections(rejected) {
  const counts = new Map();
  for (const listing of rejected) {
    const reason = listing.rejectReason || 'Off brief';
    counts.set(reason, (counts.get(reason) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([reason, count]) => `${reason} (${count})`)
    .join(', ');
}

// ---------------------------------------------------------------------------
// Inventory check

function normaliseInventoryItem(item) {
  return {
    id: item.id,
    system: item.system,
    ref: item.ref,
    title: item.title,
    type: item.type,
    city: item.city,
    area: item.area,
    bedrooms: Number(item.bedrooms),
    bathrooms: Number(item.bathrooms),
    areaM2: Number(item.area_m2 ?? item.areaM2),
    rent: Number(item.rent),
    availableFrom: item.available_from ?? item.availableFrom ?? null,
    status: item.status,
    seniorFriendly: Boolean(item.senior_friendly ?? item.seniorFriendly),
    features: Array.isArray(item.features) ? item.features : [],
    description: item.description,
    image: item.image,
  };
}

export function checkInventory(requirements, inventory = INVENTORY) {
  inventory = inventory.map(normaliseInventoryItem);
  if (requirements.transaction === 'sale') {
    return {
      outcome: 'not_applicable',
      score: null,
      reasons: ['Existing inventory is rental-only. Sales briefs move straight to the AI-assisted search.'],
      matches: [],
    };
  }

  const rows = [];
  for (const item of inventory) {
    const listing = {
      id: item.id,
      city: item.city,
      type: item.type,
      transaction: 'rent',
      bedrooms: item.bedrooms,
      areaM2: item.areaM2,
      price: item.rent,
      features: item.features,
      available: item.availableFrom,
      listedDaysAgo: 4,
    };
    const locationOk = locationMatches(listing, requirements);
    const budgetOk =
      !Number.isFinite(requirements.budgetMax) ||
      item.rent <= requirements.budgetMax * 1.08;
    const bedMin = requirements.bedroomsMin;
    const bedMax = requirements.bedroomsMax;
    const bedsOk =
      (bedMin === null || bedMin === undefined || item.bedrooms >= Math.max(0, bedMin - 1)) &&
      (bedMax === null || bedMax === undefined || item.bedrooms <= bedMax + 1);
    const missing = missingFeatures(item.features, requirements.mustHaves ?? []);
    const available = item.status === 'available' && availableBy(item.availableFrom, requirements.moveIn);
    const reasons = [];
    if (!locationOk) reasons.push('Outside the requested area');
    const budgetPct = Number.isFinite(requirements.budgetMax) && requirements.budgetMax > 0
      ? Math.round(((item.rent - requirements.budgetMax) / requirements.budgetMax) * 100)
      : 0;
    if (!budgetOk) reasons.push(`${budgetPct}% over budget`);
    if (!bedsOk) reasons.push('Bedroom count outside tolerance');
    if (missing.length) reasons.push(`Missing ${missing.join(' + ')}`);
    if (item.status !== 'available') reasons.push(`Currently ${item.status}`);
    else if (!available) reasons.push('Available after the requested move-in date');
    if (reasons.length) {
      rows.push({ item, eligible: false, reasons, score: 0, locationOk, available, budgetPct });
      continue;
    }
    const scored = scoreMatch(listing, requirements);
    rows.push({ item, eligible: true, reasons: scored.reasons, score: scored.score, locationOk, available });
  }

  const eligible = rows.filter((row) => row.eligible).sort((a, b) => b.score - a.score);
  const relevantRows = [...rows].sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    if (a.locationOk !== b.locationOk) return a.locationOk ? -1 : 1;
    if (a.available !== b.available) return a.available ? -1 : 1;
    if (a.locationOk && b.locationOk && a.item.city !== b.item.city) return 0;
    return Math.abs(a.budgetPct || 0) - Math.abs(b.budgetPct || 0);
  });
  const matches = (eligible.length ? eligible : relevantRows)
    .slice(0, 3)
    .map((row) => ({
      inventoryId: row.item.id,
      ref: row.item.ref,
      system: row.item.system,
      title: row.item.title,
      type: row.item.type,
      city: row.item.city,
      area: row.item.area,
      bedrooms: row.item.bedrooms,
      bathrooms: row.item.bathrooms,
      areaM2: row.item.areaM2,
      rent: row.item.rent,
      availableFrom: row.item.availableFrom,
      status: row.item.status,
      seniorFriendly: row.item.seniorFriendly,
      features: row.item.features,
      description: row.item.description,
      image: row.item.image,
      eligible: row.eligible,
      score: row.score,
      reasons: row.reasons,
    }));

  const best = eligible[0];
  const suitable = Boolean(best && best.score >= 65);
  const outcome = suitable ? 'suitable' : 'gap';
  let reasons;
  if (suitable) {
    reasons = [
      `${eligible.length} available ${eligible.length === 1 ? 'home' : 'homes'} in existing inventory meet the hard requirements.`,
      'Human review can start with inventory before any external search.',
    ];
  } else if (eligible.length) {
    reasons = [
      'Available inventory is close, but none clears the suitability threshold strongly enough.',
      ...eligible.slice(0, 2).map((row) => `${row.item.ref}: ${row.reasons.slice(0, 2).join(' · ')}`),
    ];
  } else {
    reasons = [
      'No available inventory home meets the hard requirements.',
      ...rows
        .filter((row) => row.reasons.length)
        .slice(0, 3)
        .map((row) => `${row.item.ref}: ${row.reasons.join(' · ')}`),
    ];
  }

  return {
    outcome,
    score: best?.score ?? 0,
    reasons,
    matches,
    eligibleCount: eligible.length,
    checked: rows.length,
  };
}

export function inventoryMatchesToListings(check, requirements) {
  return check.matches
    .filter((match) => match.eligible)
    .map((match) => ({
      id: newId('lst'),
      sourceId: null,
      externalRef: match.ref,
      origin: 'inventory',
      title: match.title,
      transaction: 'rent',
      type: match.type,
      city: match.city,
      cityKey: cityKey(match.city),
      area: match.area,
      bedrooms: match.bedrooms,
      bathrooms: match.bathrooms,
      areaM2: match.areaM2,
      price: match.rent,
      period: 'month',
      features: match.features,
      description: match.description,
      agent: match.system,
      available: match.availableFrom,
      image: match.image,
      confidence: 0.98,
      fingerprint: match.inventoryId,
      duplicateGroup: match.inventoryId,
      canonical: true,
      mirrorCount: 0,
      mirrorNote: null,
      matchScore: match.score,
      matchReasons: match.reasons,
      rejectReason: null,
      included: true,
      rank: null,
      priceCheck: null,
      originSourceName: match.system,
      isInventory: true,
      published: false,
    }));
}
