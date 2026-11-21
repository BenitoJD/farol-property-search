import { convertToEur, normalizeCurrency, formatMoney } from '../lib/fx.js';
import { normalizeText } from '../lib/text.js';
import { clamp } from '../lib/values.js';
import { GAZETTEER } from './brief.js';

const TYPE_WORDS = [
  { type: 'apartment', pattern: /\b(apartment|apartments|flat|flats|penthouse|duplex|loft)\b/ },
  { type: 'villa', pattern: /\b(villa|villas|chalet|detached house|country house)\b/ },
  { type: 'townhouse', pattern: /\b(townhouse|town house|terraced|townhome|house|home)\b/ },
];

const FEATURE_WORDS = [
  ['Sea view', /\b(sea view|sea views|ocean view|beachfront|frontline|waterfront)\b/],
  ['River view', /\b(river view|river views|estuary view)\b/],
  ['Private pool', /\b(private pool|heated pool|plunge pool)\b/],
  ['Pool', /\b(swimming pool|communal pool|pool)\b/],
  ['Garden', /\b(garden|gardens|courtyard)\b/],
  ['Parking', /\b(parking|garage|carport|driveway)\b/],
  ['Furnished', /\b(furnished|fully furnished)\b/],
  ['Terrace', /\b(terrace|balcony|roof terrace)\b/],
  ['Lift', /\b(lift|elevator)\b/],
  ['Air conditioning', /\b(air conditioning|air-conditioning|a\/c|aircon)\b/],
  ['Walk to amenities', /\b(walk to|walking distance|near amenities|close to shops|central)\b/],
  ['Golf nearby', /\b(golf|golf course)\b/],
  ['Heating', /\b(heating|underfloor heating)\b/],
  ['Pet friendly', /\b(pet friendly|pets allowed)\b/],
  ['Single storey', /\b(single storey|single-storey|step-free|accessible)\b/],
];

export function inferTransaction(text) {
  const lower = normalizeText(text);
  if (/\b(rent|rental|long term let|long let|lease|monthly)\b/.test(lower)) return 'rent';
  if (/\b(sale|for sale|buy|purchase|resale)\b/.test(lower)) return 'sale';
  return null;
}

export function normalizeType(value) {
  const lower = normalizeText(value);
  if (!lower) return null;
  for (const { type, pattern } of TYPE_WORDS) {
    if (pattern.test(lower)) return type;
  }
  return null;
}

export function inferType(text) {
  return normalizeType(text);
}

export function inferBeds(text) {
  const lower = String(text || '').toLowerCase();
  const range = lower.match(/(\d|one|two|three|four|five)\s*(?:-|–|—|to)\s*(\d|one|two|three|four|five)\s*[- ]?(?:bed|bedroom|br)\b/);
  const words = { one: 1, two: 2, three: 3, four: 4, five: 5 };
  if (range) {
    const a = words[range[1]] ?? Number(range[1]);
    const b = words[range[2]] ?? Number(range[2]);
    return Math.max(a, b);
  }
  const exact = lower.match(/\b(\d|one|two|three|four|five)\s*[- ]?(?:bed|bedroom)s?\b/);
  if (exact) return words[exact[1]] ?? Number(exact[1]);
  const t = lower.match(/\bt([1-9])\b/);
  if (t) return Number(t[1]);
  return null;
}

export function inferArea(text) {
  const match = String(text || '').match(/\b(\d{2,4})\s*(?:m2|m²|sqm|sq\.?\s?m|square met(?:er|re)s?)\b/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value >= 20 && value <= 5000 ? value : null;
}

export function extractFeaturesFromText(text) {
  const lower = String(text || '').toLowerCase();
  const features = [];
  for (const [label, pattern] of FEATURE_WORDS) {
    if (pattern.test(lower) && !features.includes(label)) features.push(label);
  }
  return features;
}

export function inferCity(text) {
  const normalized = normalizeText(text);
  for (const entry of GAZETTEER) {
    for (const alias of entry.aliases) {
      if (new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(normalized)) {
        return entry;
      }
    }
  }
  return null;
}

export function detectCurrency(text) {
  const lower = String(text || '').toLowerCase();
  if (/£|\bgbp\b|\bpounds?\b/.test(lower)) return 'GBP';
  if (/\$|\busd\b|\bdollars?\b/.test(lower)) return 'USD';
  return 'EUR';
}

export function parsePriceString(text) {
  const match = String(text || '').replace(/\u00a0/g, ' ').match(/[€£$]?\s?\d[\d.,]*\s*(?:k|m)?/i);
  if (!match) return null;
  let raw = match[0].trim();
  const suffix = /k$/i.test(raw) ? 'k' : /m$/i.test(raw) ? 'm' : '';
  let digits = raw.replace(/[^\d.,]/g, '');
  if (!digits) return null;
  if (suffix === 'k') return Math.round(Number.parseFloat(digits.replace(/,/g, '')) * 1000);
  if (suffix === 'm') return Math.round(Number.parseFloat(digits.replace(/,/g, '')) * 1_000_000);
  if (digits.includes('.') && digits.includes(',')) {
    digits = digits.lastIndexOf(',') > digits.lastIndexOf('.')
      ? digits.replace(/\./g, '').replace(',', '.')
      : digits.replace(/,/g, '');
  } else if (digits.includes(',')) {
    const after = digits.split(',').pop();
    digits = after.length === 3 ? digits.replace(/,/g, '') : digits.replace(',', '.');
  } else if (digits.includes('.')) {
    const after = digits.split('.').pop();
    const before = digits.split('.')[0];
    if (after.length === 3 && before.length <= 3) digits = digits.replace(/\./g, '');
  }
  const value = Number.parseFloat(digits);
  return Number.isFinite(value) ? value : null;
}

/**
 * Convert a page's advertised price to the reporting period.
 * Weekly and nightly rents are annualised then expressed per month.
 */
export function normalizeRentPeriod(price, hintText) {
  const lower = normalizeText(hintText);
  if (/\b(per week|weekly|\/week|\/ wk|pcm|per calendar month|per month|monthly|\/month|\/mo)\b/.test(lower)) {
    if (/\b(per week|weekly|\/week|\/ wk)\b/.test(lower)) {
      return { price: Math.round((price * 52) / 12), period: 'month', adjusted: 'weekly' };
    }
    return { price, period: 'month', adjusted: null };
  }
  if (/\b(per year|annual|annually|\/year|per annum)\b/.test(lower)) {
    return { price: Math.round(price / 12), period: 'month', adjusted: 'annual' };
  }
  if (/\b(per night|nightly|\/night)\b/.test(lower)) {
    return { price: Math.round(price * 30.4), period: 'month', adjusted: 'nightly' };
  }
  return { price, period: 'month', adjusted: null };
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && 'value' in value) return toNumber(value.value);
  const n = Number(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function titleCase(value) {
  return String(value)
    .toLowerCase()
    .replace(/(^|\s|\/)([a-zà-ÿ])/g, (m, prefix, letter) => prefix + letter.toUpperCase());
}

/**
 * Accepts a raw offer from any provider and returns a clean, validated offer
 * with an EUR-normalised price. Returns a rejection reason when unusable.
 */
export function normalizeOffer(raw, { source, filters, fx }) {
  const title = String(raw.title || '').replace(/\s+/g, ' ').trim().slice(0, 220);
  if (!title) return { offer: null, reason: 'missing_title' };

  const text = [title, raw.snippet, raw.description, raw.priceText].filter(Boolean).join(' ');
  const transaction = raw.transaction === 'sale' || raw.transaction === 'rent'
    ? raw.transaction
    : inferTransaction(text) || filters.transaction;
  const type = normalizeType(raw.type) || inferType(text);
  if (!type) return { offer: null, reason: 'missing_type' };

  const cityEntry = (raw.city && GAZETTEER.find((entry) => normalizeText(entry.city) === normalizeText(raw.city)))
    || inferCity(text);
  const city = raw.city || cityEntry?.city;
  if (!city) return { offer: null, reason: 'missing_location' };

  const currency = normalizeCurrency(raw.currency || raw.priceCurrency || detectCurrency(raw.priceText || text));
  let price = toNumber(raw.price);
  if (!price && typeof raw.price === 'string') price = parsePriceString(raw.price);
  if (!price && raw.priceText) price = parsePriceString(raw.priceText);
  if (!price) return { offer: null, reason: 'missing_price' };

  let period = raw.period === 'total' || raw.period === 'month' ? raw.period : transaction === 'sale' ? 'total' : 'month';
  if (transaction === 'rent') {
    const normalised = normalizeRentPeriod(price, raw.priceText || text);
    price = normalised.price;
    period = normalised.period;
  } else {
    period = 'total';
  }

  const priceEur = convertToEur(price, currency, fx);
  if (!priceEur) return { offer: null, reason: 'fx_failure' };

  const min = transaction === 'rent' ? 150 : 20_000;
  const max = transaction === 'rent' ? 100_000 : 100_000_000;
  if (priceEur < min || priceEur > max) return { offer: null, reason: 'price_out_of_range' };

  const beds = toNumber(raw.bedrooms) ?? inferBeds(text);
  const area = toNumber(raw.area_m2) ?? inferArea(text);
  const neighborhood = raw.neighborhood ? titleCase(raw.neighborhood) : null;
  const features = [...new Set((Array.isArray(raw.features) ? raw.features : []).concat(extractFeaturesFromText(text)))]
    .map((feature) => String(feature).trim())
    .filter(Boolean)
    .slice(0, 12);

  let confidence = Number(raw.confidence);
  if (!Number.isFinite(confidence)) {
    confidence = 0.55;
    if (raw.title) confidence += 0.08;
    if (raw.priceText || raw.price) confidence += 0.12;
    if (cityEntry || raw.city) confidence += 0.08;
    if (type) confidence += 0.05;
    if (beds) confidence += 0.04;
  }
  confidence = clamp(confidence, 0.3, 0.99);

  return {
    offer: {
      source_id: source.id,
      external_id: raw.external_id ? String(raw.external_id).slice(0, 120) : null,
      title,
      url: raw.url || null,
      transaction,
      type,
      city,
      neighborhood,
      region: raw.region || cityEntry?.region || null,
      country: raw.country || cityEntry?.country || null,
      lat: toNumber(raw.lat) ?? cityEntry?.lat ?? null,
      lng: toNumber(raw.lng) ?? cityEntry?.lng ?? null,
      bedrooms: beds,
      bathrooms: toNumber(raw.bathrooms),
      area_m2: area,
      price,
      currency,
      price_eur: Math.round(priceEur),
      period,
      features,
      seller: raw.seller || source.name,
      snippet: String(raw.snippet || '').replace(/\s+/g, ' ').trim().slice(0, 600) || null,
      confidence,
      price_text: raw.priceText ? formatMoney(price, currency) : null,
    },
    reason: null,
  };
}

function collectNodes(value, out = []) {
  if (!value || typeof value !== 'object') return out;
  if (Array.isArray(value)) {
    for (const item of value) collectNodes(item, out);
    return out;
  }
  out.push(value);
  for (const key of ['@graph', 'itemListElement', 'item', 'mainEntity', 'offers', 'containsPlace']) {
    if (value[key]) collectNodes(value[key], out);
  }
  return out;
}

function flattenAddress(address) {
  if (!address) return {};
  if (typeof address === 'string') return { text: address };
  return {
    city: address.addressLocality || address.addressRegion,
    region: address.addressRegion,
    country: address.addressCountry,
    text: [address.streetAddress, address.addressLocality, address.addressRegion, address.addressCountry]
      .filter(Boolean)
      .join(', '),
  };
}

function nodeToRaw(node) {
  const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
  const typeString = types.join(' ');
  if (!/RealEstateListing|Product|Residence|Apartment|House|SingleFamilyResidence|Accommodation/i.test(typeString)) {
    return null;
  }
  // Nested schema.org Offer objects are traversed by collectNodes, but they are
  // not standalone listings. Only the parent property entity should be emitted.
  if (types.every((type) => /^(Offer|AggregateOffer)$/.test(String(type)))) return null;
  if (!node.name && !node.headline && !node.description) return null;
  const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers;
  const price = offers?.price ?? node.price ?? offers?.lowPrice;
  if (price === undefined || price === null) return null;
  const address = flattenAddress(node.address);
  const floorSize = node.floorSize?.value ?? node.floorSize;
  return {
    title: node.name || node.headline || node.description?.slice(0, 160),
    price,
    currency: offers?.priceCurrency || node.priceCurrency || 'EUR',
    city: address.city,
    region: address.region,
    country: address.country,
    bedrooms: node.numberOfRooms || node.numberOfBedrooms,
    area_m2: floorSize,
    url: node.url || offers?.url,
    description: node.description,
    type: typeString,
    seller: node.seller?.name || node.provider?.name || offers?.seller?.name,
  };
}

export function extractJsonLdNodes(html) {
  const results = [];
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(regex)) {
    const jsonText = match[1].trim();
    if (!jsonText) continue;
    try {
      const parsed = JSON.parse(jsonText);
      for (const node of collectNodes(parsed)) {
        const raw = nodeToRaw(node);
        if (raw) results.push(raw);
      }
    } catch {
      // Ignore malformed structured data blocks.
    }
  }
  return results;
}

function readMeta(html, names) {
  for (const name of names) {
    const pattern = new RegExp(
      `<meta[^>]+(?:property|name)=["']${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]+content=["']([^"']+)["']`,
      'i'
    );
    const direct = html.match(pattern);
    if (direct) return direct[1];
    const reversed = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`,
      'i'
    );
    const reverseMatch = html.match(reversed);
    if (reverseMatch) return reverseMatch[1];
  }
  return null;
}

/**
 * Heuristic single-page extractor for live mode. JSON-LD is trusted most;
 * OpenGraph and visible text act as fallbacks.
 */
export function extractOffersFromHtml(html, { source, url, filters, fx }) {
  const candidates = [];
  const jsonLd = extractJsonLdNodes(html);
  for (const raw of jsonLd) {
    candidates.push({ ...raw, url: raw.url || url, confidence: 0.9 });
  }

  if (!candidates.length) {
    const title = readMeta(html, ['og:title', 'twitter:title']) || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    const description = readMeta(html, ['og:description', 'description']);
    const price = readMeta(html, ['product:price:amount', 'og:price:amount', 'price']);
    const currency = readMeta(html, ['product:price:currency', 'og:price:currency']);
    if (title && price) {
      candidates.push({
        title: title.trim(),
        description,
        price,
        currency: currency || detectCurrency(price),
        url,
        confidence: 0.72,
      });
    }
  }

  if (!candidates.length) {
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, ' ');
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const priceMatch = text.match(/(?:€|£|\$)\s?\d[\d.,]*\s*(?:per month|per week|\/month|monthly)?/i)
      || text.match(/\d[\d.,]*\s*(?:€|EUR)\s*(?:per month|monthly)?/i);
    if (h1 && priceMatch) {
      candidates.push({
        title: h1.replace(/\s+/g, ' ').trim(),
        description: text.slice(0, 500),
        priceText: priceMatch[0],
        price: parsePriceString(priceMatch[0]),
        currency: detectCurrency(priceMatch[0]),
        url,
        confidence: 0.58,
      });
    }
  }

  return candidates.slice(0, 5);
}

export function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}
