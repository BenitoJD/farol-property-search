import { hashString } from './util.js';

/** Deterministic PRNG so demo runs are reproducible. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngFrom(...parts) {
  return mulberry32(hashString(parts.join('|')));
}

export function pick(rng, items) {
  if (!items?.length) return null;
  return items[Math.floor(rng() * items.length)];
}

export function pickMany(rng, items, count) {
  const pool = [...items];
  const out = [];
  while (pool.length && out.length < count) {
    out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return out;
}

export function chance(rng, probability) {
  return rng() < probability;
}

export function between(rng, min, max) {
  return min + rng() * (max - min);
}

export function intBetween(rng, min, max) {
  return Math.floor(between(rng, min, max + 1));
}
