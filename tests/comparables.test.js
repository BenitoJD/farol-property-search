import test from 'node:test';
import assert from 'node:assert/strict';
import { PORTFOLIO } from '../server/seed/portfolio.js';
import { SOURCES } from '../server/seed/market.js';
import {
  comparisonQueries,
  describeComparisonSteps,
  prepareComparison,
  subjectFromInput,
  subjectFromPortfolio,
} from '../server/domain/comparables.js';

const sources = SOURCES.map((source) => ({ ...source, enabled: true }));

function portfolioSubject(ref) {
  return subjectFromPortfolio(PORTFOLIO.find((property) => property.ref === ref));
}

test('a portfolio apartment produces a defensible below-market report', () => {
  const subject = portfolioSubject('PBR-1042');
  const result = prepareComparison({ subject, sources });

  assert.equal(result.mode, 'demo');
  assert.equal(result.subject.ref, 'PBR-1042');
  assert.equal(result.subject.price, 1650);
  assert.ok(result.check.available);
  assert.equal(result.check.count, 5);
  assert.equal(result.check.median, 2100);
  assert.equal(result.check.verdict, 'below');
  assert.ok(result.check.deltaPct < -7);
  assert.equal(result.narrative.suggestedPrice, 2100);
  assert.deepEqual(result.narrative.valueRange, [2050, 2150]);
  assert.ok(result.competitors.length >= 3);
  assert.ok(result.coverage.marketListings > 50);
  assert.ok(result.coverage.sourcesWithComps >= 2);
  assert.equal(result.coverage.selfExcluded, 1);
});

test('a subject is never compared with what looks like its own listing', () => {
  const subject = portfolioSubject('PBR-1042');
  const result = prepareComparison({ subject, sources });
  assert.ok(
    result.comps.every(
      (comp) => comp.title.trim().toLowerCase() !== subject.title.trim().toLowerCase()
    )
  );
  assert.ok(result.coverage.selfExcluded >= 1);
});

test('the report copy does not duplicate per-month suffixes', () => {
  const result = prepareComparison({ subject: portfolioSubject('PBR-1042'), sources });
  const text = [
    result.narrative.summary,
    result.narrative.recommendation.label,
    result.narrative.recommendation.detail,
    ...result.narrative.bullets,
  ].join(' ');
  assert.doesNotMatch(text, /\/mo\/mo|\/month\/month|\/mo\/month/);
});

test('competitor rows are coherent and comparable to the ask', () => {
  const result = prepareComparison({ subject: portfolioSubject('PBR-1042'), sources });
  assert.ok(result.competitors.length >= 1);
  for (const competitor of result.competitors) {
    assert.ok(Number.isFinite(competitor.median));
    assert.ok(competitor.listings >= 1);
    assert.ok(Number.isFinite(competitor.deltaPct));
    assert.ok(competitor.medianPerM2 === null || competitor.medianPerM2 > 0);
    assert.ok(competitor.min <= competitor.median);
    assert.ok(competitor.max >= competitor.median);
  }
});

test('a manual listing uses the same engine and returns an evidence trail', () => {
  const subject = subjectFromInput({
    title: 'Two-bedroom apartment with sea view, Lagos',
    transaction: 'rent',
    type: 'apartment',
    city: 'Lagos',
    area: 'Meia Praia',
    bedrooms: 2,
    bathrooms: 2,
    areaM2: 95,
    price: 2100,
    features: ['Sea view', 'Pool', 'Furnished'],
  });
  const result = prepareComparison({ subject, sources });
  assert.equal(result.subject.source, 'manual');
  assert.ok(result.check.count >= 3);
  assert.ok(result.check.verdict === 'at' || result.check.verdict === 'below' || result.check.verdict === 'above');
  const steps = describeComparisonSteps(result);
  assert.ok(steps.length >= 9);
  assert.ok(steps.some((step) => step.phase === 'dedupe'));
  assert.ok(steps.some((step) => step.phase === 'value'));
});

test('a location with no market evidence returns an honest coverage gap', () => {
  const subject = subjectFromInput({
    title: 'Four-bedroom penthouse in Sagres',
    transaction: 'rent',
    type: 'penthouse',
    city: 'Sagres',
    area: 'Sagres',
    bedrooms: 4,
    bathrooms: 4,
    areaM2: 300,
    price: 9000,
    features: [],
  });
  const result = prepareComparison({ subject, sources });
  assert.equal(result.check.available, false);
  assert.equal(result.narrative.suggestedPrice, null);
  assert.equal(result.narrative.valueRange, null);
  assert.match(result.narrative.headline, /Not enough comparable evidence/i);
  assert.equal(result.stats.comps, 0);
});

test('search queries are specific to the subject listing', () => {
  const queries = comparisonQueries({
    bedrooms: 2,
    type: 'apartment',
    transaction: 'rent',
    city: 'Lagos',
    area: 'Meia Praia',
    features: ['Sea view'],
  });
  assert.ok(queries.some((query) => query.includes('2-bed apartment')));
  assert.ok(queries.some((query) => query.includes('Lagos')));
  assert.ok(queries.some((query) => query.includes('for rent')));
});
