import { cityKey } from '../domain/pricing.js';

/**
 * Live market provider: Imovirtual public search results.
 *
 * This is deliberately narrow. It makes one request to a public search page
 * per analysis, parses the structured listing payload the page already ships,
 * and never bypasses logins, anti-bot challenges or portal terms. It is a
 * provider, not a crawler of the entire web.
 *
 * Operators must confirm that their use of a source complies with its terms.
 */

const BASE = 'https://www.imovirtual.com';
const USER_AGENT =
  'FarolComparableAgent/1.0 (+https://propertybuyorrent.com; listing comparison; contact the operator)';
const CACHE_TTL_MS = 8 * 60 * 1000;
const MAX_ITEMS = 60;
const cache = new Map();

const TYPE_LABELS = { FLAT: 'apartment', HOUSE: 'house', TOWNHOUSE: 'townhouse', VILLA: 'villa' };

const DISTRICT = {
  lagos: 'faro', portimao: 'faro', alvor: 'faro', 'praia da luz': 'faro', tavira: 'faro',
  faro: 'faro', vilamoura: 'faro', albufeira: 'faro', carvoeiro: 'faro', loule: 'faro',
  olhao: 'faro', ferragudo: 'faro', silves: 'faro', sagres: 'faro', salema: 'faro',
  'armacao de pera': 'faro', 'quinta do lago': 'faro', 'vale do lobo': 'faro',
  'sao bras de alportel': 'faro', 'castro marim': 'faro', 'vila real de santo antonio': 'faro',
  monchique: 'faro',
  lisbon: 'lisboa', lisboa: 'lisboa', cascais: 'lisboa', estoril: 'lisboa', oeiras: 'lisboa',
  sintra: 'lisboa', comporta: 'setubal',
};

const FEATURE_PATTERNS = [
  ['Sea view', /\b(sea view|vista mar|vista de mar|ocean view|beachfront|frente mar)\b/i],
  ['Pool', /\b(pool|piscina)\b/i],
  ['Garden', /\b(garden|jardim)\b/i],
  ['Terrace', /\b(terrace|terraço|terraco|varanda|balcony)\b/i],
  ['Parking', /\b(parking|garagem|garage|estacionamento)\b/i],
  ['Furnished', /\b(furnished|mobilado|equipado)\b/i],
  ['Lift', /\b(lift|elevador)\b/i],
  ['Air conditioning', /\b(air conditioning|ar condicionado|a\/c)\b/i],
  ['Near beach', /\b(beach|praia)\b/i],
  ['Pet friendly', /\b(pet|animais)\b/i],
  ['Golf', /\b(golf)\b/i],
];

const ROOM_WORDS = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6, SEVEN: 7 };

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function parsePrice(item) {
  const price = item.totalPrice?.value ?? item.rentPrice?.value;
  const number = Number(price);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function parseBeds(item) {
  const title = `${item.title || ''} ${item.shortDescription || ''}`;
  const t = title.match(/\bT([0-9])\b/i);
  if (t) return Number(t[1]);
  const bedrooms = title.match(/(\d+)\s*(?:bed|bedroom|quartos?|quarto)\b/i);
  if (bedrooms) return Number(bedrooms[1]);
  const rooms = ROOM_WORDS[String(item.roomsNumber || '').toUpperCase()];
  return rooms ? Math.max(0, rooms - 1) : null;
}

function parseType(item) {
  const estate = String(item.estate || '').toUpperCase();
  const title = `${item.title || ''}`.toLowerCase();
  if (estate === 'VILA') return 'villa';
  if (estate === 'TOWNHOUSE') return 'townhouse';
  if (estate === 'HOUSE') return /villa/.test(title) ? 'villa' : /townhouse|moradia em banda/.test(title) ? 'townhouse' : 'house';
  if (estate === 'FLAT' || estate === 'APARTMENT') return 'apartment';
  if (TYPE_LABELS[estate]) return TYPE_LABELS[estate];
  return 'apartment';
}

function parseCity(item, fallbackCity) {
  const locations = item.location?.reverseGeocoding?.locations || [];
  const council = locations.find((entry) => entry.locationLevel === 'council');
  const district = locations.find((entry) => entry.locationLevel === 'district');
  return council?.name || district?.name || fallbackCity;
}

function parseArea(item) {
  const value = Number(item.areaInSquareMeters);
  return Number.isFinite(value) && value >= 10 && value <= 2000 ? Math.round(value) : null;
}

function parseBathrooms(item) {
  const value = Number(item.bathroomsNumber);
  return Number.isFinite(value) && value >= 0 && value <= 20 ? value : null;
}

function featuresFrom(item) {
  const haystack = `${item.title || ''} ${item.shortDescription || ''}`;
  const features = [];
  for (const [label, pattern] of FEATURE_PATTERNS) {
    if (pattern.test(haystack)) features.push(label);
  }
  return features;
}

function daysSince(value) {
  if (!value) return 14;
  const date = new Date(value).getTime();
  if (!Number.isFinite(date)) return 14;
  return Math.max(0, Math.round((Date.now() - date) / 86_400_000));
}

function isShortLet(item) {
  if (String(item.transaction).toUpperCase() !== 'RENT') return false;
  const haystack = `${item.title || ''} ${item.shortDescription || ''}`.toLowerCase();
  return /\b(tempor|sazona|short[- ]term|holiday|f[ée]rias|from (october|november|december|january|february|march)\b)/i.test(
    haystack
  );
}

export function searchUrlForSubject(subject) {
  const action = subject.transaction === 'sale' ? 'comprar' : 'arrendar';
  const estate = ['apartment', 'penthouse'].includes(subject.type) ? 'apartamento' : 'moradia';
  const city = cityKey(subject.city);
  const district = DISTRICT[city.toLowerCase()] || null;
  const CITY_SLUG = { Lisbon: 'lisboa' };
  const citySlug = (CITY_SLUG[city] || city)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (district) {
    return `${BASE}/pt/resultados/${action}/${estate}/${district}/${citySlug}`;
  }
  return `${BASE}/pt/resultados/${action}/${estate}/todo-o-pais?q=${encodeURIComponent(city)}`;
}

export function parseImovirtualSearchHtml(html) {
  const match = String(html).match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error('The live search page did not contain a structured data payload.');
  let data;
  try {
    data = JSON.parse(match[1]);
  } catch {
    throw new Error('The live search page returned malformed structured data.');
  }
  const items = data?.props?.pageProps?.data?.searchAds?.items;
  if (!Array.isArray(items)) {
    throw new Error('The live search page did not contain comparable listings.');
  }
  return items;
}

function toListing(item, subject) {
  const price = parsePrice(item);
  if (!price) return null;
  if (isShortLet(item)) return null;
  const areaM2 = parseArea(item);
  const city = parseCity(item, subject.city);
  const type = parseType(item);
  const agency = item.agency || {};
  const sourceId = `live-imovirtual-${agency.id || 'portal'}`;
  const slug = String(item.slug || item.id);
  const features = featuresFrom(item);
  const image =
    features.includes('Pool')
      ? 'pool'
      : features.includes('Sea view')
        ? 'sea'
        : type === 'house' || type === 'villa' || type === 'townhouse'
          ? 'villa'
          : 'interior';
  return {
    id: `live-${item.id}`,
    cluster: `live-${item.id}`,
    sourceId,
    sourceName: agency.name || 'Imovirtual',
    sourceDomain: 'imovirtual.com',
    sourceKind: agency.type === 'AGENCY' ? 'agency' : 'portal',
    reliability: 0.7,
    reference: String(item.id || slug),
    title: text(item.title) || 'Untitled live listing',
    transaction: String(item.transaction).toUpperCase() === 'SALE' ? 'sale' : 'rent',
    type,
    city,
    cityKey: cityKey(city),
    area: item.location?.reverseGeocoding?.locations?.find((entry) => entry.locationLevel === 'parish')?.name || '',
    bedrooms: parseBeds(item),
    bathrooms: parseBathrooms(item),
    areaM2,
    price,
    features,
    blurb: text(item.shortDescription) || text(item.title),
    available: null,
    listedDaysAgo: daysSince(item.createdAtFirst),
    image,
    agent: agency.name || 'Imovirtual',
    url: `${BASE}/pt/anuncio/${slug}`,
  };
}

async function fetchHtml(url, { signal } = {}) {
  const timeout = AbortSignal.timeout(14_000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const response = await fetch(url, {
    signal: combined,
    headers: {
      'User-Agent': USER_AGENT,
      'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.6',
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!response.ok) {
    const error = new Error(`Imovirtual returned HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  const html = await response.text();
  if (html.length > 6_000_000) throw new Error('The live search page was too large to process safely.');
  return html;
}

/**
 * Fetch one live Imovirtual search page and return listings in the same shape
 * as the demo market. Cache for a few minutes so repeat analyses are kind to
 * the source.
 */
export async function fetchLiveMarket(subject, { signal } = {}) {
  const url = searchUrlForSubject(subject);
  const cached = cache.get(url);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return { ...cached.value, cached: true };
  }

  let html = await fetchHtml(url, { signal });
  let items = parseImovirtualSearchHtml(html);
  if (!items.length) {
    const fallbackUrl = `${BASE}/pt/resultados/${
      subject.transaction === 'sale' ? 'comprar' : 'arrendar'
    }/${['apartment', 'penthouse'].includes(subject.type) ? 'apartamento' : 'moradia'}/todo-o-pais?q=${encodeURIComponent(
      subject.city
    )}`;
    html = await fetchHtml(fallbackUrl, { signal });
    items = parseImovirtualSearchHtml(html);
  }

  const extracted = items
    .slice(0, MAX_ITEMS)
    .map((item) => toListing(item, subject))
    .filter(Boolean);
  if (!extracted.length) {
    throw new Error('The live source returned no usable comparable listings for this market.');
  }

  // Collapse obvious cross-posts before the comparable engine sees them.
  const groups = new Map();
  for (const listing of extracted) {
    const titleKey = listing.title
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 70);
    const areaBucket = listing.areaM2 ? Math.round(listing.areaM2 / 5) * 5 : 'na';
    const priceBucket = Math.round(listing.price / (listing.transaction === 'rent' ? 25 : 5000)) *
      (listing.transaction === 'rent' ? 25 : 5000);
    const key = [listing.cityKey, listing.type, listing.bedrooms ?? 'x', areaBucket, priceBucket, titleKey].join('|');
    if (!groups.has(key)) {
      const cluster = `live-${titleKey.slice(0, 24)}-${groups.size + 1}`;
      groups.set(key, { canonical: { ...listing, cluster }, copies: [] });
    }
    groups.get(key).copies.push({ ...listing, cluster: groups.get(key).canonical.cluster });
  }
  const listings = [...groups.values()].map((group) => group.canonical);
  const copies = [...groups.values()].flatMap((group) => group.copies);

  const agencySources = new Map();
  for (const listing of listings) {
    if (!agencySources.has(listing.sourceId)) {
      agencySources.set(listing.sourceId, {
        id: listing.sourceId,
        name: listing.sourceName,
        domain: 'imovirtual.com',
        kind: listing.sourceKind,
        coverage: 'Portugal',
        reliability: listing.reliability,
        enabled: true,
      });
    }
  }

  const value = {
    mode: 'live',
    sourceLabel: 'Imovirtual live market',
    queryUrl: url,
    sources: [
      {
        id: 'src-imovirtual-live',
        name: 'Imovirtual',
        domain: 'imovirtual.com',
        kind: 'portal',
        coverage: 'Portugal',
        reliability: 0.8,
        enabled: true,
      },
      ...agencySources.values(),
    ],
    sourceCount: 1,
    market: listings,
    copies,
    fetchedAt: new Date().toISOString(),
  };
  cache.set(url, { at: Date.now(), value });
  return value;
}
