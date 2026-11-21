import { EventEmitter } from 'node:events';
import { nowIso } from '../lib/util.js';
import {
  prepareSearch,
  describeSearchSteps,
  inventoryMatchesToListings,
} from '../domain/search.js';
import { priceCheck } from '../domain/pricing.js';
import { canonicalMarket } from '../seed/market.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Streams the AI-assisted search and inventory check into SQLite and the SSE
 * bus. The heavy work is deterministic; the pacing exists so the property
 * finder can follow what the agent is doing.
 */
export class Orchestrator {
  constructor({ store, config, logger, bus }) {
    this.store = store;
    this.config = config;
    this.logger = logger;
    this.bus = bus || new EventEmitter();
    this.bus.setMaxListeners(80);
  }

  isCancelled(runId) {
    const run = this.store.getRun(runId);
    return !run || run.status === 'cancelled';
  }

  emit(runId, type, payload) {
    this.bus.emit(`run:${runId}`, { type, runId, ...payload });
  }

  async pace(index) {
    const delay = this.config.stepDelayMs;
    if (delay <= 0) return;
    const jitter = index === 0 ? 0 : Math.round(delay * 0.35 * ((index % 3) / 2));
    await sleep(delay + jitter);
  }

  async startSearch(runId) {
    const run = this.store.getRun(runId);
    if (!run) return;
    if (run.status === 'cancelled') {
      this.emit(runId, 'done', { run, cancelled: true });
      return;
    }
    const caseRow = this.store.getCase(run.case_id);
    const requirements = this.store.getRequirement(run.requirements_id);
    if (!caseRow || !requirements) {
      this.failRun(runId, 'The case or requirement set could not be loaded.');
      return;
    }
    const startedAt = Date.now();
    this.store.updateRun(runId, {
      status: 'running',
      phase: 'planning',
      progress: 2,
      started_at: nowIso(),
    });
    this.emit(runId, 'status', { status: 'running', phase: 'planning', progress: 2 });

    try {
      const result = prepareSearch({
        requirements,
        sources: this.store.listSources(),
        caseIteration: run.iteration,
      });

      // Surface newly discovered sources immediately so the catalogue visibly
      // grows as the run proceeds.
      for (const discovery of result.discoveries) {
        if (this.store.findSourceByDomain(discovery.domain)) continue;
        this.store.createSource({ ...discovery, id: discovery.id, enabled: true, discovered_by: 'agent' });
      }

      const steps = describeSearchSteps(result);
      let seq = 0;
      for (const step of steps) {
        if (this.isCancelled(runId)) {
          this.cancelRun(runId, startedAt);
          return;
        }
        await this.pace(seq);
        seq += 1;
        const progress = Math.min(99, Math.round((seq / steps.length) * 100));
        const persisted = this.store.addRunStep(runId, {
          seq,
          phase: step.phase,
          level: step.level ?? 'info',
          message: step.message,
          detail: step.detail ?? null,
          elapsedMs: Date.now() - startedAt,
        });
        this.store.updateRun(runId, { phase: step.phase, progress });
        this.emit(runId, 'step', { step: persisted, progress, phase: step.phase });
      }

      if (this.isCancelled(runId)) {
        this.cancelRun(runId, startedAt);
        return;
      }

      this.store.insertListings(runId, result.listings);
      this.store.touchSources(result.selectedSourceIds);

      const durationMs = Date.now() - startedAt;
      const stats = {
        ...result.stats,
        coveredSources: result.sources.length,
        durationMs,
      };
      this.store.updateRun(runId, {
        status: 'completed',
        phase: 'complete',
        progress: 100,
        stats: JSON.stringify(stats),
        finished_at: nowIso(),
        duration_ms: durationMs,
      });
      const refreshedCase = this.store.getCase(run.case_id);
      if (refreshedCase && ['ai_search', 'inventory', 'review'].includes(refreshedCase.stage)) {
        this.store.updateCase(run.case_id, {
          stage: 'review',
          stage_changed_at: nowIso(),
          next_action: `Human review: ${stats.longList} homes on the long list`,
        });
      }
      this.store.addEvent({
        caseId: run.case_id,
        type: 'search',
        actor: 'Farol AI',
        message: `AI search completed with ${stats.longList} long-list homes`,
        detail: {
          sources: stats.sourcesQueried,
          extracted: stats.extracted,
          duplicates: stats.duplicates,
          discovered: stats.discovered,
          priceChecked: stats.priceChecked,
          durationMs,
        },
      });
      if (stats.discovered > 0) {
        this.store.addEvent({
          caseId: run.case_id,
          type: 'catalogue',
          actor: 'Farol AI',
          message: `${stats.discovered} new source${stats.discovered === 1 ? '' : 's'} added to the catalogue`,
          detail: { sources: result.discoveries.map((source) => source.name) },
        });
      }
      const finalRun = this.store.getRun(runId);
      this.emit(runId, 'done', { run: finalRun, stats });
    } catch (error) {
      this.logger.error('search run failed', { runId, error: error.message });
      this.failRun(runId, error.message);
    }
  }

  async startInventory(runId) {
    const run = this.store.getRun(runId);
    if (!run) return;
    if (run.status === 'cancelled') {
      this.emit(runId, 'done', { run, cancelled: true });
      return;
    }
    const caseRow = this.store.getCase(run.case_id);
    const requirements = this.store.getRequirement(run.requirements_id);
    const check = this.store.getLatestInventoryCheck(run.case_id);
    if (!caseRow || !requirements || !check) {
      this.failRun(runId, 'The inventory check could not be loaded.');
      return;
    }
    const startedAt = Date.now();
    this.store.updateRun(runId, {
      status: 'running',
      phase: 'inventory',
      progress: 5,
      started_at: nowIso(),
    });
    this.emit(runId, 'status', { status: 'running', phase: 'inventory', progress: 5 });

    try {
      const listings = inventoryMatchesToListings(check, requirements);
      const market = canonicalMarket();
      for (const listing of listings) {
        listing.priceCheck = priceCheck(
          {
            id: listing.id,
            cluster: listing.fingerprint,
            city: listing.city,
            type: listing.type,
            transaction: listing.transaction,
            bedrooms: listing.bedrooms,
            areaM2: listing.areaM2,
            price: listing.price,
            features: listing.features,
            listedDaysAgo: 3,
          },
          market
        );
      }
      const priced = listings.filter((item) => item.priceCheck?.available);
      const aboveMarket = priced.filter((item) => item.priceCheck.verdict === 'above').length;
      const belowMarket = priced.filter((item) => item.priceCheck.verdict === 'below').length;

      const steps = [
        {
          phase: 'catalogue',
          message: 'Checked existing rental inventory',
          detail: 'Algarve Senior Living · Portugal Long Lets · availability and senior-friendly attributes',
        },
        {
          phase: 'filter',
          message: `Filtered ${check.checked ?? listings.length} homes to the brief`,
          detail: 'Available status, location, budget and hard requirements',
        },
        {
          phase: 'rank',
          message: `Scored ${listings.length} suitable inventory homes`,
          detail: 'Lift, access, amenities and proximity to medical services',
        },
        {
          phase: 'complete',
          message: 'Inventory matches ready for human review',
          detail: `${listings.length} homes · no external search needed`,
          level: 'success',
        },
      ];

      for (let index = 0; index < steps.length; index += 1) {
        if (this.isCancelled(runId)) {
          this.cancelRun(runId, startedAt);
          return;
        }
        await this.pace(index);
        const progress = Math.round(((index + 1) / steps.length) * 100);
        const persisted = this.store.addRunStep(runId, {
          seq: index + 1,
          phase: steps[index].phase,
          level: steps[index].level ?? 'info',
          message: steps[index].message,
          detail: steps[index].detail,
          elapsedMs: Date.now() - startedAt,
        });
        this.store.updateRun(runId, { phase: steps[index].phase, progress });
        this.emit(runId, 'step', { step: persisted, progress });
      }

      if (this.isCancelled(runId)) {
        this.cancelRun(runId, startedAt);
        return;
      }

      this.store.insertListings(runId, listings);
      const durationMs = Date.now() - startedAt;
      const stats = {
        sourcesQueried: 2,
        queries: 4,
        extracted: listings.length,
        offBrief: Math.max(0, (check.checked || 0) - listings.length),
        duplicates: 0,
        uniqueListings: listings.length,
        longList: listings.length,
        discovered: 0,
        priceChecked: priced.length,
        aboveMarket,
        belowMarket,
        atMarket: priced.length - aboveMarket - belowMarket,
        coverage: requirements.regions?.join(' + ') || 'Algarve',
        iteration: run.iteration,
        comparisons: priced.reduce((sum, item) => sum + (item.priceCheck?.count || 0), 0),
        inventorySystem: 'Algarve Senior Living + Portugal Long Lets',
        durationMs,
      };
      this.store.updateRun(runId, {
        status: 'completed',
        phase: 'complete',
        progress: 100,
        stats: JSON.stringify(stats),
        finished_at: nowIso(),
        duration_ms: durationMs,
      });
      const refreshedCase = this.store.getCase(run.case_id);
      if (refreshedCase && ['inventory', 'review'].includes(refreshedCase.stage)) {
        this.store.updateCase(run.case_id, {
          stage: 'review',
          stage_changed_at: nowIso(),
          next_action: `Human review: ${listings.length} inventory matches`,
        });
      }
      this.store.addEvent({
        caseId: run.case_id,
        type: 'inventory',
        actor: 'Farol AI',
        message: `${listings.length} suitable homes found in existing inventory`,
        detail: { systems: ['Algarve Senior Living', 'Portugal Long Lets'], priceChecked: priced.length },
      });
      const finalRun = this.store.getRun(runId);
      this.emit(runId, 'done', { run: finalRun, stats });
    } catch (error) {
      this.logger.error('inventory run failed', { runId, error: error.message });
      this.failRun(runId, error.message);
    }
  }

  cancelRun(runId, startedAt) {
    const current = this.store.getRun(runId);
    const alreadyCancelled = current?.status === 'cancelled';
    const durationMs = Date.now() - startedAt;
    this.store.updateRun(runId, {
      status: 'cancelled',
      phase: 'cancelled',
      error: 'Cancelled by the property finder.',
      finished_at: nowIso(),
      duration_ms: durationMs,
    });
    const run = this.store.getRun(runId);
    if (!alreadyCancelled) {
      this.store.addEvent({
        caseId: run.case_id,
        type: 'search',
        actor: 'Team',
        message: 'AI search cancelled by the property finder',
      });
    }
    this.emit(runId, 'done', { run, cancelled: true });
  }

  failRun(runId, message) {
    this.store.updateRun(runId, {
      status: 'failed',
      phase: 'failed',
      error: message,
      finished_at: nowIso(),
    });
    const run = this.store.getRun(runId);
    if (run) {
      this.store.addEvent({
        caseId: run.case_id,
        type: 'search',
        actor: 'System',
        message: `AI search failed: ${message}`,
        detail: { runId },
      });
    }
    this.emit(runId, 'error', { message });
    this.emit(runId, 'done', { run, error: message });
  }
}
