import {
  describeComparisonSteps,
  prepareComparison,
  subjectFromPortfolio,
} from '../domain/comparables.js';

function isoDaysAgo(days, hours = 0) {
  return new Date(Date.now() - days * 86_400_000 - hours * 3_600_000).toISOString();
}

function seedOneComparison(store, portfolioProperty, { daysAgo, durationMs }) {
  const subject = subjectFromPortfolio(portfolioProperty);
  const result = prepareComparison({
    subject,
    sources: store.listSources(),
  });
  const steps = describeComparisonSteps(result);
  const createdAt = isoDaysAgo(daysAgo);
  const startedAt = new Date(new Date(createdAt).getTime() + 1_500).toISOString();
  const finishedAt = new Date(new Date(startedAt).getTime() + durationMs).toISOString();

  const comparison = store.createComparison({
    mode: 'demo',
    subjectSource: 'portfolio',
    portfolioId: portfolioProperty.id,
    subjectRef: subject.ref,
    title: subject.title,
    transaction: subject.transaction,
    type: subject.type,
    city: subject.city,
    area: subject.area,
    bedrooms: subject.bedrooms,
    bathrooms: subject.bathrooms,
    areaM2: subject.areaM2,
    price: subject.price,
    currency: subject.currency,
    period: subject.period,
    features: subject.features,
    image: subject.image,
    description: subject.description,
    status: 'running',
    createdAt,
  });

  store.updateComparison(comparison.id, {
    status: 'completed',
    stats: JSON.stringify(result.stats),
    report: JSON.stringify(result),
    started_at: startedAt,
    finished_at: finishedAt,
    duration_ms: durationMs,
  });

  steps.forEach((step, index) => {
    const elapsed = Math.round((index / Math.max(1, steps.length - 1)) * durationMs);
    store.addComparisonStep(comparison.id, {
      seq: index + 1,
      phase: step.phase,
      level: step.level || 'info',
      message: step.message,
      detail: step.detail || null,
      ts: new Date(new Date(startedAt).getTime() + elapsed).toISOString(),
      elapsedMs: elapsed,
    });
  });

  return comparison;
}

/**
 * Seed completed analyses so the listing-first home page has evidence on first
 * load. These are generated through the same comparables engine as live runs.
 */
export function seedComparisons(store) {
  const count = store.db.prepare('SELECT COUNT(*) AS c FROM comparisons').get().c;
  if (Number(count) > 0) return;

  const portfolio = store.listPortfolio();
  const rentSubject = portfolio.find((property) => property.ref === 'PBR-1042');
  const saleSubject = portfolio.find((property) => property.ref === 'PBR-2024');
  const selected = [rentSubject, saleSubject].filter(Boolean);
  for (const [index, property] of selected.entries()) {
    seedOneComparison(store, property, {
      daysAgo: index === 0 ? 1 : 4,
      durationMs: index === 0 ? 38_000 : 31_000,
    });
  }
}
