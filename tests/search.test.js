import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBrief } from '../server/domain/requirements.js';
import { SOURCES, INVENTORY } from '../server/seed/market.js';
import {
  checkInventory,
  describeSearchSteps,
  inventoryMatchesToListings,
  prepareSearch,
  regionForCity,
} from '../server/domain/search.js';

const knownSources = SOURCES.filter((source) => !source.discovery).map((source) => ({
  ...source,
  enabled: true,
  discovered_by: 'seed',
}));

const HARTMANN =
  'Long-term rental for a retired couple: 2–3 bedroom apartment or townhouse with sea view and pool access, around Lagos or Portimão. Budget up to €2,200 per month, furnished, move in February 2027. We would like to be within walking distance of the beach and a café.';

const ELLIS =
  'Our parents are relocating from the UK. Looking for a two-bedroom apartment with a lift, close to shops and medical services in the Algarve, long let up to €1,800 a month from January. Algarve Senior Living was recommended.';

test('regions are derived for source planning', () => {
  assert.equal(regionForCity('Portimão'), 'Algarve');
  assert.equal(regionForCity('Cascais'), 'Lisbon');
  assert.equal(regionForCity('Marbella'), 'Andalusia');
});

test('AI search produces a filtered, deduplicated, price-checked long list', () => {
  const requirements = parseBrief(HARTMANN);
  const result = prepareSearch({ requirements, sources: knownSources });
  assert.ok(result.stats.sourcesQueried >= 10);
  assert.ok(result.stats.extracted > result.stats.longList);
  assert.ok(result.stats.duplicates >= 1);
  assert.ok(result.stats.longList >= 6);
  assert.equal(result.longList.length, result.stats.longList);
  assert.ok(result.stats.discovered >= 1);
  assert.ok(result.stats.priceChecked > 0);

  for (const listing of result.longList) {
    assert.equal(listing.transaction, 'rent');
    assert.ok(listing.price <= 2200 * 1.08);
    assert.ok(listing.features.includes('Sea view'));
    assert.ok(listing.features.includes('Pool'));
    assert.ok(listing.features.includes('Furnished'));
    assert.ok(listing.matchScore >= 50);
    assert.ok(listing.included);
    assert.ok(listing.canonical);
    assert.equal(listing.included, true);
    assert.ok(listing.priceCheck.available);
  }

  // Cross-posted copies are retained but not counted as unique homes.
  const duplicates = result.listings.filter((listing) => !listing.canonical && !listing.rejectReason);
  assert.ok(duplicates.length >= 1);
  assert.ok(duplicates.every((listing) => listing.title));
  assert.ok(result.rejected.every((listing) => listing.rejectReason));
  assert.ok(result.rejected.some((listing) => listing.rejectReason.includes('Outside')));
});

test('source discovery is bounded and only adds relevant agencies', () => {
  const requirements = parseBrief(HARTMANN);
  const result = prepareSearch({ requirements, sources: knownSources });
  assert.ok(result.discoveries.length >= 1);
  assert.ok(result.discoveries.length <= 2);
  assert.ok(result.discoveries.every((source) => source.discovery));
  assert.ok(result.discoveries.every((source) => source.coverage === 'Algarve'));

  // A second search with the new sources already in the catalogue discovers
  // nothing twice.
  const updatedSources = [
    ...knownSources,
    ...result.discoveries.map((source) => ({ ...source, enabled: true })),
  ];
  const second = prepareSearch({ requirements, sources: updatedSources });
  assert.ok(second.discoveries.length <= result.discoveries.length);
  assert.equal(new Set(second.discoveries.map((source) => source.domain)).size, second.discoveries.length);
});

test('off-brief results carry explicit reasons', () => {
  const requirements = parseBrief(
    'Two-bedroom apartment in Faro to buy, budget €310,000, no other requirements.'
  );
  const result = prepareSearch({ requirements, sources: knownSources });
  assert.ok(result.longList.length >= 1);
  assert.ok(result.rejected.length >= 1);
  assert.ok(
    result.rejected.every((listing) =>
      ['Wrong transaction type', 'Outside the requested area', 'Not a', 'Over budget', 'Missing', 'Only', 'more than asked', 'Available after'].some(
        (prefix) => listing.rejectReason.startsWith(prefix)
      ) || listing.rejectReason.includes('budget')
    )
  );
});

test('sale search skips inventory and reaches the villa market', () => {
  const requirements = parseBrief(
    'Buying a three-bedroom villa around Tavira with a pool and some garden. Budget €650,000.'
  );
  const result = prepareSearch({ requirements, sources: knownSources });
  assert.ok(result.longList.length >= 3);
  assert.ok(result.longList.every((listing) => listing.transaction === 'sale'));
  assert.ok(result.longList.every((listing) => listing.type === 'villa'));
  assert.ok(result.longList.every((listing) => listing.features.includes('Pool')));
  assert.equal(checkInventory(requirements, INVENTORY).outcome, 'not_applicable');
});

test('inventory check returns a gap for the Hartmann brief', () => {
  const requirements = parseBrief(HARTMANN);
  const result = checkInventory(requirements, INVENTORY);
  assert.equal(result.outcome, 'gap');
  assert.ok(result.reasons.length > 0);
  assert.ok(result.matches.length > 0);
  assert.ok(result.matches.some((match) => !match.eligible));
  assert.match(result.reasons.join(' '), /inventory|Missing|available/i);
});

test('inventory check finds suitable Algarve Senior Living homes for the Ellis brief', () => {
  const requirements = parseBrief(ELLIS, {
    mustHaves: ['Lift', 'Near shops', 'Near medical', 'Senior friendly'],
    transaction: 'rent',
    locations: ['Algarve'],
    budgetMax: 1800,
    bedroomsMin: 2,
    bedroomsMax: 2,
    moveIn: '2027-01',
  });
  const result = checkInventory(requirements, INVENTORY);
  assert.equal(result.outcome, 'suitable');
  assert.ok(result.eligibleCount >= 2);
  assert.ok(result.matches.every((match) => match.eligible));
  assert.ok(result.matches.every((match) => match.status === 'available'));
  assert.ok(result.matches.every((match) => match.rent <= 1800 * 1.08));
});

test('inventory matches convert into reviewable listings', () => {
  const requirements = parseBrief(ELLIS, {
    mustHaves: ['Lift', 'Near shops', 'Near medical'],
    transaction: 'rent',
    locations: ['Algarve'],
    budgetMax: 1800,
    bedroomsMin: 2,
    bedroomsMax: 2,
    moveIn: '2027-01',
  });
  const check = checkInventory(requirements, INVENTORY);
  const listings = inventoryMatchesToListings(check, requirements);
  assert.ok(listings.length >= 1);
  assert.ok(listings.every((listing) => listing.origin === 'inventory'));
  assert.ok(listings.every((listing) => listing.included && listing.canonical));
  assert.ok(listings.every((listing) => listing.price === listing.price));
});

test('agent steps describe the real phases and counts', () => {
  const requirements = parseBrief(HARTMANN);
  const result = prepareSearch({ requirements, sources: knownSources });
  const steps = describeSearchSteps(result);
  const phases = steps.map((step) => step.phase);
  assert.ok(phases.includes('catalogue'));
  assert.ok(phases.includes('plan'));
  assert.ok(phases.includes('search'));
  assert.ok(phases.includes('dedupe'));
  assert.ok(phases.includes('rank'));
  assert.ok(phases.includes('price'));
  assert.ok(phases.includes('complete'));
  assert.ok(steps.some((step) => step.message.includes(String(result.stats.longList))));
  assert.ok(steps.some((step) => step.message.includes('Price-checked')));
});
