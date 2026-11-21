/** Lightweight text normalisation and similarity, used by parsing / matching. */

export function normalizeText(input) {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(input, { remove = [] } = {}) {
  const stop = new Set(remove);
  return normalizeText(input)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !stop.has(token));
}

const TITLE_STOPWORDS = [
  'apartment',
  'apartments',
  'flat',
  'villa',
  'house',
  'home',
  'townhouse',
  'property',
  'properties',
  'bedroom',
  'bedrooms',
  'bed',
  'beds',
  'bath',
  'baths',
  'bathroom',
  'bathrooms',
  'for',
  'sale',
  'rent',
  'rental',
  'long',
  'term',
  'let',
  'in',
  'at',
  'with',
  'and',
  'the',
  'a',
  'an',
  'of',
  'to',
  'stunning',
  'beautiful',
  'charming',
  'luxury',
  'luxurious',
  'exclusive',
  'new',
  'modern',
  'spacious',
  'bright',
  'sunlit',
  'contemporary',
  'restored',
  'lovely',
  'perfect',
  'ideal',
  'must',
  'see',
  'listing',
  'algarve',
  'portugal',
  'portuguese',
];

export function titleTokens(title) {
  return tokenize(title, { remove: TITLE_STOPWORDS }).filter((token) => token.length > 2);
}

/** Jaccard similarity between title keyword sets (0..1). */
export function titleSimilarity(a, b) {
  const setA = new Set(titleTokens(a));
  const setB = new Set(titleTokens(b));
  if (!setA.size || !setB.size) return 0;
  let intersection = 0;
  for (const token of setA) if (setB.has(token)) intersection += 1;
  return intersection / (setA.size + setB.size - intersection);
}

export function jaccard(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  if (!setA.size || !setB.size) return 0;
  let intersection = 0;
  for (const item of setA) if (setB.has(item)) intersection += 1;
  return intersection / (setA.size + setB.size - intersection);
}

export function includesNormalized(haystack, needle) {
  return normalizeText(haystack).includes(normalizeText(needle));
}
