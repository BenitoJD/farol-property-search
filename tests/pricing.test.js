import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalMarket } from '../server/seed/market.js';
import { PORTFOLIO } from '../server/seed/portfolio.js';
import {
  benchmarkPortfolio,
  cityKey,
  priceCheck,
  summariseShortlist,
  typeCompatibility,
} from '../server/domain/pricing.js';

const pool = canonicalMarket();

test('canonical market has unique clusters and expected breadth', () => {
  assert.ok(pool.length >= 50);
  const clusters = new Set(pool.map((listing) => listing.cluster));
  assert.equal(clusters.size, pool.length);
  assert.ok(pool.some((listing) => listing.city === 'Lagos'));
  assert.ok(pool.some((listing) => listing.transaction === 'sale'));
});

test('price check finds comparables and classifies an at-market asking price', () => {
  const target = pool.find((listing) => listing.cluster === 'lagos-t2-meia-praia-96');
  const check = priceCheck({ ...target, id: 'target-lagos' }, pool);
  assert.equal(check.available, true);
  assert.ok(check.count >= 2);
  assert.ok(check.median > 1000);
  assert.ok(['above', 'at', 'below'].includes(check.verdict));
  assert.ok(check.medianPerM2 > 0);
  assert.ok(check.comparables.every((comp) => comp.price > 0));
});

test('a property is never used as its own comparable', () => {
  const target = pool.find((listing) => listing.cluster === 'portimao-t2-rocha-85');
  const check = priceCheck(
    {
      id: 'different-id',
      cluster: target.cluster,
      city: target.city,
      type: target.type,
      transaction: target.transaction,
      bedrooms: target.bedrooms,
      areaM2: target.areaM2,
      price: target.price,
      features: target.features,
      listedDaysAgo: 5,
    },
    pool
  );
  assert.ok(check.comparables.every((comp) => comp.id !== target.id));
});

test('an overpriced home gets a suggested offer inside the comparable range', () => {
  const target = pool.find((listing) => listing.cluster === 'portimao-t3-rocha-118');
  const inflated = { ...target, id: 'inflated', price: target.price * 1.18 };
  const check = priceCheck(inflated, pool);
  assert.equal(check.verdict, 'above');
  assert.ok(check.suggestedOffer < inflated.price);
  assert.ok(check.offerLow <= check.offerHigh);
  assert.ok(check.potentialSaving > 0);
});

test('no comparables returns an honest unknown', () => {
  const check = priceCheck(
    {
      id: 'isolated',
      city: 'Sagres',
      type: 'penthouse',
      transaction: 'rent',
      bedrooms: 5,
      areaM2: 500,
      price: 9000,
      features: [],
    },
    pool
  );
  assert.equal(check.available, false);
  assert.equal(check.verdict, 'unknown');
  assert.equal(check.count, 0);
});

test('city aliases normalise nearby areas without merging unrelated towns', () => {
  assert.equal(cityKey('Praia da Luz'), 'Lagos');
  assert.equal(cityKey('Alvor'), 'Portimão');
  assert.equal(cityKey('Estoril'), 'Cascais');
  assert.equal(cityKey('Tavira'), 'Tavira');
  assert.ok(typeCompatibility('townhouse', 'house') > 0.5);
  assert.equal(typeCompatibility('apartment', 'villa'), 0);
});

test('portfolio benchmark covers the seeded book and returns recommendations', () => {
  const benchmark = benchmarkPortfolio(PORTFOLIO, pool);
  assert.equal(benchmark.summary.total, PORTFOLIO.length);
  assert.ok(benchmark.summary.benchmarked >= 18);
  assert.equal(
    benchmark.summary.benchmarked + benchmark.summary.noEvidence,
    benchmark.summary.total
  );
  assert.equal(
    benchmark.summary.above + benchmark.summary.at + benchmark.summary.below,
    benchmark.summary.benchmarked
  );
  assert.ok(benchmark.findings.length > 0);
  assert.ok(benchmark.rows.every((row) => ['rent', 'sale'].includes(row.transaction)));
  assert.ok(benchmark.rows.some((row) => row.check.available && row.suggestedPrice));
});

test('shortlist summary uses singular grammar and a negotiation figure', () => {
  const target = pool.find((listing) => listing.cluster === 'portimao-t3-rocha-118');
  const check = priceCheck({ ...target, id: 'one-above', price: target.price * 1.2 }, pool);
  const summary = summariseShortlist([{ listing: { ...target, priceCheck: check } }]);
  assert.equal(summary.count, 1);
  assert.match(summary.narrative, /1 of 1 sits above/);
  assert.ok(summary.monthlyHeadroom > 0);
});
