import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBrief, selectProperties, locationMatches } from '../server/agent/brief.js';
import { SEED_PROPERTIES } from '../server/seed/data.js';

const FX = { EUR: 1, GBP: 1.17, USD: 0.92 };

test('parses the signature Algarve long-let brief', () => {
  const filters = parseBrief(
    'Long-term rental for a retired couple: 2–3 bedroom apartment or townhouse with sea view and pool access, around Lagos or Portimão, budget up to €2,200/month. Prefer walkable to amenities.',
    { fx: FX }
  );
  assert.equal(filters.transaction, 'rent');
  assert.deepEqual(filters.types.sort(), ['apartment', 'townhouse']);
  assert.deepEqual(filters.locations.sort(), ['Lagos', 'Portimão']);
  assert.equal(filters.bedsMin, 2);
  assert.equal(filters.bedsMax, 3);
  assert.equal(filters.budget, 2200);
  assert.equal(filters.budgetCurrency, 'EUR');
  assert.ok(filters.features.includes('Sea view'));
  assert.ok(filters.features.includes('Pool'));
  assert.ok(filters.confidence >= 0.8);
  assert.match(filters.summary, /Long-term rental/);
  assert.match(filters.searchQuery, /2-3 bedroom/);
});

test('parses a sale brief with a compact price', () => {
  const filters = parseBrief('Buy a 3-bed villa in Vilamoura under €700k with a private pool.', { fx: FX });
  assert.equal(filters.transaction, 'sale');
  assert.deepEqual(filters.types, ['villa']);
  assert.equal(filters.bedsMin, 3);
  assert.equal(filters.bedsMax, 3);
  assert.equal(filters.budget, 700_000);
  assert.deepEqual(filters.locations, ['Vilamoura']);
  assert.ok(filters.features.includes('Private pool'));
});

test('understands T-format bedrooms and multiple towns', () => {
  const filters = parseBrief('T2 in Tavira or Faro for a couple; long let.', { fx: FX });
  assert.equal(filters.transaction, 'rent');
  assert.equal(filters.bedsMin, 2);
  assert.equal(filters.bedsMax, 2);
  assert.deepEqual(filters.locations.sort(), ['Faro', 'Tavira']);
  assert.deepEqual(filters.types, []);
});

test('converts a GBP budget into EUR', () => {
  const filters = parseBrief('Long-term rental in Lisbon, two bedrooms, up to £1,500 per month.', { fx: FX });
  assert.equal(filters.budget, 1755);
  assert.ok(filters.assumptions.some((line) => line.includes('converted to EUR')));
});

test('defaults unknown briefs to the Algarve and explains why', () => {
  const filters = parseBrief('Somewhere sunny with two bedrooms and a garden.', { fx: FX });
  assert.equal(filters.transaction, 'rent');
  assert.deepEqual(filters.regions, ['Algarve']);
  assert.ok(filters.assumptions.some((line) => line.includes('defaulted to the Algarve')));
  assert.ok(filters.assumptions.some((line) => line.includes('assumed a long-term rental')));
});

test('form overrides beat the prose', () => {
  const filters = parseBrief('T2 in Lagos up to €1,500 per month.', {
    fx: FX,
    overrides: { transaction: 'sale', location: 'Portimão', budget: 320_000, bedsMin: 3, bedsMax: 4, types: ['villa'] },
  });
  assert.equal(filters.transaction, 'sale');
  assert.deepEqual(filters.locations, ['Portimão']);
  assert.equal(filters.budget, 320_000);
  assert.equal(filters.bedsMin, 3);
  assert.equal(filters.bedsMax, 4);
  assert.deepEqual(filters.types, ['villa']);
});

test('selects only portfolio homes inside the brief', () => {
  const filters = parseBrief(
    '2–3 bedroom apartment or townhouse in Lagos or Portimão, long-term rental, up to €2,200/month.',
    { fx: FX }
  );
  const inScope = selectProperties(SEED_PROPERTIES, filters);
  assert.deepEqual(inScope.map((property) => property.ref).sort(), ['PBR-1042', 'PBR-1067', 'PBR-1088', 'PBR-1093']);
  assert.ok(inScope.every((property) => property.transaction === 'rent'));
  assert.ok(inScope.every((property) => property.price <= 2200));
});

test('strict location matching respects city and region', () => {
  const filters = parseBrief('2 bedroom long let anywhere in the Algarve.', { fx: FX });
  assert.equal(locationMatches({ city: 'Tavira', region: 'Algarve', country: 'Portugal' }, filters), true);
  assert.equal(locationMatches({ city: 'Lisbon', region: 'Lisbon', country: 'Portugal' }, filters), false);
});
