import { randomBytes, randomUUID } from 'node:crypto';

export function nowIso() {
  return new Date().toISOString();
}

export function newId(prefix = 'id') {
  return `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
}

export function newToken(bytes = 24) {
  return randomBytes(bytes).toString('base64url');
}

export function parseJson(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

export function round(value, step = 1) {
  if (!Number.isFinite(Number(value))) return 0;
  return Math.round(Number(value) / step) * step;
}

export function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

export function daysAgoDate(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

export function addDays(iso, days) {
  const date = new Date(iso);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export function startOfWeek(date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = (day + 6) % 7; // Monday first
  copy.setDate(copy.getDate() - diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function weekdayLabel(date) {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function formatDuration(ms) {
  if (!Number.isFinite(Number(ms)) || Number(ms) < 0) return '—';
  const value = Number(ms);
  if (value < 1000) return `${Math.round(value)} ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}s`;
  const minutes = Math.floor(value / 60_000);
  const seconds = Math.round((value % 60_000) / 1000);
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

export function unique(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ''))];
}

export function titleCase(value) {
  return String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function slugify(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function safeNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
