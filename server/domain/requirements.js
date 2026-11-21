import { clamp } from '../lib/util.js';

/**
 * The enquiry interpreter. It turns a free-text brief into a structured,
 * editable requirement set. It is deliberately conservative: every field it
 * derives can be overridden by the property finder before confirmation.
 */

const PLACES = [
  // Algarve
  { city: 'Lagos', region: 'Algarve', aliases: ['lagos', 'meia praia'] },
  { city: 'Portimão', region: 'Algarve', aliases: ['portimao', 'praia da rocha'] },
  { city: 'Alvor', region: 'Algarve', aliases: ['alvor'] },
  { city: 'Praia da Luz', region: 'Algarve', aliases: ['praia da luz'] },
  { city: 'Tavira', region: 'Algarve', aliases: ['tavira'] },
  { city: 'Faro', region: 'Algarve', aliases: ['faro'] },
  { city: 'Vilamoura', region: 'Algarve', aliases: ['vilamoura'] },
  { city: 'Albufeira', region: 'Algarve', aliases: ['albufeira'] },
  { city: 'Carvoeiro', region: 'Algarve', aliases: ['carvoeiro'] },
  { city: 'Loulé', region: 'Algarve', aliases: ['loule'] },
  { city: 'Olhão', region: 'Algarve', aliases: ['olhao'] },
  { city: 'Ferragudo', region: 'Algarve', aliases: ['ferragudo'] },
  { city: 'Silves', region: 'Algarve', aliases: ['silves'] },
  { city: 'Sagres', region: 'Algarve', aliases: ['sagres'] },
  { city: 'Salema', region: 'Algarve', aliases: ['salema'] },
  { city: 'Armação de Pêra', region: 'Algarve', aliases: ['armacao de pera'] },
  { city: 'Quinta do Lago', region: 'Algarve', aliases: ['quinta do lago'] },
  { city: 'Vale do Lobo', region: 'Algarve', aliases: ['vale do lobo'] },
  { city: 'São Brás de Alportel', region: 'Algarve', aliases: ['sao bras de alportel'] },
  { city: 'Castro Marim', region: 'Algarve', aliases: ['castro marim'] },
  { city: 'Vila Real de Santo António', region: 'Algarve', aliases: ['vila real de santo antonio'] },
  { city: 'Monchique', region: 'Algarve', aliases: ['monchique'] },
  // Lisbon and the west
  { city: 'Lisbon', region: 'Lisbon', aliases: ['lisbon', 'lisboa', 'estrela', 'alfama', 'principe real', 'avenida', 'chiado', 'belem'] },
  { city: 'Cascais', region: 'Lisbon', aliases: ['cascais'] },
  { city: 'Estoril', region: 'Lisbon', aliases: ['estoril'] },
  { city: 'Oeiras', region: 'Lisbon', aliases: ['oeiras'] },
  { city: 'Sintra', region: 'Lisbon', aliases: ['sintra'] },
  { city: 'Comporta', region: 'Lisbon', aliases: ['comporta', 'troia'] },
];

const REGIONS = ['Algarve', 'Lisbon'];

export const PROPERTY_TYPES = ['apartment', 'townhouse', 'villa', 'house', 'penthouse', 'quinta'];

const TYPE_PATTERNS = [
  { type: 'apartment', patterns: [/\bapartments?\b/, /\bflats?\b/, /\bcondos?\b/] },
  { type: 'townhouse', patterns: [/\btown\s?houses?\b/, /\btownhomes?\b/, /\bterraced house\b/] },
  { type: 'villa', patterns: [/\bvillas?\b/] },
  { type: 'house', patterns: [/\bhouses?\b/, /\bhomes?\b/] },
  { type: 'penthouse', patterns: [/\bpenthouses?\b/] },
  { type: 'quinta', patterns: [/\bquintas?\b/, /\bfarmhouses?\b/, /\bcountry house\b/] },
];

const FEATURES = [
  { label: 'Sea view', patterns: [/\bsea views?\b/, /\bocean views?\b/, /\bviews? (?:of|over) the sea\b/] },
  { label: 'Pool', patterns: [/\bswimming pool\b/, /\bpools?\b/] },
  { label: 'Garden', patterns: [/\bgardens?\b/] },
  { label: 'Terrace', patterns: [/\bterraces?\b/] },
  { label: 'Balcony', patterns: [/\bbalcon(?:y|ies)\b/] },
  { label: 'Parking', patterns: [/\bparking\b/, /\bgarages?\b/, /\bcar port\b/] },
  { label: 'Furnished', patterns: [/\bfurnished\b/] },
  { label: 'Lift', patterns: [/\blifts?\b/, /\belevators?\b/] },
  { label: 'Air conditioning', patterns: [/\bair conditioning\b/, /\ba\/c\b/] },
  { label: 'Fireplace', patterns: [/\bfireplaces?\b/] },
  { label: 'Pet friendly', patterns: [/\bpet[- ]friendly\b/, /\bpets? (?:are )?(?:welcome|allowed)\b/] },
  { label: 'Near beach', patterns: [/\bwalking distance (?:of|to|from) the beach\b/, /\bnear (?:the )?beach\b/, /\bbeach access\b/, /\bclose to the beach\b/] },
  { label: 'Near shops', patterns: [/\bnear (?:the )?shops\b/, /\bclose to shops\b/, /\bwalking distance (?:of|to) shops\b/, /\bamenities\b/] },
  { label: 'Near medical', patterns: [/\bmedical\b/, /\bhospitals?\b/, /\bclinics?\b/, /\bhealth cent(?:re|er)\b/] },
  { label: 'Near metro', patterns: [/\bmetro\b/, /\bunderground\b/] },
  { label: 'Senior friendly', patterns: [/\bsenior\b/, /\bretirement\b/, /\bstep[- ]free\b/, /\baccessible\b/] },
  { label: 'Golf', patterns: [/\bgolf\b/] },
  { label: 'River view', patterns: [/\briver views?\b/] },
  { label: 'Storage', patterns: [/\bstorage\b/] },
  { label: 'Roof terrace', patterns: [/\broof terrace\b/] },
  { label: 'Heating', patterns: [/\bheating\b/] },
  { label: 'Renovated', patterns: [/\brenovated\b/, /\brefurbished\b/] },
  { label: 'New build', patterns: [/\bnew build\b/, /\bbrand new\b/] },
];

const WORD_NUMBERS = {
  studio: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
};

const SOFT_MARKERS = /\b(ideally|nice to have|would like|bonus|preferably|if possible|would love|it would be great)\b/;

export function fold(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseAmount(raw, suffix) {
  let text = String(raw)
    .replace(/\s/g, '')
    .replace(/€|eur/gi, '')
    .replace(/[^\d.,]/g, '')
    .replace(/[.,]+$/, '');
  let multiplier = 1;
  const tail = String(suffix ?? '').toLowerCase();
  if (tail.startsWith('k') || tail.startsWith('thousand')) multiplier = 1000;
  if (tail.startsWith('m') || tail.startsWith('million')) multiplier = 1_000_000;
  if (/k$/i.test(text)) {
    multiplier = 1000;
    text = text.slice(0, -1);
  } else if (/m$/i.test(text)) {
    multiplier = 1_000_000;
    text = text.slice(0, -1);
  }
  if (text.includes(',') && text.includes('.')) {
    if (text.lastIndexOf(',') > text.lastIndexOf('.')) {
      text = text.replaceAll('.', '').replace(',', '.');
    } else {
      text = text.replaceAll(',', '');
    }
  } else if (text.includes(',')) {
    const decimals = text.split(',').pop();
    text = decimals.length === 3 ? text.replaceAll(',', '') : text.replace(',', '.');
  } else if (text.includes('.')) {
    const decimals = text.split('.').pop();
    if (decimals.length === 3 && !/^\d{1,2}\.\d{3}$/.test(text)) text = text.replaceAll('.', '');
  }
  const number = Number(text);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * multiplier);
}

export function extractBudget(text, transaction) {
  const folded = fold(text);
  let budgetMin = null;
  let budgetMax = null;

  const range = folded.match(
    /(?:€|eur)?\s*([\d](?:[\d.,]*[\d])?)\s*(k|m)?\s*(?:-|–|to|and)\s*(?:€|eur)?\s*([\d](?:[\d.,]*[\d])?)\s*(k|m)?/
  );
  if (range && /budget|€|eur|month|rent|price/.test(folded)) {
    const first = parseAmount(range[1], range[2]);
    const second = parseAmount(range[3], range[4] || range[2]);
    const moneyLike = first >= 100 && second >= 100;
    if (first && second && moneyLike && second > first && second < 50_000_000) {
      budgetMin = first;
      budgetMax = second;
    }
  }

  if (budgetMax === null) {
    const patterns = [
      /(?:€|eur)\s*([\d](?:[\d.,]*[\d])?)\s*(k|m|thousand|million)?/g,
      /([\d](?:[\d.,]*[\d])?)\s*(k|m)?\s*(?:€|euros?|eur)\b/g,
      /(?:budget|up to|maximum|max|around|about|under|below|no more than|ceiling)\s*(?:of\s*)?(?:€|eur)?\s*([\d](?:[\d.,]*[\d])?)\s*(k|m|thousand|million)?/g,
    ];
    const candidates = [];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(folded)) !== null) {
        const amount = parseAmount(match[1], match[2]);
        if (!amount) continue;
        const isMonthly = /month|pcm|per month|monthly/.test(folded);
        if (transaction === 'rent' && !isMonthly && amount > 40_000) continue;
        if (amount < 50) continue;
        candidates.push(amount);
      }
      if (candidates.length) break;
    }
    if (candidates.length) budgetMax = Math.max(...candidates);
  }

  if (budgetMax !== null && budgetMin !== null && budgetMin >= budgetMax) budgetMin = null;
  return { budgetMin, budgetMax };
}

export function extractBedrooms(text) {
  const folded = fold(text);
  let min = null;
  let max = null;
  const word = '(\\d+|one|two|three|four|five|six|seven|eight)';
  const toNumber = (value) => {
    if (value === null || value === undefined) return null;
    if (/^\d+$/.test(value)) return Number(value);
    return WORD_NUMBERS[value] ?? null;
  };

  const range = folded.match(
    new RegExp(`${word}\\s*(?:-|–|to|or)\\s*${word}[\\s-]*(?:bed|bedroom|br)\\b`)
  );
  if (range) {
    const first = toNumber(range[1]);
    const second = toNumber(range[2]);
    if (first !== null && second !== null) {
      min = Math.min(first, second);
      max = Math.max(first, second);
    }
  }
  if (min === null) {
    const single = folded.match(new RegExp(`${word}[\\s-]*\\+?\\s*(?:bed|bedroom|br)\\b`));
    if (single) {
      const value = toNumber(single[1]);
      if (value !== null) {
        min = value;
        max = value;
      }
    } else if (/\bstudio\b/.test(folded)) {
      min = 0;
      max = 1;
    }
  }
  return { bedroomsMin: min, bedroomsMax: max };
}

function extractLocations(text) {
  const folded = fold(text);
  const found = [];
  for (const place of PLACES) {
    for (const alias of place.aliases) {
      const pattern = new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'i');
      if (pattern.test(folded)) {
        found.push(place);
        break;
      }
    }
  }
  const locations = [];
  for (const place of found) {
    if (!locations.includes(place.city)) locations.push(place.city);
  }
  if (!locations.length) {
    if (/\balgarve\b/.test(folded)) locations.push('Algarve');
    else if (/\blisbon\b|\blisboa\b/.test(folded)) locations.push('Lisbon');
  }
  return locations;
}

function extractTypes(text) {
  const folded = fold(text);
  const types = [];
  for (const group of TYPE_PATTERNS) {
    if (group.patterns.some((pattern) => pattern.test(folded))) types.push(group.type);
  }
  // "house" is implied by townhouse/villa; don't double count.
  if (types.includes('townhouse') || types.includes('villa') || types.includes('quinta')) {
    return types.filter((type) => type !== 'house');
  }
  return types;
}

function extractFeatures(text) {
  const must = [];
  const nice = [];
  const sentences = String(text).split(/(?<=[.!?])\s+|\n+/);
  for (const sentence of sentences) {
    const folded = fold(sentence);
    const soft = SOFT_MARKERS.test(folded);
    for (const feature of FEATURES) {
      if (
        feature.label === 'Senior friendly' &&
        /algarve senior living|portugal long lets/.test(folded)
      ) continue;
      if (feature.patterns.some((pattern) => pattern.test(folded))) {
        // Don't read "no pool" or "without a pool" as a requirement.
        const negative = new RegExp(`(?:no|without|not)\\s+(?:a\\s+)?[^.]{0,12}${escapeRegExp(feature.label.split(' ')[0])}`, 'i');
        if (negative.test(folded)) continue;
        const target = soft ? nice : must;
        if (!must.includes(feature.label) && !nice.includes(feature.label)) target.push(feature.label);
      }
    }
  }
  return { mustHaves: must, niceToHaves: nice };
}

function extractTransaction(text, budgetMax) {
  const folded = fold(text);
  const monthly = /\b(per month|pcm|monthly|a month|\/month)\b/.test(folded);
  const rent = /\b(rent|rental|renting|long let|long-term let|long term let|lease|tenancy|tenant)\b/.test(folded);
  const sale = /\b(buy|buying|purchase|purchasing|for sale|sale|mortgage|freehold|invest)\b/.test(folded) || /\bto buy\b/.test(folded);
  if (monthly) return { transaction: 'rent', explicit: true };
  if (rent && !sale) return { transaction: 'rent', explicit: true };
  if (sale && !rent) return { transaction: 'sale', explicit: true };
  if (rent && sale) return { transaction: rent ? 'rent' : 'sale', explicit: true };
  if (budgetMax !== null && budgetMax >= 50_000) return { transaction: 'sale', explicit: false };
  return { transaction: 'rent', explicit: false };
}

function extractMoveIn(text) {
  const folded = fold(text);
  const months = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
  ];
  const now = new Date();
  for (let index = 0; index < months.length; index += 1) {
    const pattern = new RegExp(`\\b${months[index]}\\b(?:\\s+(\\d{4}))?`, 'i');
    const match = folded.match(pattern);
    if (match) {
      let year = match[1] ? Number(match[1]) : now.getFullYear();
      if (!match[1] && index < now.getMonth()) year += 1;
      return `${year}-${String(index + 1).padStart(2, '0')}`;
    }
  }
  if (/\bsummer\b/.test(folded)) {
    return `${now.getMonth() >= 5 ? now.getFullYear() + 1 : now.getFullYear()}-06`;
  }
  if (/\b(asap|as soon as possible|immediately|straight away)\b/.test(folded)) {
    const next = new Date(now);
    next.setMonth(next.getMonth() + 1);
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
  }
  return '';
}

function extractTenure(text) {
  const folded = fold(text);
  if (/\bshort let|short-term|short term|holiday let\b/.test(folded)) return 'Short let';
  if (/\blong let|long-term|long term|annual|12 months|one year\b/.test(folded)) return 'Long let';
  return '';
}

export function regionsForLocations(locations = []) {
  const regions = [];
  for (const location of locations) {
    if (REGIONS.includes(location)) {
      if (!regions.includes(location)) regions.push(location);
      continue;
    }
    const place = PLACES.find((entry) => entry.city === location);
    if (place && !regions.includes(place.region)) regions.push(place.region);
  }
  return regions;
}

export function parseBrief(brief, fields = {}) {
  const text = String(brief ?? '').trim();
  const folded = fold(text);
  const rawBudget = extractBudget(text, 'rent');
  const transactionInfo = extractTransaction(text, rawBudget.budgetMax);
  const transaction = transactionInfo.transaction;
  const budget = extractBudget(text, transaction);
  const bedrooms = extractBedrooms(text);
  const locations = extractLocations(text);
  const propertyTypes = extractTypes(text);
  const features = extractFeatures(text);
  const moveIn = extractMoveIn(text);
  const tenure = extractTenure(text);

  const parsed = {
    transaction,
    propertyTypes,
    locations,
    budgetMin: budget.budgetMin,
    budgetMax: budget.budgetMax,
    bedroomsMin: bedrooms.bedroomsMin,
    bedroomsMax: bedrooms.bedroomsMax,
    mustHaves: features.mustHaves,
    niceToHaves: features.niceToHaves,
    moveIn,
    tenure: transaction === 'rent' ? tenure || 'Long let' : '',
    notes: '',
  };

  let confidence = 0.52;
  if (transactionInfo.explicit) confidence += 0.08;
  if (locations.length) confidence += 0.1;
  if (budget.budgetMax !== null) confidence += 0.1;
  if (bedrooms.bedroomsMin !== null) confidence += 0.07;
  if (propertyTypes.length) confidence += 0.05;
  if (features.mustHaves.length) confidence += 0.04;
  if (moveIn) confidence += 0.03;
  if (text.length > 180) confidence += 0.02;

  const assumptions = [];
  if (transaction === 'rent') {
    assumptions.push('Monthly rent, quoted in EUR');
    if (!tenure) assumptions.push('Long let assumed');
  } else {
    assumptions.push('Asking price, quoted in EUR');
  }
  if (budget.budgetMax === null) assumptions.push('Budget to be confirmed');
  if (!locations.length) assumptions.push('Location to be confirmed');
  if (!bedrooms.bedroomsMin) assumptions.push('Bedroom count to be confirmed');

  const result = {
    ...parsed,
    confidence: clamp(Number(confidence.toFixed(2)), 0.4, 0.96),
    assumptions,
    brief: text,
  };
  return applyRequirementFields(result, fields);
}

export function applyRequirementFields(parsed, fields = {}) {
  const result = { ...parsed };
  const has = (key) => Object.prototype.hasOwnProperty.call(fields, key) && fields[key] !== undefined;
  if (has('transaction')) result.transaction = fields.transaction === 'sale' ? 'sale' : 'rent';
  if (has('propertyTypes')) result.propertyTypes = [...new Set(fields.propertyTypes)];
  if (has('locations')) result.locations = [...new Set(fields.locations)];
  if (has('budgetMin')) result.budgetMin = fields.budgetMin === '' ? null : Number(fields.budgetMin);
  if (has('budgetMax')) result.budgetMax = fields.budgetMax === '' ? null : Number(fields.budgetMax);
  if (has('bedroomsMin')) result.bedroomsMin = fields.bedroomsMin === '' ? null : Number(fields.bedroomsMin);
  if (has('bedroomsMax')) result.bedroomsMax = fields.bedroomsMax === '' ? null : Number(fields.bedroomsMax);
  if (has('mustHaves')) result.mustHaves = [...new Set(fields.mustHaves)];
  if (has('niceToHaves')) result.niceToHaves = [...new Set(fields.niceToHaves)];
  if (has('moveIn')) result.moveIn = fields.moveIn;
  if (has('tenure')) result.tenure = fields.tenure;
  if (has('notes')) result.notes = fields.notes;
  if (has('brief') && fields.brief) result.brief = fields.brief;

  result.regions = regionsForLocations(result.locations);
  if (result.transaction === 'sale') {
    result.tenure = '';
    if (result.budgetMax !== null && result.budgetMax < 10_000) {
      result.budgetMax = result.budgetMax * 1000;
    }
  }
  if (result.transaction === 'rent' && result.budgetMax !== null && result.budgetMax > 50_000) {
    result.budgetMax = null;
  }
  return result;
}

export function requirementSummary(requirements) {
  const parts = [];
  const typeText = requirements.propertyTypes.length
    ? requirements.propertyTypes.join(' or ')
    : 'property';
  const bedText =
    requirements.bedroomsMin !== null && requirements.bedroomsMin !== undefined
      ? requirements.bedroomsMax !== null && requirements.bedroomsMax !== requirements.bedroomsMin
        ? `${requirements.bedroomsMin}–${requirements.bedroomsMax} bed `
        : `${requirements.bedroomsMin} bed `
      : '';
  parts.push(`${bedText}${typeText}`);
  if (requirements.locations.length) parts.push(`in ${requirements.locations.join(' / ')}`);
  if (requirements.budgetMax !== null) {
    const value = new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(requirements.budgetMax);
    parts.push(requirements.transaction === 'rent' ? `up to ${value}/mo` : `up to ${value}`);
  }
  if (requirements.moveIn) parts.push(`from ${requirements.moveIn}`);
  return parts.join(' ');
}
