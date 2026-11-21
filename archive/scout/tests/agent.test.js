import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deduplicate,
  detectSameListing,
  matchOffers,
  offerRejectionReason,
  scoreComparable,
} from '../server/agent/matching.js';
import { median, percentileRank, classifyGap, summarizePrices, pctChange } from '../server/lib/stats.js';
import { convertToEur } from '../server/lib/fx.js';

const property = {
  id: 'p_1042',
  ref: 'PBR-1042',
  title: 'Marina-front two-bedroom with sea views',
  transaction: 'rent',
  type: 'apartment',
  city: 'Lagos',
  neighborhood: 'Marina de Lagos',
  region: 'Algarve',
  country: 'Portugal',
  bedrooms: 2,
  bathrooms: 2,
  area_m2: 94,
  price: 1650,
  currency: 'EUR',
  period: 'month',
  features: ['Sea view', 'Furnished', 'Terrace'],
};

function offer(overrides = {}) {
  return {
    id: 'off_1',
    source_id: 'src_idealista_pt',
    title: 'Marina-front two-bedroom with sea views | New to the market',
    snippet: 'Ref. PBR-1042. Marina-front two-bedroom with sea views.',
    transaction: 'rent',
    type: 'apartment',
    city: 'Lagos',
    neighborhood: 'Marina de Lagos',
    region: 'Algarve',
    country: 'Portugal',
    bedrooms: 2,
    bathrooms: 2,
    area_m2: 94,
    price: 1525,
    currency: 'EUR',
    price_eur: 1525,
    period: 'month',
    features: ['Sea view', 'Furnished'],
    confidence: 0.9,
    ...overrides,
  };
}

const filters = {
  transaction: 'rent',
  types: ['apartment', 'townhouse'],
  locations: ['Lagos', 'Portimão'],
  regions: ['Algarve'],
  countries: ['Portugal'],
  bedsMin: 2,
  bedsMax: 3,
  budget: 2200,
};

test('detects a mirrored portfolio listing', () => {
  const same = detectSameListing(offer(), property);
  assert.ok(same);
  assert.equal(same.kind, 'same_listing');
  assert.ok(same.score >= 90);
  assert.ok(same.reasons.some((reason) => reason.includes('reference')));
});

test('does not mistake a different property for a mirror', () => {
  const other = offer({
    title: 'Three-bed townhouse with private pool in Praia da Luz',
    type: 'townhouse',
    city: 'Lagos',
    bedrooms: 3,
    area_m2: 142,
    price_eur: 2150,
    price: 2150,
    snippet: '',
  });
  assert.equal(detectSameListing(other, property), null);
});

test('scores a comparable with room-count tolerance', () => {
  const comparable = offer({
    title: 'Two-bedroom apartment near the marina',
    snippet: '',
    bedrooms: 3,
    area_m2: 108,
    price_eur: 1700,
    price: 1700,
  });
  const match = scoreComparable(comparable, property);
  assert.ok(match);
  assert.equal(match.kind, 'comparable');
  assert.ok(match.score >= 55);
});

test('rejects offers outside the brief', () => {
  assert.equal(offerRejectionReason(offer({ transaction: 'sale' }), filters), 'transaction');
  assert.equal(offerRejectionReason(offer({ type: 'villa' }), filters), 'type');
  assert.equal(offerRejectionReason(offer({ city: 'Lisbon' }), filters), 'location');
  assert.equal(offerRejectionReason(offer({ bedrooms: 5 }), filters), 'bedrooms');
  assert.equal(offerRejectionReason(offer({ price_eur: 5000, price: 5000 }), filters), 'budget');
  assert.equal(offerRejectionReason(offer(), filters), null);
});

test('collapses cross-posted duplicates and keeps the most confident copy', () => {
  const a = offer({ id: 'off_a', source_id: 'src_idealista_pt', confidence: 0.9, price_eur: 1525 });
  const b = offer({ id: 'off_b', source_id: 'src_casasapo', confidence: 0.75, price_eur: 1525 });
  const c = offer({
    id: 'off_c',
    title: 'Three-bed townhouse with private pool',
    type: 'townhouse',
    bedrooms: 3,
    area_m2: 142,
    price_eur: 2150,
    price: 2150,
    confidence: 0.88,
  });
  const sources = new Map([
    ['src_idealista_pt', { reliability: 0.93 }],
    ['src_casasapo', { reliability: 0.84 }],
  ]);
  const result = deduplicate([a, b, c], sources);
  assert.equal(result.collapsed, 1);
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].offers.length, 2);
  assert.equal(a.canonical, true);
  assert.equal(b.canonical, false);
  assert.equal(c.canonical, true);
  assert.equal(a.duplicate_group, b.duplicate_group);
});

test('prefers a mirror match over a comparable match', () => {
  const mirror = offer({ id: 'off_mirror', price_eur: 1525, price: 1525 });
  const comparable = offer({
    id: 'off_comp',
    title: 'Apartment with sea views in Lagos old town',
    snippet: '',
    bedrooms: 2,
    area_m2: 88,
    price_eur: 1600,
    price: 1600,
  });
  const { matches } = matchOffers([mirror, comparable], [property]);
  const mirrorMatch = matches.find((match) => match.offer_id === 'off_mirror');
  const comparableMatch = matches.find((match) => match.offer_id === 'off_comp');
  assert.equal(mirrorMatch.kind, 'same_listing');
  assert.equal(comparableMatch.kind, 'comparable');
  assert.equal(mirrorMatch.property_id, property.id);
});

test('price statistics are stable and interpretable', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 2]), 3);
  const summary = summarizePrices([1600, 1650, 1500, 2000]);
  assert.equal(summary.count, 4);
  assert.equal(summary.median, 1625);
  assert.equal(summary.p25, 1575);
  assert.equal(summary.p75, 1738);
  assert.equal(percentileRank([1000, 1500, 2000], 1500), 50);
  assert.equal(classifyGap(8), 'overpriced');
  assert.equal(classifyGap(-8), 'underpriced');
  assert.equal(classifyGap(2), 'competitive');
  assert.equal(pctChange(1000, 1100), 10);
});

test('FX conversion handles supported and unsupported currencies', () => {
  const fx = { EUR: 1, GBP: 1.17, USD: 0.92 };
  assert.equal(convertToEur(1000, 'GBP', fx), 1170);
  assert.equal(convertToEur(1000, 'USD', fx), 920);
  assert.equal(convertToEur(1000, 'CHF', fx), null);
  assert.equal(convertToEur(1000, 'EUR', fx), 1000);
});
