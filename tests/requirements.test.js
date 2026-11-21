import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyRequirementFields,
  parseBrief,
  regionsForLocations,
  requirementSummary,
} from '../server/domain/requirements.js';

const HARTMANN =
  'Long-term rental for a retired couple: 2–3 bedroom apartment or townhouse with sea view and pool access, around Lagos or Portimão. Budget up to €2,200 per month, furnished, move in February 2027. We would like to be within walking distance of the beach and a café.';

test('parses the Hartmann long-let brief', () => {
  const parsed = parseBrief(HARTMANN);
  assert.equal(parsed.transaction, 'rent');
  assert.deepEqual(parsed.propertyTypes, ['apartment', 'townhouse']);
  assert.deepEqual(parsed.locations, ['Lagos', 'Portimão']);
  assert.deepEqual(parsed.regions, ['Algarve']);
  assert.equal(parsed.budgetMax, 2200);
  assert.equal(parsed.bedroomsMin, 2);
  assert.equal(parsed.bedroomsMax, 3);
  assert.ok(parsed.mustHaves.includes('Sea view'));
  assert.ok(parsed.mustHaves.includes('Pool'));
  assert.ok(parsed.mustHaves.includes('Furnished'));
  assert.equal(parsed.moveIn, '2027-02');
  assert.equal(parsed.tenure, 'Long let');
  assert.ok(parsed.confidence >= 0.9);
});

test('parses a sales brief with a six-figure budget', () => {
  const parsed = parseBrief(
    'Buying a three-bedroom villa around Tavira with a pool and some garden. Budget €650,000, cash buyer, happy to renovate a little.'
  );
  assert.equal(parsed.transaction, 'sale');
  assert.deepEqual(parsed.propertyTypes, ['villa']);
  assert.deepEqual(parsed.locations, ['Tavira']);
  assert.equal(parsed.budgetMax, 650000);
  assert.equal(parsed.bedroomsMin, 3);
  assert.equal(parsed.bedroomsMax, 3);
  assert.deepEqual(parsed.mustHaves.sort(), ['Garden', 'Pool'].sort());
  assert.equal(parsed.tenure, '');
});

test('reads one-or-two bedroom ranges and Portuguese accents', () => {
  const parsed = parseBrief(
    'One or two bedroom furnished apartment in Lisbon for a work posting, up to €1,500 a month, from December, near a metro.'
  );
  assert.equal(parsed.bedroomsMin, 1);
  assert.equal(parsed.bedroomsMax, 2);
  assert.deepEqual(parsed.locations, ['Lisbon']);
  assert.equal(parsed.budgetMax, 1500);
  assert.equal(parsed.moveIn, '2026-12');
  assert.ok(parsed.mustHaves.includes('Furnished'));
  assert.ok(parsed.mustHaves.includes('Near metro'));

  const portimao = parseBrief('A two-bedroom apartment in Portimão for rent.');
  assert.deepEqual(portimao.locations, ['Portimão']);
});

test('does not confuse a bedroom range with a budget range', () => {
  const parsed = parseBrief(
    'A 2-3 bedroom apartment in Lagos, budget up to €2,200 per month, furnished.'
  );
  assert.equal(parsed.budgetMax, 2200);
  assert.equal(parsed.budgetMin, null);
});

test('structured fields override interpreted fields', () => {
  const parsed = parseBrief(HARTMANN, {
    transaction: 'sale',
    locations: ['Tavira'],
    budgetMax: 700000,
    bedroomsMin: 3,
    bedroomsMax: 4,
    mustHaves: ['Pool'],
    niceToHaves: ['Garden'],
    moveIn: '',
    tenure: '',
  });
  assert.equal(parsed.transaction, 'sale');
  assert.deepEqual(parsed.locations, ['Tavira']);
  assert.deepEqual(parsed.regions, ['Algarve']);
  assert.equal(parsed.budgetMax, 700000);
  assert.equal(parsed.bedroomsMin, 3);
  assert.deepEqual(parsed.mustHaves, ['Pool']);
  assert.deepEqual(parsed.niceToHaves, ['Garden']);
  assert.equal(parsed.tenure, '');
});

test('regions and human summaries are derived from locations', () => {
  assert.deepEqual(regionsForLocations(['Lagos', 'Portimão']), ['Algarve']);
  assert.deepEqual(regionsForLocations(['Lisbon', 'Cascais']), ['Lisbon']);
  const parsed = parseBrief(HARTMANN);
  const summary = requirementSummary(parsed);
  assert.match(summary, /2–3 bed apartment or townhouse/);
  assert.match(summary, /Lagos \/ Portimão/);
  assert.match(summary, /€2,200\/mo/);
});

test('keeps bare briefs honest with assumptions and lower confidence', () => {
  const parsed = parseBrief('Looking for a nice place in the sun.');
  assert.equal(parsed.transaction, 'rent');
  assert.equal(parsed.budgetMax, null);
  assert.deepEqual(parsed.locations, []);
  assert.ok(parsed.assumptions.includes('Budget to be confirmed'));
  assert.ok(parsed.confidence < 0.7);
});

test('applyRequirementFields removes tenure from a sale brief', () => {
  const parsed = parseBrief(HARTMANN);
  const sale = applyRequirementFields(parsed, { transaction: 'sale', moveIn: '', tenure: 'Long let' });
  assert.equal(sale.transaction, 'sale');
  assert.equal(sale.tenure, '');
});
