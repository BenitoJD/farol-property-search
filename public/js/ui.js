const ICONS = {
  pipeline:
    '<rect x="3" y="4" width="6" height="7" rx="1.6"/><rect x="3" y="14" width="6" height="6" rx="1.6"/><rect x="12" y="4" width="9" height="5" rx="1.6"/><rect x="12" y="12" width="9" height="8" rx="1.6"/>',
  home: '<path d="M4 20V9.8L12 4l8 5.8V20"/><path d="M9 20v-6h6v6"/><path d="M4 20h16"/>',
  globe:
    '<circle cx="12" cy="12" r="8.4"/><path d="M3.8 9.4h16.4M3.8 14.6h16.4"/><path d="M12 3.6c2.4 2.3 3.6 5.1 3.6 8.4S14.4 18.1 12 20.4C9.6 18.1 8.4 15.3 8.4 12S9.6 5.9 12 3.6Z"/>',
  chart: '<path d="M4 20V5"/><path d="M4 20h16"/><rect x="7.2" y="12" width="2.8" height="5" rx=".8"/><rect x="12" y="8.5" width="2.8" height="8.5" rx=".8"/><rect x="16.8" y="10.5" width="2.8" height="6.5" rx=".8"/>',
  layers:
    '<path d="m12 4 8 4.2-8 4.2-8-4.2Z"/><path d="m4 12.2 8 4.2 8-4.2"/><path d="m4 16.2 8 4.2 8-4.2"/>',
  plug: '<path d="M9 3v4M15 3v4"/><path d="M7 7h10v3a5 5 0 0 1-10 0Z"/><path d="M12 15v6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6.4"/><path d="m16 16 4.2 4.2"/>',
  'arrow-right': '<path d="M4 12h15"/><path d="m13 6 6 6-6 6"/>',
  'arrow-left': '<path d="M20 12H5"/><path d="m11 6-6 6 6 6"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'chevron-right': '<path d="m9 6 6 6-6 6"/>',
  'chevron-up': '<path d="m6 15 6-6 6 6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 6.5"/>',
  'check-circle': '<circle cx="12" cy="12" r="8.4"/><path d="m8.2 12.2 2.5 2.5 5.2-5.4"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  clock: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.5V12l3 2"/>',
  user: '<circle cx="12" cy="8.4" r="3.4"/><path d="M5.2 20c.8-3.5 3.4-5.4 6.8-5.4s6 1.9 6.8 5.4"/>',
  users:
    '<circle cx="9" cy="8.6" r="3.1"/><path d="M3.2 19.4c.7-3.1 2.9-4.8 5.8-4.8s5.1 1.7 5.8 4.8"/><path d="M15.5 6.2a3 3 0 0 1 0 5.8M17 14.8c2.2.4 3.6 2 4 4.6"/>',
  sparkles:
    '<path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9Z"/><path d="M19 16.5 19.8 19l2.5.8-2.5.8L19 23M5 2.5 5.7 4.8 8 5.5 5.7 6.2 5 8.5 4.3 6.2 2 5.5l2.3-.7Z"/>',
  bed: '<path d="M3.5 19v-9M3.5 15h17v4"/><path d="M6.5 15v-3.5h5V15"/><path d="M14 15v-3.5h4V15"/><path d="M3.5 10h17v2"/>',
  bath:
    '<path d="M4 12h16v2.4a4.2 4.2 0 0 1-4.2 4.2H8.2A4.2 4.2 0 0 1 4 14.4Z"/><path d="M6.2 12V6.4A2.4 2.4 0 0 1 10.9 6"/><path d="M6 20.5 5.4 22M18 20.5l.6 1.5"/>',
  ruler: '<path d="m4 16 12-12 4 4L8 20Z"/><path d="m8 12 2 2M11 9l2 2M14 6l2 2"/>',
  pin: '<path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10Z"/><circle cx="12" cy="10.6" r="2.2"/>',
  mail: '<rect x="3" y="5.4" width="18" height="13.2" rx="2.2"/><path d="m4 7 8 6 8-6"/>',
  phone: '<path d="M6.3 3.8 9 3.2l2 4.2-2 1.4a12 12 0 0 0 5.2 5.2l1.4-2 4.2 2-.6 2.7c-.4 1.5-1.7 2.5-3.2 2.4C9.6 18.6 5.4 14.4 4 7c-.1-1.5.9-2.8 2.3-3.2Z"/>',
  calendar: '<rect x="3.5" y="5.5" width="17" height="15" rx="2.2"/><path d="M3.5 10h17M8 3.5v4M16 3.5v4"/>',
  link: '<path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 0 0-5.7-5.7l-1.5 1.5"/><path d="M13.5 10.5a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 0 0 5.7 5.7l1.5-1.5"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  download: '<path d="M12 3v12"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4 19h16"/>',
  external: '<path d="M14 4h6v6"/><path d="m20 4-8 8"/><path d="M19 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4"/>',
  alert: '<path d="M12 4 3.5 19.5h17Z"/><path d="M12 9.5v4.5"/><circle cx="12" cy="17" r=".8" fill="currentColor" stroke="none"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-13.8-5.2L3.5 8.5"/><path d="M4 13a8 8 0 0 0 13.8 5.2l2.7-2.7"/><path d="M3.5 4v4.5H8M20.5 20v-4.5H16"/>',
  filter: '<path d="M3.5 5h17l-6.5 7.4V20l-4-2v-5.6Z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  shield: '<path d="M12 3.5 19 6v5.5c0 4.4-2.8 7.6-7 9-4.2-1.4-7-4.6-7-9V6Z"/><path d="m9 12 2.2 2.2 4-4.2"/>',
  star: '<path d="m12 3.8 2.5 5.1 5.6.8-4 4 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4-4 5.6-.8Z"/>',
  building: '<path d="M4 21V5.5L12 3v18"/><path d="M12 7h8v14"/><path d="M2.5 21h19"/><path d="M7 8h2M7 12h2M7 16h2M15 11h2M15 15h2"/>',
  key: '<circle cx="8" cy="8" r="4"/><path d="m11 11 9 9M17 17l2-2M14.5 14.5l2-2"/>',
  eye: '<path d="M2.8 12S6.2 5.8 12 5.8 21.2 12 21.2 12 17.8 18.2 12 18.2 2.8 12 2.8 12Z"/><circle cx="12" cy="12" r="3"/>',
  flag: '<path d="M5 21V4"/><path d="M5 5c4-2.4 6.5 2 10 0v8c-3.5 2-6-2.4-10 0"/>',
  send: '<path d="m21 3-9.5 18-2.2-7.3L3 11.5Z"/><path d="M21 3 9.3 13.7"/>',
  dots: '<circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  map: '<path d="m9 4-5.5 2v14L9 18l6 2 5.5-2V4L15 6Z"/><path d="M9 4v14M15 6v14"/>',
  trend: '<path d="M3.5 17.5 9 12l3.5 3.5L20.5 7"/><path d="M15.5 7h5v5"/>',
  info: '<circle cx="12" cy="12" r="8.4"/><path d="M12 11v5"/><circle cx="12" cy="8" r=".9" fill="currentColor" stroke="none"/>',
  file: '<path d="M6 3.5h7l5 5v12H6Z"/><path d="M13 3.5v5h5"/><path d="M9 13h6M9 16.5h4"/>',
  database: '<ellipse cx="12" cy="6" rx="7.5" ry="3"/><path d="M4.5 6v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6"/><path d="M4.5 12v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6"/>',
  zap: '<path d="M13.5 3 5 13.5h6L10.5 21 19 10.5h-6Z"/>',
  target: '<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2h-4v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3v-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V3h4v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.2v4h-.2a1.7 1.7 0 0 0-1.5 1Z"/>',
  quote: '<path d="M9.5 6.5c-3 1.5-4.5 4-4.5 7.5v3.5h6V11H7.7c0-1.8.8-3 2.7-4Z"/><path d="M19.5 6.5c-3 1.5-4.5 4-4.5 7.5v3.5h6V11h-3.3c0-1.8.8-3 2.7-4Z"/>',
  play: '<path d="M8 5.5 18.5 12 8 18.5Z"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/>',
  circle: '<circle cx="12" cy="12" r="8.4"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4"/>',
  'trend-down': '<path d="M3.5 6.5 9 12l3.5-3.5L20.5 17"/><path d="M15.5 17h5v-5"/>',
  archive: '<rect x="3" y="4" width="18" height="4" rx="1.2"/><path d="M5 8v11h14V8M9.5 12h5"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4.3" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="4.3" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4.3" cy="18" r="1" fill="currentColor" stroke="none"/>',
  'arrow-up-right': '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
};

export function icon(name, size = 18, className = '') {
  const inner = ICONS[name] || ICONS.circle;
  return `<svg class="icon ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((element) => {
    element.innerHTML = icon(element.dataset.icon, Number(element.dataset.iconSize) || 18);
  });
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function escapeAttr(value) {
  return escapeHtml(value).replaceAll('`', '&#96;');
}

const moneyFormatter = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

export function money(amount, { period = null, compact = false } = {}) {
  if (!Number.isFinite(Number(amount))) return '—';
  const value = Number(amount);
  let text;
  if (compact && Math.abs(value) >= 1_000_000) {
    text = `€${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 2)}m`;
  } else if (compact && Math.abs(value) >= 10_000) {
    text = `€${(value / 1_000).toFixed(value % 1_000 === 0 ? 0 : 1)}k`;
  } else {
    text = moneyFormatter.format(value);
  }
  if (period === 'month') text += '/mo';
  return text;
}

export function moneyPerM2(amount) {
  if (!Number.isFinite(Number(amount))) return '—';
  return `€${Math.round(Number(amount)).toLocaleString('en-GB')}/m²`;
}

export function percent(value, { signed = true } = {}) {
  if (!Number.isFinite(Number(value))) return '—';
  const number = Number(value);
  const sign = signed && number > 0 ? '+' : '';
  return `${sign}${number.toFixed(1)}%`;
}

export function formatDate(value, style = 'short') {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  if (style === 'long') {
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  if (style === 'month') {
    return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  }
  if (style === 'monthDay') {
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function relativeTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const diff = Date.now() - date.getTime();
  const future = diff < 0;
  const seconds = Math.floor(Math.abs(diff) / 1000);
  if (seconds < 60) return future ? 'in a moment' : 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return future ? `in ${minutes}m` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return future ? `in ${hours}h` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return future ? `in ${days}d` : `${days}d ago`;
  if (days < 30) return future ? `in ${Math.round(days / 7)}w` : `${Math.round(days / 7)}w ago`;
  return formatDate(value, 'short');
}

export function daysBetween(from, to = Date.now()) {
  if (!from) return null;
  return Math.max(0, (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000);
}

export function formatMonth(value) {
  if (!value) return '—';
  const match = String(value).match(/^(\d{4})-(\d{2})/);
  if (!match) return escapeHtml(value);
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

export function initials(name = '') {
  return String(name)
    .split(/[\s&]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function avatarClass(name = '') {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) hash = (hash * 31 + name.charCodeAt(index)) % 6;
  return `avatar-tone-${hash}`;
}

export function plural(count, one, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

export const STAGES = [
  {
    key: 'enquiry',
    label: 'Enquiry',
    long: 'New enquiry',
    summary: 'The client brief lands in the casebook.',
    icon: 'mail',
  },
  {
    key: 'requirements',
    label: 'Requirements',
    long: 'Record requirements',
    summary: 'The brief is interpreted, checked and confirmed.',
    icon: 'check-circle',
  },
  {
    key: 'inventory',
    label: 'Inventory',
    long: 'Existing inventory',
    summary: 'Algarve Senior Living and Portugal Long Lets are checked first.',
    icon: 'home',
  },
  {
    key: 'ai_search',
    label: 'AI search',
    long: 'AI-assisted search',
    summary: 'The catalogue is searched, deduplicated and price-checked.',
    icon: 'sparkles',
  },
  {
    key: 'review',
    label: 'Human review',
    long: 'Human review',
    summary: 'The team reviews the long list and builds the shortlist.',
    icon: 'users',
  },
  {
    key: 'client',
    label: 'With client',
    long: 'With client',
    summary: 'The shortlist is presented; feedback feeds the next iteration.',
    icon: 'send',
  },
  {
    key: 'closed',
    label: 'Closed',
    long: 'Closed',
    summary: 'The case is won, lost or paused.',
    icon: 'flag',
  },
];

export function stageInfo(key) {
  return STAGES.find((stage) => stage.key === key) || STAGES[0];
}

export function stageIndex(key) {
  return STAGES.findIndex((stage) => stage.key === key);
}

export function priceVerdict(check) {
  if (!check || !check.available || !Number.isFinite(Number(check.median))) {
    return { key: 'unknown', label: 'No comps', tone: 'neutral', delta: null };
  }
  if (check.verdict === 'above') return { key: 'above', label: 'Above market', tone: 'warn', delta: check.deltaPct };
  if (check.verdict === 'below') return { key: 'below', label: 'Below market', tone: 'good', delta: check.deltaPct };
  return { key: 'at', label: 'At market', tone: 'neutral', delta: check.deltaPct };
}

export function priceChip(check, { compact = false } = {}) {
  const verdict = priceVerdict(check);
  const deltaText =
    verdict.delta === null || verdict.delta === 0 ? '' : ` ${percent(verdict.delta)}`;
  return `<span class="price-chip price-chip-${verdict.tone}">${icon(
    verdict.key === 'above' ? 'trend' : verdict.key === 'below' ? 'trend-down' : 'target',
    13
  )} ${compact ? verdict.label : `${verdict.label}${deltaText}`}</span>`;
}

export function confidenceLabel(confidence) {
  return confidence === 'high' ? 'Strong evidence' : confidence === 'medium' ? 'Fair evidence' : confidence === 'low' ? 'Thin evidence' : 'No evidence';
}

export function sourceKindLabel(kind) {
  return {
    portal: 'Portal',
    marketplace: 'Marketplace',
    agency: 'Agency',
    network: 'Network',
    other: 'Other',
  }[kind] || 'Source';
}

const TYPE_IMAGES = {
  apartment: 'apartment',
  townhouse: 'townhouse',
  villa: 'villa',
  house: 'villa',
  quinta: 'quinta',
  penthouse: 'terrace',
};

export function propertyImage(property = {}) {
  const city = String(property.city || '').toLowerCase();
  const explicit = property.image;
  const name =
    explicit ||
    (['lisbon', 'cascais', 'estoril'].includes(city) ? 'lisbon' : TYPE_IMAGES[property.type] || 'apartment');
  return `/assets/property-${name}.svg`;
}

export function propertyAlt(property = {}) {
  return `${property.type || 'Property'} in ${property.city || 'Portugal'}`;
}

export function toast(message, { tone = 'info', timeout = 4200 } = {}) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const element = document.createElement('div');
  element.className = `toast toast-${tone}`;
  element.innerHTML = `<span class="toast-icon">${icon(
    tone === 'success' ? 'check-circle' : tone === 'error' ? 'alert' : 'info',
    17
  )}</span><span>${escapeHtml(message)}</span>`;
  root.appendChild(element);
  requestAnimationFrame(() => element.classList.add('toast-in'));
  setTimeout(() => {
    element.classList.remove('toast-in');
    setTimeout(() => element.remove(), 250);
  }, timeout);
}

export function openModal({ title, eyebrow = '', body, footer = '', size = 'md', onMount = null }) {
  const root = document.getElementById('modal-root');
  if (!root) return null;
  root.innerHTML = `
    <div class="modal-backdrop" data-modal-backdrop>
      <div class="modal modal-${size}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-head">
          <div>
            ${eyebrow ? `<p class="modal-eyebrow">${escapeHtml(eyebrow)}</p>` : ''}
            <h2 id="modal-title" class="modal-title">${escapeHtml(title)}</h2>
          </div>
          <button class="icon-button" type="button" data-modal-close aria-label="Close">${icon('x')}</button>
        </div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
      </div>
    </div>
  `;
  const backdrop = root.querySelector('[data-modal-backdrop]');
  const close = () => {
    root.innerHTML = '';
    document.body.classList.remove('modal-open');
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (event) => {
    if (event.key === 'Escape') close();
  };
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) close();
  });
  root.querySelectorAll('[data-modal-close]').forEach((button) => button.addEventListener('click', close));
  document.addEventListener('keydown', onKey);
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => backdrop.classList.add('modal-open'));
  const focusTarget = root.querySelector('input, textarea, select, button');
  focusTarget?.focus({ preventScroll: true });
  onMount?.({ root, close });
  return { root, close };
}

export function confirmModal({ title, message, confirmLabel = 'Confirm', tone = 'primary', onConfirm }) {
  return openModal({
    title,
    body: `<p class="modal-copy">${escapeHtml(message)}</p>`,
    footer: `
      <button class="button button-ghost" type="button" data-modal-close>Cancel</button>
      <button class="button button-${tone}" type="button" data-confirm>${escapeHtml(confirmLabel)}</button>
    `,
    size: 'sm',
    onMount({ root, close }) {
      root.querySelector('[data-confirm]').addEventListener('click', async () => {
        const button = root.querySelector('[data-confirm]');
        button.disabled = true;
        try {
          await onConfirm();
          close();
        } catch (error) {
          toast(error.message, { tone: 'error' });
          button.disabled = false;
        }
      });
    },
  });
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard', { tone: 'success' });
    return true;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      toast('Copied to clipboard', { tone: 'success' });
      return true;
    } catch {
      toast('Could not copy. Select the link manually.', { tone: 'error' });
      return false;
    } finally {
      textarea.remove();
    }
  }
}

export function setBusy(button, busy, label = 'Working…') {
  if (!button) return;
  if (busy) {
    button.dataset.original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="spinner"></span>${escapeHtml(label)}`;
  } else {
    button.disabled = false;
    if (button.dataset.original) button.innerHTML = button.dataset.original;
  }
}

export function sparkline(values, { width = 220, height = 54, stroke = 'currentColor', fill = true } = {}) {
  if (!values.length) return '';
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const points = values.map((value, index) => {
    const x = (index / Math.max(1, values.length - 1)) * width;
    const y = height - 6 - ((value - min) / span) * (height - 12);
    return [x, y];
  });
  const line = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
    ${fill ? `<path d="${area}" fill="${stroke}" opacity=".1"/>` : ''}
    <path d="${line}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round"/>
    ${points.map(([x, y], index) => index === points.length - 1 ? `<circle cx="${x}" cy="${y}" r="3" fill="${stroke}"/>` : '').join('')}
  </svg>`;
}

export function growthChart(growth, { height = 110 } = {}) {
  if (!growth?.length) return '';
  const max = Math.max(...growth.map((item) => item.total), 1);
  return `<div class="growth-chart" style="--chart-height:${height}px">
    ${growth
      .map((item) => {
        const barHeight = Math.max(6, Math.round((item.total / max) * (height - 24)));
        return `<div class="growth-col" title="${escapeAttr(item.label)}: ${item.total} sources (+${item.added})">
          <span class="growth-value">${item.total}</span>
          <span class="growth-bar" style="height:${barHeight}px">
            ${item.added ? `<span class="growth-added" style="height:${Math.max(3, Math.round((item.added / item.total) * barHeight))}px"></span>` : ''}
          </span>
          <span class="growth-label">${escapeHtml(item.label)}</span>
        </div>`;
      })
      .join('')}
  </div>`;
}

export function emptyState({ iconName = 'search', title, copy = '', action = '' }) {
  return `<div class="empty-state">
    <span class="empty-icon">${icon(iconName, 24)}</span>
    <h3>${escapeHtml(title)}</h3>
    ${copy ? `<p>${escapeHtml(copy)}</p>` : ''}
    ${action}
  </div>`;
}

export function spinnerBlock(label = 'Loading…') {
  return `<div class="page-loading"><span class="spinner spinner-lg"></span><p>${escapeHtml(label)}</p></div>`;
}

export function stagePill(stage, { long = false } = {}) {
  const info = stageInfo(stage);
  return `<span class="stage-pill stage-${info.key}">${icon(info.icon, 13)} ${escapeHtml(long ? info.long : info.label)}</span>`;
}

export function priceSummaryLine(summary) {
  if (!summary || !summary.count) return 'No comparable evidence yet.';
  return summary.narrative || '';
}

export function choiceLabel(value) {
  return {
    interested: 'Interested',
    not_for_us: 'Not for us',
    question: 'Has a question',
    pending: 'Awaiting response',
  }[value] || value;
}

export function decisionChip(decision) {
  const tone = decision === 'interested' ? 'good' : decision === 'not_for_us' ? 'muted' : decision === 'question' ? 'warn' : 'neutral';
  return `<span class="decision-chip decision-${tone}">${escapeHtml(choiceLabel(decision))}</span>`;
}

export function clientDecisionIcon(decision) {
  return decision === 'interested' ? 'check-circle' : decision === 'not_for_us' ? 'x' : decision === 'question' ? 'alert' : 'clock';
}
