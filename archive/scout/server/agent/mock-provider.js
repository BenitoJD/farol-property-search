import { chance, between, intBetween, pick, rngFrom } from '../lib/rng.js';
import { formatMoney } from '../lib/fx.js';
import { hashString, shortHash, slugify } from '../lib/util.js';
import { DISCOVERY_POOL } from '../seed/data.js';
import { GAZETTEER } from './brief.js';

const PROPERTY_TYPES = ['apartment', 'villa', 'townhouse'];
const PORTAL_KINDS = new Set(['portal', 'marketplace']);

const NEIGHBOURHOODS = {
  Lagos: ['Marina de Lagos', 'Meia Praia', 'Lagos old town', 'Praia da Luz', 'Ponta da Piedade'],
  'Portimão': ['Praia da Rocha', 'Portimão centre', 'Alvor', 'Praia do Vau'],
  Albufeira: ['Albufeira old town', 'Olhos de Água', 'Praia da Falésia', 'Galé'],
  Vilamoura: ['Vilamoura Marina', 'Quarteira', 'Vilamoura golf'],
  Tavira: ['Tavira centre', 'Cabanas', 'Santa Luzia'],
  Faro: ['Faro centre', 'Faro Marina', 'Estói'],
  'Olhão': ['Olhão centre', 'Fuseta', 'Ria Formosa'],
  Cascais: ['Cascais centre', 'Estoril', 'Monte Estoril'],
  Lisbon: ['Príncipe Real', 'Chiado', 'Alfama', 'Estrela'],
  Marbella: ['Nueva Andalucía', 'San Pedro de Alcántara', 'Puerto Banús'],
  Estepona: ['Estepona old town', 'La Rada', 'Cancelada'],
};

const AGENCY_SELLERS = [
  'Casa Mar Algarve',
  'Barlavento Realty',
  'Atlantic Homes',
  'Luz Properties',
  'Villa Collection',
  'Southern Key Realty',
];

const MARKETING = [
  'Exclusive listing',
  'New to the market',
  'Viewing recommended',
  'Private listing',
  'Featured property',
  'Verified listing',
];

const TYPE_LABEL = { apartment: 'apartment', villa: 'villa', townhouse: 'townhouse' };

/** Slight market bias per base listing, so the demo has clear findings. */
const BASE_BIAS = [0.91, 1.12, 0.99, 1.06, 0.96, 1.08];

function priceRound(value, transaction) {
  if (transaction === 'sale') return Math.max(1000, Math.round(value / 1000) * 1000);
  return Math.max(100, Math.round(value / 25) * 25);
}

function displayPrice(eurPrice, currency, fx, transaction) {
  if (currency === 'EUR') return priceRound(eurPrice, transaction);
  const raw = eurPrice / (fx[currency] || 1);
  if (transaction === 'sale') return Math.round(raw / 1000) * 1000;
  return Math.round(raw / 25) * 25;
}

function featureList(base, filters, rng) {
  const pool = [
    ...(base.features || []),
    ...(filters.features || []),
    'Terrace',
    'Air conditioning',
    'Garden',
    'Parking',
    'Sea view',
    'Pool',
    'Furnished',
    'Lift',
  ];
  const unique = [...new Set(pool)];
  for (let i = unique.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [unique[i], unique[j]] = [unique[j], unique[i]];
  }
  const count = intBetween(rng, 3, Math.min(6, unique.length));
  const chosen = unique.slice(0, count);
  for (const wanted of filters.features || []) {
    if (chance(rng, 0.45) && !chosen.includes(wanted)) chosen.push(wanted);
  }
  return [...new Set(chosen)].slice(0, 8);
}

function makeSnippet({ title, beds, area, city, currency, price, source, features }) {
  const priceText = `${formatMoney(price, currency)}${currency !== 'EUR' ? ` (${currency})` : ''}`;
  const featureText = features?.length ? ` Features include ${features.slice(0, 3).join(', ').toLowerCase()}.` : '';
  return `${title}. ${beds ? `${beds} bedroom${beds === 1 ? '' : 's'}, ` : ''}${area ? `${area} m², ` : ''}${city}. ${priceText}.${featureText} Listed by ${source.name}.`;
}

export class DemoProvider {
  constructor({ config, logger, discoveryPool = DISCOVERY_POOL }) {
    this.config = config;
    this.logger = logger;
    this.discoveryPool = discoveryPool;
    this.mode = 'demo';
    this.name = 'Simulated market';
  }

  relevantSources(filters, sources) {
    const countries = filters.countries?.length ? filters.countries : null;
    let pool = sources.filter((source) => source.enabled);
    if (countries) {
      pool = pool.filter((source) => !source.country || countries.includes(source.country));
    }
    if (!pool.length) pool = sources.filter((source) => source.enabled);
    if (!pool.length) pool = sources;
    const regions = filters.regions || [];
    const scored = pool.map((source) => {
      let score = source.reliability || 0.5;
      if (regions.length && source.region && regions.includes(source.region)) score += 0.16;
      if (PORTAL_KINDS.has(source.kind)) score += 0.03;
      return { source, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 9).map((item) => item.source);
  }

  pickBases(properties, allProperties, filters) {
    if (properties.length) return properties.slice(0, 6);
    const sameTransaction = allProperties.filter((property) => property.transaction === filters.transaction);
    const locationPool = sameTransaction.filter((property) => {
      if (filters.types?.length && !filters.types.includes(property.type)) return false;
      if (filters.locations?.length && !filters.locations.includes(property.city)) return false;
      if (filters.regions?.length && !filters.regions.includes(property.region)) return false;
      if (filters.countries?.length && !filters.countries.includes(property.country)) return false;
      return true;
    });
    const pool = locationPool.length ? locationPool : sameTransaction;
    if (pool.length) {
      return pool.slice(0, 4).map((property) => ({
        ...property,
        price: filters.budget ? Math.min(property.price, filters.budget * 1.05) : property.price,
      }));
    }
    return [this.syntheticBase(filters)];
  }

  syntheticBase(filters) {
    const city = filters.locations?.[0] || (filters.countries?.[0] === 'Spain' ? 'Marbella' : 'Lagos');
    const entry = GAZETTEER.find((item) => item.city === city) || GAZETTEER[0];
    const type = filters.types?.[0] || 'apartment';
    const beds = filters.bedsMin ?? 2;
    const price = filters.budget
      ? Math.round(filters.budget * 0.95)
      : filters.transaction === 'sale'
        ? 450_000
        : 1650;
    return {
      id: `synthetic_${slugify(city)}_${type}`,
      ref: 'MARKET',
      title: `${beds}-bed ${type} in ${city}`,
      transaction: filters.transaction,
      type,
      city: entry.city,
      neighborhood: NEIGHBOURHOODS[entry.city]?.[0] || entry.city,
      region: entry.region,
      country: entry.country,
      lat: entry.lat,
      lng: entry.lng,
      bedrooms: beds,
      bathrooms: Math.max(1, beds - 1),
      area_m2: 85 + beds * 18,
      price,
      currency: 'EUR',
      period: filters.transaction === 'sale' ? 'total' : 'month',
      features: filters.features?.length ? filters.features : ['Terrace', 'Pool'],
    };
  }

  /**
   * Decide the source plan, mirrors and cross-posts for the whole run. All
   * decisions are made here so concurrent source searches stay deterministic.
   */
  prepareRun({ runId, filters, sources, properties, allProperties }) {
    const selected = this.relevantSources(filters, sources);
    const bases = this.pickBases(properties, allProperties, filters);
    const rng = rngFrom(runId, filters.searchQuery, 'plan');

    const queries = [];
    for (const source of selected) {
      const base = filters.searchQuery;
      queries.push({ sourceId: source.id, text: `site:${source.domain} ${base}`, kind: 'site' });
      queries.push({
        sourceId: source.id,
        text: `${filters.locations?.[0] || filters.regions?.[0] || 'Algarve'} ${(filters.features || []).slice(0, 2).join(' ')} ${filters.transaction === 'sale' ? 'for sale' : 'long term rent'}`.trim(),
        kind: 'local',
      });
      queries.push({ sourceId: source.id, text: `${base} -${source.domain}`, kind: 'discovery' });
    }

    const portalSources = selected.filter((source) => PORTAL_KINDS.has(source.kind));
    const mirrorSlots = Math.min(3, bases.length);
    const mirrorSources = (portalSources.length >= 2
      ? portalSources
      : [...portalSources, ...selected.filter((source) => !PORTAL_KINDS.has(source.kind))]
    ).slice(0, mirrorSlots);
    const offsets = [-7, 6, -4];
    const mirrorPlan = mirrorSources.map((source, i) => ({
      sourceId: source.id,
      base: bases[i],
      offsetPct: offsets[i] ?? -3,
    })).filter((item) => item.base);

    const crossSources = selected.filter((source) => !mirrorPlan.some((plan) => plan.sourceId === source.id));
    const crossPost = crossSources.length >= 2 && bases.length
      ? {
          sourceIds: [crossSources[0].id, crossSources[1].id],
          spec: this.buildComparable({ base: bases[bases.length - 1], filters, rng, baseIndex: bases.length - 1, shared: true }),
        }
      : null;

    const knownDomains = new Set(sources.map((source) => source.domain));
    const discoveryCandidates = this.discoveryPool.filter((candidate) => {
      if (knownDomains.has(candidate.domain)) return false;
      if (filters.countries?.length && candidate.country && !filters.countries.includes(candidate.country)) return false;
      return true;
    });
    const discovery = [];
    if (discoveryCandidates.length) {
      const shuffled = [...discoveryCandidates].sort((a, b) => hashString(`${runId}${a.domain}`) - hashString(`${runId}${b.domain}`));
      const count = discoveryCandidates.length > 1 && chance(rng, 0.7) ? 2 : 1;
      for (const candidate of shuffled.slice(0, count)) {
        discovery.push({
          name: candidate.name,
          domain: candidate.domain,
          kind: candidate.kind,
          region: filters.regions?.[0] || candidate.region,
          country: filters.countries?.[0] || candidate.country,
          url: candidate.url,
          reliability: candidate.reliability,
          notes: candidate.notes,
          discovered_by: 'agent',
        });
      }
    }

    const context = {
      bases,
      mirrorPlan,
      mirrorCount: 0,
      crossPost,
      queries,
      transaction: filters.transaction,
      fx: this.config.fx,
      seenTitles: new Set(),
      offersProduced: 0,
    };

    return { sources: selected, queries, discovery, context };
  }

  buildComparable({ base, filters, rng, baseIndex, shared = false }) {
    const transaction = base.transaction;
    const bias = BASE_BIAS[baseIndex % BASE_BIAS.length];
    const factor = between(rng, 0.94, 1.06);
    const eurPrice = priceRound(base.price * bias * factor, transaction);
    const currency = shared ? 'EUR' : chance(rng, 0.18) ? (chance(rng, 0.5) ? 'GBP' : 'USD') : 'EUR';
    const price = displayPrice(eurPrice, currency, this.config.fx, transaction);
    const area = Math.max(35, Math.round(base.area_m2 * between(rng, 0.87, 1.15)));
    const beds = shared
      ? base.bedrooms
      : Math.max(1, base.bedrooms + (chance(rng, 0.22) ? (chance(rng, 0.5) ? 1 : -1) : 0));
    const type = shared
      ? base.type
      : chance(rng, 0.08)
        ? pick(rng, PROPERTY_TYPES.filter((t) => t !== base.type))
        : base.type;
    const neighborhoods = NEIGHBOURHOODS[base.city] || [base.neighborhood || base.city];
    const neighborhood = shared ? (base.neighborhood || neighborhoods[0]) : pick(rng, neighborhoods);
    const features = featureList(base, filters, rng);
    const descriptor = features.includes('Sea view')
      ? 'with sea views'
      : features.includes('Pool')
        ? 'with a pool'
        : features.includes('Garden')
          ? 'with a garden'
          : 'close to amenities';
    const titleOptions = [
      `${beds}-bedroom ${TYPE_LABEL[type]} ${descriptor} in ${neighborhood}`,
      `${neighborhood} ${TYPE_LABEL[type]} · ${beds} bed · ${area} m²`,
      `${beds}-bed ${TYPE_LABEL[type]} in ${neighborhood}, ${descriptor}`,
      `${TYPE_LABEL[type][0].toUpperCase()}${TYPE_LABEL[type].slice(1)} in ${neighborhood} with ${area} m²`,
    ];
    const title = pick(rng, titleOptions);
    const seller = chance(rng, 0.55) ? pick(rng, AGENCY_SELLERS) : null;
    const priceText = formatMoney(price, currency);
    return {
      title,
      transaction,
      type,
      city: base.city,
      neighborhood,
      region: base.region,
      country: base.country,
      lat: base.lat ? base.lat + between(rng, -0.009, 0.009) : null,
      lng: base.lng ? base.lng + between(rng, -0.009, 0.009) : null,
      bedrooms: beds,
      bathrooms: Math.max(1, beds - 1),
      area_m2: area,
      price,
      currency,
      period: transaction === 'sale' ? 'total' : 'month',
      features,
      seller,
      snippet: makeSnippet({
        title,
        beds,
        area,
        city: base.city,
        currency,
        price,
        source: { name: seller || 'a local agency' },
        features,
      }),
      confidence: intBetween(rng, 74, 96) / 100,
      priceText,
    };
  }

  buildMirror({ base, filters, source, offsetPct, rng }) {
    const transaction = base.transaction;
    const price = priceRound(base.price * (1 + offsetPct / 100), transaction);
    const marketing = pick(rng, MARKETING);
    const title = `${base.title} | ${marketing}`;
    const seller = chance(rng, 0.5) ? pick(rng, AGENCY_SELLERS) : source.name;
    return {
      title,
      transaction,
      type: base.type,
      city: base.city,
      neighborhood: base.neighborhood,
      region: base.region,
      country: base.country,
      lat: base.lat,
      lng: base.lng,
      bedrooms: base.bedrooms,
      bathrooms: base.bathrooms,
      area_m2: base.area_m2,
      price,
      currency: 'EUR',
      period: transaction === 'sale' ? 'total' : 'month',
      features: [...new Set([...(base.features || []), ...(filters.features || []), 'Sea view'].filter(Boolean))].slice(0, 8),
      seller,
      snippet: `${base.ref} — ${base.title}. ${base.area_m2} m², ${base.bedrooms} bed. ${formatMoney(price, 'EUR')}${transaction === 'rent' ? ' per month' : ''}. Listed by ${seller} on ${source.name}.`,
      confidence: intBetween(rng, 86, 98) / 100,
      priceText: formatMoney(price, 'EUR'),
    };
  }

  buildNoise({ base, filters, source, rng }) {
    const outside = GAZETTEER.filter((entry) => {
      if (filters.locations?.length && filters.locations.some((city) => city === entry.city)) return false;
      if (filters.regions?.length && filters.regions.includes(entry.region)) return false;
      if (filters.countries?.length && filters.countries.includes(entry.country)) return false;
      return true;
    });
    const elsewhere = outside.length ? pick(rng, outside) : null;
    const mode = pick(rng, ['city', 'type', 'price']);
    const city = mode === 'city' && elsewhere ? elsewhere.city : base.city;
    const region = mode === 'city' && elsewhere ? elsewhere.region : base.region;
    const country = mode === 'city' && elsewhere ? elsewhere.country : base.country;
    const type = mode === 'type' ? pick(rng, PROPERTY_TYPES.filter((t) => t !== base.type)) : base.type;
    const price = mode === 'price'
      ? priceRound(base.price * 2.2, base.transaction)
      : priceRound(base.price * between(rng, 0.9, 1.1), base.transaction);
    const title = `${base.bedrooms}-bed ${type} in ${city}`;
    return {
      title,
      transaction: mode === 'type' ? base.transaction : base.transaction,
      type,
      city,
      neighborhood: NEIGHBOURHOODS[city]?.[0] || city,
      region,
      country,
      lat: elsewhere?.lat ?? base.lat,
      lng: elsewhere?.lng ?? base.lng,
      bedrooms: base.bedrooms,
      bathrooms: base.bathrooms,
      area_m2: base.area_m2,
      price,
      currency: chance(rng, 0.2) ? 'GBP' : 'EUR',
      period: base.transaction === 'sale' ? 'total' : 'month',
      features: featureList(base, filters, rng),
      seller: source.name,
      snippet: `Listing on ${source.name} in ${city}. ${formatMoney(price, 'EUR')}.`,
      confidence: 0.61,
      priceText: formatMoney(price, 'EUR'),
    };
  }

  materialise(raw, { source, runId, index, sharedId = null }) {
    const externalId = sharedId || shortHash(`${runId}|${source.id}|${index}|${raw.title}`, 10);
    return {
      ...raw,
      external_id: externalId,
      url: `https://www.${source.domain}/en/property/${externalId}`,
      seller: raw.seller || source.name,
    };
  }

  async searchSource({ runId, filters, source, index, context }) {
    const rng = rngFrom(runId, source.id, filters.searchQuery, 'search');
    const offers = [];
    let counter = 0;

    const mirror = context.mirrorPlan.find((plan) => plan.sourceId === source.id);
    if (mirror) {
      const raw = this.buildMirror({ base: mirror.base, filters, source, offsetPct: mirror.offsetPct, rng });
      offers.push(this.materialise(raw, { source, runId, index: `mirror-${counter}` }));
      context.mirrorCount += 1;
      counter += 1;
    }

    if (context.crossPost?.sourceIds.includes(source.id)) {
      const sharedId = shortHash(`cross|${runId}|${context.crossPost.spec.title}`, 10);
      offers.push(
        this.materialise(
          { ...context.crossPost.spec, seller: source.name },
          { source, runId, index: `cross-${counter}`, sharedId }
        )
      );
      counter += 1;
    }

    const count = intBetween(rng, 4, 7);
    for (let i = 0; i < count; i += 1) {
      const base = context.bases[(index + i) % context.bases.length];
      const raw = this.buildComparable({
        base,
        filters,
        rng,
        baseIndex: (index + i) % context.bases.length,
      });
      offers.push(this.materialise(raw, { source, runId, index: `${counter}-${i}` }));
    }

    if (this.config.chaos && chance(rng, 0.12)) {
      throw new Error(`Timed out fetching ${source.name}`);
    }

    const noise = this.buildNoise({ base: context.bases[index % context.bases.length], filters, source, rng });
    if (chance(rng, 0.45)) {
      offers.push(this.materialise(noise, { source, runId, index: 'noise' }));
    }

    context.offersProduced += offers.length;
    return offers;
  }
}
