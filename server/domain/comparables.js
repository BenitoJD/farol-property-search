import {
  canonicalMarket,
  marketListings,
  imageFor,
} from '../seed/market.js';
import { priceCheck, cityKey, typeCompatibility } from './pricing.js';
import { median } from '../lib/stats.js';

/**
 * The listing-first comparables agent.
 *
 * Give it one listing. It searches the source catalogue for similar homes,
 * removes cross-posted mirrors, groups the evidence by competitor, and returns
 * a fair-value read. In this build the source universe is the deterministic
 * demo market; the same result shape is ready for a live web/market provider.
 */

function roundToPrice(value, transaction) {
  if (!Number.isFinite(value)) return null;
  const step = transaction === 'sale' ? 1000 : 25;
  return Math.round(value / step) * step;
}

function titleTokens(value) {
  return new Set(
    String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 2 && !['the', 'and', 'with', 'for', 'sale', 'rent', 'new'].includes(token))
  );
}

function titleOverlap(a, b) {
  const left = titleTokens(a);
  const right = titleTokens(b);
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

function isLikelySameListing(subject, candidate) {
  if (!candidate) return false;
  if (candidate.transaction !== subject.transaction) return false;
  if (candidate.type !== subject.type) return false;
  if (cityKey(candidate.city) !== cityKey(subject.city)) return false;
  if (
    Number.isFinite(subject.bedrooms) &&
    Number.isFinite(candidate.bedrooms) &&
    Number(candidate.bedrooms) !== Number(subject.bedrooms)
  ) return false;
  const subjectArea = Number(subject.areaM2);
  const candidateArea = Number(candidate.areaM2);
  const areaClose =
    Number.isFinite(subjectArea) && Number.isFinite(candidateArea) && subjectArea > 0
      ? Math.abs(candidateArea - subjectArea) / subjectArea <= 0.02
      : false;
  const priceClose =
    Number.isFinite(Number(subject.price)) && Number(candidate.price) > 0
      ? Math.abs(candidate.price - Number(subject.price)) / Number(subject.price) <= 0.08
      : false;
  const titleClose = titleOverlap(subject.title, candidate.title) >= 0.75;
  return titleClose || (areaClose && priceClose);
}

function pricePerM2(price, areaM2) {
  const area = Number(areaM2);
  if (!Number.isFinite(area) || area <= 0) return null;
  return Math.round(Number(price) / area);
}

function money(value, transaction) {
  if (!Number.isFinite(Number(value))) return '—';
  const formatted = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(Number(value));
  return transaction === 'rent' ? `${formatted}/mo` : formatted;
}

export function subjectFromPortfolio(property) {
  return {
    source: 'portfolio',
    portfolioId: property.id,
    ref: property.ref,
    title: property.title,
    transaction: property.transaction,
    type: property.type,
    city: property.city,
    area: property.neighborhood || '',
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    areaM2: property.area_m2,
    price: property.price,
    currency: property.currency || 'EUR',
    period: property.period || (property.transaction === 'rent' ? 'month' : 'total'),
    features: property.features || [],
    image: property.image || imageFor(property),
    description: property.blurb || '',
  };
}

export function subjectFromInput(input) {
  return {
    source: 'manual',
    portfolioId: null,
    ref: 'Your listing',
    title: input.title,
    transaction: input.transaction,
    type: input.type,
    city: input.city,
    area: input.area || '',
    bedrooms: input.bedrooms ?? null,
    bathrooms: input.bathrooms ?? null,
    areaM2: input.areaM2 ?? null,
    price: input.price,
    currency: 'EUR',
    period: input.transaction === 'rent' ? 'month' : 'total',
    features: input.features || [],
    image: imageFor(input),
    description: input.description || '',
  };
}

export function comparisonQueries(subject) {
  const bed = subject.bedrooms ? `${subject.bedrooms}-bed ` : '';
  const type = subject.type || 'home';
  const action = subject.transaction === 'sale' ? 'for sale' : 'for rent';
  const feature = subject.features?.[0] ? ` with ${subject.features[0].toLowerCase()}` : '';
  return [
    `${bed}${type} ${action} in ${subject.city}`,
    `${type}${feature} ${subject.city} asking prices`,
    `similar ${type} near ${subject.area || subject.city} ${action}`,
  ];
}

function enrichComparable(comp, { sourceMap, copiesByCluster }) {
  const source = comp.sourceId ? sourceMap.get(comp.sourceId) : null;
  const copies = comp.cluster ? copiesByCluster.get(comp.cluster) || [] : [];
  const prices = copies.map((item) => item.price).filter(Number.isFinite);
  return {
    ...comp,
    sourceDomain: source?.domain || comp.sourceDomain || null,
    sourceKind: source?.kind || comp.sourceKind || null,
    sourceReliability: source?.reliability ?? comp.sourceReliability ?? null,
    mirrorCount: Math.max(0, copies.length - 1),
    mirrorSources: copies
      .filter((copy) => copy.sourceId !== comp.sourceId)
      .map((copy) => copy.sourceName),
    mirrorPriceLow: prices.length > 1 ? Math.min(...prices) : null,
    mirrorPriceHigh: prices.length > 1 ? Math.max(...prices) : null,
    pricePerM2: pricePerM2(comp.price, comp.areaM2),
  };
}

function buildCompetitors({ comps, copies, sourceMap, subject }) {
  const clusters = new Set(comps.map((comp) => comp.cluster).filter(Boolean));
  const relevant = copies.filter((copy) => clusters.has(copy.cluster));
  const bySource = new Map();
  for (const copy of relevant) {
    const key = copy.sourceId || copy.sourceName;
    if (!bySource.has(key)) bySource.set(key, []);
    bySource.get(key).push(copy);
  }

  const competitors = [];
  for (const [, rows] of bySource) {
    const prices = rows.map((row) => row.price).filter(Number.isFinite).sort((a, b) => a - b);
    if (!prices.length) continue;
    const source = sourceMap.get(rows[0].sourceId);
    const medianPrice = median(prices);
    const perM2 = rows
      .map((row) => pricePerM2(row.price, row.areaM2))
      .filter(Number.isFinite);
    const deltaPct = subject.price
      ? Number((((medianPrice - subject.price) / subject.price) * 100).toFixed(1))
      : null;
    competitors.push({
      sourceId: rows[0].sourceId,
      sourceName: source?.name || rows[0].sourceName,
      sourceDomain: source?.domain || comp.sourceDomain || null,
      sourceKind: source?.kind || rows[0].sourceKind || null,
      reliability: source?.reliability ?? rows[0].reliability ?? null,
      listings: rows.length,
      clusters: [...new Set(rows.map((row) => row.cluster))].length,
      median: Math.round(medianPrice),
      medianPerM2: perM2.length ? Math.round(median(perM2)) : null,
      min: prices[0],
      max: prices[prices.length - 1],
      deltaPct,
      share: relevant.length ? Math.round((rows.length / relevant.length) * 100) : 0,
    });
  }
  competitors.sort((a, b) => b.listings - a.listings || (b.reliability || 0) - (a.reliability || 0));
  return competitors;
}

function buildCoverage({ subject, market, copies, comps, competitors, sources, selfExcluded, sourceCount }) {
  const key = cityKey(subject.city);
  const sameCity = market.filter(
    (listing) => listing.transaction === subject.transaction && cityKey(listing.city) === key
  );
  const sameType = sameCity.filter(
    (listing) => typeCompatibility(subject.type, listing.type) > 0
  );
  const similar = sameType.filter((listing) => {
    if (Number.isFinite(subject.bedrooms) && Number.isFinite(listing.bedrooms)) {
      if (Math.abs(listing.bedrooms - subject.bedrooms) > 1) return false;
    }
    const subjectArea = Number(subject.areaM2);
    const listingArea = Number(listing.areaM2);
    if (Number.isFinite(subjectArea) && Number.isFinite(listingArea) && subjectArea > 0) {
      const ratio = listingArea / subjectArea;
      if (ratio < 0.6 || ratio > 1.6) return false;
    }
    return true;
  });
  const compClusters = new Set(comps.map((comp) => comp.cluster).filter(Boolean));
  const relevantCopies = copies.filter((copy) => compClusters.has(copy.cluster));
  return {
    sourcesPlanned: sourceCount ?? sources.filter((source) => source.enabled !== false).length,
    marketListings: market.length,
    marketCopies: copies.length,
    sameCity: sameCity.length,
    sameType: sameType.length,
    similar: similar.length,
    selfExcluded,
    comps: comps.length,
    uniqueComps: compClusters.size,
    mirrorsCollapsed: Math.max(0, relevantCopies.length - compClusters.size),
    competitors: competitors.length,
    sourcesWithComps: competitors.length,
  };
}

function buildNarrative(subject, check, competitors, coverage) {
  const basis = `${check.count} comparable ${check.count === 1 ? 'home' : 'homes'} in ${subject.city}`;
  const subjectPerM2 = pricePerM2(subject.price, subject.areaM2);
  const bullets = [];

  if (!check.available) {
    return {
      headline: 'Not enough comparable evidence yet',
      summary: `The catalogue did not return a strong comparable set for this ${subject.type} in ${subject.city}. Widen the search or add a source before changing the asking price.`,
      recommendation: {
        action: 'Widen coverage',
        tone: 'neutral',
        label: 'No price action yet',
        detail: 'Add another source or expand the area. A thin evidence set should not drive a pricing decision.',
      },
      bullets: [
        `${coverage.marketListings} unique listings are in the current demo market.`,
        `${coverage.sameCity} are in ${subject.city}; none passed the similarity screen.`,
        'Treat this as a coverage problem, not a price signal.',
      ],
      suggestedPrice: null,
      valueRange: null,
    };
  }

  const delta = check.deltaPct;
  const verdict = check.verdict;
  const suggestedPrice = roundToPrice(check.median, subject.transaction);
  const valueRange = [
    roundToPrice(check.p25, subject.transaction),
    roundToPrice(check.p75, subject.transaction),
  ];
  const headline =
    verdict === 'above'
      ? `${Math.abs(delta).toFixed(1)}% above the comparable median`
      : verdict === 'below'
        ? `${Math.abs(delta).toFixed(1)}% below the comparable median`
        : 'Priced inside the comparable market';

  const summary =
    verdict === 'above'
      ? `The ask is above ${basis}. The evidence suggests ${money(suggestedPrice, subject.transaction)} is a defensible market level, unless there is a premium the comparables cannot see.`
      : verdict === 'below'
        ? `The ask is below ${basis}. Comparable asking prices support up to ${money(suggestedPrice, subject.transaction)} in this market, assuming similar condition and terms.`
        : `The ask sits within the ±${check.corridor}% corridor around ${basis}. No price change is indicated by this comparable set.`;

  if (check.verdict === 'above') {
    bullets.push(
      `${check.count} comparable homes have a median of ${money(check.median, subject.transaction)}; your ask is ${money(subject.price, subject.transaction)}.`
    );
    bullets.push(
      `The middle 50% of comparable asks sits between ${money(check.p25, subject.transaction)} and ${money(check.p75, subject.transaction)}.`
    );
    bullets.push(
      `Indicative negotiation room is about ${money(check.potentialSaving, subject.transaction)} against the comparable median.`
    );
  } else if (check.verdict === 'below') {
    bullets.push(
      `${check.count} comparable homes have a median of ${money(check.median, subject.transaction)}; your ask is ${money(subject.price, subject.transaction)}.`
    );
    bullets.push(
      `The middle 50% of comparable asks sits between ${money(check.p25, subject.transaction)} and ${money(check.p75, subject.transaction)}.`
    );
    bullets.push(
      `The gap to the median is ${money(check.median - subject.price, subject.transaction)}. Confirm condition, terms and availability before treating it as pure headroom.`
    );
  } else {
    bullets.push(
      `The comparable median is ${money(check.median, subject.transaction)} and the middle 50% spans ${money(check.p25, subject.transaction)}–${money(check.p75, subject.transaction)}.`
    );
    bullets.push('Stay close to the market and monitor new competitor listings rather than moving the price on this evidence alone.');
  }

  if (subjectPerM2 && check.medianPerM2) {
    const perM2Delta = Number(
      (((subjectPerM2 - check.medianPerM2) / check.medianPerM2) * 100).toFixed(1)
    );
    bullets.push(
      `On size, the subject is ${money(subjectPerM2, 'sale')} per m² against a comparable median of ${money(check.medianPerM2, 'sale')} per m² (${perM2Delta > 0 ? '+' : ''}${perM2Delta.toFixed(1)}%).`
    );
  }

  if (competitors.length) {
    const cheapest = [...competitors].sort((a, b) => a.median - b.median)[0];
    const largest = competitors[0];
    bullets.push(
      `${competitors.length} competitor${competitors.length === 1 ? '' : 's'} have comparable stock. ${largest.sourceName} has ${largest.listings} observation${largest.listings === 1 ? '' : 's'}; ${cheapest.sourceName} is the cheapest at a ${money(cheapest.median, subject.transaction)} median.`
    );
  }

  const recommendation =
    verdict === 'above'
      ? {
          action: 'Review the asking price',
          tone: 'warn',
          label: `${money(check.potentialSaving, subject.transaction)} of indicative negotiation room`,
          detail: `Bring the ask toward ${money(suggestedPrice, subject.transaction)} or document why the premium is justified. Start any negotiation around ${money(check.p25, subject.transaction)}–${money(check.median, subject.transaction)}.`,
        }
      : verdict === 'below'
        ? {
            action: 'Consider the headroom',
            tone: 'opportunity',
            label: `${money(check.median - subject.price, subject.transaction)} below the median`,
            detail: `The comparables support an ask closer to ${money(suggestedPrice, subject.transaction)}. Check condition, lease terms and demand before moving.`,
          }
        : {
            action: 'Hold and monitor',
            tone: 'good',
            label: 'Inside the ±7% corridor',
            detail: 'No price action is indicated by this evidence set. Watch for new competitor listings and price cuts.',
          };

  return { headline, summary, recommendation, bullets, suggestedPrice, valueRange };
}

export function describeComparisonSteps(result) {
  const { subject, check, competitors, coverage, queries } = result;
  const steps = [];
  steps.push({
    phase: 'read',
    message: 'Read and normalised your listing',
    detail: `${subject.title} · ${subject.bedrooms || '—'} bed · ${subject.areaM2 || '—'} m² · ${money(subject.price, subject.transaction)}`,
  });
  steps.push({
    phase: 'plan',
    message: result.mode === 'live' ? 'Planned a live market search' : 'Planned the comparable search',
    detail:
      result.mode === 'live'
        ? `${result.sourceLabel} · ${queries.length} query variants · ${coverage.sameCity} ${subject.city} listings in scope`
        : `${coverage.sourcesPlanned} sources · ${queries.length} query variants · ${coverage.sameCity} ${subject.city} listings in scope`,
  });
  steps.push({
    phase: 'search',
    message: result.mode === 'live' ? 'Fetched live market results' : `Searched ${coverage.sourcesPlanned} sources`,
    detail:
      result.mode === 'live'
        ? `${coverage.marketCopies} live listings from ${result.sourceLabel} · ${coverage.sameCity} in ${subject.city}`
        : `${coverage.marketCopies} listing observations scanned · ${coverage.marketListings} unique properties`,
  });
  const topCompetitors = competitors.slice(0, 4);
  for (const competitor of topCompetitors) {
    steps.push({
      phase: 'search',
      message: result.mode === 'live' ? `${competitor.sourceName} has comparable stock` : `Queried ${competitor.sourceName}`,
      detail: `${competitor.listings} comparable observation${competitor.listings === 1 ? '' : 's'} · median ${money(competitor.median, subject.transaction)}`,
    });
  }
  steps.push({
    phase: 'extract',
    message: `Extracted and normalised ${coverage.marketListings} unique listings`,
    detail: 'Title, price, size, bedrooms, features, source and availability',
  });
  steps.push({
    phase: 'filter',
    message: `${coverage.comps} similar homes passed the similarity screen`,
    detail: `${coverage.sameType} in ${subject.city} are the same type; ${coverage.similar} are within one bedroom and the size band`,
  });
  steps.push({
    phase: 'dedupe',
    message: `Collapsed ${coverage.mirrorsCollapsed} cross-posted mirrors`,
    detail: `${coverage.uniqueComps} unique comparable ${coverage.uniqueComps === 1 ? 'home' : 'homes'} remain · ${coverage.competitors} competitors`,
  });
  if (check.available) {
    steps.push({
      phase: 'value',
      message: 'Built the value range',
      detail: `Median ${money(check.median, subject.transaction)} · p25–p75 ${money(check.p25, subject.transaction)}–${money(check.p75, subject.transaction)} · ${check.confidence} confidence`,
      level: 'insight',
    });
  } else {
    steps.push({
      phase: 'value',
      message: 'Could not build a defensible value range',
      detail: 'The comparable set is too thin. The report recommends widening coverage.',
      level: 'warn',
    });
  }
  if (competitors.length) {
    steps.push({
      phase: 'competitors',
      message: `Grouped the evidence across ${competitors.length} competitors`,
      detail: competitors
        .slice(0, 4)
        .map((competitor) => `${competitor.sourceName} ${competitor.listings} · ${money(competitor.median, subject.transaction)}`)
        .join(' · '),
    });
  }
  steps.push({
    phase: 'complete',
    message: 'Comparable value report ready',
    detail: check.available
      ? `${check.verdictLabel} · ${check.count} comparables · ${Math.abs(check.deltaPct).toFixed(1)}% ${check.deltaPct > 0 ? 'above' : check.deltaPct < 0 ? 'below' : 'from'} the median`
      : 'Coverage gap flagged for the team',
    level: 'success',
  });
  return steps;
}

export function prepareComparison({
  subject,
  sources,
  market = canonicalMarket(),
  copies = marketListings(),
  mode = 'demo',
  sourceLabel = 'Demo market',
  sourceCount = null,
}) {
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const copiesByCluster = new Map();
  for (const copy of copies) {
    if (!copiesByCluster.has(copy.cluster)) copiesByCluster.set(copy.cluster, []);
    copiesByCluster.get(copy.cluster).push(copy);
  }

  const selfClusters = new Set();
  const pool = market.filter((candidate) => {
    if (!isLikelySameListing(subject, candidate)) return true;
    selfClusters.add(candidate.cluster);
    return false;
  });
  const check = priceCheck(
    {
      id: 'subject',
      cluster: subject.cluster || null,
      city: subject.city,
      type: subject.type,
      transaction: subject.transaction,
      bedrooms: subject.bedrooms,
      areaM2: subject.areaM2,
      price: subject.price,
      features: subject.features,
      listedDaysAgo: 0,
    },
    pool
  );

  const comps = check.comparables.map((comp) =>
    enrichComparable(comp, { sourceMap, copiesByCluster })
  );
  const relevantCopies = copies.filter((copy) => !selfClusters.has(copy.cluster));
  const competitors = buildCompetitors({ comps, copies: relevantCopies, sourceMap, subject });
  const coverage = buildCoverage({
    subject,
    market,
    copies,
    comps,
    competitors,
    sources,
    selfExcluded: selfClusters.size,
    sourceCount: sourceCount ?? undefined,
  });
  const narrative = buildNarrative(subject, check, competitors, coverage);

  return {
    mode,
    sourceLabel,
    subject,
    check,
    comps,
    competitors,
    coverage,
    narrative,
    queries: comparisonQueries(subject),
    generatedAt: new Date().toISOString(),
    stats: {
      mode,
      sourceLabel,
      comps: check.count,
      median: check.median,
      p25: check.p25,
      p75: check.p75,
      deltaPct: check.deltaPct,
      verdict: check.verdict,
      confidence: check.confidence,
      suggestedPrice: narrative.suggestedPrice,
      competitors: competitors.length,
      sourcesWithComps: coverage.sourcesWithComps,
    },
  };
}
