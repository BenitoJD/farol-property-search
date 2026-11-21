import { api } from '../api.js';
import {
  escapeAttr,
  escapeHtml,
  icon,
  money,
  percent,
  propertyImage,
  relativeTime,
  setBusy,
  toast,
} from '../ui.js';

function verdictTone(stats) {
  if (!stats || !stats.comps) return { label: 'No comps', tone: 'neutral', delta: null };
  if (stats.verdict === 'above') return { label: 'Above market', tone: 'warn', delta: stats.deltaPct };
  if (stats.verdict === 'below') return { label: 'Below market', tone: 'good', delta: stats.deltaPct };
  if (stats.verdict === 'at') return { label: 'At market', tone: 'neutral', delta: stats.deltaPct };
  return { label: 'No comps', tone: 'neutral', delta: null };
}

function verdictChip(stats) {
  const verdict = verdictTone(stats);
  return `<span class="price-chip price-chip-${verdict.tone}">${icon(
    verdict.tone === 'warn' ? 'trend' : verdict.tone === 'good' ? 'trend-down' : 'target',
    12
  )} ${escapeHtml(verdict.label)}${verdict.delta ? ` ${percent(verdict.delta)}` : ''}</span>`;
}

function portfolioOption(property) {
  return `<option value="${escapeAttr(property.id)}">${escapeHtml(property.ref)} · ${escapeHtml(
    property.title
  )} · ${money(property.price, { period: property.transaction === 'rent' ? 'month' : null })}</option>`;
}

function portfolioPreview(property) {
  if (!property) return '';
  return `<article class="subject-preview" data-preview>
    <div class="subject-preview-media"><img src="${propertyImage(property)}" alt="" /></div>
    <div class="subject-preview-copy">
      <span class="kicker">${escapeHtml(property.ref)} · ${property.transaction === 'rent' ? 'Long let' : 'For sale'}</span>
      <h3>${escapeHtml(property.title)}</h3>
      <span class="subject-preview-location">${icon('pin', 13)} ${escapeHtml(property.city)}${property.area ? ` · ${escapeHtml(property.area)}` : ''}</span>
      <div class="subject-preview-meta">
        <span>${property.bedrooms} bed</span>
        <span>${property.bathrooms} bath</span>
        <span>${property.areaM2} m²</span>
      </div>
      <strong class="subject-preview-price">${money(property.price, { period: property.transaction === 'rent' ? 'month' : null })}</strong>
    </div>
  </article>`;
}

function recentCard(comparison) {
  const stats = comparison.stats || {};
  const subject = comparison.subject || {};
  return `<a class="recent-card" href="#/comparisons/${escapeAttr(comparison.id)}">
    <div class="recent-card-media"><img src="${propertyImage(subject)}" alt="" loading="lazy" />
      ${verdictChip(stats)}
    </div>
    <div class="recent-card-body">
      <div class="recent-card-top"><span class="mono">${escapeHtml(comparison.ref)}</span><span class="mode-pill ${comparison.mode === 'live' ? 'mode-live' : ''}">${comparison.mode === 'live' ? 'Live' : 'Demo'}</span><span>${escapeHtml(relativeTime(comparison.createdAt))}</span></div>
      <h3>${escapeHtml(subject.title || 'Untitled listing')}</h3>
      <p>${escapeHtml(subject.city || '')} · ${money(subject.price, { period: subject.transaction === 'rent' ? 'month' : null })}</p>
      <div class="recent-card-stats">
        <span><b>${stats.comps ?? 0}</b> comps</span>
        <span><b>${stats.median ? money(stats.median, { period: subject.transaction === 'rent' ? 'month' : null }) : '—'}</b> median</span>
        <span><b>${stats.competitors ?? 0}</b> competitors</span>
      </div>
    </div>
    <span class="recent-card-arrow">${icon('arrow-right', 16)}</span>
  </a>`;
}

export async function renderCompare(main) {
  const data = await api.compareOptions();
  const { portfolio, recent, market } = data;
  const defaultProperty = portfolio.find((property) => property.ref === 'PBR-1042') || portfolio[0];
  const featured = recent.find((item) => item.status === 'completed') || null;
  const featuredStats = featured?.stats || {};
  const liveAvailable = Boolean(data.live?.available);
  let marketMode = liveAvailable ? 'live' : 'demo';
  let mode = 'portfolio';
  let selectedId = defaultProperty?.id || '';
  let selected = defaultProperty || null;

  const featuredDelta = featuredStats.deltaPct;
  const featuredHeadline = featured
    ? `<strong>${featuredDelta === null || featuredDelta === undefined ? '—' : `${Math.abs(featuredDelta).toFixed(1)}%`}</strong>
       <span>${featuredDelta > 0 ? 'above' : featuredDelta < 0 ? 'below' : 'at'} the comparable median</span>
       <div class="hero-signal-bar"><span style="left:${featuredDelta > 0 ? 50 : 50 - Math.min(46, Math.abs(featuredDelta || 0) * 1.4)}%;width:${Math.min(46, Math.abs(featuredDelta || 0) * 1.4)}%"></span></div>
       <em>${featured.subject?.title || ''}</em>
       <a class="hero-signal-cta" href="#/comparisons/${escapeAttr(featured.id)}">Open the evidence ${icon('arrow-right', 14)}</a>`
    : `<strong>—</strong><span>No analyses yet</span>`;

  main.innerHTML = `<div class="page compare-page">
    <section class="compare-hero">
      <div class="compare-hero-copy">
        <span class="kicker">Listing intelligence · comparable market</span>
        <h1>What is my listing worth?</h1>
        <p>Give Farol one property. The agent searches the source catalogue for similar listings, collapses cross-posted duplicates, groups the evidence by competitor and returns a fair-value range you can defend.</p>
        <div class="compare-hero-stats">
          <span><b>${market.sources}</b><span>catalogue sources</span></span>
          <span><b>${market.uniqueListings}</b><span>demo listings</span></span>
          <span><b>1</b><span>live portal</span></span>
        </div>
      </div>
      <div class="compare-hero-signal">
        <span class="kicker">Latest read ${featured ? `<span class="mode-pill ${featured.mode === 'live' ? 'mode-live' : ''}">${featured.mode === 'live' ? 'Live' : 'Demo'}</span>` : ''}</span>
        ${featuredHeadline}
      </div>
    </section>

    <div class="compare-layout">
      <section class="panel compare-builder">
        <div class="panel-head">
          <div>
            <p class="kicker">New analysis</p>
            <h2>Start with the listing you own</h2>
          </div>
          <span class="status-chip ${marketMode === 'live' ? 'status-live' : 'status-demo'}" id="compare-mode-badge">${marketMode === 'live' ? 'Live market' : 'Demo market'}</span>
        </div>

        <div class="market-switch" role="tablist" aria-label="Market mode">
          <button class="market-tab ${marketMode === 'live' ? 'is-active' : ''}" type="button" data-market="live" ${liveAvailable ? '' : 'disabled'}>
            <span class="live-dot"></span> Live market <em>Imovirtual</em>
          </button>
          <button class="market-tab ${marketMode === 'demo' ? 'is-active' : ''}" type="button" data-market="demo">
            Demo market <em>Synthetic</em>
          </button>
        </div>

        <div class="mode-tabs" role="tablist">
          <button class="mode-tab is-active" type="button" data-compare-mode="portfolio">${icon('building', 15)} From my portfolio</button>
          <button class="mode-tab" type="button" data-compare-mode="manual">${icon('plus', 15)} Enter a listing</button>
        </div>

        <form id="compare-form" class="compare-form">
          <div class="compare-pane" data-pane="portfolio">
            <label class="field">
              <span class="field-label">Choose a portfolio listing</span>
              <select class="input" id="portfolio-select" name="portfolioId">
                <optgroup label="Long lets">${portfolio.filter((p) => p.transaction === 'rent').map(portfolioOption).join('')}</optgroup>
                <optgroup label="Sales">${portfolio.filter((p) => p.transaction === 'sale').map(portfolioOption).join('')}</optgroup>
              </select>
            </label>
            <div id="portfolio-preview">${portfolioPreview(selected)}</div>
          </div>

          <div class="compare-pane" data-pane="manual" hidden>
            <div class="form-grid form-grid-2">
              <label class="field"><span class="field-label">Listing title</span><input class="input" name="title" placeholder="Two-bedroom apartment with sea views" /></label>
              <label class="field"><span class="field-label">City</span><input class="input" name="city" placeholder="Lagos" /></label>
              <div class="field">
                <span class="field-label">Transaction</span>
                <div class="segmented">
                  <label><input type="radio" name="transaction" value="rent" checked /><span>Long let</span></label>
                  <label><input type="radio" name="transaction" value="sale" /><span>Sale</span></label>
                </div>
              </div>
              <label class="field"><span class="field-label">Type</span><select class="input" name="type"><option value="apartment">Apartment</option><option value="townhouse">Townhouse</option><option value="villa">Villa</option><option value="house">House</option><option value="quinta">Quinta</option><option value="penthouse">Penthouse</option></select></label>
              <label class="field"><span class="field-label">Area / neighbourhood</span><input class="input" name="area" placeholder="Meia Praia" /></label>
              <label class="field"><span class="field-label">Asking price (EUR)</span><input class="input" type="number" min="1" name="price" placeholder="2100" /></label>
              <label class="field"><span class="field-label">Bedrooms</span><input class="input" type="number" min="0" name="bedrooms" value="2" /></label>
              <label class="field"><span class="field-label">Bathrooms</span><input class="input" type="number" min="0" name="bathrooms" value="2" /></label>
              <label class="field"><span class="field-label">Area m²</span><input class="input" type="number" min="10" name="areaM2" value="95" /></label>
              <label class="field"><span class="field-label">Features <span class="field-hint">comma separated</span></span><input class="input" name="features" placeholder="Sea view, Pool, Furnished" /></label>
            </div>
            <label class="field"><span class="field-label">Short description <span class="field-hint">optional</span></span><textarea class="input textarea" name="description" rows="2"></textarea></label>
          </div>

          <div class="compare-submit-row">
            <div class="compare-submit-copy">
              <strong>${icon('sparkles', 15)} The agent will find and price similar listings</strong>
              <span id="compare-market-note">${icon('info', 13)} ${escapeHtml(marketMode === 'live' ? data.live.note : market.note)}</span>
            </div>
            <button class="button button-primary compare-submit" type="submit" id="run-comparison">
              ${icon('target', 16)} Find comparable listings
            </button>
          </div>
        </form>
      </section>

      <aside class="compare-rail">
        <section class="panel">
          <div class="panel-head"><div><p class="kicker">How it works</p><h2>One listing, four moves</h2></div></div>
          <div class="compare-steps">
            <div><span>01</span><div><strong>Read your listing</strong><p>Normalise type, size, bedrooms, location and features.</p></div></div>
            <div><span>02</span><div><strong>Search the source catalogue</strong><p>Query portals and agencies for similar stock, not the whole market.</p></div></div>
            <div><span>03</span><div><strong>Dedupe and benchmark</strong><p>Collapse mirrors, then compute median, p25/p75 and €/m².</p></div></div>
            <div><span>04</span><div><strong>Return the evidence</strong><p>Value range, competitor pricing and every comparable used.</p></div></div>
          </div>
        </section>

        <section class="panel compare-coverage">
          <div class="panel-head"><div><p class="kicker">Coverage</p><h2>What the agent can see</h2></div></div>
          <div class="coverage-grid" data-coverage="demo" ${marketMode === 'live' ? 'hidden' : ''}>
            <span><b>${market.sources}</b><span>sources</span></span>
            <span><b>${market.uniqueListings}</b><span>unique listings</span></span>
            <span><b>${market.listingObservations}</b><span>observations</span></span>
          </div>
          <div class="coverage-grid" data-coverage="live" ${marketMode === 'live' ? '' : 'hidden'}>
            <span><b>1</b><span>live portal</span></span>
            <span><b>Imovirtual</b><span>public search</span></span>
            <span><b>On demand</b><span>fetched live</span></span>
          </div>
          <div class="notice ${marketMode === 'live' ? 'notice-live' : 'notice-neutral'}" id="compare-market-notice">${icon('globe', 16)} <div><strong>${marketMode === 'live' ? 'Live source: Imovirtual' : 'Demo catalogue'}</strong><span>${marketMode === 'live' ? 'Public Imovirtual search results are fetched on demand. Confirm source terms before production use; the agent does not bypass anti-bot controls.' : 'The demo catalogue is synthetic. Switch to Live market to fetch current Imovirtual public results.'}</span></div></div>
        </section>
      </aside>
    </div>

    <section class="recent-section">
      <div class="panel-head">
        <div><p class="kicker">Evidence history</p><h2>Recent analyses</h2></div>
        <span class="panel-count">${recent.length} saved</span>
      </div>
      ${recent.length
        ? `<div class="recent-grid">${recent.map(recentCard).join('')}</div>`
        : `<div class="empty-state"><span class="empty-icon">${icon('target', 22)}</span><h3>No analyses yet</h3><p>Choose a portfolio home and run the first comparable value report.</p></div>`}
    </section>
  </div>`;

  const form = main.querySelector('#compare-form');
  const select = main.querySelector('#portfolio-select');
  const preview = main.querySelector('#portfolio-preview');
  if (selectedId) select.value = selectedId;
  const panes = [...main.querySelectorAll('[data-pane]')];
  const tabs = [...main.querySelectorAll('[data-compare-mode]')];
  const marketTabs = [...main.querySelectorAll('[data-market]')];
  const note = main.querySelector('#compare-market-note');
  const notice = main.querySelector('#compare-market-notice');
  const modeBadge = main.querySelector('#compare-mode-badge');
  const coverageDemo = main.querySelector('[data-coverage="demo"]');
  const coverageLive = main.querySelector('[data-coverage="live"]');

  function selectProperty(id) {
    selectedId = id;
    selected = portfolio.find((property) => property.id === id) || null;
    if (preview) preview.innerHTML = portfolioPreview(selected);
  }

  function fillManualFrom(property) {
    if (!property) return;
    form.querySelector('[name="title"]').value = property.title;
    form.querySelector('[name="city"]').value = property.city;
    form.querySelector('[name="area"]').value = property.area || '';
    form.querySelector('[name="price"]').value = property.price;
    form.querySelector('[name="bedrooms"]').value = property.bedrooms;
    form.querySelector('[name="bathrooms"]').value = property.bathrooms;
    form.querySelector('[name="areaM2"]').value = property.areaM2;
    form.querySelector('[name="type"]').value = property.type;
    form.querySelector('[name="features"]').value = (property.features || []).join(', ');
    const transaction = form.querySelector(`[name="transaction"][value="${property.transaction}"]`);
    if (transaction) transaction.checked = true;
  }

  function setMode(next) {
    mode = next;
    tabs.forEach((tab) => tab.classList.toggle('is-active', tab.dataset.compareMode === next));
    panes.forEach((pane) => {
      pane.hidden = pane.dataset.pane !== next;
    });
    if (next === 'manual') fillManualFrom(selected);
  }

  tabs.forEach((tab) => tab.addEventListener('click', () => setMode(tab.dataset.compareMode)));
  marketTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      marketMode = tab.dataset.market;
      marketTabs.forEach((item) => item.classList.toggle('is-active', item.dataset.market === marketMode));
      if (note) {
        note.innerHTML = `${icon('info', 13)} ${escapeHtml(
          marketMode === 'live' ? data.live.note : data.market.note
        )}`;
      }
      if (modeBadge) {
        modeBadge.textContent = marketMode === 'live' ? 'Live market' : 'Demo market';
        modeBadge.classList.toggle('status-live', marketMode === 'live');
        modeBadge.classList.toggle('status-demo', marketMode !== 'live');
      }
      if (coverageDemo) coverageDemo.hidden = marketMode === 'live';
      if (coverageLive) coverageLive.hidden = marketMode !== 'live';
      if (notice) {
        notice.classList.toggle('notice-live', marketMode === 'live');
        notice.innerHTML = `${icon('globe', 16)} <div><strong>${
          marketMode === 'live' ? 'Live source: Imovirtual' : 'Demo catalogue'
        }</strong><span>${
          marketMode === 'live'
            ? 'Public Imovirtual search results are fetched on demand. Confirm source terms before production use; the agent does not bypass anti-bot controls.'
            : 'The demo catalogue is synthetic. Switch to Live market to fetch current Imovirtual public results.'
        }</span></div>`;
      }
    });
  });
  select.addEventListener('change', () => selectProperty(select.value));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = main.querySelector('#run-comparison');
    let payload;
    if (mode === 'portfolio') {
      if (!selectedId) {
        toast('Choose a portfolio listing first.', { tone: 'error' });
        return;
      }
      payload = { portfolioId: selectedId, market: marketMode };
    } else {
      const data = new FormData(form);
      payload = {
        market: marketMode,
        title: String(data.get('title') || '').trim(),
        transaction: String(data.get('transaction') || 'rent'),
        type: String(data.get('type') || 'apartment'),
        city: String(data.get('city') || '').trim(),
        area: String(data.get('area') || '').trim(),
        price: Number(data.get('price') || 0),
        bedrooms: Number(data.get('bedrooms') || 0),
        bathrooms: Number(data.get('bathrooms') || 0),
        areaM2: Number(data.get('areaM2') || 0),
        features: String(data.get('features') || '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        description: String(data.get('description') || '').trim(),
      };
      if (!payload.title || !payload.city || !payload.price) {
        toast('Title, city and asking price are required.', { tone: 'error' });
        return;
      }
    }
    setBusy(button, true, 'Starting agent…');
    try {
      const result = await api.createComparison(payload);
      window.location.hash = `#/comparisons/${result.comparison.id}`;
    } catch (error) {
      toast(error.message, { tone: 'error' });
      setBusy(button, false);
    }
  });

  return () => {};
}
