import { createHash, randomUUID } from 'node:crypto';

export function newId(prefix = 'id') {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
}

/** Deterministic 32-bit FNV-1a hash, used for reproducible demo data. */
export function hashString(input) {
  const str = String(input);
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function shortHash(input, length = 8) {
  return createHash('sha1').update(String(input)).digest('hex').slice(0, length);
}

export function slugify(input) {
  return String(input)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function normalizeUrl(input) {
  try {
    const url = new URL(String(input));
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

export function sleep(ms, signal) {
  if (!ms) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
