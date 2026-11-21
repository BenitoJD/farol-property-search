import { api } from '../api.js';
import {
  escapeAttr,
  escapeHtml,
  icon,
  money,
  moneyPerM2,
  percent,
  priceChip,
  propertyImage,
} from '../ui.js';

function positionBar(check) {
  if (!check?.available) {
    return `<span class="benchmark-position benchmark-position-empty">No evidence</span>`;
  }
  const delta = Math.max(-30, Math.min(30, check.deltaPct));
  const width = Math.min(50, (Math.abs(delta) / 30) * 50);
  return `<span class="benchmark-position">
    <span class="position-track"><span class="position-zero"></span><span class="position-fill position-${delta >= 0 ? 'above' : 'below'}" style="${delta >= 0 ? 'left:50%' : `right:50%`};width:${width}%"></span></span>
    <span class="position-label position-${delta > 7 ? 'above' : delta < -7 ? 'below' : 'at'}">${percent(check.deltaPct)}</span>
  </span>`;
}

function priceScale(check, row) {
  if (!check?.available) {
    return `<div class="price-panel price-panel-empty"><p>No comparable asking prices were captured for this home. Add coverage or widen the area before drawing a conclusion.</p></div>`;
  }
  const low = Math.min(check.p25, row.price) * 0.96;
  const high = Math.max(check.p75, row.price) * 1.04;
  const span = high - low || 1;
  const position = (value) => `${Math.max(2, Math.min(98, ((value - low) / span) * 100)).toFixed(1)}%`;
  return `<div class="benchmark-detail-block">
    <div class="benchmark-detail-head"><span class="meta-label">Comparable range</span><span class="confidence-label">${escapeHtml(check.confidence)} evidence · ${check.count} comps</span></div>
    <div class="price-scale">
      <div class="price-scale-track">
        <span class="price-scale-band" style="left:${position(check.p25)};right:${100 - Number.parseFloat(position(check.p75))}%"></span>
        <span class="price-scale-median" style="left:${position(check.median)}"></span>
        <span class="price-scale-target" style="left:${position(row.price)}"><span>${money(row.price)}</span></span>
      </div>
      <div class="price-scale-labels"><span>${money(check.p25)}</span><span>median ${money(check.median)}</span><span>${money(check.p75)}</span></div>
    </div>
    <div class="benchmark-detail-numbers">
      <span><span class="meta-label">Asking per m²</span><b>${check.pricePerM2 ? moneyPerM2(check.pricePerM2) : '—'}</b></span>
      <span><span class="meta-label">Comparable median per m²</span><b>${check.medianPerM2 ? moneyPerM2(check.medianPerM2) : '—'}</b></span>
      <span><span class="meta-label">Percentile</span><b>${check.percentile ?? '—'}th</b></span>
    </div>
    ${check.comparables.length ? `<div class="comparable-list">
      <span class="meta-label">Comparable evidence</span>
      ${check.comparables.slice(0, 6).map((comp) => `<div class="comparable-row">
        <span class="comparable-title">${escapeHtml(comp.title)}</span>
        <span class="comparable-meta">${escapeHtml(comp.sourceName)} · ${comp.bedrooms} bed · ${comp.areaM2 ? `${comp.areaM2} m²` : 'area n/a'}</span>
        <span class="comparable-price">${money(comp.price, { period: row.transaction === 'rent' ? 'month' : null })}</span>
      </div>`).join('')}
    </div>` : ''}
  </div>`;
}

function benchmarkRow(row) {
  const check = row.check;
  return `<article class="benchmark-row" data-verdict="${escapeHtml(row.check?.verdict || 'unknown')}" data-transaction="${escapeAttr(row.transaction)}" data-search="${escapeAttr(
    `${row.ref} ${row.title} ${row.city}`.toLowerCase()
  )}">
    <button class="benchmark-main" type="button" data-expand-benchmark aria-expanded="false">
      <span class="benchmark-thumb"><img src="${propertyImage(row)}" alt="" loading="lazy" /></span>
      <span class="benchmark-property">
        <span class="benchmark-ref">${escapeHtml(row.ref)} · ${row.transaction === 'rent' ? 'Long let' : 'Sale'}</span>
        <strong>${escapeHtml(row.title)}</strong>
        <span class="benchmark-meta">${escapeHtml(row.city)}${row.neighborhood ? ` · ${escapeHtml(row.neighborhood)}` : ''} · ${row.bedrooms} bed · ${row.areaM2} m²</span>
      </span>
      <span class="benchmark-asking"><span class="meta-label">Asking</span><b>${money(row.price, { period: row.transaction === 'rent' ? 'month' : null })}</b></span>
      <span class="benchmark-median"><span class="meta-label">Comp. median</span><b>${check?.available ? money(check.median, { period: row.transaction === 'rent' ? 'month' : null }) : '—'}</b></span>
      ${positionBar(check)}
      <span class="benchmark-verdict">${priceChip(check)}<span class="benchmark-action">${escapeHtml(row.action || '')}</span></span>
      <span class="benchmark-chevron">${icon('chevron-down', 16)}</span>
    </button>
    <div class="benchmark-detail" hidden>
      <div class="benchmark-recommendation benchmark-recommendation-${escapeHtml(row.tone || 'neutral')}">
        <span class="benchmark-rec-icon">${icon(
          row.tone === 'warn' ? 'alert' : row.tone === 'opportunity' ? 'trend' : row.tone === 'good' ? 'check-circle' : 'info',
          18
        )}</span>
        <div>
          <strong>${escapeHtml(row.verdict === 'No evidence' ? 'No evidence yet' : `${row.verdict} · ${row.check.deltaPct === 0 ? 'at market' : percent(row.check.deltaPct)}`)}</strong>
          <p>${escapeHtml(row.message)}</p>
        </div>
        ${row.suggestedPrice && row.tone !== 'good' ? `<span class="benchmark-suggested"><span class="meta-label">Suggested ${row.transaction === 'rent' ? 'ask' : 'price'}</span><b>${money(row.suggestedPrice, { period: row.transaction === 'rent' ? 'month' : null })}</b></span>` : ''}
      </div>
      ${priceScale(check, row)}
    </div>
  </article>`;
}

export async function renderPortfolio(main) {
  const data = await api.portfolio();
  const { rows, summary, findings, corridor, market } = data;
  const deltaText =
    summary.medianDeltaPct === null
      ? 'No benchmark'
      : `${Math.abs(summary.medianDeltaPct).toFixed(1)}% ${summary.medianDeltaPct <= 0 ? 'below' : 'above'}`;

  main.innerHTML = `<div class="page portfolio-page">
    <header class="page-head">
      <div class="page-head-copy">
        <p class="kicker">Reusable systems · price intelligence</p>
        <h1>Know what fair looks like.</h1>
        <p class="page-intro">Every search result and every portfolio home is checked against comparable asking prices. The search finds the homes; this is how the team knows whether the price is defensible.</p>
      </div>
      <div class="page-actions">
        <a class="button button-ghost" href="#/sources">${icon('globe', 15)} Source coverage</a>
        <a class="button button-ghost" href="#/outputs">${icon('layers', 15)} Outputs</a>
      </div>
    </header>

    <section class="kpi-grid kpi-grid-4">
      <article class="kpi-card">
        <div class="kpi-top"><span class="kpi-label">Portfolio homes</span><span class="kpi-icon">${icon('building', 18)}</span></div>
        <div class="kpi-value">${summary.total}</div>
        <p class="kpi-sub">${summary.rentCount} long lets · ${summary.saleCount} sales</p>
      </article>
      <article class="kpi-card">
        <div class="kpi-top"><span class="kpi-label">Benchmarked</span><span class="kpi-icon">${icon('target', 18)}</span></div>
        <div class="kpi-value">${summary.benchmarked}<span class="kpi-unit">/${summary.total}</span></div>
        <p class="kpi-sub">${summary.confidenceHigh} strong · ${summary.confidenceLow} thin evidence</p>
      </article>
      <article class="kpi-card ${summary.medianDeltaPct > 0 ? 'kpi-warm' : ''}">
        <div class="kpi-top"><span class="kpi-label">Median position</span><span class="kpi-icon">${icon('trend', 18)}</span></div>
        <div class="kpi-value kpi-value-small">${escapeHtml(deltaText)}</div>
        <p class="kpi-sub">vs comparable asking prices · corridor ±${corridor}%</p>
      </article>
      <article class="kpi-card">
        <div class="kpi-top"><span class="kpi-label">Pricing headroom</span><span class="kpi-icon">${icon('arrow-up-right', 18)}</span></div>
        <div class="kpi-value">${summary.below}</div>
        <p class="kpi-sub">${summary.above} above · ${summary.at} at market</p>
      </article>
    </section>

    <div class="portfolio-intro">
      <div class="portfolio-intro-copy">
        <span class="kicker">The read</span>
        <h2>${summary.below} portfolio home${summary.below === 1 ? '' : 's'} sit below the comparable median.</h2>
        <p>${summary.below ? 'That is either pricing headroom or a condition difference the comparables cannot see. The evidence is on the row, not in a black box.' : 'The portfolio is broadly aligned with comparable asking prices. Keep monitoring as the catalogue grows.'}</p>
      </div>
      <div class="portfolio-intro-stats">
        <span><b>${summary.benchmarked}</b><span>benchmarked</span></span>
        <span><b>${Math.round((summary.benchmarked / Math.max(1, summary.total)) * 100)}%</b><span>coverage</span></span>
        <span><b>${market.canonicalListings}</b><span>market comps</span></span>
      </div>
    </div>

    ${findings.length ? `<section class="findings-row">
      ${findings.slice(0, 4).map((finding) => `<article class="finding-card finding-${escapeHtml(finding.tone || 'neutral')}">
        <div class="finding-top"><span class="finding-tone">${icon(finding.tone === 'warn' ? 'alert' : 'trend', 15)}</span><span>${escapeHtml(finding.ref)}</span><span class="delta-badge delta-${finding.deltaPct > 0 ? 'warn' : 'good'}">${percent(finding.deltaPct)}</span></div>
        <strong>${escapeHtml(finding.title)}</strong>
        <p>${escapeHtml(finding.message)}</p>
      </article>`).join('')}
    </section>` : ''}

    <section class="panel">
      <div class="panel-head">
        <div><p class="kicker">Portfolio benchmark</p><h2>Every home, against the market</h2></div>
        <span class="panel-count">${summary.benchmarked} with evidence</span>
      </div>
      <div class="benchmark-toolbar">
        <div class="filter-tabs" role="tablist">
          <button class="filter-tab is-active" type="button" data-portfolio-type="all">All <span>${rows.length}</span></button>
          <button class="filter-tab" type="button" data-portfolio-type="rent">Long lets <span>${summary.rentCount}</span></button>
          <button class="filter-tab" type="button" data-portfolio-type="sale">Sales <span>${summary.saleCount}</span></button>
        </div>
        <div class="filter-tabs filter-tabs-subtle" role="tablist">
          <button class="filter-tab is-active" type="button" data-verdict-filter="all">All reads</button>
          <button class="filter-tab" type="button" data-verdict-filter="above">Above</button>
          <button class="filter-tab" type="button" data-verdict-filter="at">At market</button>
          <button class="filter-tab" type="button" data-verdict-filter="below">Below</button>
          <button class="filter-tab" type="button" data-verdict-filter="unknown">No evidence</button>
        </div>
        <label class="search-field">${icon('search', 15)}<input type="search" id="benchmark-search" placeholder="Search ref, home or city" /></label>
      </div>
      <div class="benchmark-list" id="benchmark-list">
        ${rows.map(benchmarkRow).join('')}
      </div>
      <div class="empty-state" id="benchmark-empty" hidden><span class="empty-icon">${icon('search', 22)}</span><h3>No homes match</h3><p>Try another filter or clear the search.</p></div>
      <div class="panel-foot panel-foot-split">
        <span class="panel-foot-note">${icon('info', 13)} Asking prices only. A formal valuation, condition check and title review remain separate.</span>
        <span class="panel-foot-note">Comparables: same city and type, bedrooms ±1, area 60–160%</span>
      </div>
    </section>

    <section class="method-panel">
      <div class="method-copy">
        <span class="kicker">Method & limits</span>
        <h2>Price intelligence, not a price oracle.</h2>
        <p>The benchmark compares each home with other unique asking prices in the same city and property type, within one bedroom and a 60–160% area band. It uses the median and the 25th–75th percentile range, and treats ±${corridor}% as the market corridor. A thin comparable set is labelled thin, not hidden.</p>
      </div>
      <div class="method-points">
        <span>${icon('check', 14)} Duplicates removed before the median</span>
        <span>${icon('check', 14)} Mirrors excluded from their own benchmark</span>
        <span>${icon('check', 14)} Evidence source shown on every row</span>
        <span>${icon('check', 14)} Confidence and coverage published</span>
      </div>
      <a class="button button-ghost" href="#/sources">${icon('globe', 15)} See the ${market.sources} sources</a>
    </section>
  </div>`;

  let typeFilter = 'all';
  let verdictFilter = 'all';
  let search = '';
  const rowsElements = [...main.querySelectorAll('.benchmark-row')];
  const empty = main.querySelector('#benchmark-empty');

  function applyFilters() {
    let visible = 0;
    rowsElements.forEach((row) => {
      const matchesType = typeFilter === 'all' || row.dataset.transaction === typeFilter;
      const matchesVerdict = verdictFilter === 'all' || row.dataset.verdict === verdictFilter;
      const matchesSearch = !search || row.dataset.search.includes(search);
      const show = matchesType && matchesVerdict && matchesSearch;
      row.hidden = !show;
      if (show) visible += 1;
    });
    empty.hidden = visible !== 0;
  }

  main.querySelectorAll('[data-portfolio-type]').forEach((button) => {
    button.addEventListener('click', () => {
      typeFilter = button.dataset.portfolioType;
      main.querySelectorAll('[data-portfolio-type]').forEach((tab) => tab.classList.toggle('is-active', tab === button));
      applyFilters();
    });
  });
  main.querySelectorAll('[data-verdict-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      verdictFilter = button.dataset.verdictFilter;
      main.querySelectorAll('[data-verdict-filter]').forEach((tab) => tab.classList.toggle('is-active', tab === button));
      applyFilters();
    });
  });
  main.querySelector('#benchmark-search')?.addEventListener('input', (event) => {
    search = event.target.value.trim().toLowerCase();
    applyFilters();
  });

  main.querySelectorAll('[data-expand-benchmark]').forEach((button) => {
    button.addEventListener('click', () => {
      const row = button.closest('.benchmark-row');
      const detail = row.querySelector('.benchmark-detail');
      const open = !detail.hidden;
      detail.hidden = open;
      button.setAttribute('aria-expanded', String(!open));
      button.classList.toggle('is-open', !open);
    });
  });

  return () => {};
}
