/** Small parsing helpers shared by config and validators. */

export function parseEnvInt(value, fallback, { min = -Infinity, max = Infinity } = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, Number(n) || 0));
}

export function roundTo(value, step = 1) {
  if (!Number.isFinite(value) || step <= 0) return 0;
  return Math.round(value / step) * step;
}

export function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
