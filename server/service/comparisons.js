import { conflict, notFound, badRequest } from '../lib/errors.js';
import { toCsv } from '../lib/csv.js';
import { canonicalMarket, marketListings } from '../seed/market.js';
import { subjectFromInput, subjectFromPortfolio } from '../domain/comparables.js';
import {
  serialiseComparison,
  serialiseComparisonStep,
  serialiseComparisonSummary,
} from '../serialise.js';

function slug(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export class ComparisonService {
  constructor({ store, orchestrator, config, logger }) {
    this.store = store;
    this.orchestrator = orchestrator;
    this.config = config;
    this.logger = logger;
  }

  options() {
    const portfolio = this.store.listPortfolio().map((property) => {
      const subject = subjectFromPortfolio(property);
      return {
        id: property.id,
        ref: property.ref,
        title: property.title,
        transaction: property.transaction,
        type: property.type,
        city: property.city,
        area: property.neighborhood || '',
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
        areaM2: property.area_m2,
        price: property.price,
        currency: property.currency || 'EUR',
        period: property.period,
        image: subject.image,
        features: subject.features,
      };
    });
    const recent = this.store
      .listComparisons(8)
      .map(serialiseComparisonSummary)
      .filter(Boolean);
    return {
      mode: 'demo',
      market: {
        uniqueListings: canonicalMarket().length,
        listingObservations: marketListings().length,
        sources: this.store.listSources({ enabledOnly: true }).length,
        label: 'Demo market',
        note: 'A deterministic synthetic market for repeatable pricing. Switch to Live market to fetch current Imovirtual public results.',
      },
      portfolio,
      recent,
      live: {
        available: true,
        source: 'Imovirtual',
        domain: 'imovirtual.com',
        label: 'Live market · Imovirtual',
        note: 'Public Imovirtual search results, fetched on demand. Confirm the source terms before production use. The agent does not bypass logins, anti-bot controls or portal restrictions.',
      },
    };
  }

  list(limit = 30) {
    return this.store
      .listComparisons(limit)
      .map(serialiseComparisonSummary)
      .filter(Boolean);
  }

  get(idOrRef) {
    const comparison = this.store.getComparison(idOrRef);
    if (!comparison) throw notFound('Comparison not found.');
    return {
      comparison: serialiseComparison(comparison),
      steps: this.store.listComparisonSteps(comparison.id).map(serialiseComparisonStep),
    };
  }

  start(idOrRef) {
    const comparison = this.store.getComparison(idOrRef);
    if (!comparison) throw notFound('Comparison not found.');
    if (comparison.status === 'running' || comparison.status === 'queued') {
      throw conflict('This comparison is already running.');
    }
    if (this.store.countRunningComparisons() >= this.config.maxConcurrentRuns) {
      throw conflict('Farol is already running the maximum number of analyses. Try again in a moment.');
    }
    this.store.db.prepare('DELETE FROM comparison_steps WHERE comparison_id = ?').run(comparison.id);
    this.store.updateComparison(comparison.id, {
      status: 'queued',
      error: null,
      stats: null,
      report: null,
    });
    setImmediate(() => {
      this.orchestrator.start(comparison.id).catch((error) => {
        this.logger.error('comparison orchestration crashed', {
          comparisonId: comparison.id,
          error: error.message,
        });
      });
    });
    return this.get(comparison.id);
  }

  create(input) {
    let subject;
    if (input.portfolioId) {
      const property = this.store
        .listPortfolio()
        .find((item) => item.id === input.portfolioId || item.ref === input.portfolioId);
      if (!property) throw notFound('Portfolio listing not found.');
      subject = subjectFromPortfolio(property);
    } else {
      subject = subjectFromInput(input);
    }
    if (!Number.isFinite(Number(subject.price)) || Number(subject.price) <= 0) {
      throw badRequest('An asking price is required.');
    }
    if (this.store.countRunningComparisons() >= this.config.maxConcurrentRuns) {
      throw conflict('Farol is already running the maximum number of analyses. Try again in a moment.');
    }

    const comparison = this.store.createComparison({
      mode: input.market === 'live' ? 'live' : 'demo',
      subjectSource: subject.source,
      portfolioId: subject.portfolioId,
      subjectRef: subject.ref,
      title: subject.title,
      transaction: subject.transaction,
      type: subject.type,
      city: subject.city,
      area: subject.area,
      bedrooms: subject.bedrooms,
      bathrooms: subject.bathrooms,
      areaM2: subject.areaM2,
      price: subject.price,
      currency: subject.currency,
      period: subject.period,
      features: subject.features,
      image: subject.image,
      description: subject.description,
      status: 'queued',
    });
    setImmediate(() => {
      this.orchestrator.start(comparison.id).catch((error) => {
        this.logger.error('comparison orchestration crashed', {
          comparisonId: comparison.id,
          error: error.message,
        });
      });
    });
    return this.get(comparison.id);
  }

  exportCsv(idOrRef) {
    const comparison = this.store.getComparison(idOrRef);
    if (!comparison) throw notFound('Comparison not found.');
    const report = comparison.report;
    if (!report) throw conflict('Wait for the analysis to finish before exporting.');
    const rows = (report.comps || []).map((comp) => ({
      ...comp,
      subjectPrice: report.subject.price,
    }));
    return toCsv(rows, [
      { label: 'Comparable', value: (row) => row.title },
      { label: 'Source', value: (row) => row.sourceName },
      { label: 'Domain', value: (row) => row.sourceDomain || '' },
      { label: 'City', value: (row) => row.city },
      { label: 'Type', value: (row) => row.type },
      { label: 'Bedrooms', value: (row) => row.bedrooms ?? '' },
      { label: 'Area m2', value: (row) => row.areaM2 ?? '' },
      { label: 'Price', value: (row) => Math.round(row.price) },
      { label: 'Price per m2', value: (row) => row.pricePerM2 ?? '' },
      { label: 'Delta vs median %', value: (row) => row.deltaPct ?? '' },
      { label: 'Match score', value: (row) => row.matchScore ?? '' },
      { label: 'Mirrors', value: (row) => row.mirrorCount ?? 0 },
      { label: 'Subject price', value: (row) => Math.round(row.subjectPrice) },
    ]);
  }

  exportFilename(idOrRef) {
    const comparison = this.store.getComparison(idOrRef);
    return slug(comparison?.ref || 'comparison');
  }
}
