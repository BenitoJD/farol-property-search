import { convertToEur, formatMoney } from '../lib/fx.js';
import { normalizeText } from '../lib/text.js';
import { clamp } from '../lib/values.js';

/**
 * A deliberately small gazetteer for the demo. In live deployments this would be
 * replaced by a geocoder; the parser only needs to recognise the markets PBoR serves.
 */
export const GAZETTEER = [
  { city: 'Lagos', region: 'Algarve', country: 'Portugal', lat: 37.1028, lng: -8.6735, aliases: ['lagos', 'praia da luz', 'meia praia', 'ponta da piedade'] },
  { city: 'Portimão', region: 'Algarve', country: 'Portugal', lat: 37.136, lng: -8.5375, aliases: ['portimao', 'praia da rocha', 'alvor', 'lagoa'] },
  { city: 'Albufeira', region: 'Algarve', country: 'Portugal', lat: 37.0891, lng: -8.2498, aliases: ['albufeira', 'olhos de agua', 'gale'] },
  { city: 'Vilamoura', region: 'Algarve', country: 'Portugal', lat: 37.0912, lng: -8.1166, aliases: ['vilamoura', 'quarteira'] },
  { city: 'Tavira', region: 'Algarve', country: 'Portugal', lat: 37.1273, lng: -7.6493, aliases: ['tavira', 'cabanas', 'santa luzia'] },
  { city: 'Faro', region: 'Algarve', country: 'Portugal', lat: 37.0194, lng: -7.9304, aliases: ['faro'] },
  { city: 'Olhão', region: 'Algarve', country: 'Portugal', lat: 37.0275, lng: -7.8421, aliases: ['olhao', 'fuseta'] },
  { city: 'Cascais', region: 'Lisbon', country: 'Portugal', lat: 38.6979, lng: -9.4215, aliases: ['cascais', 'estoril'] },
  { city: 'Lisbon', region: 'Lisbon', country: 'Portugal', lat: 38.7169, lng: -9.1487, aliases: ['lisbon', 'lisboa', 'principe real', 'chiado', 'alfama'] },
  { city: 'Marbella', region: 'Andalusia', country: 'Spain', lat: 36.4943, lng: -4.9673, aliases: ['marbella', 'san pedro de alcantara', 'nueva andalucia', 'puerto banus'] },
  { city: 'Estepona', region: 'Andalusia', country: 'Spain', lat: 36.4267, lng: -5.147, aliases: ['estepona'] },
];

export const LOCATION_OPTIONS = [
  { value: '', label: 'Any market' },
  { value: 'Algarve', label: 'Algarve (all)' },
  { value: 'Lagos', label: 'Lagos' },
  { value: 'Portimão', label: 'Portimão' },
  { value: 'Albufeira', label: 'Albufeira' },
  { value: 'Vilamoura', label: 'Vilamoura' },
  { value: 'Tavira', label: 'Tavira' },
  { value: 'Faro', label: 'Faro' },
  { value: 'Olhão', label: 'Olhão' },
  { value: 'Lisbon', label: 'Lisbon' },
  { value: 'Cascais', label: 'Cascais' },
  { value: 'Marbella', label: 'Marbella' },
  { value: 'Estepona', label: 'Estepona' },
  { value: 'Spain', label: 'Spain (all)' },
  { value: 'Portugal', label: 'Portugal (all)' },
];

export const PROPERTY_TYPES = ['apartment', 'villa', 'townhouse'];

const FEATURE_PATTERNS = [
  { label: 'Sea view', pattern: /\b(sea view|ocean view|sea views|water view|frontline|beachfront)\b/ },
  { label: 'River view', pattern: /\b(river view|river views|estuary view)\b/ },
  { label: 'Pool', pattern: /\b(pool|swimming pool|plunge pool)\b/ },
  { label: 'Private pool', pattern: /\b(private pool|heated pool)\b/ },
  { label: 'Garden', pattern: /\b(garden|gardens|courtyard)\b/ },
  { label: 'Parking', pattern: /\b(parking|garage|car space|driveway)\b/ },
  { label: 'Furnished', pattern: /\b(furnished|furniture)\b/ },
  { label: 'Terrace', pattern: /\b(terrace|balcony|roof terrace)\b/ },
  { label: 'Lift', pattern: /\b(lift|elevator)\b/ },
  { label: 'Air conditioning', pattern: /\b(air conditioning|a\/c|air-con|aircon)\b/ },
  { label: 'Walk to amenities', pattern: /\b(walkable|walk to|walking distance|near amenities|near shops|central)\b/ },
  { label: 'Golf nearby', pattern: /\b(golf|golf course)\b/ },
  { label: 'Pet friendly', pattern: /\b(pet friendly|pets allowed|pets considered)\b/ },
  { label: 'Quiet', pattern: /\b(quiet|peaceful|calm)\b/ },
  { label: 'Single storey', pattern: /\b(single storey|single-storey|one level|step-free|accessible)\b/ },
  { label: 'Heating', pattern: /\b(heating|underfloor heating)\b/ },
];

const WORD_NUMBERS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseNumberToken(raw) {
  if (raw === undefined || raw === null) return null;
  let text = String(raw).trim();
  if (!text) return null;
  if (/^\d+(\.\d+)?[kK]$/.test(text)) return Math.round(parseFloat(text) * 1000);
  if (/^\d+(\.\d+)?[mM]$/.test(text)) return Math.round(parseFloat(text) * 1_000_000);
  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      text = text.replace(/\./g, '').replace(',', '.');
    } else {
      text = text.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    const after = text.slice(lastComma + 1);
    text = after.length === 3 && text.split(',')[0].length <= 3
      ? text.replace(/,/g, '')
      : text.replace(/,/g, '.');
  } else if (lastDot !== -1) {
    const after = text.slice(lastDot + 1);
    const before = text.slice(0, lastDot);
    if (after.length === 3 && before.length <= 3) {
      text = text.replace(/\./g, '');
    }
  }
  const value = Number.parseFloat(text.replace(/[^\d.]/g, ''));
  return Number.isFinite(value) ? value : null;
}

function applySuffix(amount, suffix) {
  if (!Number.isFinite(amount)) return null;
  const s = String(suffix || '').toLowerCase();
  if (s === 'k' || s === 'thousand') return Math.round(amount * 1000);
  if (s === 'm' || s === 'million') return Math.round(amount * 1_000_000);
  return Math.round(amount);
}

function detectCurrency(segment) {
  if (/£|gbp|pounds?/i.test(segment)) return 'GBP';
  if (/\$|usd|dollars?/i.test(segment)) return 'USD';
  return 'EUR';
}

function parseBudget(lower, fx) {
  const candidates = [];
  const currencyToken = '(?:€|£|\\$|eur|euros?|gbp|pounds?|usd|dollars?)';
  const suffixToken = '(k|m|thousand|million)?';

  // €2,200  /  £1.5k  /  $3,000
  const before = new RegExp(`(€|£|\\$)\\s*(\\d[\\d.,]*)\\s*${suffixToken}`, 'gi');
  for (const match of lower.matchAll(before)) {
    const amount = applySuffix(parseNumberToken(match[2]), match[3]);
    if (amount) candidates.push({ amount, currency: detectCurrency(match[1]) });
  }

  // 2,200 EUR  /  1.5m euros
  const after = new RegExp(`(\\d[\\d.,]*)\\s*${suffixToken}\\s*(€|eur|euros?|£|gbp|pounds?|\\$|usd|dollars?)`, 'gi');
  for (const match of lower.matchAll(after)) {
    const amount = applySuffix(parseNumberToken(match[1]), match[2]);
    if (amount) candidates.push({ amount, currency: detectCurrency(match[3]) });
  }

  // "budget 2200", "up to 2.2k", "max €2,500"
  const keywords = new RegExp(
    `(?:up to|under|below|max(?:imum)?(?: budget)?(?: of)?|budget(?: of)?|no more than|around|about|circa|between)\\s*${currencyToken}?\\s*(\\d[\\d.,]*)\\s*${suffixToken}\\s*${currencyToken}?`,
    'gi'
  );
  for (const match of lower.matchAll(keywords)) {
    const amount = applySuffix(parseNumberToken(match[1]), match[2]);
    if (amount) {
      const segment = match[0];
      candidates.push({ amount, currency: detectCurrency(segment) });
    }
  }

  const sensible = candidates.filter((c) => c.amount >= 100 && c.amount <= 50_000_000);
  if (!sensible.length) return null;

  // The upper end of a range is the useful cap.
  sensible.sort((a, b) => b.amount - a.amount);
  const chosen = sensible[0];
  const amountEur = convertToEur(chosen.amount, chosen.currency, fx);
  if (!amountEur) return null;
  return {
    amount: amountEur,
    sourceAmount: chosen.amount,
    sourceCurrency: chosen.currency,
  };
}

function parseBeds(lower) {
  const word = 'one|two|three|four|five|six';
  const range = lower.match(
    new RegExp(`\\b(\\d|${word})\\s*(?:-|–|—|to)\\s*(\\d|${word})\\s*[- ]?(?:bed|beds|bedroom|bedrooms|br)\\b`)
  );
  if (range) {
    const a = WORD_NUMBERS[range[1]] ?? Number(range[1]);
    const b = WORD_NUMBERS[range[2]] ?? Number(range[2]);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      return { min: Math.min(a, b), max: Math.max(a, b), stated: true };
    }
  }

  const exact = lower.match(new RegExp(`\\b(\\d|${word})\\s*[- ]?(?:bed|beds|bedroom|bedrooms)\\b`));
  if (exact) {
    const n = WORD_NUMBERS[exact[1]] ?? Number(exact[1]);
    if (Number.isFinite(n)) return { min: n, max: n, stated: true };
  }

  const tFormat = lower.match(/\bt([1-9])\b/);
  if (tFormat) {
    const n = Number(tFormat[1]);
    return { min: n, max: n, stated: true };
  }

  return { min: null, max: null, stated: false };
}

function parseTypes(lower) {
  const types = new Set();
  if (/\b(apartment|apartments|flat|flats|penthouse|duplex)\b/.test(lower)) types.add('apartment');
  if (/\bvilla(s)?\b/.test(lower)) types.add('villa');
  if (/\b(townhouse|town house|townhouses|terraced house)\b/.test(lower)) types.add('townhouse');
  if (/\b(house|home)\b/.test(lower) && !types.size) {
    types.add('townhouse');
    types.add('villa');
  }
  return [...types];
}

function parseTransaction(lower) {
  const rentIndex = lower.search(/\b(rent|renting|rental|long[- ]?let|long[- ]?term|lease|tenant|monthly)\b/);
  const saleIndex = lower.search(/\b(buy|buying|purchase|purchasing|for sale|sales?|acquisition)\b/);
  if (rentIndex === -1 && saleIndex === -1) return { value: null, stated: false };
  if (rentIndex === -1) return { value: 'sale', stated: true };
  if (saleIndex === -1) return { value: 'rent', stated: true };
  return { value: saleIndex < rentIndex ? 'sale' : 'rent', stated: true };
}

function parseLocations(lower, normalized) {
  const foundCities = [];
  const foundRegions = new Set();
  const foundCountries = new Set();

  for (const location of GAZETTEER) {
    for (const alias of location.aliases) {
      const pattern = new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'i');
      if (pattern.test(normalized)) {
        if (!foundCities.includes(location.city)) foundCities.push(location.city);
        foundRegions.add(location.region);
        foundCountries.add(location.country);
        break;
      }
    }
  }

  if (/\balgarve\b/.test(normalized)) {
    foundRegions.add('Algarve');
    foundCountries.add('Portugal');
  }
  if (/\bandalusia\b|\bandalucia\b|\bcosta del sol\b/.test(normalized)) {
    foundRegions.add('Andalusia');
    foundCountries.add('Spain');
  }
  if (/\bportugal\b/.test(normalized)) foundCountries.add('Portugal');
  if (/\bspain\b|\bespana\b/.test(normalized)) foundCountries.add('Spain');

  return {
    cities: foundCities,
    regions: [...foundRegions],
    countries: [...foundCountries],
  };
}

function parseFeatures(lower) {
  const features = [];
  for (const { label, pattern } of FEATURE_PATTERNS) {
    if (pattern.test(lower)) {
      if (label === 'Private pool') {
        if (!features.includes('Private pool')) features.push('Private pool');
      } else if (!features.includes(label)) {
        features.push(label);
      }
    }
  }
  if (features.includes('Private pool') && !features.includes('Pool')) features.push('Pool');
  return features;
}

function summarize(filters) {
  const bits = [];
  bits.push(filters.transaction === 'sale' ? 'Purchase' : 'Long-term rental');
  const bedLabel = filters.bedsMin !== null && filters.bedsMax !== null && filters.bedsMin !== filters.bedsMax
    ? `${filters.bedsMin}–${filters.bedsMax} bed`
    : filters.bedsMin !== null
      ? `${filters.bedsMin} bed`
      : null;
  if (bedLabel) bits.push(bedLabel);
  if (filters.types.length) {
    bits.push(filters.types.length === 1 ? filters.types[0] : `${filters.types.join(' / ')}`);
  }
  if (filters.locations.length) bits.push(filters.locations.join(' & '));
  else if (filters.regions.length) bits.push(filters.regions.join(' & '));
  else if (filters.countries.length) bits.push(filters.countries.join(' & '));
  if (filters.budget) {
    bits.push(`up to ${formatMoney(filters.budget, 'EUR')}${filters.transaction === 'rent' ? '/mo' : ''}`);
  }
  return bits.join(' · ');
}

function buildQuery(filters) {
  const terms = [];
  if (filters.bedsMin !== null) {
    terms.push(
      filters.bedsMax !== null && filters.bedsMax !== filters.bedsMin
        ? `${filters.bedsMin}-${filters.bedsMax} bedroom`
        : `${filters.bedsMin} bedroom`
    );
  }
  if (filters.types.length) terms.push(filters.types.join(' '));
  if (filters.features.length) terms.push(filters.features.slice(0, 3).join(' '));
  if (filters.locations.length) terms.push(filters.locations.join(' '));
  else if (filters.regions.length) terms.push(filters.regions.join(' '));
  else if (filters.countries.length) terms.push(filters.countries.join(' '));
  terms.push(filters.transaction === 'sale' ? 'for sale' : 'long term rental');
  if (filters.budget) {
    terms.push(`under EUR ${Math.round(filters.budget)}${filters.transaction === 'rent' ? '/month' : ''}`);
  }
  return terms.join(' ').replace(/\s+/g, ' ').trim();
}

function locationFromOverride(value, fx) {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  for (const location of GAZETTEER) {
    if (normalizeText(location.city) === normalized) {
      return { cities: [location.city], regions: [location.region], countries: [location.country] };
    }
  }
  if (normalized === 'algarve') return { cities: [], regions: ['Algarve'], countries: ['Portugal'] };
  if (normalized === 'lisbon') return { cities: [], regions: ['Lisbon'], countries: ['Portugal'] };
  if (normalized === 'portugal') return { cities: [], regions: [], countries: ['Portugal'] };
  if (normalized === 'spain' || normalized === 'espana') return { cities: [], regions: [], countries: ['Spain'] };
  return null;
}

/**
 * Turn a free-text client brief (plus optional form overrides) into a
 * deterministic, reviewable set of search criteria.
 */
export function parseBrief(brief, { overrides = {}, fx = { EUR: 1, GBP: 1.17, USD: 0.92 } } = {}) {
  const raw = String(brief ?? '').trim();
  const lower = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const normalized = normalizeText(raw);
  const assumptions = [];

  const tx = parseTransaction(lower);
  let transaction = tx.value ?? 'rent';
  if (!tx.stated) assumptions.push('No transaction specified — assumed a long-term rental.');
  if (overrides.transaction === 'rent' || overrides.transaction === 'sale') {
    if (overrides.transaction !== transaction) {
      assumptions.push(`Transaction set to ${overrides.transaction === 'sale' ? 'purchase' : 'long-term rental'} in the form.`);
    }
    transaction = overrides.transaction;
  }

  const parsedTypes = parseTypes(lower);
  let types = parsedTypes;
  if (Array.isArray(overrides.types) && overrides.types.length) {
    types = overrides.types.filter((type) => PROPERTY_TYPES.includes(type));
    if (!types.length) types = parsedTypes;
  }
  if (!types.length) assumptions.push('No property type stated — searching all residential types.');

  const beds = parseBeds(lower);
  let bedsMin = beds.min;
  let bedsMax = beds.max;
  if (Number.isFinite(overrides.bedsMin)) bedsMin = clamp(overrides.bedsMin, 0, 10);
  if (Number.isFinite(overrides.bedsMax)) bedsMax = clamp(overrides.bedsMax, 0, 10);
  if (bedsMin === null && Number.isFinite(overrides.bedsMin)) bedsMax = bedsMax ?? bedsMin;
  if (bedsMax !== null && bedsMin !== null && bedsMax < bedsMin) [bedsMin, bedsMax] = [bedsMax, bedsMin];
  if (bedsMin === null) assumptions.push('No bedroom count stated — matching a wider set of homes.');

  let budgetInfo = parseBudget(lower, fx);
  if (Number.isFinite(overrides.budget) && overrides.budget > 0) {
    budgetInfo = { amount: Math.round(overrides.budget), sourceAmount: Math.round(overrides.budget), sourceCurrency: 'EUR' };
  }
  if (!budgetInfo) assumptions.push('No budget stated — benchmarking against comparable stock.');
  else if (budgetInfo.sourceCurrency !== 'EUR') {
    assumptions.push(
      `Budget of ${formatMoney(budgetInfo.sourceAmount, budgetInfo.sourceCurrency)} converted to EUR at the configured FX rate.`
    );
  }

  const parsedLocations = parseLocations(lower, normalized);
  let locations = parsedLocations.cities;
  let regions = parsedLocations.regions;
  let countries = parsedLocations.countries;
  if (overrides.location) {
    const overridden = locationFromOverride(overrides.location, fx);
    if (overridden) {
      locations = overridden.cities;
      regions = overridden.regions;
      countries = overridden.countries;
      assumptions.push(`Location set to ${overrides.location} in the form.`);
    }
  }
  if (!locations.length && !regions.length && !countries.length) {
    locations = [];
    regions = ['Algarve'];
    countries = ['Portugal'];
    assumptions.push('No recognisable location — defaulted to the Algarve.');
  } else if (locations.length) {
    // Keep region/country context for the UI and source planning.
    regions = [...new Set(locations.flatMap((city) => {
      const entry = GAZETTEER.find((g) => g.city === city);
      return entry ? [entry.region] : [];
    }))];
    countries = [...new Set(locations.flatMap((city) => {
      const entry = GAZETTEER.find((g) => g.city === city);
      return entry ? [entry.country] : [];
    }))];
  }

  const features = parseFeatures(lower);
  if (Number.isFinite(overrides.bedsMin) || overrides.location || Number.isFinite(overrides.budget)) {
    assumptions.push('Form refinements override the brief where they conflict.');
  }

  const budget = budgetInfo?.amount ?? null;
  const filters = {
    version: 1,
    transaction,
    types,
    locations,
    regions,
    countries,
    bedsMin,
    bedsMax,
    budget,
    budgetCurrency: 'EUR',
    features,
    assumptions,
    parsedFrom: 'brief',
    confidence: 0,
    summary: '',
    searchQuery: '',
    brief: raw,
  };

  let recognised = 0;
  if (tx.stated) recognised += 1;
  if (types.length) recognised += 1;
  if (bedsMin !== null) recognised += 1;
  if (budget) recognised += 1;
  if (locations.length || regions.length || countries.length) recognised += 1;
  filters.confidence = Math.min(0.97, 0.48 + recognised * 0.1 + (features.length ? 0.04 : 0));
  filters.summary = summarize(filters);
  filters.searchQuery = buildQuery(filters);

  return filters;
}

export function locationMatches(offer, filters) {
  if (filters.locations?.length) {
    return filters.locations.some((city) => normalizeText(city) === normalizeText(offer.city));
  }
  if (filters.regions?.length) {
    return filters.regions.some((region) => normalizeText(region) === normalizeText(offer.region));
  }
  if (filters.countries?.length) {
    return filters.countries.some((country) => normalizeText(country) === normalizeText(offer.country));
  }
  return true;
}

/** Listings that Scout will benchmark against the external market. */
export function selectProperties(properties, filters, { budgetTolerance = 0.02 } = {}) {
  return properties.filter((property) => {
    if (property.status && property.status !== 'active') return false;
    if (property.transaction !== filters.transaction) return false;
    if (filters.types?.length && !filters.types.includes(property.type)) return false;
    if (!locationMatches(property, filters)) return false;
    if (filters.bedsMin !== null && filters.bedsMin !== undefined && property.bedrooms < filters.bedsMin) return false;
    if (filters.bedsMax !== null && filters.bedsMax !== undefined && property.bedrooms > filters.bedsMax) return false;
    if (filters.budget) {
      const cap = filters.budget * (1 + budgetTolerance);
      if (property.price > cap) return false;
    }
    return true;
  });
}

export function filterPropertiesExcludingBudget(properties, filters) {
  return properties.filter((property) => {
    if (property.transaction !== filters.transaction) return false;
    if (filters.types?.length && !filters.types.includes(property.type)) return false;
    return locationMatches(property, filters);
  });
}
