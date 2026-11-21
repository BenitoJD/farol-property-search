import { median, pctChange, percentileRank, summarizePrices } from '../lib/stats.js';
import { fold } from './requirements.js';

/**
 * Comparable-market pricing. The same engine powers two views:
 *  - a buyer check on a search result or shortlist item ("is this ask fair?");
 *  - a portfolio benchmark on Property Buy or Rent's own stock.
 *
 * It is an indicative analysis from asking prices, not a valuation and not a
 * statement of availability.
 */

const MIN_SCORE = 50;
const MARKET_CORRIDOR = 7;

const CITY_KEYS = {
  'praia da luz': 'Lagos',
  'meia praia': 'Lagos',
  alvor: 'Portimão',
  ferragudo: 'Portimão',
  lisboa: 'Lisbon',
  estoril: 'Cascais',
};

export function cityKey(city) {
  const folded = fold(city);
  return CITY_KEYS[folded] || city;
}

const TYPE_COMPATIBILITY = {
  apartment: { apartment: 1, penthouse: 0.8 },
  penthouse: { penthouse: 1, apartment: 0.8 },
  townhouse: { townhouse: 1, house: 0.85 },
  house: { house: 1, townhouse: 0.85, villa: 0.72 },
  villa: { villa: 1, house: 0.8, quinta: 0.7 },
  quinta: { quinta: 1, villa: 0.7 },
};

export function typeCompatibility(a, b) {
  return TYPE_COMPATIBILITY[a]?.[b] ?? 0;
}

function featureKey(feature) {
  return fold(feature).replace(/[^a-z0-9]+/g, ' ').trim();
}

export function featureOverlap(a = [], b = []) {
  const left = new Set(a.map(featureKey));
  const right = new Set(b.map(featureKey));
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const item of left) if (right.has(item)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

function roundTo(value, step) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value / step) * step;
}

function step(transaction) {
  return transaction === 'sale' ? 1000 : 25;
}

function comparableScore(target, candidate) {
  if (!candidate || target.id === candidate.id) return null;
  if ((target.fingerprint || target.cluster) && candidate.cluster === (target.fingerprint || target.cluster)) return null;
  if (candidate.transaction !== target.transaction) return null;
  const typeScore = typeCompatibility(target.type, candidate.type);
  if (!typeScore) return null;
  if (fold(cityKey(candidate.city)) !== fold(cityKey(target.city))) return null;

  if (
    Number.isFinite(target.bedrooms) &&
    Number.isFinite(candidate.bedrooms) &&
    Math.abs(target.bedrooms - candidate.bedrooms) > 1
  ) {
    return null;
  }

  const targetArea = Number(target.areaM2);
  const candidateArea = Number(candidate.areaM2);
  let areaScore = 0.55;
  if (Number.isFinite(targetArea) && Number.isFinite(candidateArea) && targetArea > 0) {
    const ratio = candidateArea / targetArea;
    if (ratio < 0.62 || ratio > 1.6) return null;
    areaScore = Math.max(0, 1 - Math.abs(candidateArea - targetArea) / targetArea);
  }

  const bedScore = Number.isFinite(target.bedrooms) && Number.isFinite(candidate.bedrooms)
    ? Math.max(0, 1 - Math.abs(candidate.bedrooms - target.bedrooms) / 2)
    : 0.6;
  const featureScore = featureOverlap(target.features || [], candidate.features || []);
  const recencyScore = Number.isFinite(candidate.listedDaysAgo)
    ? Math.max(0, 1 - Math.min(candidate.listedDaysAgo, 60) / 90)
    : 0.6;

  const score = 100 * (0.42 * areaScore + 0.26 * bedScore + 0.18 * featureScore + 0.14 * recencyScore);
  const weighted = score * (0.75 + 0.25 * typeScore);
  if (weighted < MIN_SCORE) return null;
  return Math.round(weighted);
}

function collectComparables(target, pool, { allowTypeBroadening = true } = {}) {
  const rows = [];
  for (const candidate of pool) {
    const score = comparableScore(target, candidate);
    if (score === null) continue;
    rows.push({ candidate, score });
  }
  rows.sort((a, b) => b.score - a.score);
  if (allowTypeBroadening && rows.length < 3) {
    // A thin set of identical types is less useful than a slightly broader but
    // clearly labelled comparable set. The UI always states the composition.
    for (const candidate of pool) {
      if (candidate.id === target.id) continue;
      if ((target.fingerprint || target.cluster) && candidate.cluster === (target.fingerprint || target.cluster)) continue;
      if (rows.some((row) => row.candidate.id === candidate.id)) continue;
      if (candidate.transaction !== target.transaction) continue;
      if (fold(cityKey(candidate.city)) !== fold(cityKey(target.city))) continue;
      if (typeCompatibility(target.type, candidate.type) < 0.8) continue;
      if (
        Number.isFinite(target.bedrooms) &&
        Number.isFinite(candidate.bedrooms) &&
        Math.abs(target.bedrooms - candidate.bedrooms) > 1
      ) continue;
      const targetArea = Number(target.areaM2);
      const candidateArea = Number(candidate.areaM2);
      if (Number.isFinite(targetArea) && Number.isFinite(candidateArea)) {
        const ratio = candidateArea / targetArea;
        if (ratio < 0.7 || ratio > 1.5) continue;
      }
      rows.push({ candidate, score: MIN_SCORE });
    }
    rows.sort((a, b) => b.score - a.score);
  }
  return rows.slice(0, 12);
}

function pricePerM2(price, areaM2) {
  const area = Number(areaM2);
  if (!Number.isFinite(area) || area <= 0) return null;
  return Math.round(price / area);
}

/**
 * Compare one asking price with the comparable set.
 * deltaPct > 0 means the target is more expensive than the median.
 */
export function priceCheck(target, pool = []) {
  const rows = collectComparables(target, pool);
  const prices = rows.map((row) => row.candidate.price).filter((value) => Number.isFinite(value));
  const stats = summarizePrices(prices);

  if (!stats || stats.count === 0) {
    return {
      available: false,
      count: 0,
      verdict: 'unknown',
      verdictLabel: 'No comparable evidence',
      confidence: 'none',
      median: null,
      p25: null,
      p75: null,
      pricePerM2: pricePerM2(target.price, target.areaM2),
      medianPerM2: null,
      deltaPct: null,
      percentile: null,
      suggestedOffer: null,
      offerLow: null,
      offerHigh: null,
      potentialSaving: null,
      comparables: [],
      summary: 'No comparable asking prices were captured in this search.',
    };
  }

  const deltaPct = Number(pctChange(stats.median, target.price).toFixed(1));
  const verdict = deltaPct > MARKET_CORRIDOR ? 'above' : deltaPct < -MARKET_CORRIDOR ? 'below' : 'at';
  const verdictLabel =
    verdict === 'above' ? 'Above market' : verdict === 'below' ? 'Below market' : 'At market';
  const confidence = stats.count >= 6 ? 'high' : stats.count >= 3 ? 'medium' : 'low';
  const band = step(target.transaction);
  const suggestedOffer = verdict === 'above' ? roundTo(stats.median, band) : null;
  const offerLow = verdict === 'above' ? roundTo(stats.p25, band) : null;
  const offerHigh = verdict === 'above' ? roundTo(stats.median, band) : null;
  const potentialSaving = verdict === 'above' ? Math.max(0, target.price - stats.median) : 0;
  const targetPerM2 = pricePerM2(target.price, target.areaM2);
  const compsPerM2 = rows
    .map((row) => pricePerM2(row.candidate.price, row.candidate.areaM2))
    .filter((value) => Number.isFinite(value));
  const medianPerM2 = median(compsPerM2);

  const basis = `${stats.count} comparable ${
    stats.count === 1 ? 'home' : 'homes'
  } in ${target.city}`;
  const priceUnit = target.transaction === 'sale' ? '' : '/month';
  const summary =
    verdict === 'above'
      ? `${Math.abs(deltaPct).toFixed(1)}% above the median of ${basis} (€${stats.median.toLocaleString('en-GB')}${priceUnit}).`
      : verdict === 'below'
        ? `${Math.abs(deltaPct).toFixed(1)}% below the median of ${basis} (€${stats.median.toLocaleString('en-GB')}${priceUnit}).`
        : `Within ${MARKET_CORRIDOR}% of the median of ${basis} (€${stats.median.toLocaleString('en-GB')}${priceUnit}).`;

  return {
    available: true,
    count: stats.count,
    verdict,
    verdictLabel,
    confidence,
    median: stats.median,
    p25: stats.p25,
    p75: stats.p75,
    min: stats.min,
    max: stats.max,
    pricePerM2: targetPerM2,
    medianPerM2: Number.isFinite(medianPerM2) ? Math.round(medianPerM2) : null,
    deltaPct,
    percentile: percentileRank(prices, target.price),
    suggestedOffer,
    offerLow,
    offerHigh,
    potentialSaving,
    corridor: MARKET_CORRIDOR,
    comparables: rows.map((row) => ({
      id: row.candidate.id,
      cluster: row.candidate.cluster || null,
      title: row.candidate.title,
      sourceName: row.candidate.sourceName,
      sourceId: row.candidate.sourceId,
      sourceDomain: row.candidate.sourceDomain || null,
      sourceKind: row.candidate.sourceKind || null,
      sourceReliability: row.candidate.reliability ?? null,
      reference: row.candidate.reference || null,
      city: row.candidate.city,
      area: row.candidate.area,
      type: row.candidate.type,
      bedrooms: row.candidate.bedrooms,
      bathrooms: row.candidate.bathrooms ?? null,
      areaM2: row.candidate.areaM2,
      price: row.candidate.price,
      pricePerM2: pricePerM2(row.candidate.price, row.candidate.areaM2),
      deltaPct: Number(pctChange(stats.median, row.candidate.price).toFixed(1)),
      matchScore: row.score,
      listedDaysAgo: row.candidate.listedDaysAgo,
      features: row.candidate.features || [],
      blurb: row.candidate.blurb || null,
      image: row.candidate.image || null,
      available: row.candidate.available || null,
    })),
    summary,
  };
}

function portfolioRecommendation(row, check) {
  const unit = row.transaction === 'sale' ? '' : '/month';
  if (!check.available) {
    return {
      verdict: 'No evidence',
      tone: 'neutral',
      action: 'Widen coverage',
      message: 'No comparable asking prices were found for this home. Add a source or expand the area before drawing a conclusion.',
      suggestedPrice: null,
    };
  }
  if (check.verdict === 'above') {
    return {
      verdict: 'Overpriced',
      tone: 'warn',
      action: 'Review price',
      message: `${Math.abs(check.deltaPct).toFixed(1)}% above the comparable median of €${check.median.toLocaleString('en-GB')}${unit}. €${check.suggestedOffer.toLocaleString('en-GB')}${unit} would bring it into the corridor, or document the premium.`,
      suggestedPrice: check.suggestedOffer,
    };
  }
  if (check.verdict === 'below') {
    return {
      verdict: 'Underpriced',
      tone: 'opportunity',
      action: 'Consider an increase',
      message: `${Math.abs(check.deltaPct).toFixed(1)}% below the comparable median of €${check.median.toLocaleString('en-GB')}${unit}. There is headroom to €${Math.round(check.median).toLocaleString('en-GB')}${unit}.`,
      suggestedPrice: Math.round(check.median),
    };
  }
  return {
    verdict: 'At market',
    tone: 'good',
    action: 'Monitor',
    message: `Within the ±${MARKET_CORRIDOR}% corridor of the comparable median. No price action is indicated by this benchmark.`,
    suggestedPrice: row.price,
  };
}

/**
 * Benchmark the portfolio against the canonical market pool.
 */
export function benchmarkPortfolio(portfolio, pool) {
  const rows = portfolio.map((property) => {
    const target = {
      id: property.id,
      title: property.title,
      transaction: property.transaction,
      type: property.type,
      city: property.city,
      bedrooms: property.bedrooms,
      areaM2: property.area_m2 ?? property.areaM2,
      price: property.price,
      features: property.features || [],
      listedDaysAgo: 30,
    };
    const check = priceCheck(target, pool);
    const recommendation = portfolioRecommendation(target, check);
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
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      areaM2: target.areaM2,
      price: property.price,
      currency: property.currency || 'EUR',
      period: property.period,
      features: property.features || [],
      image: property.image,
      blurb: property.blurb,
      check,
      ...recommendation,
    };
  });

  const benchmarked = rows.filter((row) => row.check.available);
  const deltas = benchmarked.map((row) => row.check.deltaPct).filter(Number.isFinite);
  const sortedDeltas = [...deltas].sort((a, b) => a - b);
  const medianDelta = sortedDeltas.length
    ? Math.round(sortedDeltas[Math.floor(sortedDeltas.length / 2)] * 10) / 10
    : null;

  const summary = {
    total: rows.length,
    benchmarked: benchmarked.length,
    noEvidence: rows.length - benchmarked.length,
    above: benchmarked.filter((row) => row.check.verdict === 'above').length,
    at: benchmarked.filter((row) => row.check.verdict === 'at').length,
    below: benchmarked.filter((row) => row.check.verdict === 'below').length,
    medianDeltaPct: medianDelta,
    rentCount: rows.filter((row) => row.transaction === 'rent').length,
    saleCount: rows.filter((row) => row.transaction === 'sale').length,
    confidenceHigh: benchmarked.filter((row) => row.check.confidence === 'high').length,
    confidenceLow: benchmarked.filter((row) => row.check.confidence === 'low').length,
    monthlyAskingRent: rows
      .filter((row) => row.transaction === 'rent')
      .reduce((sum, row) => sum + row.price, 0),
    saleAskingTotal: rows
      .filter((row) => row.transaction === 'sale')
      .reduce((sum, row) => sum + row.price, 0),
  };

  const findings = rows
    .filter((row) => row.check.available && row.check.verdict !== 'at')
    .sort((a, b) => Math.abs(b.check.deltaPct) - Math.abs(a.check.deltaPct))
    .slice(0, 5)
    .map((row) => ({
      id: row.id,
      ref: row.ref,
      title: row.title,
      city: row.city,
      verdict: row.verdict,
      deltaPct: row.check.deltaPct,
      suggestedPrice: row.suggestedPrice,
      message: row.message,
      tone: row.tone,
    }));

  return { rows, summary, findings, corridor: MARKET_CORRIDOR };
}

/**
 * Aggregate price intelligence for a shortlist.
 */
export function summariseShortlist(items) {
  const withCheck = items.filter((item) => item.listing?.priceCheck?.available);
  if (!withCheck.length) {
    return {
      count: 0,
      medianDeltaPct: null,
      above: 0,
      at: 0,
      below: 0,
      askTotal: null,
      compMedianTotal: null,
      monthlyHeadroom: null,
      narrative: 'Add comparable evidence to see a price read on this shortlist.',
    };
  }
  const deltas = withCheck.map((item) => item.listing.priceCheck.deltaPct);
  const sorted = [...deltas].sort((a, b) => a - b);
  const medianDeltaPct = Math.round(sorted[Math.floor(sorted.length / 2)] * 10) / 10;
  const transaction = withCheck[0].listing.transaction;
  const askTotal = withCheck.reduce((sum, item) => sum + item.listing.price, 0);
  const compMedianTotal = withCheck.reduce((sum, item) => sum + item.listing.priceCheck.median, 0);
  const above = withCheck.filter((item) => item.listing.priceCheck.verdict === 'above').length;
  const below = withCheck.filter((item) => item.listing.priceCheck.verdict === 'below').length;
  const at = withCheck.length - above - below;
  const potentialSaving = withCheck.reduce(
    (sum, item) => sum + (item.listing.priceCheck.potentialSaving || 0),
    0
  );
  const unit = transaction === 'sale' ? '' : '/month';
  const narrative =
    above > 0
      ? `${above} of ${withCheck.length} ${above === 1 ? 'sits' : 'sit'} above the comparable median. There is €${potentialSaving.toLocaleString('en-GB')}${unit} of indicative negotiation room across the list.`
      : below > 0
        ? `${below} of ${withCheck.length} ${below === 1 ? 'sits' : 'sit'} below the comparable median. Ask why before treating that as value.`
        : `All ${withCheck.length} sit within the ±7% market corridor.`;
  return {
    count: withCheck.length,
    medianDeltaPct,
    above,
    at,
    below,
    askTotal,
    compMedianTotal,
    monthlyHeadroom: potentialSaving,
    narrative,
  };
}
