import { EventEmitter } from 'node:events';
import { nowIso } from '../lib/util.js';
import {
  prepareComparison,
  describeComparisonSteps,
  subjectFromPortfolio,
} from '../domain/comparables.js';
import { fetchLiveMarket } from './live-market.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Streams a listing-first comparable analysis: read the subject, search the
 * source universe, find similar listings, collapse mirrors, price the segment
 * and write the report back to SQLite.
 */
export class ComparisonOrchestrator {
  constructor({ store, config, logger, bus }) {
    this.store = store;
    this.config = config;
    this.logger = logger;
    this.bus = bus || new EventEmitter();
    this.bus.setMaxListeners(80);
  }

  emit(comparisonId, type, payload) {
    this.bus.emit(`comparison:${comparisonId}`, { type, comparisonId, ...payload });
  }

  async pace(index) {
    const delay = this.config.stepDelayMs;
    if (delay <= 0) return;
    const jitter = index === 0 ? 0 : Math.round(delay * 0.3 * ((index % 3) / 2));
    await sleep(delay + jitter);
  }

  async start(comparisonId) {
    const comparison = this.store.getComparison(comparisonId);
    if (!comparison) return;
    if (comparison.status === 'completed') {
      this.emit(comparisonId, 'done', { comparison });
      return;
    }
    const startedAt = Date.now();
    this.store.updateComparison(comparisonId, {
      status: 'running',
      started_at: nowIso(),
    });
    this.emit(comparisonId, 'status', { status: 'running' });

    try {
      const portfolio = comparison.portfolio_id
        ? this.store.listPortfolio().find((property) => property.id === comparison.portfolio_id)
        : null;
      const subject = portfolio
        ? subjectFromPortfolio(portfolio)
        : {
            source: 'manual',
            portfolioId: null,
            ref: 'Your listing',
            title: comparison.title,
            transaction: comparison.transaction,
            type: comparison.type,
            city: comparison.city,
            area: comparison.area || '',
            bedrooms: comparison.bedrooms,
            bathrooms: comparison.bathrooms,
            areaM2: comparison.area_m2,
            price: comparison.price,
            currency: comparison.currency,
            period: comparison.period,
            features: comparison.features,
            image: comparison.image,
            description: comparison.description || '',
          };

      let result;
      if (comparison.mode === 'live') {
        let live;
        try {
          live = await fetchLiveMarket(subject);
        } catch (error) {
          throw new Error(
            `Live market request failed: ${error.message}. Check network access or switch to Demo market.`
          );
        }
        result = prepareComparison({
          subject,
          sources: live.sources,
          market: live.market,
          copies: live.copies,
          mode: 'live',
          sourceLabel: live.sourceLabel,
          sourceCount: live.sourceCount,
        });
      } else {
        result = prepareComparison({
          subject,
          sources: this.store.listSources(),
        });
      }
      const steps = describeComparisonSteps(result);
      for (let index = 0; index < steps.length; index += 1) {
        await this.pace(index);
        const step = steps[index];
        const persisted = this.store.addComparisonStep(comparisonId, {
          seq: index + 1,
          phase: step.phase,
          level: step.level || 'info',
          message: step.message,
          detail: step.detail || null,
          elapsedMs: Date.now() - startedAt,
        });
        this.emit(comparisonId, 'step', { step: persisted, progress: Math.round(((index + 1) / steps.length) * 100) });
      }

      const durationMs = Date.now() - startedAt;
      const report = {
        ...result,
        generatedAt: nowIso(),
        durationMs,
      };
      this.store.updateComparison(comparisonId, {
        status: 'completed',
        stats: JSON.stringify(result.stats),
        report: JSON.stringify(report),
        finished_at: nowIso(),
        duration_ms: durationMs,
      });
      const updated = this.store.getComparison(comparisonId);
      this.emit(comparisonId, 'done', { comparison: updated, report });
    } catch (error) {
      this.logger.error('comparison failed', { comparisonId, error: error.message });
      this.store.updateComparison(comparisonId, {
        status: 'failed',
        error: error.message,
        finished_at: nowIso(),
      });
      this.emit(comparisonId, 'error', { message: error.message });
      this.emit(comparisonId, 'done', { comparison: this.store.getComparison(comparisonId) });
    }
  }
}
