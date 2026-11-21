import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { fetchJson, startTestApp, waitFor } from './helpers.js';

let ctx;
let base;

before(async () => {
  ctx = await startTestApp();
  base = ctx.base;
});

after(async () => {
  await ctx.app.close();
});

test('health and meta describe a seeded demo', async () => {
  const health = await fetchJson(base, '/api/health');
  assert.equal(health.response.status, 200);
  assert.equal(health.json.data.mode, 'demo');
  assert.equal(health.json.data.cases, 7);

  const meta = await fetchJson(base, '/api/meta');
  assert.equal(meta.response.status, 200);
  assert.equal(meta.json.data.app, 'Farol');
  assert.equal(meta.json.data.counts.sources, 20);
  assert.equal(meta.json.data.counts.inventory, 14);
  assert.equal(meta.json.data.counts.portfolio, 20);
  assert.deepEqual(meta.json.data.stages, [
    'enquiry',
    'requirements',
    'inventory',
    'ai_search',
    'review',
    'client',
    'closed',
  ]);
});

test('dashboard returns the casebook, price read and catalogue growth', async () => {
  const { response, json } = await fetchJson(base, '/api/dashboard');
  assert.equal(response.status, 200);
  const data = json.data;
  assert.equal(data.cases.length, 7);
  assert.equal(data.metrics.activeCases, 6);
  assert.equal(data.metrics.withClient, 1);
  assert.ok(data.pipeline.review >= 2);
  assert.ok(data.attention.length >= 3);
  assert.ok(data.catalogueGrowth.length === 8);
  assert.equal(data.portfolio.summary.total, 20);
  assert.ok(data.portfolio.summary.benchmarked >= 18);
  assert.ok(data.activity.length > 0);
});

test('Hartmann case exposes the human-reviewed shortlist and client feedback', async () => {
  const { json } = await fetchJson(base, '/api/cases/FRL-2408');
  const bundle = json.data;
  assert.equal(bundle.case.stage, 'client');
  assert.equal(bundle.currentRequirement.budgetMax, 2200);
  assert.ok(bundle.listings.length > 0);
  assert.equal(bundle.shortlist.status, 'shared');
  assert.equal(bundle.shortlist.items.length, 4);
  assert.equal(bundle.shortlist.items.filter((item) => item.clientDecision === 'interested').length, 1);
  assert.equal(bundle.feedback[0].overall, 'refine');
  assert.ok(bundle.priceSummary.shortlist.count >= 3);
  assert.ok(bundle.shortlist.items.every((item) => item.listing.priceCheck));
  assert.ok(bundle.events.some((event) => event.type === 'feedback'));
});

test('complete lifecycle: inventory gap, search, shortlist, share, feedback, iterate', async () => {
  const initial = await fetchJson(base, '/api/cases/FRL-2410');
  assert.equal(initial.json.data.case.stage, 'inventory');
  assert.equal(initial.json.data.inventoryCheck.outcome, 'gap');

  const search = await fetchJson(base, '/api/cases/FRL-2410/search', { method: 'POST', body: {} });
  assert.equal(search.response.status, 202);
  assert.ok(search.json.data.run.id);

  const completed = await waitFor(async () => {
    const result = await fetchJson(base, '/api/cases/FRL-2410');
    return ['completed', 'failed'].includes(result.json.data.latestRun?.status)
      ? result.json.data
      : null;
  });
  assert.equal(completed.latestRun.status, 'completed');
  assert.equal(completed.case.stage, 'review');
  assert.ok(completed.latestRun.stats.longList >= 3);
  const included = completed.listings.filter((listing) => listing.included && listing.canonical);
  assert.ok(included.length >= 3);
  assert.ok(included.every((listing) => listing.priceCheck));

  const created = await fetchJson(base, '/api/cases/FRL-2410/shortlist', {
    method: 'POST',
    body: {
      items: included.slice(0, 2).map((listing, index) => ({
        listingId: listing.id,
        rationale: `Reviewed rationale ${index + 1}.`,
      })),
      summary: 'Two reviewed Lisbon homes.',
    },
  });
  assert.equal(created.response.status, 201);
  const shortlist = created.json.data.shortlist;
  assert.equal(shortlist.status, 'draft');
  assert.equal(shortlist.items.length, 2);

  const draftPortal = await fetchJson(base, `/api/portal/${shortlist.token}`);
  assert.equal(draftPortal.response.status, 404);

  const shared = await fetchJson(base, `/api/cases/FRL-2410/shortlists/${shortlist.id}/share`, {
    method: 'POST',
    body: {},
  });
  assert.equal(shared.response.status, 200);
  assert.equal(shared.json.data.shortlist.status, 'shared');
  assert.equal(shared.json.data.case.stage, 'client');

  const portal = await fetchJson(base, `/api/portal/${shortlist.token}`);
  assert.equal(portal.response.status, 200);
  assert.equal(portal.json.data.items.length, 2);
  assert.equal(portal.json.data.feedback, null);
  assert.ok(portal.json.data.priceSummary.count >= 1);

  const feedback = await fetchJson(base, `/api/portal/${shortlist.token}/feedback`, {
    method: 'POST',
    body: {
      overall: 'refine',
      comment: 'Please add parking as a must-have.',
      submittedBy: 'James Whitfield',
      decisions: [
        {
          shortlistItemId: portal.json.data.items[0].id,
          decision: 'interested',
          comment: 'A good fit.',
        },
        {
          shortlistItemId: portal.json.data.items[1].id,
          decision: 'question',
          comment: 'Is there a lift?',
        },
      ],
    },
  });
  assert.equal(feedback.response.status, 200);
  assert.equal(feedback.json.data.feedback.overall, 'refine');
  assert.equal(feedback.json.data.status, 'feedback');

  const afterFeedback = await fetchJson(base, '/api/cases/FRL-2410');
  assert.equal(afterFeedback.json.data.case.stage, 'client');
  assert.ok(afterFeedback.json.data.feedback.length >= 1);
  assert.equal(afterFeedback.json.data.shortlist.items[0].clientDecision, 'interested');

  const iterated = await fetchJson(base, '/api/cases/FRL-2410/iterate', {
    method: 'POST',
    body: { note: 'Add parking as a must-have.', applyFeedback: true },
  });
  assert.equal(iterated.response.status, 201);
  assert.equal(iterated.json.data.case.stage, 'requirements');
  assert.equal(iterated.json.data.case.iteration, 2);
  assert.ok(iterated.json.data.draftRequirement);
  assert.equal(iterated.json.data.draftRequirement.confirmedAt, null);

  const draft = iterated.json.data.draftRequirement;
  const confirmed = await fetchJson(base, '/api/cases/FRL-2410/requirements', {
    method: 'POST',
    body: {
      brief: draft.brief,
      transaction: draft.transaction,
      propertyTypes: draft.propertyTypes,
      locations: draft.locations,
      budgetMin: draft.budgetMin,
      budgetMax: draft.budgetMax,
      bedroomsMin: draft.bedroomsMin,
      bedroomsMax: draft.bedroomsMax,
      mustHaves: [...draft.mustHaves, 'Parking'],
      niceToHaves: draft.niceToHaves,
      moveIn: draft.moveIn,
      tenure: draft.tenure,
      notes: draft.notes,
      confirm: true,
    },
  });
  assert.equal(confirmed.response.status, 200);
  assert.equal(confirmed.json.data.case.stage, 'inventory');
  assert.ok(confirmed.json.data.currentRequirement.mustHaves.includes('Parking'));
});

test('a purchase brief skips inventory and reaches the sales market', async () => {
  const created = await fetchJson(base, '/api/cases', {
    method: 'POST',
    body: {
      client: {
        name: 'Sales Test',
        email: 'sales.test@example.com',
        phone: '+351 900 111 222',
        source: 'Website',
      },
      transaction: 'sale',
      brief: 'Two-bedroom apartment in Tavira to buy, budget €650,000, must have parking and a terrace.',
      owner: 'Tomás Reis',
    },
  });
  assert.equal(created.response.status, 201);
  const caseRow = created.json.data.case;
  assert.equal(caseRow.stage, 'enquiry');
  assert.ok(created.json.data.draftRequirement);

  const confirmed = await fetchJson(base, `/api/cases/${caseRow.id}/requirements`, {
    method: 'POST',
    body: {
      brief: created.json.data.draftRequirement.brief,
      transaction: 'sale',
      propertyTypes: ['apartment'],
      locations: ['Tavira'],
      budgetMax: 650000,
      bedroomsMin: 2,
      bedroomsMax: 2,
      mustHaves: ['Parking'],
      niceToHaves: ['Terrace'],
      moveIn: '',
      tenure: '',
      notes: '',
      confirm: true,
    },
  });
  assert.equal(confirmed.json.data.case.stage, 'ai_search');
  assert.equal(confirmed.json.data.case.transaction, 'sale');
  assert.equal(confirmed.json.data.draftRequirement, null);

  const check = await fetchJson(base, `/api/cases/${caseRow.id}/inventory-check`, {
    method: 'POST',
    body: {},
  });
  assert.equal(check.json.data.check.outcome, 'not_applicable');
});

test('draft and unknown portal links are not exposed', async () => {
  const draftCase = await fetchJson(base, '/api/cases/FRL-2407');
  assert.equal(draftCase.json.data.shortlist.status, 'draft');
  const draftPortal = await fetchJson(base, `/api/portal/${draftCase.json.data.shortlist.token}`);
  assert.equal(draftPortal.response.status, 404);

  const unknown = await fetchJson(base, '/api/portal/definitely-not-a-real-token');
  assert.equal(unknown.response.status, 404);
});

test('source catalogue supports add, duplicate rejection and CSV import', async () => {
  const created = await fetchJson(base, '/api/sources', {
    method: 'POST',
    body: {
      name: 'Test Agency',
      domain: 'testagency.pt',
      kind: 'agency',
      coverage: 'Algarve',
      reliability: 0.73,
      notes: 'Added in a test.',
    },
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.json.data.name, 'Test Agency');

  const duplicate = await fetchJson(base, '/api/sources', {
    method: 'POST',
    body: {
      name: 'Duplicate',
      domain: 'https://www.testagency.pt/some-page',
      kind: 'agency',
      coverage: 'Algarve',
      reliability: 0.5,
    },
  });
  assert.equal(duplicate.response.status, 409);

  const imported = await fetchJson(base, '/api/sources/import', {
    method: 'POST',
    body: {
      csv: 'name,domain,kind,coverage,reliability\nImported Agency,importedagency.pt,agency,Algarve,0.66\nBad Row,not-a-domain,agency,Algarve,0.5',
    },
  });
  assert.equal(imported.response.status, 200);
  assert.equal(imported.json.data.created, 1);
  assert.equal(imported.json.data.skipped, 1);

  const catalogue = await fetchJson(base, '/api/sources');
  assert.ok(catalogue.json.data.sources.some((source) => source.domain === 'testagency.pt'));
  assert.ok(catalogue.json.data.sources.some((source) => source.domain === 'importedagency.pt'));
});

test('inventory can be added and its availability changed', async () => {
  const created = await fetchJson(base, '/api/inventory', {
    method: 'POST',
    body: {
      system: 'Portugal Long Lets',
      title: 'Test apartment',
      type: 'apartment',
      city: 'Faro',
      area: 'Centro',
      bedrooms: 2,
      bathrooms: 1,
      areaM2: 80,
      rent: 1400,
      availableFrom: '2027-01-01',
      status: 'available',
      features: ['Lift', 'Near shops'],
      seniorFriendly: false,
      description: 'A test home.',
    },
  });
  assert.equal(created.response.status, 201);
  assert.ok(created.json.data.ref.startsWith('PLL-'));

  const updated = await fetchJson(base, `/api/inventory/${created.json.data.id}`, {
    method: 'PATCH',
    body: { status: 'let' },
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.json.data.status, 'let');
});

test('case and data exports are useful files', async () => {
  const csv = await fetch(`${base}/api/cases/FRL-2408/export.csv`);
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  const bytes = new Uint8Array(await csv.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  const text = new TextDecoder().decode(bytes);
  assert.match(text, /Property/);
  assert.match(text, /Comparable median/);

  const json = await fetch(`${base}/api/cases/FRL-2408/export.json`);
  assert.equal(json.status, 200);
  const payload = await json.json();
  assert.equal(payload.data.case.ref, 'FRL-2408');
  assert.equal(payload.data.shortlist.items.length, 4);

  const sourcesCsv = await fetch(`${base}/api/sources/export.csv`);
  assert.equal(sourcesCsv.status, 200);
  assert.match(await sourcesCsv.text(), /idealista\.pt/);
});

test('validation rejects malformed writes', async () => {
  const missing = await fetchJson(base, '/api/cases', {
    method: 'POST',
    body: { transaction: 'rent', brief: 'No client.' },
  });
  assert.equal(missing.response.status, 400);

  const badEmail = await fetchJson(base, '/api/cases', {
    method: 'POST',
    body: {
      client: { name: 'Bad Email', email: 'not-an-email' },
      transaction: 'rent',
      brief: 'A brief.',
    },
  });
  assert.equal(badEmail.response.status, 400);

  const noRun = await fetchJson(base, '/api/cases/FRL-2411/shortlist', {
    method: 'POST',
    body: { items: [{ listingId: 'missing', rationale: 'x' }] },
  });
  assert.equal(noRun.response.status, 400);

  const wrongType = await fetch(`${base}/api/cases/FRL-2408`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'text/plain' },
    body: 'not json',
  });
  assert.equal(wrongType.status, 415);
});

test('reset restores the demo casebook', async () => {
  const reset = await fetchJson(base, '/api/demo/reset', { method: 'POST', body: {} });
  assert.equal(reset.response.status, 200);
  assert.equal(reset.json.data.reset, true);
  const dashboard = await fetchJson(base, '/api/dashboard');
  assert.equal(dashboard.json.data.cases.length, 7);
  assert.equal(dashboard.json.data.cases.find((row) => row.ref === 'FRL-2410').stage, 'inventory');
});
