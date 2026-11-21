import { pctChange } from '../lib/stats.js';
import { normalizeText, titleSimilarity, jaccard } from '../lib/text.js';
import { shortHash } from '../lib/util.js';
import { locationMatches } from './brief.js';

export function offerRejectionReason(offer, filters) {
  if (offer.transaction !== filters.transaction) return 'transaction';
  if (filters.types?.length && !filters.types.includes(offer.type)) return 'type';
  if (!locationMatches(offer, filters)) return 'location';
  if (filters.bedsMin !== null && filters.bedsMin !== undefined && Number.isFinite(offer.bedrooms)) {
    if (offer.bedrooms < Math.max(0, filters.bedsMin - 1)) return 'bedrooms';
  }
  if (filters.bedsMax !== null && filters.bedsMax !== undefined && Number.isFinite(offer.bedrooms)) {
    if (offer.bedrooms > filters.bedsMax + 1) return 'bedrooms';
  }
  if (filters.budget && offer.price_eur > filters.budget * 1.55) return 'budget';
  if (offer.area_m2 && (offer.area_m2 < 25 || offer.area_m2 > 2_000)) return 'area';
  if (!offer.title || !offer.city) return 'incomplete';
  return null;
}

/**
 * Collapse cross-posted listings. Two offers collapse when title keywords,
 * location, type, bedrooms, area and price all align. The most trustworthy
 * copy becomes canonical and is used for benchmarking.
 */
export function deduplicate(offers, sourcesById = new Map()) {
  const buckets = new Map();
  for (const offer of offers) {
    const areaBucket = offer.area_m2 ? Math.round(offer.area_m2 / 5) * 5 : 'na';
    const priceStep = offer.transaction === 'rent' ? 25 : 5000;
    const priceBucket = Math.round(offer.price_eur / priceStep) * priceStep;
    const titleKey = [...new Set(
      offer.title
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((token) => token.length > 2 && !['the', 'and', 'with', 'for', 'sale', 'rent', 'listing', 'exclusive'].includes(token))
    )].sort().slice(0, 14).join('-');
    const key = [
      normalizeText(offer.city),
      offer.transaction,
      offer.type,
      offer.bedrooms ?? 'x',
      areaBucket,
      priceBucket,
      titleKey,
    ].join('|');
    const fingerprint = shortHash(key, 12);
    if (!buckets.has(fingerprint)) buckets.set(fingerprint, []);
    buckets.get(fingerprint).push(offer);
  }

  let collapsed = 0;
  const groups = [];
  for (const [fingerprint, group] of buckets) {
    const sorted = [...group].sort((a, b) => {
      const reliabilityA = sourcesById.get(a.source_id)?.reliability ?? 0;
      const reliabilityB = sourcesById.get(b.source_id)?.reliability ?? 0;
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      if (reliabilityB !== reliabilityA) return reliabilityB - reliabilityA;
      return a.price_eur - b.price_eur;
    });
    sorted.forEach((offer, index) => {
      offer.duplicate_group = fingerprint;
      offer.fingerprint = fingerprint;
      offer.canonical = index === 0;
    });
    if (sorted.length > 1) {
      collapsed += sorted.length - 1;
      groups.push({
        fingerprint,
        canonicalId: sorted[0].id,
        offers: sorted.map((offer) => ({
          id: offer.id,
          title: offer.title,
          source_id: offer.source_id,
          price_eur: offer.price_eur,
          url: offer.url,
        })),
      });
    }
  }

  return { offers, groups, collapsed };
}

export function detectSameListing(offer, property) {
  if (offer.transaction !== property.transaction) return null;
  if (offer.type !== property.type) return null;
  if (normalizeText(offer.city) !== normalizeText(property.city)) return null;
  if (Number.isFinite(offer.bedrooms) && Number.isFinite(property.bedrooms) && offer.bedrooms !== property.bedrooms) {
    return null;
  }

  const text = `${offer.title} ${offer.snippet || ''}`;
  const refMention = new RegExp(`\\b${property.ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);
  const areaDiff = Number.isFinite(offer.area_m2) && property.area_m2
    ? Math.abs(offer.area_m2 - property.area_m2) / property.area_m2
    : 1;
  const priceDelta = pctChange(property.price, offer.price_eur);
  const similarity = titleSimilarity(offer.title, property.title);

  if (refMention) {
    return {
      kind: 'same_listing',
      score: 99,
      reasons: ['Same PBoR reference found on the competitor page', 'Identical listing attributes'],
    };
  }

  const priceAligned = Math.abs(priceDelta) <= 0.22;
  const areaAligned = areaDiff <= 0.08;
  if (similarity >= 0.55 && areaAligned && priceAligned) {
    const score = Math.round(70 + similarity * 20 + (1 - areaDiff) * 5 + (1 - Math.abs(priceDelta)) * 4);
    return {
      kind: 'same_listing',
      score: Math.min(99, score),
      reasons: [
        `Title match ${Math.round(similarity * 100)}%`,
        `Area within ${(areaDiff * 100).toFixed(1)}%`,
        `Price within ${(Math.abs(priceDelta) * 100).toFixed(1)}%`,
      ],
    };
  }
  return null;
}

export function scoreComparable(offer, property) {
  if (offer.transaction !== property.transaction) return null;
  if (offer.type !== property.type) return null;
  if (normalizeText(offer.city) !== normalizeText(property.city)) return null;
  if (Number.isFinite(offer.bedrooms) && Number.isFinite(property.bedrooms)) {
    if (Math.abs(offer.bedrooms - property.bedrooms) > 1) return null;
  }
  const area = Number(offer.area_m2);
  if (Number.isFinite(area) && property.area_m2) {
    const ratio = area / property.area_m2;
    if (ratio < 0.6 || ratio > 1.6) return null;
  }
  if (Number.isFinite(offer.price_eur) && property.price) {
    const ratio = offer.price_eur / property.price;
    if (ratio < 0.5 || ratio > 1.7) return null;
  }

  const bedScore = Number.isFinite(offer.bedrooms)
    ? Math.max(0, 1 - Math.abs(offer.bedrooms - property.bedrooms) / 2)
    : 0.6;
  const areaScore = Number.isFinite(area) && property.area_m2
    ? Math.max(0, 1 - Math.abs(area - property.area_m2) / property.area_m2)
    : 0.6;
  const priceScore = Math.max(0, 1 - Math.abs(offer.price_eur - property.price) / property.price);
  const featureScore = jaccard(offer.features || [], property.features || []);
  const score = Math.round(100 * (0.3 + 0.2 * bedScore + 0.25 * areaScore + 0.15 * featureScore + 0.1 * priceScore));

  if (score < 55) return null;

  const reasons = ['Same city and property type'];
  if (offer.bedrooms === property.bedrooms) reasons.push(`${property.bedrooms}-bed match`);
  else reasons.push(`${Math.abs(property.bedrooms - offer.bedrooms)} bedroom difference`);
  if (Number.isFinite(area)) reasons.push(`Area ${areaDiffLabel(area, property.area_m2)}`);
  if (featureScore > 0.2) reasons.push(`${Math.round(featureScore * 100)}% feature overlap`);

  return {
    kind: 'comparable',
    score: Math.min(97, score),
    reasons,
  };
}

function areaDiffLabel(area, ownArea) {
  if (!ownArea) return 'not stated';
  const diff = Math.abs(area - ownArea) / ownArea;
  if (diff <= 0.02) return 'effectively identical';
  return `${Math.round(diff * 100)}% from yours`;
}

/**
 * Assign each canonical offer to the single best-fitting portfolio listing.
 * Mirrors take precedence over comparables so the same listing is never used
 * as its own benchmark twice.
 */
export function matchOffers(canonicalOffers, properties) {
  const matches = [];
  const unmatched = [];
  for (const offer of canonicalOffers) {
    let best = null;
    for (const property of properties) {
      const same = detectSameListing(offer, property);
      if (same) {
        if (!best || same.score > best.score) {
          best = { property, ...same };
        }
      }
    }

    if (!best) {
      for (const property of properties) {
        const comparable = scoreComparable(offer, property);
        if (comparable && (!best || comparable.score > best.score)) {
          best = { property, ...comparable };
        }
      }
    }

    if (!best) {
      unmatched.push(offer);
      continue;
    }

    const deltaAbs = Math.round(best.property.price - offer.price_eur);
    const deltaPct = pctChange(offer.price_eur, best.property.price);
    matches.push({
      id: `mat_${offer.id.replace(/^off_/, '')}`,
      offer_id: offer.id,
      property_id: best.property.id,
      property_ref: best.property.ref,
      kind: best.kind,
      score: best.score,
      delta_abs: deltaAbs,
      delta_pct: Number.isFinite(deltaPct) ? Math.round(deltaPct * 10) / 10 : null,
      reasons: best.reasons,
    });
  }
  return { matches, unmatched };
}
