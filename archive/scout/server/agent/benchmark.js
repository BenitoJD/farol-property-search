import { classifyGap, median, percentileRank, summarizePrices } from '../lib/stats.js';
import { formatMoney } from '../lib/fx.js';

function round1(value) {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
}

function suggestionStep(transaction) {
  return transaction === 'sale' ? 1000 : 25;
}

function suggestPrice(ownPrice, marketMedian, transaction) {
  if (!marketMedian) return ownPrice;
  const step = suggestionStep(transaction);
  return Math.round(marketMedian / step) * step;
}

function priceUnit(transaction) {
  return transaction === 'sale' ? '' : '/month';
}

function buildPositions({ properties, canonicalOffers, matches }) {
  const offersById = new Map(canonicalOffers.map((offer) => [offer.id, offer]));
  const matchesByProperty = new Map();
  for (const match of matches) {
    if (!matchesByProperty.has(match.property_id)) matchesByProperty.set(match.property_id, []);
    matchesByProperty.get(match.property_id).push(match);
  }

  return properties.map((property) => {
    const propertyMatches = (matchesByProperty.get(property.id) || [])
      .map((match) => ({ match, offer: offersById.get(match.offer_id) }))
      .filter((item) => item.offer);
    const comparables = propertyMatches.filter((item) => item.match.kind === 'comparable');
    const mirrors = propertyMatches.filter((item) => item.match.kind === 'same_listing');
    const prices = comparables.map((item) => item.offer.price_eur).filter((v) => Number.isFinite(v));
    const stats = summarizePrices(prices);
    const marketMedian = stats?.median ?? null;
    const deltaPct = marketMedian
      ? round1(((property.price - marketMedian) / marketMedian) * 100)
      : null;
    const verdict = classifyGap(deltaPct);
    const percentile = percentileRank(prices, property.price);
    const cheapestMirror = mirrors
      .map((item) => item.offer)
      .sort((a, b) => a.price_eur - b.price_eur)[0] || null;
    const mirrorDeltaPct = cheapestMirror
      ? round1(((property.price - cheapestMirror.price_eur) / cheapestMirror.price_eur) * 100)
      : null;
    const recommendedPrice = deltaPct !== null && Math.abs(deltaPct) > 7
      ? suggestPrice(property.price, marketMedian, property.transaction)
      : property.price;
    const gapAnnual = recommendedPrice !== property.price
      ? Math.round(Math.abs(property.price - recommendedPrice) * (property.transaction === 'rent' ? 12 : 1))
      : 0;

    let recommendation = 'Priced within the market corridor.';
    if (verdict === 'overpriced') {
      recommendation = `Sits ${Math.abs(deltaPct).toFixed(1)}% above the comparable median. Consider ${formatMoney(recommendedPrice, 'EUR')}${priceUnit(property.transaction)} or document the premium.`;
    } else if (verdict === 'underpriced') {
      recommendation = `Sits ${Math.abs(deltaPct).toFixed(1)}% below the comparable median. ${formatMoney(recommendedPrice, 'EUR')}${priceUnit(property.transaction)} would align it with the market.`;
    } else if (verdict === 'competitive') {
      recommendation = `Within ${Math.abs(deltaPct).toFixed(1)}% of the comparable median — competitively positioned.`;
    } else if (mirrors.length) {
      recommendation = 'Only a mirror listing was found; run a wider search to establish a market median.';
    } else {
      recommendation = 'No comparable market offers were identified for this listing.';
    }

    const confidences = propertyMatches.map((item) => item.offer.confidence);
    const confidence = confidences.length
      ? Math.round((confidences.reduce((sum, value) => sum + value, 0) / confidences.length) * 100) / 100
      : null;

    return {
      property: {
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
        area_m2: property.area_m2,
        price: property.price,
        currency: property.currency,
        period: property.period,
        features: property.features,
        url: property.url,
        blurb: property.blurb,
      },
      market: stats,
      comparablePrices: [...prices].sort((a, b) => a - b),
      deltaPct,
      verdict,
      percentile,
      recommendedPrice,
      recommendation,
      confidence,
      comparableCount: comparables.length,
      matches: propertyMatches.map(({ match, offer }) => ({
        offerId: offer.id,
        title: offer.title,
        sourceId: offer.source_id,
        price_eur: offer.price_eur,
        currency: offer.currency,
        price: offer.price,
        kind: match.kind,
        score: match.score,
        deltaPct: match.delta_pct,
        url: offer.url,
        confidence: offer.confidence,
      })),
      mirrors: mirrors.map(({ match, offer }) => ({
        offerId: offer.id,
        title: offer.title,
        sourceId: offer.source_id,
        price_eur: offer.price_eur,
        deltaPct: match.delta_pct,
        gapVsOwnPct: round1(((property.price - offer.price_eur) / offer.price_eur) * 100),
        url: offer.url,
      })),
      cheapestMirror: cheapestMirror
        ? {
            offerId: cheapestMirror.id,
            sourceId: cheapestMirror.source_id,
            price_eur: cheapestMirror.price_eur,
            deltaPct: mirrorDeltaPct,
          }
        : null,
      gapAnnual,
    };
  });
}

function buildRecommendations(positions, filters, sourcesById) {
  const recommendations = [];
  for (const position of positions) {
    const property = position.property;
    const unit = priceUnit(property.transaction);

    for (const mirror of position.mirrors) {
      if (mirror.gapVsOwnPct !== null && mirror.gapVsOwnPct > 2) {
        const source = sourcesById.get(mirror.sourceId);
        const sourceName = source?.name || 'A competitor portal';
        recommendations.push({
          type: 'mirror_undercut',
          severity: mirror.gapVsOwnPct > 5 ? 'high' : 'medium',
          propertyRef: property.ref,
          propertyId: property.id,
          title: `${property.ref} is mirrored below your portal price`,
          message: `${sourceName} shows ${formatMoney(mirror.price_eur, 'EUR')}${unit}, ${mirror.gapVsOwnPct.toFixed(1)}% under your ${formatMoney(property.price, 'EUR')}${unit}.`,
          action: 'Review the portal price',
          impact: Math.round((property.price - mirror.price_eur) * (property.transaction === 'rent' ? 12 : 1)),
          sourceId: mirror.sourceId,
          offerId: mirror.offerId,
        });
      }
    }

    if (position.comparableCount >= 2 && position.verdict === 'overpriced') {
      recommendations.push({
        type: 'reprice_down',
        severity: Math.abs(position.deltaPct) >= 12 ? 'high' : 'medium',
        propertyRef: property.ref,
        propertyId: property.id,
        title: `${property.ref} sits ${Math.abs(position.deltaPct).toFixed(1)}% above market`,
        message: `${position.comparableCount} comparables in ${property.city} have a median of ${formatMoney(position.market.median, 'EUR')}${unit}. Scout suggests ${formatMoney(position.recommendedPrice, 'EUR')}${unit}, or a documented premium.`,
        action: 'Review pricing',
        impact: position.gapAnnual,
      });
    }

    if (position.comparableCount >= 2 && position.verdict === 'underpriced') {
      recommendations.push({
        type: 'reprice_up',
        severity: 'opportunity',
        propertyRef: property.ref,
        propertyId: property.id,
        title: `${property.ref} has pricing headroom`,
        message: `${position.comparableCount} comparables in ${property.city} have a median of ${formatMoney(position.market.median, 'EUR')}${unit}. ${formatMoney(position.recommendedPrice, 'EUR')}${unit} would close a ${Math.abs(position.deltaPct).toFixed(1)}% gap.`,
        action: 'Consider a price increase',
        impact: position.gapAnnual,
      });
    }

    if (position.comparableCount > 0 && position.comparableCount < 2) {
      recommendations.push({
        type: 'coverage',
        severity: 'low',
        propertyRef: property.ref,
        propertyId: property.id,
        title: `Thin evidence for ${property.ref}`,
        message: `Only ${position.comparableCount} comparable offer was found. Widen the location or rerun to strengthen the benchmark.`,
        action: 'Widen the search',
        impact: 0,
      });
    }
  }

  if (!positions.length) {
    recommendations.push({
      type: 'no_portfolio',
      severity: 'medium',
      title: 'No portfolio listings matched this brief',
      message: 'The market scan still ran. Adjust the transaction, location or budget to benchmark your own stock, or save this search as a market watch.',
      action: 'Adjust the brief',
      impact: 0,
    });
  } else if (!recommendations.length && positions.some((position) => position.market)) {
    recommendations.push({
      type: 'healthy',
      severity: 'positive',
      title: 'Portfolio is pricing with the market',
      message: `${positions.filter((position) => position.market).length} benchmarked listing${positions.length === 1 ? '' : 's'} sit within the ±7% corridor. No portal mirror is undercutting your price.`,
      action: 'Keep monitoring',
      impact: 0,
    });
  }

  const rank = { high: 0, medium: 1, opportunity: 2, low: 3, positive: 4 };
  return recommendations
    .sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9) || (b.impact || 0) - (a.impact || 0))
    .slice(0, 6);
}

function buildHeadline(overview) {
  if (!overview.ownListingsInScope) {
    return `${overview.uniqueOffers} market offer${overview.uniqueOffers === 1 ? '' : 's'} found — no portfolio listing matched this brief.`;
  }
  if (!overview.ownListingsBenchmarked) {
    return `${overview.ownListingsInScope} portfolio listing${overview.ownListingsInScope === 1 ? '' : 's'} in scope, but not enough comparable offers to benchmark.`;
  }
  const medianText = overview.medianDeltaPct === null
    ? ''
    : ` · median ${overview.medianDeltaPct > 0 ? '+' : ''}${Number(overview.medianDeltaPct).toFixed(1)}% vs market`;
  return `${overview.ownListingsBenchmarked} of ${overview.ownListingsInScope} listing${overview.ownListingsInScope === 1 ? '' : 's'} benchmarked${medianText}`;
}

/**
 * Compose the client-facing report from stored offers and matches. This is
 * deterministic and can be recomputed from SQLite at any time.
 */
export function buildReport({ run, offers, matches, properties, sources, steps }) {
  const sourcesById = new Map(sources.map((source) => [source.id, source]));
  const canonicalOffers = offers.filter((offer) => offer.canonical);
  const positions = buildPositions({ properties, canonicalOffers, matches })
    .sort((a, b) => {
      const aAbs = a.deltaPct === null ? -1 : Math.abs(a.deltaPct);
      const bAbs = b.deltaPct === null ? -1 : Math.abs(b.deltaPct);
      if (a.mirrors.length !== b.mirrors.length) return b.mirrors.length - a.mirrors.length;
      return bAbs - aAbs;
    });

  const benchmarked = positions.filter((position) => position.market);
  const deltas = benchmarked.map((position) => position.deltaPct).filter((value) => Number.isFinite(value));
  const medianDeltaPct = deltas.length ? round1(median(deltas)) : null;
  const counts = { overpriced: 0, competitive: 0, underpriced: 0, unknown: 0 };
  for (const position of benchmarked) counts[position.verdict] = (counts[position.verdict] || 0) + 1;

  const matchesByOffer = new Map(matches.map((match) => [match.offer_id, match]));
  const duplicatesByCanonical = new Map();
  const duplicateGroups = [];
  const offersByGroup = new Map();
  for (const offer of offers) {
    if (!offer.duplicate_group) continue;
    if (!offersByGroup.has(offer.duplicate_group)) offersByGroup.set(offer.duplicate_group, []);
    offersByGroup.get(offer.duplicate_group).push(offer);
  }
  for (const [group, groupOffers] of offersByGroup) {
    if (groupOffers.length < 2) continue;
    const canonical = groupOffers.find((offer) => offer.canonical) || groupOffers[0];
    duplicatesByCanonical.set(canonical.id, groupOffers.length - 1);
    duplicateGroups.push({
      group,
      canonicalId: canonical.id,
      offers: groupOffers.map((offer) => {
        const source = sourcesById.get(offer.source_id);
        return {
          id: offer.id,
          title: offer.title,
          sourceName: source?.name || 'Unknown source',
          sourceDomain: source?.domain || null,
          price_eur: offer.price_eur,
          canonical: Boolean(offer.canonical),
          url: offer.url,
        };
      }),
    });
  }

  const serialisedOffers = canonicalOffers.map((offer) => {
    const source = sourcesById.get(offer.source_id);
    const match = matchesByOffer.get(offer.id) || null;
    const comparison = match
      ? {
          propertyId: match.property_id,
          propertyRef: properties.find((property) => property.id === match.property_id)?.ref || match.property_ref,
          kind: match.kind,
          score: match.score,
          deltaPct: match.delta_pct,
          deltaAbs: match.delta_abs,
          reasons: match.reasons,
        }
      : null;
    return {
      id: offer.id,
      title: offer.title,
      url: offer.url,
      source: source
        ? { id: source.id, name: source.name, domain: source.domain, kind: source.kind, reliability: source.reliability }
        : { id: offer.source_id, name: 'Unknown source', domain: null, kind: 'unknown', reliability: 0.5 },
      transaction: offer.transaction,
      type: offer.type,
      city: offer.city,
      neighborhood: offer.neighborhood,
      region: offer.region,
      country: offer.country,
      bedrooms: offer.bedrooms,
      bathrooms: offer.bathrooms,
      area_m2: offer.area_m2,
      price: offer.price,
      currency: offer.currency,
      price_eur: offer.price_eur,
      period: offer.period,
      features: offer.features,
      seller: offer.seller,
      snippet: offer.snippet,
      confidence: offer.confidence,
      duplicateCount: duplicatesByCanonical.get(offer.id) || 0,
      comparison,
    };
  });

  const usedSourceIds = run.stats?.usedSourceIds || [...new Set(offers.map((offer) => offer.source_id))];
  const failedSourceIds = run.stats?.failedSourceIds || [];
  const usedSources = usedSourceIds
    .map((id) => sourcesById.get(id))
    .filter(Boolean)
    .map((source) => {
      const sourceOffers = offers.filter((offer) => offer.source_id === source.id);
      return {
        id: source.id,
        name: source.name,
        domain: source.domain,
        kind: source.kind,
        region: source.region,
        country: source.country,
        reliability: source.reliability,
        discoveredBy: source.discovered_by,
        offers: sourceOffers.length,
        mirrors: sourceOffers.filter((offer) => matchesByOffer.get(offer.id)?.kind === 'same_listing').length,
        failed: failedSourceIds.includes(source.id),
      };
    })
    .sort((a, b) => b.offers - a.offers);

  const discoveredIds = run.stats?.discoveredSourceIds || [];
  const discoveredSources = discoveredIds
    .map((id) => sourcesById.get(id))
    .filter(Boolean)
    .map((source) => ({
      id: source.id,
      name: source.name,
      domain: source.domain,
      kind: source.kind,
      region: source.region,
      country: source.country,
      reliability: source.reliability,
      discoveredBy: source.discovered_by,
    }));

  const recommendations = buildRecommendations(positions, run.filters, sourcesById);
  const overview = {
    offersFound: run.stats?.offersFound ?? offers.length,
    offersEligible: run.stats?.offersEligible ?? offers.length,
    offersRejected: run.stats?.offersRejected ?? 0,
    rejectionReasons: run.stats?.rejectionReasons ?? {},
    duplicatesCollapsed: run.stats?.duplicatesCollapsed ?? (offers.length - canonicalOffers.length),
    uniqueOffers: canonicalOffers.length,
    sourcesQueried: run.stats?.sourcesQueried ?? usedSources.length,
    sourcesResponded: run.stats?.sourcesResponded ?? usedSources.filter((source) => !source.failed).length,
    sourceFailures: run.stats?.sourceFailures ?? failedSourceIds.length,
    newSources: discoveredSources.length,
    ownListingsInScope: properties.length,
    ownListingsBenchmarked: benchmarked.length,
    mirrors: canonicalOffers.filter((offer) => matchesByOffer.get(offer.id)?.kind === 'same_listing').length,
    mirrorUndercuts: positions.filter((position) => (position.cheapestMirror?.deltaPct || 0) > 1).length,
    medianDeltaPct,
    overpriced: counts.overpriced,
    competitive: counts.competitive,
    underpriced: counts.underpriced,
    unknown: counts.unknown,
    avgConfidence: canonicalOffers.length
      ? Math.round((canonicalOffers.reduce((sum, offer) => sum + offer.confidence, 0) / canonicalOffers.length) * 100) / 100
      : null,
    currencyAdjusted: run.stats?.currencyAdjusted ?? canonicalOffers.filter((offer) => offer.currency !== 'EUR').length,
    annualGap: positions.reduce((sum, position) => sum + (position.gapAnnual || 0), 0),
  };

  const headline = buildHeadline(overview);
  const summary = overview.ownListingsBenchmarked
    ? `${overview.uniqueOffers} unique offers across ${overview.sourcesQueried} sources. ${overview.overpriced} listing${overview.overpriced === 1 ? '' : 's'} above market, ${overview.underpriced} below, ${overview.competitive} within the corridor.${overview.mirrorUndercuts ? ` ${overview.mirrorUndercuts} price undercut${overview.mirrorUndercuts === 1 ? '' : 's'} found on mirrored listings.` : ''}`
    : `${overview.uniqueOffers} offers were extracted and normalised. ${overview.ownListingsInScope ? `${overview.ownListingsInScope} portfolio listings were in scope but lacked sufficient comparables.` : 'No portfolio listings matched the brief.'}`;

  return {
    run: {
      id: run.id,
      threadId: run.thread_id,
      iteration: run.iteration,
      brief: run.brief,
      status: run.status,
      mode: run.mode,
      phase: run.phase,
      createdAt: run.created_at,
      startedAt: run.started_at,
      finishedAt: run.finished_at,
      durationMs: run.duration_ms,
      error: run.error,
    },
    filters: run.filters,
    overview,
    headline,
    summary,
    positions,
    recommendations,
    offers: serialisedOffers,
    sources: usedSources,
    discoveredSources,
    duplicates: duplicateGroups,
    steps: steps || [],
    generatedAt: new Date().toISOString(),
  };
}

export function emptyReport(run, steps = []) {
  return {
    run: {
      id: run.id,
      threadId: run.thread_id,
      iteration: run.iteration,
      brief: run.brief,
      status: run.status,
      mode: run.mode,
      phase: run.phase,
      createdAt: run.created_at,
      startedAt: run.started_at,
      finishedAt: run.finished_at,
      durationMs: run.duration_ms,
      error: run.error,
    },
    filters: run.filters,
    overview: {
      offersFound: 0,
      offersEligible: 0,
      offersRejected: 0,
      rejectionReasons: {},
      duplicatesCollapsed: 0,
      uniqueOffers: 0,
      sourcesQueried: 0,
      sourcesResponded: 0,
      sourceFailures: 0,
      newSources: 0,
      ownListingsInScope: 0,
      ownListingsBenchmarked: 0,
      mirrors: 0,
      mirrorUndercuts: 0,
      medianDeltaPct: null,
      overpriced: 0,
      competitive: 0,
      underpriced: 0,
      unknown: 0,
      avgConfidence: null,
      currencyAdjusted: 0,
      annualGap: 0,
    },
    headline: 'No report generated',
    summary: run.error || 'This run did not produce a report.',
    positions: [],
    recommendations: [],
    offers: [],
    sources: [],
    discoveredSources: [],
    duplicates: [],
    steps,
    generatedAt: new Date().toISOString(),
  };
}
