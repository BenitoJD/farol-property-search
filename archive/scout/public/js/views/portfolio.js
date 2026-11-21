import { api } from '../api.js';
import {
  esc,
  icon,
  fmtMoney,
  fmtNumber,
  typeLabel,
  propertyImage,
  emptyState,
  openDrawer,
  closeDrawer,
  fmtPct,
  verdictBadge,
  prefillFromProperty,
  safeUrl,
  formatDateTime,
} from '../ui.js';

const TRANSACTION_LABELS = { all: 'All homes', rent: 'Long lets', sale: 'For sale' };

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function statsMarkup(properties) {
  const rentals = properties.filter((property) => property.transaction === 'rent');
  const sales = properties.filter((property) => property.transaction === 'sale');
  const rentalMedian = median(rentals.map((property) => property.price));
  return `<div class="stat-strip">
    <div class="stat-block"><div class="stat-label">Active homes</div><div class="stat-value">${fmtNumber(properties.length)}</div><div class="stat-note">Across the Algarve, Lisbon and Andalusia.</div></div>
    <div class="stat-block"><div class="stat-label">Long lets</div><div class="stat-value">${fmtNumber(rentals.length)} <small>homes</small></div><div class="stat-note">${rentalMedian ? `Median ask ${fmtMoney(rentalMedian)}/mo` : 'No long lets in the portfolio'}.</div></div>
    <div class="stat-block"><div class="stat-label">For sale</div><div class="stat-value">${fmtNumber(sales.length)} <small>homes</small></div><div class="stat-note">${sales.length ? `From ${fmtMoney(Math.min(...sales.map((p) => p.price)), 'EUR', { compact: true })} to ${fmtMoney(Math.max(...sales.map((p) => p.price)), 'EUR', { compact: true })}.` : 'No sales in the portfolio'}</div></div>
    <div class="stat-block"><div class="stat-label">Locations</div><div class="stat-value">${fmtNumber(new Set(properties.map((property) => property.city)).size)} <small>cities</small></div><div class="stat-note">One catalogue, one comparable engine.</div></div>
  </div>`;
}

function marketBadge(position) {
  if (!position || !position.market) return '';
  const verdict = position.verdict;
  const cls = verdict === 'overpriced' ? 'over' : verdict === 'underpriced' ? 'under' : 'on';
  const label = verdict === 'overpriced' ? 'Above market' : verdict === 'underpriced' ? 'Below market' : 'At market';
  return `<span class="media-verdict ${cls}">${label} ${fmtPct(position.deltaPct)}</span>`;
}

function propertyCard(property, index, position) {
  const tags = (property.features || []).slice(0, 3);
  return `<article class="property-card" data-property-id="${esc(property.id)}" style="--i:${index}">
    <button class="property-card-action" type="button" aria-label="Open ${esc(property.title)} in ${esc(property.city)}"></button>
    <div class="property-media">
      <img src="${propertyImage(property.type)}" alt="" loading="lazy" />
      <div class="media-top">
        <span class="media-ref">${esc(property.ref)}</span>
        ${position?.market ? marketBadge(position) : `<span class="media-type">${typeLabel(property.type)}</span>`}
      </div>
      <span class="media-price">${fmtMoney(property.price)} <small>${property.transaction === 'rent' ? '/mo' : 'total'}</small></span>
    </div>
    <div class="property-body">
      <h3 class="property-title">${esc(property.title)}</h3>
      <div class="property-location">${icon('pin', 11)} ${esc(property.neighborhood || property.city)}, ${esc(property.city)}</div>
      <div class="property-specs">
        <span>${icon('bed', 12)} ${property.bedrooms} bed</span>
        <span>${icon('bath', 12)} ${property.bathrooms} bath</span>
        <span>${icon('area', 12)} ${fmtNumber(property.area_m2)} m²</span>
      </div>
      <div class="property-tags">${tags.map((tag) => `<span class="tag">${esc(tag)}</span>`).join('')}</div>
    </div>
  </article>`;
}

function benchmarkBlock(position, latestReport) {
  if (!position || !position.market) return '';
  const unit = position.property.transaction === 'rent' ? '/month' : '';
  return `<div class="drawer-section">
    <div class="drawer-section-title">Latest Scout benchmark</div>
    <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:14px">
      <div>
        <div class="drawer-price" style="color:${position.deltaPct > 7 ? 'var(--red)' : position.deltaPct < -7 ? 'var(--green)' : 'var(--gold)'}">${fmtPct(position.deltaPct)}</div>
        <div class="drawer-note">vs comparable median of ${fmtMoney(position.market.median)}${unit} · ${position.comparableCount} comparables</div>
      </div>
      <div style="text-align:right"><span class="section-kicker">Suggested ask</span><div style="margin-top:4px;font-family:var(--font-display);font-size:22px">${fmtMoney(position.recommendedPrice)}</div></div>
    </div>
    <div style="margin-top:12px">${verdictBadge(position.verdict)}</div>
    <p class="drawer-lede" style="margin-top:11px">${esc(position.recommendation)}</p>
    <p class="drawer-note">Benchmark from ${esc(formatDateTime(latestReport.run.finishedAt))}. Comparable prices are asking prices, not achieved prices.</p>
    <a class="text-button" style="margin-top:11px" href="#/runs/${latestReport.run.id}">Open the full scout report ${icon('arrow-right', 12)}</a>
  </div>`;
}

function openPropertyDrawer(property, position, latestReport, meta) {
  const demo = meta?.mode === 'demo';
  const link = safeUrl(property.url);
  const specs = [
    ['Reference', property.ref],
    ['Type', typeLabel(property.type)],
    ['Bedrooms', `${property.bedrooms} bed`],
    ['Bathrooms', `${property.bathrooms} bath`],
    ['Living area', `${fmtNumber(property.area_m2)} m²`],
    ['Transaction', property.transaction === 'rent' ? 'Long-term rental' : 'Sale'],
  ];
  openDrawer({
    kicker: `Portfolio / ${property.ref}`,
    title: property.title,
    body: `<div class="drawer-hero">
      <img src="${propertyImage(property.type)}" alt="">
      <span class="media-price">${fmtMoney(property.price)} <small>${property.transaction === 'rent' ? '/mo' : 'total'}</small></span>
    </div>
    <div class="drawer-section">
      <div class="drawer-kicker" style="color:var(--muted)">${esc(property.city)} · ${esc(property.neighborhood || '')}</div>
      <div class="drawer-price-row" style="margin-top:6px">
        <div>
          <div class="drawer-price">${fmtMoney(property.price)} <small>${property.transaction === 'rent' ? 'per month' : 'total'}</small></div>
          <div class="drawer-note">${esc(typeLabel(property.type))} · ${property.bedrooms} bed · ${property.bathrooms} bath · ${fmtNumber(property.area_m2)} m²</div>
        </div>
        ${position?.market ? verdictBadge(position.verdict) : '<span class="badge badge-neutral">Not yet benchmarked</span>'}
      </div>
      <p class="drawer-lede">${esc(property.blurb || '')}</p>
      <div class="drawer-actions" style="margin-top:14px">
        <button class="button button-primary button-sm" type="button" data-scout-property>${icon('compass', 14)} Scout this home</button>
        ${!demo && link ? `<a class="button button-quiet button-sm" href="${esc(link)}" target="_blank" rel="noopener noreferrer">${icon('external', 13)} View on portal</a>` : ''}
      </div>
    </div>
    <div class="drawer-section">
      <div class="meta-grid">${specs.map(([label, value]) => `<div class="meta-cell"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')}</div>
    </div>
    ${benchmarkBlock(position, latestReport)}
    <div class="drawer-section">
      <div class="drawer-section-title">Features</div>
      <div class="tag-list">${(property.features || []).map((feature) => `<span class="tag">${esc(feature)}</span>`).join('')}</div>
    </div>
    <div class="drawer-section">
      <p class="drawer-note">${demo ? 'Demo portfolio listing — prices and references are illustrative. ' : ''}Ask prices are what the market advertises. Availability, condition and negotiation room require a direct check with the owner or agency.</p>
    </div>`,
    onMount(drawer) {
      drawer.querySelector('[data-scout-property]')?.addEventListener('click', () => {
        sessionStorage.setItem('scout:prefill', JSON.stringify({ brief: prefillFromProperty(property) }));
        closeDrawer({ restoreFocus: false });
        location.hash = '#/scout';
      });
    },
  });
}

export async function renderPortfolio(root, ctx) {
  root.innerHTML = '<div class="page-loader"><span class="loader-star"></span><p>Opening the portfolio…</p></div>';
  let properties = [];
  let meta = null;
  try {
    const [propertiesResponse, metaResponse] = await Promise.all([
      api.properties(),
      api.meta().catch(() => null),
    ]);
    properties = propertiesResponse.properties || [];
    meta = metaResponse;
  } catch (error) {
    if (ctx.isStale()) return;
    root.innerHTML = emptyState({
      title: 'The portfolio could not be loaded',
      message: error.message || 'Scout could not reach the property catalogue.',
      action: '<button class="button button-quiet" type="button" data-retry-page>Try again</button>',
      mark: 'alert',
    });
    return;
  }

  let latestReport = null;
  const lastRunId = meta?.overview?.lastRun?.id;
  if (lastRunId) {
    try {
      latestReport = await api.results(lastRunId);
    } catch {
      latestReport = null;
    }
  }
  if (ctx.isStale()) return;

  const positions = new Map((latestReport?.positions || []).map((position) => [position.property.id, position]));
  const state = { search: '', transaction: 'all', type: 'all', sort: 'featured' };
  const header = `<header class="page-head">
    <div>
      <div class="eyebrow">Portfolio / ${fmtNumber(properties.length)} active homes</div>
      <h1>The homes you represent<span style="color:var(--terracotta)">.</span></h1>
      <p class="lede">One catalogue across the Algarve, Lisbon and Andalusia. Every home is ready to be benchmarked — Scout maps comparables by city, type, bedrooms and living area.</p>
    </div>
    <div class="page-actions">
      <a class="button button-primary" href="#/scout">${icon('compass', 16)} Start a scout</a>
    </div>
  </header>
  ${statsMarkup(properties)}
  <div class="toolbar">
    <div class="toolbar-search">${icon('search', 14)}<input type="search" placeholder="Search by reference, city, feature…" data-portfolio-search aria-label="Search portfolio"></div>
    <div class="segmented" role="group" aria-label="Filter by transaction">
      ${['all', 'rent', 'sale'].map((key) => `<button class="segment ${key === 'all' ? 'active' : ''}" type="button" data-portfolio-transaction="${key}">${TRANSACTION_LABELS[key]}</button>`).join('')}
    </div>
    <select class="ledger-sort" data-portfolio-type aria-label="Filter property type">
      <option value="all">All property types</option>
      <option value="apartment">Apartments</option>
      <option value="villa">Villas</option>
      <option value="townhouse">Townhouses</option>
    </select>
    <select class="ledger-sort" data-portfolio-sort aria-label="Sort portfolio">
      <option value="featured">Sort: featured</option>
      <option value="price-asc">Price: low to high</option>
      <option value="price-desc">Price: high to low</option>
    </select>
    <span class="toolbar-count" data-portfolio-count>${properties.length} homes</span>
  </div>
  <div class="property-grid" data-property-grid></div>`;

  root.innerHTML = header;
  const grid = root.querySelector('[data-property-grid]');
  const countEl = root.querySelector('[data-portfolio-count]');
  const searchInput = root.querySelector('[data-portfolio-search]');

  function filteredProperties() {
    const query = state.search.toLowerCase();
    const list = properties.filter((property) => {
      if (state.transaction !== 'all' && property.transaction !== state.transaction) return false;
      if (state.type !== 'all' && property.type !== state.type) return false;
      if (!query) return true;
      const haystack = [property.ref, property.title, property.city, property.neighborhood, ...(property.features || [])]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
    if (state.sort === 'price-asc') list.sort((a, b) => a.price - b.price);
    else if (state.sort === 'price-desc') list.sort((a, b) => b.price - a.price);
    else list.sort((a, b) => a.ref.localeCompare(b.ref));
    return list;
  }

  function renderGrid() {
    const list = filteredProperties();
    grid.innerHTML = list.length
      ? list.map((property, index) => propertyCard(property, index, positions.get(property.id))).join('')
      : emptyState({
          title: 'No homes match this view',
          message: 'Try a different location, property type or clear the search.',
          action: '<button class="button button-quiet" type="button" data-clear-portfolio>Clear filters</button>',
          mark: 'building',
        });
    countEl.textContent = `${list.length} of ${properties.length} homes`;
    grid.querySelector('[data-clear-portfolio]')?.addEventListener('click', () => {
      state.search = '';
      state.transaction = 'all';
      state.type = 'all';
      searchInput.value = '';
      root.querySelectorAll('[data-portfolio-transaction]').forEach((button) => {
        button.classList.toggle('active', button.dataset.portfolioTransaction === 'all');
      });
      root.querySelector('[data-portfolio-type]').value = 'all';
      renderGrid();
    });
  }

  searchInput.addEventListener('input', () => {
    state.search = searchInput.value.trim();
    renderGrid();
  });

  root.querySelectorAll('[data-portfolio-transaction]').forEach((button) => {
    button.addEventListener('click', () => {
      root.querySelectorAll('[data-portfolio-transaction]').forEach((node) => node.classList.remove('active'));
      button.classList.add('active');
      state.transaction = button.dataset.portfolioTransaction;
      renderGrid();
    });
  });

  root.querySelector('[data-portfolio-type]').addEventListener('change', (event) => {
    state.type = event.target.value;
    renderGrid();
  });

  root.querySelector('[data-portfolio-sort]').addEventListener('change', (event) => {
    state.sort = event.target.value;
    renderGrid();
  });

  function openCard(propertyId) {
    const property = properties.find((item) => item.id === propertyId);
    if (property) openPropertyDrawer(property, positions.get(property.id), latestReport, meta);
  }

  grid.addEventListener('click', (event) => {
    const card = event.target.closest('[data-property-id]');
    if (!card) return;
    openCard(card.dataset.propertyId);
  });

  renderGrid();
}
