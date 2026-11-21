import { selectProperties } from './brief.js';
import { normalizeOffer } from './extract.js';
import { deduplicate, matchOffers, offerRejectionReason } from './matching.js';
import { buildReport } from './benchmark.js';
import { shortHash, sleep } from '../lib/util.js';

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

function abortError() {
  return Object.assign(new Error('Run cancelled'), { name: 'AbortError' });
}

function friendlyError(error) {
  const message = String(error?.message || 'Unexpected agent error');
  return message.length > 240 ? `${message.slice(0, 237)}…` : message;
}

function sourceSummary(sources) {
  const names = sources.slice(0, 3).map((source) => source.name);
  return sources.length > 3 ? `${names.join(', ')} +${sources.length - 3} more` : names.join(', ');
}

/**
 * Runs the Scout pipeline and streams progress over the shared EventEmitter.
 *
 * interpret → plan → search → normalise → dedupe → match → benchmark → report
 */
export class Orchestrator {
  constructor({ store, provider, config, logger, bus }) {
    this.store = store;
    this.provider = provider;
    this.config = config;
    this.logger = logger;
    this.bus = bus;
    this.activeRuns = new Map();
  }

  get delay() {
    return this.config.stepDelayMs;
  }

  isActive(runId) {
    return this.activeRuns.has(runId);
  }

  activeRunIds() {
    return [...this.activeRuns.keys()];
  }

  async waitForIdle(timeoutMs = 3000) {
    const deadline = Date.now() + timeoutMs;
    while (this.activeRuns.size && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return this.activeRuns.size === 0;
  }

  async start(runId) {
    const run = this.store.getRun(runId);
    if (!run || run.status !== 'queued' || this.activeRuns.has(runId)) return;
    const ctx = {
      runId,
      startedAt: Date.now(),
      cancelled: false,
      abort: new AbortController(),
    };
    this.activeRuns.set(runId, ctx);
    this.store.updateRun(runId, {
      status: 'running',
      phase: 'interpret',
      progress: 2,
      started_at: new Date().toISOString(),
    });

    try {
      await this.execute(ctx, run);
    } catch (error) {
      if (ctx.cancelled || error?.name === 'AbortError') {
        this.finaliseCancelled(ctx);
      } else {
        this.finaliseFailed(ctx, error);
      }
    } finally {
      this.activeRuns.delete(runId);
    }
  }

  async execute(ctx, run) {
    const { runId } = ctx;
    const filters = run.filters;
    const delay = this.delay;

    await this.step(ctx, {
      phase: 'interpret',
      level: 'info',
      message: 'Reading the client brief',
      detail: `Interpreting intent, geography and budget from the written brief.`,
      progress: 4,
    });

    let allProperties = this.store.listProperties();
    const inScope = selectProperties(allProperties, filters);
    await this.step(ctx, {
      phase: 'interpret',
      level: 'success',
      message: `Brief interpreted: ${filters.summary.toLowerCase()}`,
      detail: [
        `${filters.assumptions.length ? `${filters.assumptions.length} assumption${filters.assumptions.length === 1 ? '' : 's'} applied. ` : ''}Parser confidence ${Math.round(filters.confidence * 100)}%.`,
        `${inScope.length} portfolio listing${inScope.length === 1 ? '' : 's'} fall within the brief.`,
      ].join(' '),
      progress: 8,
    });

    if (!inScope.length) {
      await this.step(ctx, {
        phase: 'interpret',
        level: 'warn',
        message: 'No portfolio listings matched — running a market-only scan',
        detail: 'Scout will still search the market and report what it finds.',
        progress: 10,
      });
    }

    this.setPhase(runId, 'plan', 12);
    await this.step(ctx, {
      phase: 'plan',
      level: 'info',
      message: 'Planning sources and query variants',
      detail: `Selecting relevant enabled sources from the catalogue.`,
      progress: 12,
    });

    const enabledSources = this.store.listSources({ enabledOnly: true });
    if (!enabledSources.length) {
      throw new Error('No enabled sources in the catalogue. Add or enable a source before launching Scout.');
    }

    const plan = await this.provider.prepareRun({
      runId,
      filters,
      sources: enabledSources,
      properties: inScope,
      allProperties,
      sourcesById: new Map(enabledSources.map((source) => [source.id, source])),
    });

    const sources = plan.sources || [];
    if (!sources.length) {
      throw new Error('No enabled sources matched this market.');
    }

    const discoveredIds = [];
    for (const candidate of plan.discovery || []) {
      const { created, source } = this.store.insertSource({
        ...candidate,
        discovered_by: 'agent',
      });
      if (created) discoveredIds.push(source.id);
    }
    if (discoveredIds.length) {
      const names = discoveredIds.map((id) => this.store.getSource(id)?.name).filter(Boolean);
      await this.step(ctx, {
        phase: 'plan',
        level: 'success',
        message: `Catalogue expanded with ${discoveredIds.length} new source${discoveredIds.length === 1 ? '' : 's'}`,
        detail: `${names.join(', ')} saved for future searches.`,
        progress: 14,
      });
    }

    const queryCount = plan.queries?.length || sources.length;
    await this.step(ctx, {
      phase: 'plan',
      level: 'success',
      message: `Search plan ready — ${sources.length} sources, ${queryCount} query variants`,
      detail: `Targets: ${sourceSummary(sources)}.`,
      progress: 16,
    });

    this.setPhase(runId, 'search', 18);
    await this.step(ctx, {
      phase: 'search',
      level: 'info',
      message: `Searching ${sources.length} property sources`,
      detail: filters.searchQuery,
      progress: 18,
    });

    const normalised = [];
    const rejectionReasons = {};
    let rawCount = 0;
    let completedSources = 0;
    let respondedSources = 0;
    const failedSourceIds = [];
    const usedSourceIds = [];
    const sourceResults = [];
    const sourcesById = new Map(this.store.listSources().map((source) => [source.id, source]));

    const concurrency = this.config.mode === 'live' ? 2 : 3;
    let cursor = 0;

    const searchOne = async (source, index) => {
      if (ctx.cancelled) throw abortError();
      usedSourceIds.push(source.id);
      let rawOffers = [];
      try {
        if (this.config.mode === 'demo') {
          await sleep(Math.round(delay * 1.6) + (index % 4) * 35, ctx.abort.signal);
        }
        rawOffers = await this.provider.searchSource({
          runId,
          filters,
          source,
          index,
          context: plan.context,
          properties: inScope,
          allProperties,
          signal: ctx.abort.signal,
        });
        if (!Array.isArray(rawOffers)) rawOffers = [];
        respondedSources += 1;
      } catch (error) {
        if (error?.name === 'AbortError' || ctx.cancelled) throw abortError();
        failedSourceIds.push(source.id);
        sourceResults.push({ source, offers: 0, failed: true, error: friendlyError(error) });
        completedSources += 1;
        this.logger.warn('source search failed', {
          runId,
          source: source.id,
          error: friendlyError(error),
        });
        await this.step(ctx, {
          phase: 'search',
          level: 'warn',
          message: `${source.name} did not respond`,
          detail: friendlyError(error),
          progress: 18 + Math.round(48 * (completedSources / sources.length)),
        });
        return;
      }

      rawCount += rawOffers.length;
      const parsed = [];
      let unparseable = 0;
      for (let i = 0; i < rawOffers.length; i += 1) {
        const raw = rawOffers[i];
        const { offer, reason } = normalizeOffer(raw, {
          source,
          filters,
          fx: this.config.fx,
        });
        if (!offer) {
          unparseable += 1;
          rejectionReasons[reason || 'unparseable'] = (rejectionReasons[reason || 'unparseable'] || 0) + 1;
          continue;
        }
        offer.id = `off_${shortHash(`${runId}|${source.id}|${i}|${offer.title}|${offer.price_eur}`, 14)}`;
        parsed.push(offer);
        normalised.push(offer);
      }

      completedSources += 1;
      sourceResults.push({ source, offers: parsed.length, failed: false });
      const priceNote = parsed.some((offer) => offer.currency !== 'EUR')
        ? ' · FX applied'
        : '';
      await this.step(ctx, {
        phase: 'search',
        level: parsed.length ? 'success' : 'warn',
        message: parsed.length
          ? `${source.name}: ${parsed.length} listing${parsed.length === 1 ? '' : 's'} parsed${priceNote}`
          : `${source.name}: no parseable listings`,
        detail: unparseable ? `${unparseable} result${unparseable === 1 ? '' : 's'} discarded during extraction.` : null,
        progress: 18 + Math.round(48 * (completedSources / sources.length)),
      });
    };

    const worker = async () => {
      while (true) {
        if (ctx.cancelled) throw abortError();
        const index = cursor;
        cursor += 1;
        if (index >= sources.length) return;
        await searchOne(sources[index], index);
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, sources.length) }, () => worker()));
    this.store.touchSources(usedSourceIds);

    if (!respondedSources) {
      throw new Error('All property sources failed to respond. Check the source catalogue or try again.');
    }

    this.setPhase(runId, 'normalise', 70);
    await this.step(ctx, {
      phase: 'normalise',
      level: 'info',
      message: 'Normalising prices and filtering off-brief results',
      detail: `Converting non-EUR prices at fixed FX rates and validating every offer.`,
      progress: 70,
    });

    const eligible = [];
    let ineligible = 0;
    for (const offer of normalised) {
      const reason = offerRejectionReason(offer, filters);
      if (reason) {
        ineligible += 1;
        rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1;
        continue;
      }
      eligible.push(offer);
    }

    const currencyAdjusted = eligible.filter((offer) => offer.currency !== 'EUR').length;
    const dedupe = deduplicate(eligible, sourcesById);
    const canonicalOffers = dedupe.offers.filter((offer) => offer.canonical);
    const duplicatesCollapsed = dedupe.collapsed;

    await this.step(ctx, {
      phase: 'normalise',
      level: eligible.length ? 'success' : 'warn',
      message: eligible.length
        ? `${eligible.length} relevant offers from ${rawCount} results`
        : 'No offers survived filtering',
      detail: [
        `${Object.entries(rejectionReasons).map(([reason, count]) => `${count} ${reason.replace(/_/g, ' ')}`).join(' · ') || 'No rejections'}.`,
        currencyAdjusted ? `${currencyAdjusted} non-EUR price${currencyAdjusted === 1 ? '' : 's'} normalised.` : null,
      ].filter(Boolean).join(' '),
      progress: 76,
    });

    await this.step(ctx, {
      phase: 'normalise',
      level: 'info',
      message: `${duplicatesCollapsed} duplicate listing${duplicatesCollapsed === 1 ? '' : 's'} collapsed`,
      detail: `${canonicalOffers.length} unique offers remain for matching.`,
      progress: 80,
    });

    this.store.insertOffers(runId, dedupe.offers);

    this.setPhase(runId, 'match', 82);
    await this.step(ctx, {
      phase: 'match',
      level: 'info',
      message: 'Matching offers to portfolio listings',
      detail: 'Detecting mirrored listings first, then scoring comparable homes.',
      progress: 82,
    });

    const matchResult = matchOffers(canonicalOffers, inScope);
    this.store.insertMatches(runId, matchResult.matches);
    const mirrorCount = matchResult.matches.filter((match) => match.kind === 'same_listing').length;
    const comparableCount = matchResult.matches.filter((match) => match.kind === 'comparable').length;

    await this.step(ctx, {
      phase: 'match',
      level: 'success',
      message: `${mirrorCount} mirrored listing${mirrorCount === 1 ? '' : 's'}, ${comparableCount} comparable${comparableCount === 1 ? '' : 's'}`,
      detail: `${matchResult.unmatched.length} market-only offer${matchResult.unmatched.length === 1 ? '' : 's'} could not be tied to a portfolio listing.`,
      progress: 88,
    });

    this.setPhase(runId, 'benchmark', 90);
    await this.step(ctx, {
      phase: 'benchmark',
      level: 'info',
      message: 'Benchmarking prices against the comparable set',
      detail: 'Calculating medians, quartiles and price positioning.',
      progress: 90,
    });

    const statsForReport = {
      offersFound: rawCount,
      offersEligible: eligible.length,
      offersRejected: rawCount - eligible.length,
      duplicatesCollapsed,
      rejectionReasons,
      sourcesQueried: sources.length,
      sourcesResponded: respondedSources,
      sourceFailures: failedSourceIds.length,
      newSources: discoveredIds.length,
      usedSourceIds,
      failedSourceIds,
      discoveredSourceIds: discoveredIds,
      currencyAdjusted,
    };

    const report = buildReport({
      run: { ...this.store.getRun(runId), stats: statsForReport },
      offers: dedupe.offers,
      matches: matchResult.matches,
      properties: inScope,
      sources: this.store.listSources(),
      steps: [],
    });

    const finalStats = {
      ...report.overview,
      usedSourceIds,
      failedSourceIds,
      discoveredSourceIds: discoveredIds,
      rejectionReasons,
      headline: report.headline,
      summary: report.summary,
      searchQuery: filters.searchQuery,
    };

    await this.step(ctx, {
      phase: 'benchmark',
      level: 'success',
      message: report.headline,
      detail: report.summary,
      progress: 95,
    });

    this.setPhase(runId, 'report', 97);
    await this.step(ctx, {
      phase: 'report',
      level: 'info',
      message: 'Writing recommendations and the downloadable report',
      detail: `${report.recommendations.length} finding${report.recommendations.length === 1 ? '' : 's'} prioritised.`,
      progress: 97,
    });

    if (ctx.cancelled) throw abortError();

    const durationMs = Date.now() - ctx.startedAt;
    this.store.updateRun(runId, {
      status: 'completed',
      phase: 'report',
      progress: 100,
      stats: finalStats,
      finished_at: new Date().toISOString(),
      duration_ms: durationMs,
    });

    const finalStep = this.store.appendStep(runId, {
      phase: 'report',
      level: 'success',
      message: `Scout complete in ${(durationMs / 1000).toFixed(1)}s`,
      detail: `${canonicalOffers.length} unique offers · ${report.overview.ownListingsBenchmarked} listings benchmarked · ${report.overview.newSources} new sources catalogued.`,
      elapsedMs: durationMs,
    });
    this.bus.emit(`run:${runId}`, {
      type: 'step',
      runId,
      step: finalStep,
      progress: 100,
      phase: 'report',
    });

    const finalRun = this.store.getRun(runId);
    this.bus.emit(`run:${runId}`, { type: 'done', runId, run: finalRun });
    this.logger.info('run completed', {
      runId,
      durationMs,
      offers: canonicalOffers.length,
      positions: report.positions.length,
    });
  }

  async step(ctx, { phase, level = 'info', message, detail = null, progress = null }) {
    if (ctx.cancelled) throw abortError();
    if (progress !== null) this.setPhase(ctx.runId, phase, progress);
    const step = this.store.appendStep(ctx.runId, {
      phase,
      level,
      message,
      detail,
      elapsedMs: Date.now() - ctx.startedAt,
    });
    const run = this.store.getRun(ctx.runId);
    this.bus.emit(`run:${ctx.runId}`, {
      type: 'step',
      runId: ctx.runId,
      step,
      progress: run?.progress ?? null,
      phase: run?.phase ?? phase,
    });
    if (this.delay) await sleep(this.delay, ctx.abort.signal);
  }

  setPhase(runId, phase, progress) {
    const run = this.store.getRun(runId);
    if (!run || TERMINAL.has(run.status)) return;
    this.store.updateRun(runId, { phase, progress });
  }

  finaliseCancelled(ctx) {
    const run = this.store.getRun(ctx.runId);
    if (!run || TERMINAL.has(run.status)) return;
    const durationMs = Date.now() - ctx.startedAt;
    this.store.updateRun(ctx.runId, {
      status: 'cancelled',
      phase: 'cancelled',
      error: 'Cancelled by the user.',
      finished_at: new Date().toISOString(),
      duration_ms: durationMs,
    });
    const step = this.store.appendStep(ctx.runId, {
      phase: 'cancelled',
      level: 'warn',
      message: 'Scout stopped',
      detail: 'The run was cancelled before completion. No report was written.',
      elapsedMs: durationMs,
    });
    this.bus.emit(`run:${ctx.runId}`, { type: 'step', runId: ctx.runId, step });
    this.bus.emit(`run:${ctx.runId}`, { type: 'done', runId: ctx.runId, run: this.store.getRun(ctx.runId) });
  }

  finaliseFailed(ctx, error) {
    const run = this.store.getRun(ctx.runId);
    if (!run || TERMINAL.has(run.status)) return;
    const durationMs = Date.now() - ctx.startedAt;
    const message = friendlyError(error);
    this.logger.error('run failed', {
      runId: ctx.runId,
      error: message,
      stack: error?.stack,
    });
    this.store.updateRun(ctx.runId, {
      status: 'failed',
      phase: 'failed',
      error: message,
      finished_at: new Date().toISOString(),
      duration_ms: durationMs,
    });
    const step = this.store.appendStep(ctx.runId, {
      phase: 'failed',
      level: 'error',
      message: 'Scout could not complete this run',
      detail: message,
      elapsedMs: durationMs,
    });
    this.bus.emit(`run:${ctx.runId}`, { type: 'step', runId: ctx.runId, step });
    this.bus.emit(`run:${ctx.runId}`, { type: 'done', runId: ctx.runId, run: this.store.getRun(ctx.runId) });
  }

  /**
   * Request cancellation. The pipeline stops at its next checkpoint so DB
   * writes are always coherent.
   */
  cancel(runId) {
    const run = this.store.getRun(runId);
    if (!run) return { found: false, status: null };
    if (TERMINAL.has(run.status)) return { found: true, status: run.status, changed: false };
    const ctx = this.activeRuns.get(runId);
    if (ctx) {
      ctx.cancelled = true;
      ctx.abort.abort();
      this.store.updateRun(runId, { phase: 'cancelling' });
      return { found: true, status: 'cancelling', changed: true };
    }
    const durationMs = run.started_at ? Date.now() - new Date(run.started_at).getTime() : 0;
    this.store.updateRun(runId, {
      status: 'cancelled',
      phase: 'cancelled',
      error: 'Cancelled by the user.',
      finished_at: new Date().toISOString(),
      duration_ms: durationMs,
    });
    const finalRun = this.store.getRun(runId);
    this.bus.emit(`run:${runId}`, { type: 'done', runId, run: finalRun });
    return { found: true, status: 'cancelled', changed: true };
  }
}
