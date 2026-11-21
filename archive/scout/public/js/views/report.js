import { api } from '../api.js';
import {
  esc,
  safeUrl,
  icon,
  fmtMoney,
  fmtPrice,
  fmtPct,
  fmtArea,
  fmtNumber,
  formatDuration,
  formatDateTime,
  typeLabel,
  propertyImage,
  confidenceDots,
  verdictBadge,
  rangeBar,
  emptyState,
  shortId,
  splitThread,
  openDrawer,
  closeDrawer,
  prefillFromProperty,
} from '../ui.js';

const SEVERITY = {
  high: { label: 'High', order: 0 },
  medium: { label: 'Medium', order: 1 },
  opportunity: { label: 'Opportunity', order: 2 },
  low: { label: 'Coverage', order: 3 },
  positive: { label: 'Healthy', order: 4 },
};

const REJECTION_LABELS = {
  transaction: 'wrong transaction',
  type: 'wrong property type',
  location: 'outside the brief',
  bedrooms: 'bedroom mismatch',
  budget: 'over budget',
  area: 'implausible area',
  incomplete: 'incomplete record',
  unparseable: 'unparseable page',
  missing_title: 'no title',
  missing_type: 'no property type',
  missing_location: 'no location',
  missing_price: 'no price',
  price_out_of_range: 'implausible price',
  fx_failure: 'FX failure',
};

function humanRejection(reason) {
  return REJECTION_LABELS[reason] || reason.replace(/_/g, ' ');
}

function percentVsOwn(offer, positionById) {
  const position = offer.comparison ? positionById.get(offer.comparison.propertyId) : null;
  if (!position) return null;
  const own = position.property.price;
  if (!Number.isFinite(own) || !own) return null;
  return ((offer.price_eur - own) / own) * 100;
}

function kpiCard({ label, value, unit = '', foot = '', tone = '' }) {
  return `<article class="kpi ${tone}">
    <div class="kpi-label">${esc(label)}</div>
    <div class="kpi-value ${tone === 'negative' ? 'is-negative' : tone === 'positive' ? 'is-positive' : ''}">${value}${
      unit ? `<span class="unit">${esc(unit)}</span>` : ''
    }</div>
    <div class="kpi-foot">${foot}</div>
  </article>`;
}

function findingsMarkup(report, positionById) {
  const items = report.recommendations?.slice(0, 6) || [];
  if (!items.length) {
    return `<div class="empty-state" style="padding:28px;border:0;background:transparent">
      <span class="empty-mark">${icon('check', 22)}</span>
      <h3>No material findings</h3>
      <p>Scout did not find a price gap worth flagging in this run.</p>
    </div>`;
  }
  return items
    .map((finding, index) => {
      const severity = SEVERITY[finding.severity] || SEVERITY.low;
      const actionable = Boolean(finding.propertyId || finding.offerId);
      return `<div class="finding ${actionable ? 'is-actionable' : ''}" data-severity="${esc(finding.severity)}" ${
        finding.offerId ? `data-finding-offer="${esc(finding.offerId)}"` : ''
      } ${finding.propertyId ? `data-finding-property="${esc(finding.propertyId)}"` : ''} ${
        actionable ? 'role="button" tabindex="0"' : ''
      }>
        <div class="finding-index">${String(index + 1).padStart(2, '0')}</div>
        <div class="finding-body">
          <div class="finding-title">${esc(finding.title)}</div>
          <div class="finding-message">${esc(finding.message)}</div>
          <div class="finding-foot">
            <span class="finding-action">${esc(finding.action || 'Review')} ${icon('arrow-up-right', 11)}</span>
          </div>
        </div>
        <span class="finding-tag ${esc(finding.severity)}">${esc(severity.label)}</span>
      </div>`;
    })
    .join('');
}

function pulseMarkup(report) {
  const o = report.overview;
  const total = o.overpriced + o.competitive + o.underpriced;
  const pct = (n) => (total ? Math.max(0, (n / total) * 100) : 0);
  const delta = o.medianDeltaPct;
  const deltaColor = delta === null ? 'var(--ink)' : delta > 7 ? 'var(--red)' : delta < -7 ? 'var(--green)' : 'var(--gold)';
  const comparableTotal = (report.positions || []).reduce((sum, p) => sum + (p.comparableCount || 0), 0);
  const confidence = o.avgConfidence === null ? '—' : `${Math.round(o.avgConfidence * 100)}%`;
  return `<aside class="card pulse-card">
    <div class="pulse-kicker">
      <span class="section-kicker">Market pulse</span>
      <span class="chip">±7% corridor</span>
    </div>
    <div class="pulse-number" style="color:${deltaColor}">${delta === null ? '—' : fmtPct(delta)}</div>
    <div class="pulse-caption">Median asking-price position against matched comparables. Positive means your portfolio is priced above the market.</div>
    <div class="pulse-bar" role="img" aria-label="Price positioning split">
      ${total ? `<span class="under" style="width:${pct(o.underpriced)}%"></span>
      <span class="on" style="width:${pct(o.competitive)}%"></span>
      <span class="over" style="width:${pct(o.overpriced)}%"></span>` : '<span style="width:100%;background:var(--line)"></span>'}
    </div>
    <div class="pulse-legend">
      <div class="pulse-legend-row"><i style="background:var(--green)"></i>Below market<strong>${o.underpriced}</strong></div>
      <div class="pulse-legend-row"><i style="background:var(--gold)"></i>At market<strong>${o.competitive}</strong></div>
      <div class="pulse-legend-row"><i style="background:var(--terracotta)"></i>Above market<strong>${o.overpriced}</strong></div>
    </div>
    <div class="pulse-foot">
      <div class="pulse-fact"><span>Comparable offers</span><strong>${fmtNumber(comparableTotal)}</strong></div>
      <div class="pulse-fact"><span>Avg. confidence</span><strong>${confidence}</strong></div>
    </div>
  </aside>`;
}

function positionsMarkup(report) {
  if (!report.positions?.length) {
    return `<div class="card position-card">
      <div class="position-head"><div><div class="position-title">Your listings</div><div class="position-sub">No portfolio home matched this brief.</div></div></div>
      <div style="padding:0 24px 24px">${emptyState({
        title: 'Nothing in the portfolio matched',
        message: 'Scout still scanned the market. Widen the brief or adjust the budget to benchmark your own listings next time.',
        mark: 'building',
      })}</div>
    </div>`;
  }

  return `<div class="card position-card">
    <div class="position-head">
      <div>
        <div class="position-title">Your positioning</div>
        <div class="position-sub">Each listing against its comparable set. The marker is your ask; the band is the interquartile market range.</div>
      </div>
      <span class="chip">${icon('pin', 11)} ${report.filters.locations?.length ? esc(report.filters.locations.join(' & ')) : esc(report.filters.regions?.join(' & ') || 'Portfolio')}</span>
    </div>
    <div class="table-wrap">
      <table class="data-table position-table">
        <thead>
          <tr>
            <th>Listing</th>
            <th>Your ask</th>
            <th>Market range</th>
            <th>vs median</th>
            <th>Verdict</th>
            <th>Comps</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${report.positions
            .map(
              (position) => `<tr class="clickable" data-property-id="${esc(position.property.id)}" tabindex="0">
                <td>
                  <div class="property-cell">
                    <span class="thumb"><img src="${propertyImage(position.property.type)}" alt="" loading="lazy"></span>
                    <span class="property-cell-text">
                      <span class="property-ref">${esc(position.property.ref)}</span>
                      <span class="property-cell-title">${esc(position.property.title)}</span>
                      <span class="property-cell-sub">${esc(position.property.city)} · ${typeLabel(position.property.type)} · ${position.property.bedrooms} bed</span>
                    </span>
                  </div>
                </td>
                <td><span class="price-ask">${fmtMoney(position.property.price)}<small>${position.property.transaction === 'rent' ? 'per month' : 'total'}</small></span></td>
                <td class="range-cell">${rangeBar(position)}</td>
                <td><span class="delta ${position.deltaPct > 0 ? 'above' : position.deltaPct < 0 ? 'below' : 'flat'}">${fmtPct(position.deltaPct)}</span><span class="compare-note">median ${position.market ? fmtMoney(position.market.median) : '—'}</span></td>
                <td>${verdictBadge(position.verdict)}</td>
                <td><span class="mono" style="font-size:10px">${position.comparableCount}</span><span class="compare-note">${position.mirrors.length ? `${position.mirrors.length} mirror${position.mirrors.length === 1 ? '' : 's'}` : 'no mirror'}</span></td>
                <td><span class="icon-arrow">${icon('chevron-right', 11)}</span></td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

function ledgerRows(report, positionById) {
  const rank = (offer) => (offer.comparison?.kind === 'same_listing' ? 0 : offer.comparison ? 1 : 2);
  const gapAbs = (offer) => {
    const delta = percentVsOwn(offer, positionById);
    return delta === null ? -1 : Math.abs(delta);
  };
  const offers = [...(report.offers || [])].sort(
    (a, b) => rank(a) - rank(b) || gapAbs(b) - gapAbs(a) || a.price_eur - b.price_eur
  );

  return offers
    .map((offer, index) => {
      const source = offer.source || {};
      const vsOwn = percentVsOwn(offer, positionById);
      const below = vsOwn !== null && vsOwn < -0.05;
      const comparison = offer.comparison;
      const searchText = [
        offer.title,
        offer.city,
        offer.neighborhood,
        source.name,
        offer.seller,
        comparison?.propertyRef,
        typeLabel(offer.type),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const matchBadge =
        comparison?.kind === 'same_listing'
          ? '<span class="badge badge-terracotta">Mirror</span>'
          : comparison?.kind === 'comparable'
            ? '<span class="badge badge-neutral">Comparable</span>'
            : '<span class="badge badge-neutral">Market only</span>';
      return `<tr class="clickable" data-offer-id="${esc(offer.id)}" data-kind="${esc(comparison?.kind || 'none')}" data-below="${below ? '1' : '0'}" data-price="${offer.price_eur}" data-gap="${vsOwn === null ? -1 : Math.abs(vsOwn)}" data-priority="${index}" data-search="${esc(searchText)}" tabindex="0">
        <td>
          <div class="offer-cell">
            <div class="offer-title">${esc(offer.title)}</div>
            <div class="offer-meta">${esc(offer.city)}${offer.neighborhood ? ` · ${esc(offer.neighborhood)}` : ''}<span class="dot"></span>${esc(offer.seller || source.name || '')}</div>
          </div>
        </td>
        <td class="hide-sm"><span class="source-pill" title="${esc(source.domain || '')}">${esc(source.name || 'Unknown')}</span></td>
        <td class="hide-sm"><span class="mono" style="font-size:9.5px;color:var(--ink-2)">${offer.bedrooms ? `${offer.bedrooms} bed` : '—'} · ${offer.area_m2 ? `${fmtNumber(offer.area_m2)} m²` : '—'} · ${typeLabel(offer.type)}</span></td>
        <td><span class="offer-ask">${fmtMoney(offer.price_eur)}<small>${offer.period === 'month' ? 'per month' : 'total'} ${offer.currency !== 'EUR' ? `· ${esc(offer.currency)}` : ''}</small></span></td>
        <td>${
          vsOwn === null
            ? `<span class="muted" style="font-size:10px">—</span><span class="compare-note">no portfolio match</span>`
            : `<span class="delta ${vsOwn < 0 ? 'is-below' : vsOwn > 0 ? 'is-above' : 'flat'}">${fmtPct(vsOwn)}</span><span class="compare-note">${vsOwn < 0 ? 'below' : vsOwn > 0 ? 'above' : 'level with'} your ask</span>`
        }</td>
        <td>${matchBadge}${offer.duplicateCount ? `<span class="compare-note">+${offer.duplicateCount} duplicate${offer.duplicateCount === 1 ? '' : 's'}</span>` : ''}</td>
        <td class="hide-sm">${confidenceDots(offer.confidence)}</td>
        <td><span class="icon-arrow">${icon('arrow-up-right', 11)}</span></td>
      </tr>`;
    })
    .join('');
}

function ledgerMarkup(report, positionById) {
  const counts = {
    all: report.offers.length,
    mirrors: report.offers.filter((offer) => offer.comparison?.kind === 'same_listing').length,
    comparables: report.offers.filter((offer) => offer.comparison?.kind === 'comparable').length,
    below: report.offers.filter((offer) => {
      const vs = percentVsOwn(offer, positionById);
      return vs !== null && vs < -0.05;
    }).length,
    lone: report.offers.filter((offer) => !offer.comparison).length,
  };
  if (!report.offers.length) {
    return `<div class="card ledger-card" id="offer-ledger">
      <div class="ledger-head"><div><div class="ledger-title">Offer ledger</div><div class="position-sub">Every unique market offer Scout extracted.</div></div></div>
      <div style="padding:0 24px 24px">${emptyState({
        title: 'No offers survived the filters',
        message: 'The sources responded, but nothing matched the brief closely enough. Try widening the geography or relaxing the budget.',
        mark: 'search',
      })}</div>
    </div>`;
  }

  return `<div class="card ledger-card" id="offer-ledger">
    <div class="ledger-head">
      <div>
        <div class="ledger-title">Offer ledger <span>${report.offers.length} unique</span></div>
        <div class="position-sub">Deduplicated offers, normalised to EUR. Select a row for the extraction evidence.</div>
      </div>
      <a class="text-button" href="${api.exportJsonUrl(report.run.id)}" download>Download JSON ${icon('download', 12)}</a>
    </div>
    <div class="ledger-toolbar">
      <div class="segmented" role="group" aria-label="Filter offers">
        <button class="segment active" type="button" data-ledger-filter="all">All <span>${counts.all}</span></button>
        <button class="segment" type="button" data-ledger-filter="mirrors">Mirrors <span>${counts.mirrors}</span></button>
        <button class="segment" type="button" data-ledger-filter="comparables">Comparables <span>${counts.comparables}</span></button>
        <button class="segment" type="button" data-ledger-filter="below">Below your ask <span>${counts.below}</span></button>
        <button class="segment" type="button" data-ledger-filter="lone">Market only <span>${counts.lone}</span></button>
      </div>
      <div class="ledger-search">
        ${icon('search', 12)}
        <input type="search" placeholder="Search offers, places, sources" data-ledger-search aria-label="Search offers">
      </div>
      <select class="ledger-sort" data-ledger-sort aria-label="Sort offers">
        <option value="priority">Priority</option>
        <option value="price">Price: low to high</option>
        <option value="gap">Biggest gap</option>
      </select>
    </div>
    <div class="table-wrap ledger-scroll" tabindex="0" role="region" aria-label="Offer ledger, scrollable list">
      <table class="data-table ledger-table">
        <thead>
          <tr>
            <th>Offer</th>
            <th class="hide-sm">Source</th>
            <th class="hide-sm">Specs</th>
            <th>Ask</th>
            <th>Offer vs your ask</th>
            <th>Match</th>
            <th class="hide-sm">Confidence</th>
            <th></th>
          </tr>
        </thead>
        <tbody data-ledger-body>
          ${ledgerRows(report, positionById)}
          <tr data-ledger-empty hidden><td colspan="8" class="no-rows">No offers match this filter.</td></tr>
        </tbody>
      </table>
    </div>
    <div class="ledger-foot">
      <span><strong data-visible-count>${report.offers.length}</strong> offer${report.offers.length === 1 ? '' : 's'} match · scroll or expand to review all</span>
      <span style="display:inline-flex;align-items:center;gap:12px">
        <span>${report.overview.duplicatesCollapsed} duplicate${report.overview.duplicatesCollapsed === 1 ? '' : 's'} collapsed · ${report.overview.currencyAdjusted} FX-normalised</span>
        <button class="text-button" type="button" data-ledger-expand aria-expanded="false">Expand all</button>
      </span>
    </div>
  </div>`;
}

function coverageMarkup(report) {
  const o = report.overview;
  const rejected = Object.entries(o.rejectionReasons || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([reason, count]) => `${count} ${humanRejection(reason)}`)
    .join(' · ');
  const sourceChips = (report.sources || [])
    .slice(0, 10)
    .map((source) => `<span class="coverage-source" title="${esc(source.domain)}">${esc(source.name)} <strong>${source.offers}</strong></span>`)
    .join('');
  const discovered = report.discoveredSources?.length
    ? `<div class="discovered-block"><span>New to the catalogue:</span>${report.discoveredSources
        .map((source) => `<span class="discovered-pill">${esc(source.name)}</span>`)
        .join('')}<span class="muted">— saved for the next search.</span></div>`
    : '';

  return `<div class="card coverage-card">
    <div class="card-head" style="margin-bottom:0">
      <div>
        <div class="position-title">Search coverage</div>
        <div class="position-sub">What the agent read, rejected and added to the source catalogue.</div>
      </div>
      <span class="chip">${icon('shield', 11)} auditable</span>
    </div>
    <div class="coverage-grid">
      <div class="coverage-fact"><span>Sources responded</span><strong>${o.sourcesResponded}<small style="font-size:11px;color:var(--faint)"> / ${o.sourcesQueried}</small></strong><small>${o.sourceFailures ? `${o.sourceFailures} failed` : 'No source failures'}</small></div>
      <div class="coverage-fact"><span>Duplicates collapsed</span><strong>${o.duplicatesCollapsed}</strong><small>${o.uniqueOffers} unique offers kept</small></div>
      <div class="coverage-fact"><span>Results filtered</span><strong>${o.offersRejected}</strong><small>${rejected || 'Nothing rejected'}</small></div>
      <div class="coverage-fact"><span>Prices normalised</span><strong>${o.currencyAdjusted}</strong><small>non-EUR offers converted</small></div>
    </div>
    ${sourceChips ? `<div class="coverage-sources">${sourceChips}</div>` : ''}
    ${discovered}
  </div>`;
}

export function reportMarkup(report) {
  const positionById = new Map((report.positions || []).map((position) => [position.property.id, position]));
  const o = report.overview;
  const delta = o.medianDeltaPct;
  const gapLabel = report.filters.transaction === 'rent' ? 'Annualised gap' : 'Gap at stake';
  const gapFoot = report.filters.transaction === 'rent' ? 'Across flagged long lets' : 'One-off across flagged sales';
  const modeLabel = report.run.mode === 'demo' ? 'Simulation' : 'Live web';
  const deltaTone = delta === null ? '' : delta > 7 ? 'negative' : delta < -7 ? 'positive' : '';
  const comparableTotal = report.positions.reduce((sum, position) => sum + (position.comparableCount || 0), 0);

  return `<section class="report" id="report" aria-labelledby="report-title">
    <header class="report-head">
      <div class="report-heading">
        <div class="eyebrow">Scout report <span style="color:var(--line-strong)">/</span> run ${esc(shortId(report.run.id))}</div>
        <h2 id="report-title" tabindex="-1">${esc(report.headline)}</h2>
        <p class="report-summary">${esc(report.summary)}</p>
        <div class="report-meta">
          <span>${esc(modeLabel)}</span><span class="meta-divider"></span>
          <span>Iteration ${report.run.iteration}</span><span class="meta-divider"></span>
          <span>Thread ${esc(splitThread(report.run.threadId))}</span><span class="meta-divider"></span>
          <span>${formatDateTime(report.run.finishedAt || report.generatedAt)}</span><span class="meta-divider"></span>
          <span>${formatDuration(report.run.durationMs)}</span>
        </div>
      </div>
      <div class="report-actions">
        <a class="button button-quiet button-sm" href="${api.exportCsvUrl(report.run.id)}" download>${icon('download', 14)} Export CSV</a>
        <button class="button button-quiet button-sm" type="button" data-print-report>${icon('printer', 14)} Print</button>
        <button class="button button-primary button-sm" type="button" data-refine-brief>${icon('spark', 14)} Refine brief</button>
      </div>
    </header>

    <div class="kpi-grid">
      ${kpiCard({
        label: 'Unique market offers',
        value: fmtNumber(o.uniqueOffers),
        foot: `${fmtNumber(o.offersFound)} found · ${o.duplicatesCollapsed} duplicate${o.duplicatesCollapsed === 1 ? '' : 's'} collapsed`,
      })}
      ${kpiCard({
        label: 'Median price position',
        value: `${delta === null ? '—' : `+${delta.toFixed(1)}`.replace('+-', '-') + '%'}`,
        foot: `${o.ownListingsBenchmarked} listing${o.ownListingsBenchmarked === 1 ? '' : 's'} vs comparables · ±7% corridor`,
        tone: deltaTone,
      })}
      ${kpiCard({
        label: 'Listings benchmarked',
        value: `${o.ownListingsBenchmarked}`,
        unit: `/ ${o.ownListingsInScope}`,
        foot: `${o.overpriced} above · ${o.underpriced} below · ${o.competitive} at market`,
      })}
      ${kpiCard({
        label: 'Portal mirrors',
        value: fmtNumber(o.mirrors),
        foot: `${o.mirrorUndercuts} undercut your portal ask`,
        tone: o.mirrorUndercuts ? 'negative' : '',
      })}
      ${kpiCard({
        label: gapLabel,
        value: o.annualGap ? fmtMoney(o.annualGap, 'EUR', { compact: true }) : '€0',
        foot: gapFoot,
      })}
    </div>

    <div class="analysis-grid">
      <div class="card findings-card">
        <div class="findings-head">
          <div>
            <div class="findings-title">What Scout found</div>
            <div class="findings-sub">Prioritised actions. Open a finding to inspect the underlying listing.</div>
          </div>
          <span class="chip">${report.recommendations.length} finding${report.recommendations.length === 1 ? '' : 's'}</span>
        </div>
        ${findingsMarkup(report, positionById)}
      </div>
      ${pulseMarkup(report)}
    </div>

    ${positionsMarkup(report)}
    ${ledgerMarkup(report, positionById)}
    ${coverageMarkup(report)}

    <div class="report-method">
      ${icon('info', 14)}
      <div>
        Benchmark method: same city and property type, bedroom count within one, area between 60–160% of the listing, feature overlap scored. Comparable median = 50th percentile. The ±7% corridor defines “at market”. ${comparableTotal} comparable offer${comparableTotal === 1 ? '' : 's'} fed this report.
        <button class="text-button" type="button" data-open-method>Read the full method</button>
      </div>
    </div>
  </section>`;
}

/* -------------------------------------------------------------------------- */
/* Drawer content                                                              */
/* -------------------------------------------------------------------------- */

function priceDistribution(position) {
  const prices = (position.comparablePrices || []).filter((value) => Number.isFinite(value));
  if (!prices.length) return '<p class="drawer-note">No comparable prices to plot.</p>';
  const own = position.property.price;
  const median = position.market?.median ?? own;
  const values = [...prices, own];
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const pad = Math.max((rawMax - rawMin) * 0.1, 1);
  const min = rawMin - pad;
  const max = rawMax + pad;
  const width = 520;
  const height = 126;
  const left = 14;
  const right = width - 14;
  const x = (value) => left + ((value - min) / Math.max(max - min, 1)) * (right - left);
  const dotsMarkup = prices
    .slice(0, 40)
    .map((value, index) => {
      const jitter = 18 + ((index * 23) % 38);
      return `<circle cx="${x(value).toFixed(1)}" cy="${jitter}" r="3.1" fill="#8fa495" opacity="${0.55 + ((index % 4) * 0.1).toFixed(2)}"/>`;
    })
    .join('');
  const medianX = x(median);
  const ownX = x(own);
  const fmt = (value) => esc(fmtMoney(value, 'EUR', { compact: true }));
  return `<div class="distribution">
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Comparable price distribution with your asking price">
      <line x1="${left}" y1="96" x2="${right}" y2="96" stroke="#d8cdbb" stroke-width="1"/>
      <line x1="${medianX}" y1="10" x2="${medianX}" y2="96" stroke="#173b2f" stroke-width="1" stroke-dasharray="3 3" opacity=".55"/>
      <line x1="${ownX}" y1="10" x2="${ownX}" y2="96" stroke="#c05b37" stroke-width="1.4"/>
      <circle cx="${ownX}" cy="96" r="4.5" fill="#c05b37" stroke="#fbf7ee" stroke-width="2"/>
      ${dotsMarkup}
      <text x="${left}" y="116" class="chart-label">${fmt(rawMin)}</text>
      <text x="${right}" y="116" text-anchor="end" class="chart-label">${fmt(rawMax)}</text>
      <text x="${medianX}" y="116" text-anchor="middle" class="chart-label">median ${fmt(median)}</text>
    </svg>
    <div class="chart-caption"><span>${prices.length} comparable offer${prices.length === 1 ? '' : 's'} · your ask ${esc(fmtMoney(own))}</span><span>fixed FX · EUR</span></div>
    <div class="dist-legend">
      <span><i style="background:#8fa495"></i>Comparables</span>
      <span><i style="background:#c05b37"></i>Your ask</span>
      <span><i style="background:#173b2f"></i>Median</span>
    </div>
  </div>`;
}

function propertySpecs(property) {
  return [
    ['Property type', typeLabel(property.type)],
    ['Bedrooms', `${property.bedrooms} bed`],
    ['Bathrooms', `${property.bathrooms} bath`],
    ['Living area', fmtArea(property.area_m2)],
    ['Transaction', property.transaction === 'rent' ? 'Long-term rental' : 'Sale'],
    ['Location', property.neighborhood ? `${property.neighborhood}, ${property.city}` : property.city],
  ];
}

function offerDrawerBody(offer, report) {
  const positionById = new Map((report.positions || []).map((position) => [position.property.id, position]));
  const position = offer.comparison ? positionById.get(offer.comparison.propertyId) : null;
  const ownPrice = position?.property.price ?? null;
  const vsOwn = ownPrice ? ((offer.price_eur - ownPrice) / ownPrice) * 100 : null;
  const source = offer.source || {};
  const demo = report.run.mode === 'demo';
  const reasons = offer.comparison?.reasons || [];
  const link = safeUrl(offer.url);
  return `<div class="drawer-hero">
    <img src="${propertyImage(offer.type)}" alt="">
    <span class="media-price">${fmtMoney(offer.price_eur)} <small>${offer.period === 'month' ? '/mo' : 'total'}</small></span>
  </div>
  <div class="drawer-section">
    <div class="drawer-price-row">
      <div>
        <div class="drawer-kicker" style="color:var(--muted)">${esc(source.name || 'Market offer')}</div>
        <div class="drawer-price">${fmtMoney(offer.price_eur)} <small>${offer.period === 'month' ? 'per month' : 'total'}</small></div>
        ${offer.currency !== 'EUR' ? `<div class="drawer-note">Listed in ${esc(offer.currency)} at ${esc(fmtMoney(offer.price, offer.currency))} · converted at fixed FX.</div>` : ''}
      </div>
      ${offer.comparison?.kind === 'same_listing' ? '<span class="badge badge-terracotta">Mirror of your listing</span>' : offer.comparison ? '<span class="badge badge-neutral">Comparable</span>' : '<span class="badge badge-neutral">Market only</span>'}
    </div>
    <div class="meta-grid">
      <div class="meta-cell"><span>Location</span><strong>${esc(offer.neighborhood ? `${offer.neighborhood}, ${offer.city}` : offer.city || '—')}</strong></div>
      <div class="meta-cell"><span>Property type</span><strong>${esc(typeLabel(offer.type))}</strong></div>
      <div class="meta-cell"><span>Bedrooms</span><strong>${offer.bedrooms ?? '—'}</strong></div>
      <div class="meta-cell"><span>Area</span><strong>${offer.area_m2 ? fmtArea(offer.area_m2) : 'Not stated'}</strong></div>
      <div class="meta-cell"><span>Advertised by</span><strong>${esc(offer.seller || source.name || '—')}</strong></div>
      <div class="meta-cell"><span>Source</span><strong>${esc(source.domain || '—')}</strong></div>
    </div>
  </div>
  ${
    position
      ? `<div class="drawer-section">
          <div class="drawer-section-title">Against your portfolio</div>
          <div class="comparison-box" data-open-property="${esc(position.property.id)}">
            <div>
              <div class="ref">${esc(position.property.ref)} · your ask</div>
              <div class="title">${esc(position.property.title)}</div>
              <div class="ask">${fmtPrice(position.property.price, position.property.transaction)} ${vsOwn !== null ? `<span class="delta ${vsOwn < 0 ? 'is-below' : 'is-above'}" style="margin-left:6px">${fmtPct(vsOwn)}</span>` : ''}</div>
            </div>
            <span class="icon-arrow">${icon('chevron-right', 11)}</span>
          </div>
          ${reasons.length ? `<ul class="drawer-list" style="margin-top:13px">${reasons.map((reason) => `<li>${esc(reason)}</li>`).join('')}</ul>` : ''}
          <div class="drawer-note">Match confidence ${offer.comparison.score}% · ${offer.comparison.kind === 'same_listing' ? 'treated as a duplicate of your listing, not as a market comparable' : 'used as a comparable for the price benchmark'}.</div>
        </div>`
      : `<div class="drawer-section"><div class="drawer-section-title">Portfolio match</div><p class="drawer-lede">Scout could not tie this offer to one of your listings. It is counted in the market scan but excluded from positioning.</p></div>`
  }
  <div class="drawer-section">
    <div class="drawer-section-title">Extraction evidence</div>
    <div class="evidence">${esc(offer.snippet || 'No snippet captured for this offer.')}</div>
    <div class="confidence-large" style="margin-top:12px">
      <div class="confidence-meter"><span style="width:${Math.round((offer.confidence || 0) * 100)}%"></span></div>
      <strong>${Math.round((offer.confidence || 0) * 100)}% confidence</strong>
    </div>
    ${offer.duplicateCount ? `<div class="drawer-note">${offer.duplicateCount} duplicate cop${offer.duplicateCount === 1 ? 'y' : 'ies'} of this listing ${offer.duplicateCount === 1 ? 'was' : 'were'} collapsed across sources before benchmarking.</div>` : ''}
  </div>
  ${
    offer.features?.length
      ? `<div class="drawer-section"><div class="drawer-section-title">Features detected</div><div class="tag-list">${offer.features.map((f) => `<span class="tag">${esc(f)}</span>`).join('')}</div></div>`
      : ''
  }
  <div class="drawer-section">
    <div class="drawer-actions">
      ${
        !demo && link
          ? `<a class="button button-quiet button-sm" href="${esc(link)}" target="_blank" rel="noopener noreferrer">${icon('external', 13)} Open on ${esc(source.domain || 'source')}</a>`
          : `<span class="chip">${icon('info', 11)} Demo listing URL is simulated</span>`
      }
    </div>
    <p class="drawer-note">Scout records asking prices. Availability, condition and floor plans must be verified with the advertiser before a client presentation.</p>
  </div>`;
}

function positionDrawerBody(position, report) {
  const property = position.property;
  const demo = report.run.mode === 'demo';
  const link = safeUrl(property.url);
  const matches = (position.matches || [])
    .filter((match) => match.kind === 'comparable')
    .slice(0, 6);
  const market = position.market;
  const deltaText = position.deltaPct === null ? '—' : fmtPct(position.deltaPct);
  const deltaColor = position.deltaPct === null ? 'var(--muted)' : position.deltaPct > 7 ? 'var(--red)' : position.deltaPct < -7 ? 'var(--green)' : 'var(--gold)';
  return `<div class="drawer-hero">
    <img src="${propertyImage(property.type)}" alt="">
    <span class="media-price">${fmtMoney(property.price)} <small>${property.transaction === 'rent' ? '/mo' : 'total'}</small></span>
  </div>
  <div class="drawer-section">
    <div class="drawer-kicker" style="color:var(--muted)">${esc(property.ref)} · ${esc(property.city)}</div>
    <h3 style="margin-top:4px;font-family:var(--font-display);font-size:28px;font-weight:500;letter-spacing:-.02em;line-height:1.12">${esc(property.title)}</h3>
    <p class="drawer-lede" style="margin-top:10px">${esc(property.blurb || '')}</p>
    <div class="drawer-actions" style="margin-top:15px">
      <button class="button button-primary button-sm" type="button" data-scout-property>${icon('compass', 14)} Scout this home</button>
      ${!demo && link ? `<a class="button button-quiet button-sm" href="${esc(link)}" target="_blank" rel="noopener noreferrer">${icon('external', 13)} View listing</a>` : ''}
    </div>
  </div>
  <div class="drawer-section">
    <div class="meta-grid">
      ${propertySpecs(property)
        .map(([label, value]) => `<div class="meta-cell"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`)
        .join('')}
    </div>
  </div>
  ${
    market
      ? `<div class="drawer-section">
          <div class="drawer-section-title">Market benchmark</div>
          <div class="drawer-price-row">
            <div>
              <div class="drawer-price" style="color:${deltaColor}">${deltaText}</div>
              <div class="drawer-note">vs comparable median of ${fmtMoney(market.median)}${property.transaction === 'rent' ? '/month' : ''} · ${position.comparableCount} comparables</div>
            </div>
            <div style="text-align:right">
              <span class="section-kicker">Suggested ask</span>
              <div style="margin-top:4px;font-family:var(--font-display);font-size:22px">${fmtMoney(position.recommendedPrice)}</div>
            </div>
          </div>
          ${priceDistribution(position)}
          <div class="meta-grid" style="margin-top:13px">
            <div class="meta-cell"><span>Market p25</span><strong>${fmtMoney(market.p25)}</strong></div>
            <div class="meta-cell"><span>Market median</span><strong>${fmtMoney(market.median)}</strong></div>
            <div class="meta-cell"><span>Market p75</span><strong>${fmtMoney(market.p75)}</strong></div>
            <div class="meta-cell"><span>Your percentile</span><strong>${position.percentile === null ? '—' : `${position.percentile}th`}</strong></div>
          </div>
          <p class="drawer-lede" style="margin-top:14px">${esc(position.recommendation)}</p>
          ${
            position.mirrors?.length
              ? `<div class="drawer-section-title" style="margin-top:18px">Portal mirrors</div>${position.mirrors
                  .map((mirror) => {
                    const source = report.sources.find((item) => item.id === mirror.sourceId);
                    return `<div class="comparison-box" data-open-offer="${esc(mirror.offerId)}" style="margin-top:8px">
                      <div><div class="ref">${esc(source?.name || 'Competitor portal')}</div><div class="title">${fmtMoney(mirror.price_eur)}${property.transaction === 'rent' ? '/mo' : ''}</div><div class="ask">${mirror.gapVsOwnPct > 0 ? `${mirror.gapVsOwnPct.toFixed(1)}% below your ask` : `${Math.abs(mirror.gapVsOwnPct).toFixed(1)}% above your ask`}</div></div>
                      <span class="icon-arrow">${icon('arrow-up-right', 11)}</span>
                    </div>`;
                  })
                  .join('')}`
              : ''
          }
        </div>`
      : `<div class="drawer-section"><div class="drawer-section-title">Market benchmark</div><p class="drawer-lede">Not enough comparable offers were found for this listing in this run. Widen the brief to establish a market median.</p></div>`
  }
  ${
    matches.length
      ? `<div class="drawer-section">
          <div class="drawer-section-title">Comparable offers used</div>
          ${matches
            .map(
              (match) => `<div class="comparison-box" data-open-offer="${esc(match.offerId)}" style="margin-top:8px">
                <div><div class="ref">${esc(match.title)}</div><div class="ask">${fmtMoney(match.price_eur)}${property.transaction === 'rent' ? '/mo' : ''} · match ${match.score}%</div></div>
                <span class="icon-arrow">${icon('chevron-right', 11)}</span>
              </div>`
            )
            .join('')}
        </div>`
      : ''
  }
  ${
    property.features?.length
      ? `<div class="drawer-section"><div class="drawer-section-title">Features</div><div class="tag-list">${property.features.map((feature) => `<span class="tag">${esc(feature)}</span>`).join('')}</div></div>`
      : ''
  }
  <div class="drawer-section">
    <p class="drawer-note">${demo ? 'Demo portfolio listing — prices and references are illustrative. ' : ''}Scout compares asking prices, not availability. Always verify with the owner or agency before quoting a client.</p>
  </div>`;
}

function openOfferDrawer(offer, report, options = {}) {
  openDrawer({
    kicker: 'Market offer / extraction',
    title: offer.title,
    body: offerDrawerBody(offer, report),
    onMount(drawer) {
      const propertyButton = drawer.querySelector('[data-open-property]');
      const positionById = new Map((report.positions || []).map((position) => [position.property.id, position]));
      propertyButton?.addEventListener('click', () => {
        const position = positionById.get(propertyButton.dataset.openProperty);
        if (position) openPositionDrawer(position, report, options);
      });
    },
  });
}

function openPositionDrawer(position, report, options = {}) {
  openDrawer({
    kicker: `Portfolio / ${position.property.ref}`,
    title: position.property.title,
    body: positionDrawerBody(position, report),
    onMount(drawer) {
      drawer.querySelector('[data-scout-property]')?.addEventListener('click', () => {
        if (typeof options.onScoutProperty === 'function') {
          closeDrawer({ restoreFocus: false });
          options.onScoutProperty(position.property);
        } else {
          sessionStorage.setItem(
            'scout:prefill',
            JSON.stringify({ brief: prefillFromProperty(position.property), threadId: report.run.threadId })
          );
          closeDrawer({ restoreFocus: false });
          location.hash = '#/scout';
        }
      });
      drawer.querySelectorAll('[data-open-offer]').forEach((node) => {
        node.addEventListener('click', () => {
          const offer = report.offers.find((item) => item.id === node.dataset.openOffer);
          if (offer) openOfferDrawer(offer, report, options);
        });
      });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Mounting & interactions                                                     */
/* -------------------------------------------------------------------------- */

export function mountReport(root, report, options = {}) {
  const container = root.querySelector?.('#report') || root;
  if (!container) return;
  const positionById = new Map((report.positions || []).map((position) => [position.property.id, position]));
  const tbody = container.querySelector('[data-ledger-body]');
  const emptyRow = container.querySelector('[data-ledger-empty]');
  const searchInput = container.querySelector('[data-ledger-search]');
  const sortSelect = container.querySelector('[data-ledger-sort]');
  const visibleCount = container.querySelector('[data-visible-count]');
  const expandButton = container.querySelector('[data-ledger-expand]');
  const ledgerScroll = container.querySelector('.ledger-scroll');
  const state = { filter: 'all', search: '', sort: 'priority' };

  function rowMatches(row) {
    const filter = state.filter;
    if (filter === 'mirrors' && row.dataset.kind !== 'same_listing') return false;
    if (filter === 'comparables' && row.dataset.kind !== 'comparable') return false;
    if (filter === 'below' && row.dataset.below !== '1') return false;
    if (filter === 'lone' && row.dataset.kind !== 'none') return false;
    if (state.search && !(row.dataset.search || '').includes(state.search)) return false;
    return true;
  }

  function sortRows() {
    if (!tbody) return;
    const rows = [...tbody.querySelectorAll('tr[data-offer-id]')];
    rows.sort((a, b) => {
      if (state.sort === 'price') return Number(a.dataset.price) - Number(b.dataset.price);
      if (state.sort === 'gap') return Number(b.dataset.gap) - Number(a.dataset.gap);
      return Number(a.dataset.priority) - Number(b.dataset.priority);
    });
    for (const row of rows) tbody.appendChild(row);
    tbody.appendChild(emptyRow);
  }

  expandButton?.addEventListener('click', () => {
    const expanded = ledgerScroll.classList.toggle('expanded');
    expandButton.textContent = expanded ? 'Collapse list' : 'Expand all';
    expandButton.setAttribute('aria-expanded', String(expanded));
    if (!expanded) ledgerScroll.scrollTop = 0;
  });

  function applyFilters() {
    if (!tbody) return;
    let count = 0;
    tbody.querySelectorAll('tr[data-offer-id]').forEach((row) => {
      const visible = rowMatches(row);
      row.hidden = !visible;
      if (visible) count += 1;
    });
    if (emptyRow) emptyRow.hidden = count !== 0;
    if (visibleCount) visibleCount.textContent = String(count);
  }

  container.querySelectorAll('[data-ledger-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      container.querySelectorAll('[data-ledger-filter]').forEach((node) => node.classList.remove('active'));
      button.classList.add('active');
      state.filter = button.dataset.ledgerFilter;
      applyFilters();
    });
  });

  searchInput?.addEventListener('input', () => {
    state.search = searchInput.value.trim().toLowerCase();
    applyFilters();
  });

  sortSelect?.addEventListener('change', () => {
    state.sort = sortSelect.value;
    sortRows();
    applyFilters();
  });

  container.querySelector('[data-print-report]')?.addEventListener('click', () => {
    window.print();
  });

  container.querySelector('[data-refine-brief]')?.addEventListener('click', () => {
    if (typeof options.onRefine === 'function') {
      options.onRefine(report);
    } else {
      sessionStorage.setItem('scout:prefill', JSON.stringify({ brief: report.run.brief, threadId: report.run.threadId }));
      location.hash = '#/scout';
      location.reload();
    }
  });

  function handleOfferOpen(offerId) {
    const offer = report.offers.find((item) => item.id === offerId);
    if (offer) openOfferDrawer(offer, report, options);
  }

  function handlePositionOpen(propertyId) {
    const position = positionById.get(propertyId);
    if (position) openPositionDrawer(position, report, options);
  }

  tbody?.addEventListener('click', (event) => {
    const row = event.target.closest('tr[data-offer-id]');
    if (!row) return;
    handleOfferOpen(row.dataset.offerId);
  });

  tbody?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = event.target.closest('tr[data-offer-id]');
    if (!row) return;
    event.preventDefault();
    handleOfferOpen(row.dataset.offerId);
  });

  container.querySelectorAll('tr[data-property-id]').forEach((row) => {
    row.addEventListener('click', () => handlePositionOpen(row.dataset.propertyId));
    row.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      handlePositionOpen(row.dataset.propertyId);
    });
  });

  container.querySelectorAll('[data-finding-offer], [data-finding-property]').forEach((node) => {
    const handler = () => {
      if (node.dataset.findingOffer) handleOfferOpen(node.dataset.findingOffer);
      else if (node.dataset.findingProperty) handlePositionOpen(node.dataset.findingProperty);
    };
    node.addEventListener('click', handler);
    node.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handler();
      }
    });
  });

  sortRows();
  applyFilters();

  if (options.focusReport) {
    requestAnimationFrame(() => container.querySelector('#report-title')?.focus({ preventScroll: true }));
  }
}

export function showReportIn(container, report, options = {}) {
  container.innerHTML = reportMarkup(report);
  mountReport(container, report, options);
}

export function reportFailureMarkup(run) {
  const cancelled = run.status === 'cancelled';
  return `<div class="card run-failure">
    <div class="failure-mark">${cancelled ? '—' : '!'}</div>
    <div class="eyebrow">${cancelled ? 'Run cancelled' : 'Run failed'}</div>
    <h2>${cancelled ? 'Scout stopped before the report.' : 'This search did not complete.'}</h2>
    <p>${esc(run.error || 'The agent could not finish this run. No partial results have been presented as facts.')}</p>
    <div class="drawer-actions">
      <button class="button button-primary button-sm" type="button" data-run-again>${icon('refresh', 13)} Start a new run</button>
      <a class="button button-quiet button-sm" href="#/runs">${icon('arrow-left', 13)} Back to run history</a>
    </div>
  </div>`;
}
