/* Shared UI helpers: formatting, icons, drawer, toasts. */

const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
}

export function safeUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

const ICONS = {
  'arrow-right': '<path d="M4 12h15M13 6l6 6-6 6"/>',
  'arrow-left': '<path d="M20 12H5M11 18l-6-6 6-6"/>',
  'arrow-up-right': '<path d="M7 17 17 7M7 7h10v10"/>',
  'arrow-down-right': '<path d="M7 7l10 10M17 7v10H7"/>',
  'chevron-right': '<path d="m9 6 6 6-6 6"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  printer: '<path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M7 14h10v7H7z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  refresh: '<path d="M20 7v5h-5"/><path d="M19 12a7 7 0 1 0-2 5"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  alert: '<path d="M12 3 2.5 20h19Z"/><path d="M12 9v5M12 17h.01"/>',
  spark: '<path d="M12 3.5 13.8 10 20.5 12l-6.7 2L12 20.5 10.2 14 3.5 12l6.7-2Z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.7 8.3-2.1 5.3-5.3 2.1 2.1-5.3Z"/>',
  pin: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.6"/>',
  bed: '<path d="M3 19v-9M3 14h18v5M21 19v-6a3 3 0 0 0-3-3H9v4"/><path d="M6 11h.01"/><circle cx="6" cy="10" r="1.6"/>',
  bath: '<path d="M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4ZM6 12V6a2 2 0 0 1 4 0M6 21l-1 1M18 21l1 1"/>',
  area: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  building: '<path d="M4 21V5l8-3 8 3v16M4 21h16"/><path d="M8 9h2M14 9h2M8 13h2M14 13h2M8 17h2M14 17h2"/>',
  source: '<circle cx="12" cy="12" r="2.5"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 12h6M9 16h6"/>',
  link: '<path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/>',
  shield: '<path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6Z"/><path d="m9 12 2 2 4-4"/>',
  wallet: '<path d="M3 7h15a2 2 0 0 1 2 2v9H3z"/><path d="M3 7V5a2 2 0 0 1 2-2h12v4M16 13h.01"/>',
  star: '<path d="M12 2.6 14 9l6.6 1.4L15.9 15l.6 6.8L12 18.4 7.5 21.8l.6-6.8L3.4 10.4 10 9Z"/>',
};

export function icon(name, size = 16, className = '') {
  const path = ICONS[name] || ICONS.info;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="${esc(className)}">${path}</svg>`;
}

export function starIcon(size = 18, className = '') {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" aria-hidden="true" class="${esc(className)}"><path d="M12 2.6 14 9l6.6 1.4L15.9 15l.6 6.8L12 18.4 7.5 21.8l.6-6.8L3.4 10.4 10 9Z"/></svg>`;
}

export function fmtNumber(value, { compact = false } = {}) {
  if (!Number.isFinite(Number(value))) return '—';
  return new Intl.NumberFormat('en-GB', {
    notation: compact && Math.abs(value) >= 10000 ? 'compact' : 'standard',
    maximumFractionDigits: 0,
  }).format(Number(value));
}

export function fmtMoney(value, currency = 'EUR', { compact = false } = {}) {
  if (!Number.isFinite(Number(value))) return '—';
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
      notation: compact && Math.abs(value) >= 10000 ? 'compact' : 'standard',
    }).format(Number(value));
  } catch {
    return `${fmtNumber(value)} ${currency}`;
  }
}

export function fmtPrice(value, transaction = 'rent', currency = 'EUR', { compact = false } = {}) {
  const price = fmtMoney(value, currency, { compact });
  return transaction === 'rent' ? `${price}/mo` : price;
}

export function fmtPct(value, { sign = true, decimals = 1 } = {}) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  const prefix = sign && n > 0 ? '+' : '';
  return `${prefix}${n.toFixed(decimals)}%`;
}

export function fmtArea(area) {
  if (!Number.isFinite(Number(area))) return '—';
  return `${fmtNumber(area)} m²`;
}

export function plural(count, singular, pluralForm = null) {
  return count === 1 ? singular : pluralForm || `${singular}s`;
}

export function formatDuration(ms) {
  if (!Number.isFinite(Number(ms))) return '—';
  const total = Math.max(0, Number(ms));
  if (total < 1000) return `${Math.round(total)}ms`;
  if (total < 60_000) return `${(total / 1000).toFixed(1)}s`;
  const minutes = Math.floor(total / 60_000);
  const seconds = Math.round((total % 60_000) / 1000);
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const dateShortFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
const fullFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return dateFmt.format(date);
}

export function formatDateShort(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return dateShortFmt.format(date);
}

export function formatTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return timeFmt.format(date);
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return fullFmt.format(date);
}

export function relativeTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const diff = Date.now() - date.getTime();
  if (diff < 45_000) return 'just now';
  if (diff < 3_600_000) return `${Math.max(1, Math.round(diff / 60_000))}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.round(diff / 86_400_000)}d ago`;
  return formatDate(date);
}

export function typeLabel(type) {
  if (type === 'townhouse') return 'Townhouse';
  if (type === 'villa') return 'Villa';
  if (type === 'apartment') return 'Apartment';
  return type ? type[0].toUpperCase() + type.slice(1) : 'Home';
}

export function propertyImage(type) {
  const safeType = ['apartment', 'villa', 'townhouse'].includes(type) ? type : 'apartment';
  return `/assets/property-${safeType}.svg`;
}

export function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export function shortId(id) {
  return String(id || '').replace(/^run_/, '').slice(0, 8).toUpperCase();
}

export function confidenceDots(value, { showNumber = true } = {}) {
  const confidence = Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : 0;
  const on = Math.round(confidence * 5);
  const dots = [0, 1, 2, 3, 4]
    .map((i) => `<i class="${i < on ? 'on' : ''}"></i>`)
    .join('');
  return `<span class="confidence" title="Extraction confidence ${Math.round(confidence * 100)}%">
    <span class="confidence-dots">${dots}</span>
    ${showNumber ? `<span class="confidence-num">${Math.round(confidence * 100)}%</span>` : ''}
  </span>`;
}

export function statusBadge(status) {
  const labels = {
    completed: 'Complete',
    running: 'Running',
    queued: 'Queued',
    cancelling: 'Stopping',
    failed: 'Failed',
    cancelled: 'Cancelled',
  };
  return `<span class="status-badge status-${esc(status)}">${esc(labels[status] || status)}</span>`;
}

export function verdictBadge(verdict) {
  if (verdict === 'overpriced') return '<span class="badge badge-red"><span class="badge-dot"></span>Above market</span>';
  if (verdict === 'underpriced') return '<span class="badge badge-green"><span class="badge-dot"></span>Below market</span>';
  if (verdict === 'competitive') return '<span class="badge badge-amber"><span class="badge-dot"></span>At market</span>';
  return '<span class="badge badge-neutral">No benchmark</span>';
}

export function rangeBar(position) {
  const market = position.market;
  if (!market || !Number.isFinite(market.p25) || !Number.isFinite(market.p75)) {
    return '<span class="muted" style="font-size:10px">Not enough data</span>';
  }
  const own = position.property.price;
  const median = market.median;
  const lo = Math.min(market.p25, own);
  const hi = Math.max(market.p75, own);
  const pad = Math.max((hi - lo) * 0.12, 1);
  const min = lo - pad;
  const max = hi + pad;
  const span = Math.max(max - min, 1);
  const pct = (value) => Math.max(0, Math.min(100, ((value - min) / span) * 100));
  const bandLeft = pct(market.p25);
  const bandRight = pct(market.p75);
  const marker = pct(own);
  const medianPos = pct(median);
  const title = `Market p25 ${fmtMoney(market.p25)}, median ${fmtMoney(median)}, p75 ${fmtMoney(market.p75)}. Your ask ${fmtMoney(own)}.`;
  return `<div class="range" title="${esc(title)}">
    <span class="range-track"></span>
    <span class="range-band" style="left:${bandLeft}%;width:${Math.max(1, bandRight - bandLeft)}%"></span>
    <span class="range-median" style="left:${medianPos}%"></span>
    <span class="range-marker" style="left:${marker}%"></span>
  </div>
  <div class="range-caption"><span>p25 ${fmtMoney(market.p25, 'EUR', { compact: true })}</span><span>p75 ${fmtMoney(market.p75, 'EUR', { compact: true })}</span></div>`;
}

export function emptyState({ title, message, action = '', mark = 'compass' }) {
  return `<div class="empty-state">
    <span class="empty-mark">${icon(mark, 23)}</span>
    <h3>${esc(title)}</h3>
    <p>${esc(message)}</p>
    ${action}
  </div>`;
}

export function errorStateMarkup(message, { title = 'Something went wrong' } = {}) {
  return `<div class="empty-state" style="margin-top:20px">
    <span class="empty-mark" style="color:var(--terracotta)">${icon('alert', 23)}</span>
    <h3>${esc(title)}</h3>
    <p>${esc(message)}</p>
    <button class="button button-quiet" type="button" data-retry-page>${icon('refresh')} Try again</button>
  </div>`;
}

export function prefillFromProperty(property) {
  if (!property) return '';
  const transaction = property.transaction === 'rent' ? 'Long-term rental' : 'Purchase';
  const featureText = (property.features || []).slice(0, 3).join(', ').toLowerCase();
  const price = fmtMoney(property.price, property.currency || 'EUR');
  const suffix = property.transaction === 'rent' ? '/month' : '';
  return `${transaction}: ${property.bedrooms}-bedroom ${typeLabel(property.type).toLowerCase()} in ${property.city}${
    property.neighborhood ? ` (${property.neighborhood})` : ''
  }, ${featureText}${featureText ? '. ' : ' '}Budget up to ${price}${suffix}.`;
}

export function splitThread(threadId) {
  return threadId ? String(threadId).replace(/^thr_/, '').slice(0, 6).toUpperCase() : '—';
}

/* -------------------------------------------------------------------------- */
/* Drawer                                                                      */
/* -------------------------------------------------------------------------- */

let drawerCleanup = null;
let lastFocused = null;

function focusables(drawer) {
  return [...drawer.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((element) => element.offsetParent !== null || element === document.activeElement);
}

function onDrawerKeydown(event) {
  if (event.key !== 'Tab') return;
  const drawer = document.getElementById('drawer');
  if (!drawer?.classList.contains('open')) return;
  const items = focusables(drawer);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function openDrawer({ kicker = '', title, body, width = '', onMount = null }) {
  const drawer = document.getElementById('drawer');
  const scrim = document.getElementById('scrim');
  if (!drawer || !scrim) return;
  if (drawer.classList.contains('open')) closeDrawer({ restoreFocus: false });
  lastFocused = document.activeElement;
  drawer.style.width = width;
  drawer.innerHTML = `
    <div class="drawer-head">
      <div>
        <div class="drawer-kicker">${esc(kicker)}</div>
        <h2 id="drawer-title">${esc(title)}</h2>
      </div>
      <button class="icon-button drawer-close" type="button" aria-label="Close panel" data-drawer-close>
        ${icon('close', 17)}
      </button>
    </div>
    <div class="drawer-body">${body}</div>
  `;
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  scrim.hidden = false;
  document.body.classList.add('drawer-open');
  drawer.scrollTop = 0;
  drawer.querySelector('[data-drawer-close]')?.addEventListener('click', () => closeDrawer());
  trapDrawerFocus();
  const cleanup = onMount?.(drawer);
  if (typeof cleanup === 'function') drawerCleanup = cleanup;
  requestAnimationFrame(() => {
    drawer.querySelector('[data-drawer-close]')?.focus({ preventScroll: true });
  });
}

function trapDrawerFocus() {
  document.removeEventListener('keydown', onDrawerKeydown);
  document.addEventListener('keydown', onDrawerKeydown);
}

export function closeDrawer({ restoreFocus = true } = {}) {
  const drawer = document.getElementById('drawer');
  const scrim = document.getElementById('scrim');
  if (!drawer) return;
  if (typeof drawerCleanup === 'function') {
    try {
      drawerCleanup();
    } catch {
      /* ignore cleanup errors */
    }
    drawerCleanup = null;
  }
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  if (scrim) scrim.hidden = true;
  document.body.classList.remove('drawer-open');
  document.removeEventListener('keydown', onDrawerKeydown);
  if (restoreFocus && lastFocused instanceof HTMLElement && document.contains(lastFocused)) {
    lastFocused.focus({ preventScroll: true });
  }
  lastFocused = null;
}

export function isDrawerOpen() {
  return document.getElementById('drawer')?.classList.contains('open') || false;
}

/* -------------------------------------------------------------------------- */
/* Toasts                                                                      */
/* -------------------------------------------------------------------------- */

export function clearToasts() {
  const stack = document.getElementById('toast-stack');
  if (stack) stack.replaceChildren();
}

export function toast(message, type = 'success') {
  const stack = document.getElementById('toast-stack');
  if (!stack) return;
  const node = document.createElement('div');
  node.className = `toast ${type === 'error' ? 'error' : ''}`;
  node.setAttribute('role', 'status');
  node.textContent = message;
  stack.appendChild(node);
  const timer = setTimeout(() => {
    node.classList.add('leaving');
    node.addEventListener('animationend', () => node.remove(), { once: true });
    setTimeout(() => node.remove(), 400);
  }, type === 'error' ? 5200 : 3600);
  node.addEventListener('click', () => {
    clearTimeout(timer);
    node.remove();
  });
}

/* -------------------------------------------------------------------------- */
/* Global method drawer                                                        */
/* -------------------------------------------------------------------------- */

export function openMethodDrawer() {
  const mode = document.getElementById('mode-pill')?.dataset.mode || 'demo';
  openDrawer({
    kicker: 'Scout / method',
    title: 'How Scout reaches its numbers',
    body: `
      <div class="method-copy">
        <div class="method-callout">
          <strong>${mode === 'demo' ? 'You are in simulation mode.' : 'You are in live-web mode.'}</strong>
          ${mode === 'demo'
            ? 'Every property, agency, price and source listing in this workspace is synthetic. The agent pipeline is real; only the market is simulated, which makes the demo fast and deterministic.'
            : 'Scout is querying Tavily, fetching public listing pages that its source catalogue points to, and extracting prices with structured data and heuristics. It respects robots.txt and never bypasses logins.'}
        </div>

        <h3>The pipeline</h3>
        <p>Scout runs seven stages for every brief. Each stage is logged and persisted, so a report can always be reconstructed.</p>
        <ul>
          <li><strong>Interpret.</strong> The brief is parsed into transaction, property types, locations, bedrooms, budget and requested features. Form refinements override the prose. Assumptions are shown, never hidden.</li>
          <li><strong>Plan.</strong> Scout selects the relevant enabled sources from the catalogue, builds query variants and, in live mode, discovers new domains.</li>
          <li><strong>Search.</strong> Each source is queried independently. Failures are isolated: one unresponsive portal cannot take down a run.</li>
          <li><strong>Normalise.</strong> Prices are validated, weekly/annual rents are converted to monthly, and non-EUR prices are converted at the configured fixed FX rates.</li>
          <li><strong>Deduplicate.</strong> Cross-posted listings are collapsed using title keywords, location, type, bedrooms, area and a price band. The most reliable copy becomes canonical.</li>
          <li><strong>Match.</strong> Scout first looks for mirrors of the portfolio (same attributes and strongly similar titles). Remaining offers are scored as comparables by city, type, bedroom count, area and feature overlap.</li>
          <li><strong>Benchmark.</strong> The comparable median is the reference. The ±7% corridor separates “at market” from “above” or “below”. A suggested price is the median, rounded to a sensible increment.</li>
        </ul>

        <h3>What the numbers mean</h3>
        <ul>
          <li><strong>Position vs median</strong> compares your asking price with the median of matched comparables. Positive means you are asking above the market.</li>
          <li><strong>Mirror</strong> means Scout believes a competitor page is advertising one of your own listings. Price differences are shown in both directions.</li>
          <li><strong>Confidence</strong> reflects extraction quality (structured data &gt; OpenGraph &gt; visible text) and source reliability. It is not a probability that the listing is real.</li>
          <li><strong>Gap at stake</strong> annualises the monthly difference for rentals and uses the one-off difference for sales. It is an indicative exposure, not a forecast.</li>
        </ul>

        <h3>Limits you should know</h3>
        <ul>
          <li>Availability is never guaranteed. Scout reads asking prices, not live availability calendars — the same limitation the team described in the brief.</li>
          <li>Portals' terms of service and licensing take precedence over automation. Live mode should use permitted APIs or licensed feeds where available.</li>
          <li>Comparables are never exact. Scout uses a documented scoring model; a human should sign off any price change.</li>
          <li>Demo listings, agencies and URLs are illustrative. Nothing here is an offer, a valuation or legal advice.</li>
          <li>Production rollout should add authentication, role-based access, encrypted backups and a retention policy for client briefs.</li>
        </ul>

        <h3>Configuration</h3>
        <p>Simulation is the default. Live mode requires a Tavily API key. An optional OpenAI-compatible endpoint can lift extraction quality on pages without structured data. Rates are fixed in configuration and can be swapped for a treasury feed.</p>
      </div>
    `,
  });
}
