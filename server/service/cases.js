import { nowIso } from '../lib/util.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { parseBrief, requirementSummary } from '../domain/requirements.js';
import { checkInventory } from '../domain/search.js';
import { benchmarkPortfolio, summariseShortlist } from '../domain/pricing.js';
import { canonicalMarket } from '../seed/market.js';
import {
  serialiseCase,
  serialiseRequirement,
  serialiseSource,
  serialiseInventory,
  serialiseRun,
  serialiseStep,
  serialiseListing,
  serialiseShortlist,
  serialiseFeedback,
  serialiseEvent,
  serialiseInventoryCheck,
} from '../serialise.js';
import { csvToObjects } from '../lib/csv.js';
import { CASE_STAGES } from '../db.js';

const STAGE_LABELS = {
  enquiry: 'New enquiry',
  requirements: 'Requirements',
  inventory: 'Inventory check',
  ai_search: 'AI-assisted search',
  review: 'Human review',
  client: 'With client',
  closed: 'Closed',
};

function sourceMap(store) {
  return new Map(store.listSources().map((source) => [source.id, source]));
}

function shortlistBundle(store, shortlistRow, map) {
  if (!shortlistRow) return null;
  const items = store.listShortlistItems(shortlistRow.id).map((item) => {
    const listingRow = store.getListing(item.listing_id);
    return {
      ...item,
      listing: listingRow ? serialiseListing(listingRow, map) : null,
    };
  });
  const serialised = serialiseShortlist(shortlistRow, items);
  const priceSummary = summariseShortlist(
    items.filter((item) => item.listing).map((item) => ({ listing: item.listing }))
  );
  return { ...serialised, priceSummary };
}

function buildBundle(store, caseRow) {
  const map = sourceMap(store);
  const requirementRows = store.listRequirements(caseRow.id);
  const requirements = requirementRows.map(serialiseRequirement);
  const currentRequirement = caseRow.current_requirements_id
    ? requirements.find((requirement) => requirement.id === caseRow.current_requirements_id) || null
    : null;
  const draftRequirement =
    requirements.find(
      (requirement) =>
        !requirement.confirmedAt &&
        (!currentRequirement || requirement.version > currentRequirement.version)
    ) || null;
  const runRows = store.listRuns({ caseId: caseRow.id, limit: 50 });
  const runs = runRows.map(serialiseRun);
  const latestRun = runs[0] || null;
  const activeRun = runs.find((run) => run.status === 'queued' || run.status === 'running') || null;
  const focusRun = activeRun || latestRun;
  const steps = focusRun ? store.listRunSteps(focusRun.id).map(serialiseStep) : [];
  const listings = focusRun
    ? store.listRunListings(focusRun.id).map((listing) => serialiseListing(listing, map))
    : [];
  const shortlistRow = store.getLatestShortlist(caseRow.id);
  const shortlist = shortlistBundle(store, shortlistRow, map);
  const feedback = store.listFeedback(caseRow.id).map(serialiseFeedback);
  const inventoryCheckRow = store.getLatestInventoryCheck(caseRow.id);
  const inventoryCheck = serialiseInventoryCheck(inventoryCheckRow);
  const events = store.listEvents(caseRow.id).map(serialiseEvent);
  const included = listings.filter((listing) => listing.included && listing.canonical);
  const longListPrice = summariseShortlist(included.map((listing) => ({ listing })));

  return {
    case: serialiseCase(caseRow),
    requirements,
    currentRequirement,
    draftRequirement,
    runs,
    latestRun,
    activeRun,
    steps,
    listings,
    shortlist,
    feedback,
    inventoryCheck,
    events,
    priceSummary: {
      longList: longListPrice,
      shortlist: shortlist?.priceSummary ?? null,
    },
    stageLabel: STAGE_LABELS[caseRow.stage] || caseRow.stage,
  };
}

function caseSummary(requirements) {
  return requirementSummary(requirements);
}

export class CaseService {
  constructor({ store, orchestrator, config, logger }) {
    this.store = store;
    this.orchestrator = orchestrator;
    this.config = config;
    this.logger = logger;
  }

  listCases({ stage, status, query, limit } = {}) {
    return this.store
      .listCases({ stage, status, query, limit })
      .map((row) => serialiseCase(row));
  }

  getBundle(idOrRef) {
    const caseRow = this.store.getCase(idOrRef);
    if (!caseRow) throw notFound('Case not found.');
    return buildBundle(this.store, caseRow);
  }

  createCase(input, actor = 'Team') {
    const transaction = input.transaction;
    const parsed = parseBrief(input.brief, { transaction });
    const caseRow = this.store.createCase({
      client: input.client,
      transaction,
      brief: input.brief,
      owner: input.owner,
      priority: input.priority,
      source: input.client.source || input.source || 'Website',
      summary: input.title || caseSummary(parsed),
      nextAction: 'Confirm the brief with the client',
    });
    this.store.addRequirements(caseRow.id, parsed, {
      confirmed: false,
      createdBy: actor,
    });
    this.store.addEvent({
      caseId: caseRow.id,
      type: 'enquiry',
      actor: actor === 'Client' ? input.client.name : actor,
      message: `Enquiry received via ${caseRow.source || 'website'}`,
      detail: { brief: input.brief.slice(0, 500) },
    });
    return this.getBundle(caseRow.id);
  }

  updateCase(id, patch, actor = 'Team') {
    const caseRow = this.store.getCase(id);
    if (!caseRow) throw notFound('Case not found.');
    this.store.updateCase(caseRow.id, patch);
    this.store.addEvent({
      caseId: caseRow.id,
      type: 'case',
      actor,
      message: 'Case details updated',
      detail: patch,
    });
    return this.getBundle(caseRow.id);
  }

  confirmRequirements(idOrRef, body, actor = 'Team') {
    const caseRow = this.store.getCase(idOrRef);
    if (!caseRow) throw notFound('Case not found.');
    const caseId = caseRow.id;
    const current =
      this.store.getCurrentRequirements(caseRow) ||
      this.store.listRequirements(caseRow.id)[0] ||
      null;
    const brief = body.brief || current?.brief || '';
    if (!brief) throw badRequest('A brief is required.');
    if (body.confirm === false) {
      throw badRequest('This endpoint confirms requirements. Save a draft through the enquiry instead.');
    }

    const fields = {
      transaction: body.transaction,
      propertyTypes: body.propertyTypes,
      locations: body.locations,
      budgetMin: body.budgetMin,
      budgetMax: body.budgetMax,
      bedroomsMin: body.bedroomsMin,
      bedroomsMax: body.bedroomsMax,
      mustHaves: body.mustHaves,
      niceToHaves: body.niceToHaves,
      moveIn: body.moveIn,
      tenure: body.tenure,
      notes: body.notes,
    };
    const parsed = parseBrief(brief, fields);
    const requirement = this.store.addRequirements(caseRow.id, parsed, {
      confirmed: body.confirm !== false,
      confirmedBy: actor,
      createdBy: actor,
    });

    let nextStage;
    let nextAction;
    if (parsed.transaction === 'sale') {
      nextStage = 'ai_search';
      nextAction = 'Run the AI-assisted search';
      this.store.addEvent({
        caseId: caseRow.id,
        type: 'inventory',
        actor: 'Farol',
        message: 'Inventory check skipped — this is a purchase brief',
      });
    } else {
      nextStage = 'inventory';
      nextAction = 'Check existing rental inventory';
    }
    this.store.updateCase(caseRow.id, {
      stage: nextStage,
      status: 'active',
      current_requirements_id: requirement.id,
      stage_changed_at: nowIso(),
      next_action: nextAction,
      summary: caseSummary(parsed),
      closed_at: null,
    });
    this.store.addEvent({
      caseId: caseRow.id,
      type: 'requirements',
      actor,
      message: `Requirements v${requirement.version} confirmed`,
      detail: {
        locations: parsed.locations,
        budgetMax: parsed.budgetMax,
        bedrooms: [parsed.bedroomsMin, parsed.bedroomsMax],
        mustHaves: parsed.mustHaves,
      },
    });
    return this.getBundle(caseRow.id);
  }

  async runInventoryCheck(idOrRef, actor = 'Team') {
    const caseRow = this.store.getCase(idOrRef);
    if (!caseRow) throw notFound('Case not found.');
    const caseId = caseRow.id;
    const requirement = this.store.getCurrentRequirements(caseRow);
    if (!requirement) throw badRequest('Confirm the requirements before checking inventory.');

    if (requirement.transaction === 'sale') {
      const check = this.store.addInventoryCheck({
        caseId,
        requirementsId: requirement.id,
        outcome: 'not_applicable',
        score: null,
        reasons: ['Existing inventory is rental-only. Purchase briefs move straight to the AI-assisted search.'],
        matches: [],
      });
      this.store.updateCase(caseId, {
        stage: 'ai_search',
        next_action: 'Run the AI-assisted search',
        stage_changed_at: nowIso(),
      });
      this.store.addEvent({
        caseId,
        type: 'inventory',
        actor: 'Farol',
        message: 'Inventory check not applicable for a purchase',
      });
      return { check: serialiseInventoryCheck(check), run: null, bundle: this.getBundle(caseId) };
    }

    const check = checkInventory(requirement, this.store.listInventory());
    const checkRow = this.store.addInventoryCheck({
      caseId,
      requirementsId: requirement.id,
      outcome: check.outcome,
      score: check.score,
      reasons: check.reasons,
      matches: check.matches,
    });

    if (check.outcome === 'suitable') {
      const run = this.store.createRun({
        caseId,
        requirementsId: requirement.id,
        kind: 'inventory',
        iteration: caseRow.iteration,
      });
      this.store.updateCase(caseId, {
        stage: 'inventory',
        next_action: 'Inventory matches are being prepared for review',
        stage_changed_at: nowIso(),
      });
      this.store.addEvent({
        caseId,
        type: 'inventory',
        actor: 'Farol',
        message: `Existing inventory checked — ${check.eligibleCount} suitable homes found`,
        detail: { score: check.score, reasons: check.reasons },
      });
      setImmediate(() => {
        this.orchestrator.startInventory(run.id).catch((error) => {
          this.logger.error('inventory orchestration crashed', { runId: run.id, error: error.message });
        });
      });
      return { check: serialiseInventoryCheck(checkRow), run: serialiseRun(run), bundle: this.getBundle(caseId) };
    }

    this.store.updateCase(caseId, {
      stage: 'inventory',
      next_action: 'Continue to AI-assisted search',
      stage_changed_at: nowIso(),
    });
    this.store.addEvent({
      caseId,
      type: 'inventory',
      actor: 'Farol',
      message: 'Existing inventory checked — no suitable available home',
      detail: { reasons: check.reasons },
    });
    return { check: serialiseInventoryCheck(checkRow), run: null, bundle: this.getBundle(caseId) };
  }

  startSearch(idOrRef, actor = 'Team') {
    const caseRow = this.store.getCase(idOrRef);
    if (!caseRow) throw notFound('Case not found.');
    const caseId = caseRow.id;
    const requirement = this.store.getCurrentRequirements(caseRow);
    if (!requirement) throw badRequest('Confirm the requirements before running a search.');
    if (!requirement.confirmed_at) throw badRequest('The current requirements are still a draft.');
    const active = this.store
      .listRuns({ caseId, limit: 10 })
      .find((run) => run.status === 'queued' || run.status === 'running');
    if (active) throw conflict('A search is already running for this case.');
    if (this.store.countRunningRuns() >= this.config.maxConcurrentRuns) {
      throw conflict('Farol is already running the maximum number of searches. Try again in a moment.');
    }

    const run = this.store.createRun({
      caseId,
      requirementsId: requirement.id,
      kind: 'search',
      iteration: caseRow.iteration,
    });
    this.store.updateCase(caseId, {
      stage: 'ai_search',
      stage_changed_at: nowIso(),
      next_action: 'AI-assisted search running',
    });
    this.store.addEvent({
      caseId,
      type: 'search',
      actor,
      message: 'AI-assisted search started',
      detail: { sources: this.store.listSources({ enabledOnly: true }).length, iteration: caseRow.iteration },
    });
    setImmediate(() => {
      this.orchestrator.startSearch(run.id).catch((error) => {
        this.logger.error('search orchestration crashed', { runId: run.id, error: error.message });
      });
    });
    return { run: serialiseRun(run), bundle: this.getBundle(caseId) };
  }

  cancelRun(idOrRef, runId, actor = 'Team') {
    const caseRow = this.store.getCase(idOrRef);
    if (!caseRow) throw notFound('Case not found.');
    const caseId = caseRow.id;
    const run = this.store.getRun(runId);
    if (!run || run.case_id !== caseRow.id) throw notFound('Run not found for this case.');
    if (!['queued', 'running'].includes(run.status)) {
      throw conflict('This run has already finished.');
    }
    this.store.updateRun(runId, {
      status: 'cancelled',
      phase: 'cancelled',
      error: 'Cancelled by the property finder.',
      finished_at: nowIso(),
    });
    this.store.addEvent({
      caseId,
      type: 'search',
      actor,
      message: 'AI search cancelled',
      detail: { runId },
    });
    return this.getBundle(caseId);
  }

  updateListingDecision(idOrRef, listingId, decision, note, actor = 'Team') {
    const caseRow = this.store.getCase(idOrRef);
    if (!caseRow) throw notFound('Case not found.');
    const caseId = caseRow.id;
    const listing = this.store.getListing(listingId);
    if (!listing) throw notFound('Listing not found.');
    const run = this.store.getRun(listing.run_id);
    if (!run || run.case_id !== caseRow.id) throw notFound('Listing does not belong to this case.');
    if (decision === 'candidate' && !listing.included) {
      throw badRequest('Only long-list homes can be marked as candidates.');
    }
    this.store.updateListingDecision(listingId, decision, note);
    return serialiseListing(this.store.getListing(listingId), sourceMap(this.store));
  }

  createShortlist(idOrRef, body, actor = 'Team') {
    const caseRow = this.store.getCase(idOrRef);
    if (!caseRow) throw notFound('Case not found.');
    const caseId = caseRow.id;
    const runRows = this.store.listRuns({ caseId, limit: 10 });
    const run = runRows.find((item) => item.status === 'completed');
    if (!run) throw badRequest('Run an AI search before building a shortlist.');
    const listings = new Map(
      this.store.listRunListings(run.id).map((listing) => [listing.id, listing])
    );
    const items = body.items.map((item) => {
      const listing = listings.get(item.listingId);
      if (!listing) throw badRequest('One of the selected homes is not part of this run.');
      if (!listing.included || !listing.canonical) {
        throw badRequest(`“${listing.title}” is not on the reviewed long list.`);
      }
      return { listingId: listing.id, rationale: item.rationale };
    });

    const existing = this.store.getLatestShortlist(caseId);
    let shortlist;
    if (existing && existing.status === 'draft' && existing.run_id === run.id) {
      shortlist = this.store.updateShortlist(existing.id, { summary: body.summary });
      this.store.replaceShortlistItems(existing.id, items);
    } else {
      shortlist = this.store.createShortlist({
        caseId,
        runId: run.id,
        summary: body.summary,
        createdBy: actor,
        status: 'draft',
      });
      items.forEach((item, index) => {
        this.store.addShortlistItem(shortlist.id, {
          listingId: item.listingId,
          rationale: item.rationale,
          position: index + 1,
        });
      });
    }
    this.store.updateCase(caseId, {
      stage: 'review',
      next_action: 'Review the shortlist, then share it with the client',
      stage_changed_at: nowIso(),
    });
    this.store.addEvent({
      caseId,
      type: 'shortlist',
      actor,
      message: `Shortlist prepared with ${items.length} homes`,
      detail: { shortlistId: shortlist.id },
    });
    return this.getBundle(caseId);
  }

  updateShortlist(idOrRef, shortlistId, patch, actor = 'Team') {
    const caseRow = this.store.getCase(idOrRef);
    if (!caseRow) throw notFound('Case not found.');
    const caseId = caseRow.id;
    const shortlist = this.store.getShortlist(shortlistId);
    if (!shortlist || shortlist.case_id !== caseId) throw notFound('Shortlist not found.');
    if (shortlist.status !== 'draft') throw conflict('Only a draft shortlist can be edited.');
    this.store.updateShortlist(shortlistId, { summary: patch.summary });
    if (patch.items) {
      const listings = new Set(
        this.store.listRunListings(shortlist.run_id).filter((item) => item.included).map((item) => item.id)
      );
      for (const item of patch.items) {
        if (!listings.has(item.listingId)) throw badRequest('One of the selected homes is not on this run.');
      }
      this.store.replaceShortlistItems(shortlistId, patch.items);
    }
    this.store.addEvent({
      caseId,
      type: 'shortlist',
      actor,
      message: 'Draft shortlist updated',
    });
    return this.getBundle(caseId);
  }

  shareShortlist(idOrRef, shortlistId, actor = 'Team') {
    const caseRow = this.store.getCase(idOrRef);
    if (!caseRow) throw notFound('Case not found.');
    const caseId = caseRow.id;
    const shortlist = this.store.getShortlist(shortlistId);
    if (!shortlist || shortlist.case_id !== caseId) throw notFound('Shortlist not found.');
    if (shortlist.status === 'draft') {
      const items = this.store.listShortlistItems(shortlist.id);
      if (!items.length) throw badRequest('Add at least one home before sharing.');
      this.store.updateShortlist(shortlist.id, { status: 'shared', shared_at: nowIso() });
      this.store.updateCase(caseId, {
        stage: 'client',
        shared_at: nowIso(),
        stage_changed_at: nowIso(),
        next_action: 'Wait for the client to respond',
      });
      this.store.addEvent({
        caseId,
        type: 'shortlist',
        actor,
        message: `Shortlist of ${items.length} presented to the client`,
        detail: { shortlistId: shortlist.id },
      });
    }
    return this.getBundle(caseId);
  }

  getPortal(token) {
    const shortlist = this.store.getShortlistByToken(token);
    if (!shortlist || !['shared', 'feedback'].includes(shortlist.status)) {
      throw notFound('This shortlist link is not available.');
    }
    const caseRow = this.store.getCase(shortlist.case_id);
    const map = sourceMap(this.store);
    const bundle = shortlistBundle(this.store, shortlist, map);
    const feedback = this.store
      .listFeedback(shortlist.case_id)
      .filter((item) => item.shortlist_id === shortlist.id)
      .map(serialiseFeedback);
    return {
      ref: caseRow.ref,
      clientName: caseRow.client.name,
      owner: caseRow.owner,
      transaction: caseRow.transaction,
      sharedAt: shortlist.shared_at,
      summary: shortlist.summary,
      status: shortlist.status,
      items: bundle.items,
      priceSummary: bundle.priceSummary,
      feedback: feedback[0] ?? null,
    };
  }

  submitFeedback(token, input) {
    const shortlist = this.store.getShortlistByToken(token);
    if (!shortlist || !['shared', 'feedback'].includes(shortlist.status)) {
      throw notFound('This shortlist link is not available.');
    }
    const caseRow = this.store.getCase(shortlist.case_id);
    const items = new Map(
      this.store.listShortlistItems(shortlist.id).map((item) => [item.id, item])
    );
    for (const decision of input.decisions) {
      if (!items.has(decision.shortlistItemId)) {
        throw badRequest('One of the feedback decisions does not belong to this shortlist.');
      }
      this.store.updateShortlistItemDecision(
        decision.shortlistItemId,
        decision.decision,
        decision.comment
      );
    }
    this.store.addFeedback({
      caseId: caseRow.id,
      shortlistId: shortlist.id,
      overall: input.overall,
      comment: input.comment,
      submittedBy: input.submittedBy || caseRow.client.name,
    });
    this.store.updateShortlist(shortlist.id, { status: 'feedback' });
    this.store.updateCase(caseRow.id, {
      next_action:
        input.overall === 'refine'
          ? 'Client asked for changes — create the next iteration'
          : 'Client responded — confirm next steps',
      stage_changed_at: nowIso(),
    });
    this.store.addEvent({
      caseId: caseRow.id,
      type: 'feedback',
      actor: input.submittedBy || caseRow.client.name,
      message:
        input.overall === 'refine'
          ? 'Client feedback received — asked to refine the search'
          : 'Client feedback received — shortlist accepted',
      detail: { comment: input.comment, decisions: input.decisions },
    });
    return this.getPortal(token);
  }

  iterateCase(idOrRef, input, actor = 'Team') {
    const caseRow = this.store.getCase(idOrRef);
    if (!caseRow) throw notFound('Case not found.');
    const caseId = caseRow.id;
    const current = this.store.getCurrentRequirements(caseRow);
    if (!current) throw badRequest('No confirmed requirements to iterate from.');
    const feedback = this.store.getLatestFeedback(caseId);
    const noteParts = [];
    if (input.applyFeedback !== false && feedback?.comment) noteParts.push(feedback.comment);
    if (input.note) noteParts.push(input.note);
    const note = noteParts.join('\n\n');

    const parsed = parseBrief(current.brief, {
      transaction: current.transaction,
      propertyTypes: current.property_types,
      locations: current.locations,
      budgetMin: current.budget_min,
      budgetMax: current.budget_max,
      bedroomsMin: current.bedrooms_min,
      bedroomsMax: current.bedrooms_max,
      mustHaves: current.must_haves,
      niceToHaves: current.nice_to_haves,
      moveIn: current.move_in,
      tenure: current.tenure,
      notes: [current.notes, note ? `Iteration ${caseRow.iteration + 1} brief: ${note}` : null]
        .filter(Boolean)
        .join('\n\n'),
    });
    const draft = this.store.addRequirements(caseRow.id, parsed, {
      confirmed: false,
      createdBy: actor,
    });
    this.store.updateCase(caseRow.id, {
      iteration: caseRow.iteration + 1,
      stage: 'requirements',
      stage_changed_at: nowIso(),
      next_action: `Confirm revised requirements (iteration ${caseRow.iteration + 1})`,
      shared_at: null,
    });
    this.store.addEvent({
      caseId: caseRow.id,
      type: 'iteration',
      actor,
      message: `Iteration ${caseRow.iteration + 1} created from client feedback`,
      detail: { feedback: feedback?.comment ?? null, note: input.note ?? null },
    });
    return { ...this.getBundle(caseRow.id), draftRequirementId: draft.id };
  }

  closeCase(idOrRef, input, actor = 'Team') {
    const caseRow = this.store.getCase(idOrRef);
    if (!caseRow) throw notFound('Case not found.');
    const caseId = caseRow.id;
    this.store.updateCase(caseId, {
      stage: 'closed',
      status: input.status,
      closed_at: nowIso(),
      stage_changed_at: nowIso(),
      next_action: input.status === 'won' ? 'Closed — won' : 'Closed — not proceeding',
    });
    this.store.addEvent({
      caseId,
      type: 'closed',
      actor,
      message:
        input.status === 'won'
          ? 'Case closed won'
          : `Case closed — ${input.reason || 'client not proceeding'}`,
      detail: input.reason ? { reason: input.reason } : null,
    });
    return this.getBundle(caseId);
  }

  getDashboard() {
    const caseRows = this.store.listCases({ limit: 100 });
    const stageIndex = Object.fromEntries(CASE_STAGES.map((stage, index) => [stage, index]));
    const cases = caseRows.map((row) => {
      const runRows = this.store.listRuns({ caseId: row.id, limit: 3 });
      const shortlist = this.store.getLatestShortlist(row.id);
      const feedback = this.store.getLatestFeedback(row.id);
      const check = this.store.getLatestInventoryCheck(row.id);
      const requirements = this.store.listRequirements(row.id);
      const current =
        requirements.find((item) => item.id === row.current_requirements_id) || requirements[0] || null;
      return {
        ...serialiseCase(row),
        stageLabel: STAGE_LABELS[row.stage] || row.stage,
        stageIndex: stageIndex[row.stage] ?? 0,
        progress: Math.round(((stageIndex[row.stage] ?? 0) / (CASE_STAGES.length - 1)) * 100),
        requirement: current
          ? {
              version: current.version,
              locations: current.locations,
              budgetMax: current.budget_max,
              bedroomsMin: current.bedrooms_min,
              bedroomsMax: current.bedrooms_max,
              propertyTypes: current.property_types,
              summary: requirementSummary(current),
              confirmedAt: current.confirmed_at,
            }
          : null,
        latestRun: runRows[0] ? serialiseRun(runRows[0]) : null,
        shortlistStatus: shortlist?.status ?? null,
        shortlistVersion: shortlist?.version ?? null,
        inventoryOutcome: check?.outcome ?? null,
        latestFeedback: feedback
          ? { overall: feedback.overall, comment: feedback.comment, createdAt: feedback.created_at }
          : null,
      };
    });

    const attention = [];
    for (const item of cases) {
      if (item.status !== 'active') continue;
      const ageHours = (Date.now() - new Date(item.updatedAt).getTime()) / 3_600_000;
      if (item.stage === 'client' && item.latestFeedback) {
        attention.push({
          id: `${item.id}-feedback`,
          caseId: item.id,
          ref: item.ref,
          client: item.client.name,
          severity: 'high',
          type: 'feedback',
          title: 'Client feedback received',
          detail: item.latestFeedback.comment?.slice(0, 120) || 'Open the case to review the response.',
          action: 'Review feedback',
          ageHours,
        });
      } else if (item.shortlistStatus === 'draft') {
        attention.push({
          id: `${item.id}-shortlist`,
          caseId: item.id,
          ref: item.ref,
          client: item.client.name,
          severity: 'medium',
          type: 'shortlist',
          title: 'Draft shortlist ready to share',
          detail: 'The human review is done — send it to the client.',
          action: 'Review shortlist',
          ageHours,
        });
      } else if (item.stage === 'enquiry' && ageHours > 3) {
        attention.push({
          id: `${item.id}-enquiry`,
          caseId: item.id,
          ref: item.ref,
          client: item.client.name,
          severity: ageHours > 12 ? 'high' : 'medium',
          type: 'enquiry',
          title: 'New enquiry awaiting triage',
          detail: 'Confirm the brief and assign an owner.',
          action: 'Triage enquiry',
          ageHours,
        });
      } else if (item.stage === 'requirements') {
        attention.push({
          id: `${item.id}-requirements`,
          caseId: item.id,
          ref: item.ref,
          client: item.client.name,
          severity: 'medium',
          type: 'requirements',
          title: 'Requirements need confirmation',
          detail: 'Check the interpreted brief before the inventory or search step.',
          action: 'Confirm requirements',
          ageHours,
        });
      } else if (item.stage === 'inventory' && item.inventoryOutcome === 'gap') {
        attention.push({
          id: `${item.id}-search`,
          caseId: item.id,
          ref: item.ref,
          client: item.client.name,
          severity: 'medium',
          type: 'search',
          title: 'Inventory gap — ready for AI search',
          detail: 'No suitable inventory home. Continue to the external search.',
          action: 'Start AI search',
          ageHours,
        });
      } else if (item.latestRun?.status === 'failed') {
        attention.push({
          id: `${item.id}-failed`,
          caseId: item.id,
          ref: item.ref,
          client: item.client.name,
          severity: 'high',
          type: 'failed',
          title: 'Search needs attention',
          detail: item.latestRun.error || 'The last search did not complete.',
          action: 'Open case',
          ageHours,
        });
      } else if (item.stage === 'review' && !item.shortlistStatus) {
        attention.push({
          id: `${item.id}-review`,
          caseId: item.id,
          ref: item.ref,
          client: item.client.name,
          severity: 'low',
          type: 'review',
          title: 'Long list ready for human review',
          detail: 'Select the homes that deserve a client conversation.',
          action: 'Review long list',
          ageHours,
        });
      }
    }
    const severityRank = { high: 0, medium: 1, low: 2 };
    attention.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || b.ageHours - a.ageHours);

    const portfolio = benchmarkPortfolio(this.store.listPortfolio(), canonicalMarket());
    const metrics = this.store.getMetrics();
    const pipeline = this.store.pipelineCounts();
    return {
      generatedAt: nowIso(),
      metrics: {
        ...metrics,
        averageDaysToShortlist: this.store.averageDaysToShortlist(),
        averageDaysToClose: this.store.averageDaysToClose(),
        sourceReuse: this.store.sourceReuseCount(),
      },
      pipeline,
      cases,
      attention: attention.slice(0, 5),
      activity: this.store.listRecentEvents(10).map(serialiseEvent),
      catalogueGrowth: this.store.catalogueGrowth(8),
      portfolio: {
        summary: portfolio.summary,
        findings: portfolio.findings.slice(0, 3),
        corridor: portfolio.corridor,
      },
      price: this.store.priceVerdictCounts(),
      decisions: this.store.countShortlistDecisions(),
    };
  }

  getPortfolio() {
    const portfolio = benchmarkPortfolio(this.store.listPortfolio(), canonicalMarket());
    const sources = this.store.listSources();
    return {
      ...portfolio,
      generatedAt: nowIso(),
      market: {
        canonicalListings: canonicalMarket().length,
        sources: sources.length,
        enabledSources: sources.filter((source) => source.enabled).length,
      },
    };
  }

  listInventory() {
    const rows = this.store.listInventory();
    const items = rows.map(serialiseInventory);
    const available = items.filter((item) => item.status === 'available');
    return {
      items,
      summary: {
        total: items.length,
        available: available.length,
        reserved: items.filter((item) => item.status === 'reserved').length,
        let: items.filter((item) => item.status === 'let').length,
        monthlyRentAvailable: available.reduce((sum, item) => sum + item.rent, 0),
        systems: [...new Set(items.map((item) => item.system))],
      },
    };
  }

  addInventory(input, actor = 'Team') {
    const item = this.store.createInventory(input);
    return serialiseInventory(item);
  }

  updateInventory(id, patch) {
    const item = this.store.updateInventory(id, patch);
    if (!item) throw notFound('Inventory home not found.');
    return serialiseInventory(item);
  }

  listSources() {
    const rows = this.store.listSources();
    const sources = rows.map(serialiseSource);
    const enabled = sources.filter((source) => source.enabled);
    return {
      sources,
      summary: {
        total: sources.length,
        enabled: enabled.length,
        discovered: sources.filter((source) => source.discoveredBy === 'agent').length,
        averageReliability:
          enabled.length > 0
            ? Math.round((enabled.reduce((sum, source) => sum + source.reliability, 0) / enabled.length) * 100) / 100
            : 0,
        uses: sources.reduce((sum, source) => sum + source.timesUsed, 0),
      },
      growth: this.store.catalogueGrowth(8),
    };
  }

  addSource(input) {
    const result = this.store.createSource({ ...input, discovered_by: 'team' });
    if (!result.created) throw conflict('That domain is already in the source catalogue.');
    return serialiseSource(result.source);
  }

  updateSource(id, patch) {
    const source = this.store.updateSource(id, patch);
    if (!source) throw notFound('Source not found.');
    return serialiseSource(source);
  }

  importSources(csv) {
    const rows = csvToObjects(csv);
    if (!rows.length) throw badRequest('The file did not contain any rows.');
    if (rows.length > 500) throw badRequest('Import at most 500 sources at a time.');
    let created = 0;
    let skipped = 0;
    const errors = [];
    for (const [index, row] of rows.entries()) {
      const name = (row.name || row.source || '').trim();
      const rawDomain = (row.domain || row.website || row.url || '').trim();
      const domain = rawDomain
        .replace(/^https?:\/\//, '')
        .replace(/\/.*$/, '')
        .replace(/^www\./, '')
        .toLowerCase();
      if (!name || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
        skipped += 1;
        if (errors.length < 4) errors.push(`Row ${index + 2}: name and domain are required.`);
        continue;
      }
      const kind = ['portal', 'marketplace', 'agency', 'network', 'other'].includes(String(row.kind).toLowerCase())
        ? String(row.kind).toLowerCase()
        : 'agency';
      const coverage = ['Algarve', 'Lisbon', 'Portugal', 'Other'].includes(row.coverage)
        ? row.coverage
        : 'Portugal';
      const reliability = Number(row.reliability);
      const result = this.store.createSource({
        name,
        domain,
        kind,
        coverage,
        reliability: Number.isFinite(reliability) ? Math.min(1, Math.max(0.1, reliability)) : 0.7,
        notes: row.notes || null,
        enabled: String(row.enabled ?? 'true').toLowerCase() !== 'false',
        discovered_by: 'import',
      });
      if (result.created) created += 1;
      else skipped += 1;
    }
    return { created, skipped, errors };
  }

  getOutputs() {
    const runs = this.store.listRunsWithCase(50).map((run) => ({
      ...serialiseRun(run),
      caseRef: run.case_ref,
      clientName: run.client_name,
    }));
    const portfolio = benchmarkPortfolio(this.store.listPortfolio(), canonicalMarket());
    return {
      generatedAt: nowIso(),
      metrics: {
        ...this.store.getMetrics(),
        averageDaysToShortlist: this.store.averageDaysToShortlist(),
        averageDaysToClose: this.store.averageDaysToClose(),
        sourceReuse: this.store.sourceReuseCount(),
        price: this.store.priceVerdictCounts(),
        decisions: this.store.countShortlistDecisions(),
      },
      runs,
      growth: this.store.catalogueGrowth(10),
      portfolio: { summary: portfolio.summary, findings: portfolio.findings },
      discoveredSources: this.store
        .listSources()
        .filter((source) => source.discovered_by === 'agent')
        .map(serialiseSource),
      caseSources: this.store.countCasesBySource(),
    };
  }

  getSystems() {
    const metrics = this.store.getMetrics();
    const inventory = this.store.listInventory();
    const sources = this.store.listSources();
    const available = inventory.filter((item) => item.status === 'available').length;
    const asl = inventory.filter((item) => item.system === 'Algarve Senior Living');
    const pll = inventory.filter((item) => item.system === 'Portugal Long Lets');
    const zohoCases = this.store.listCases({ limit: 200 }).filter((item) => item.source === 'Zoho CRM');
    const portfolio = this.store.listPortfolio();
    const avgSeconds = metrics.runStats.avg_ms ? Math.round(metrics.runStats.avg_ms / 1000) : null;
    const comparisonRows = this.store.listComparisons(100);
    const completedComparisons = comparisonRows.filter((item) => item.status === 'completed');
    const comparisonSeconds = completedComparisons.length
      ? Math.round(
          completedComparisons.reduce((sum, item) => sum + (Number(item.duration_ms) || 0), 0) /
            completedComparisons.length /
            1000
        )
      : null;
    const comparisonComps = completedComparisons.reduce(
      (sum, item) => sum + (Number(item.stats?.comps) || 0),
      0
    );
    return {
      generatedAt: nowIso(),
      systems: [
        {
          key: 'zoho',
          name: 'Zoho CRM',
          category: 'Client communication',
          status: zohoCases.length ? 'reference' : 'optional',
          statusLabel: zohoCases.length ? 'Reference data' : 'Optional',
          mode: 'No live API connection in this demo',
          detail: `${zohoCases.length} case${zohoCases.length === 1 ? '' : 's'} attributed to Zoho. Client context is visible in the case header.`,
          whatItFeeds: 'Client record, enquiry source and communication trail',
        },
        {
          key: 'source-list',
          name: 'Excel / Dropbox source list',
          category: 'Master source catalogue',
          status: 'connected',
          statusLabel: 'CSV import ready',
          mode: 'File-based adapter',
          detail: `${sources.length} sources in the catalogue, ${sources.filter((source) => source.discovered_by === 'agent').length} discovered by the AI engine.`,
          whatItFeeds: 'Seed list for every search; discovered sources are written back',
        },
        {
          key: 'asl',
          name: 'Algarve Senior Living',
          category: 'Rental inventory',
          status: 'connected',
          statusLabel: 'Inventory connected',
          mode: 'Seeded inventory in this demo',
          detail: `${asl.length} homes · ${asl.filter((item) => item.status === 'available').length} available · senior-friendly attributes included.`,
          whatItFeeds: 'First-check inventory for rental briefs',
        },
        {
          key: 'pll',
          name: 'Portugal Long Lets',
          category: 'Rental inventory',
          status: 'connected',
          statusLabel: 'Inventory connected',
          mode: 'Seeded inventory in this demo',
          detail: `${pll.length} homes · ${pll.filter((item) => item.status === 'available').length} available · long-let stock.`,
          whatItFeeds: 'First-check inventory for rental briefs',
        },
        {
          key: 'portal',
          name: 'Property Buy or Rent',
          category: 'PHP + MySQL portal',
          status: 'bridge',
          statusLabel: 'Bridge ready',
          mode: 'Export and deep-link adapter',
          detail: `${portfolio.length} portfolio homes available for price benchmarking. Case and shortlist exports are JSON/CSV.`,
          whatItFeeds: 'Portfolio stock, property records and published listings',
        },
        {
          key: 'ai',
          name: 'Farol AI Search Engine',
          category: 'Search and price intelligence',
          status: 'operational',
          statusLabel: 'Operational',
          mode: 'Deterministic demo market',
          detail: `${completedComparisons.length} value reports · ${metrics.searchRuns} client searches · ${metrics.sources.total} sources · ${comparisonComps} comparable homes in reports · ${comparisonSeconds ?? avgSeconds ?? '—'}s average run.`,
          whatItFeeds: 'Listing-first comparable value reports; also powers client case search and price checks',
        },
      ],
      totals: {
        availableInventory: available,
        totalInventory: inventory.length,
        portfolio: portfolio.length,
        sources: sources.length,
        activeCases: metrics.activeCases,
        discovered: metrics.sources.discovered,
        sourceReuse: this.store.sourceReuseCount(),
        longList: metrics.longList,
        sharedShortlists: metrics.sharedShortlists,
        avgRunSeconds: comparisonSeconds ?? (metrics.runStats.avg_ms ? Math.round(metrics.runStats.avg_ms / 1000) : null),
        comparisons: completedComparisons.length,
        comparisonComps,
      },
    };
  }
}
