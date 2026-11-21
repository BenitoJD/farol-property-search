import { api, openRunStream, portalUrl } from '../api.js';
import {
  avatarClass,
  choiceLabel,
  clientDecisionIcon,
  confidenceLabel,
  copyText,
  decisionChip,
  escapeAttr,
  escapeHtml,
  formatDate,
  formatMonth,
  icon,
  initials,
  money,
  moneyPerM2,
  openModal,
  percent,
  plural,
  priceChip,
  priceVerdict,
  propertyAlt,
  propertyImage,
  relativeTime,
  stageIndex,
  stagePill,
  STAGES,
  toast,
} from '../ui.js';

const EVENT_ICONS = {
  enquiry: 'mail',
  requirements: 'check-circle',
  inventory: 'home',
  search: 'sparkles',
  shortlist: 'users',
  feedback: 'quote',
  closed: 'flag',
  iteration: 'refresh',
  catalogue: 'globe',
  case: 'settings',
};

const PHASE_LABELS = {
  catalogue: 'Catalogue',
  plan: 'Plan',
  search: 'Search',
  discover: 'Discovery',
  extract: 'Extract',
  filter: 'Filter',
  dedupe: 'Dedupe',
  rank: 'Rank',
  price: 'Price',
  complete: 'Done',
  inventory: 'Inventory',
  queued: 'Queued',
};

function duration(ms) {
  if (!Number.isFinite(Number(ms))) return '—';
  const value = Number(ms);
  if (value < 1000) return `${Math.round(value)} ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}s`;
  return `${Math.floor(value / 60_000)}m ${String(Math.round((value % 60_000) / 1000)).padStart(2, '0')}s`;
}

function fact(label, value) {
  if (!value) return '';
  return `<div class="fact"><span class="fact-label">${escapeHtml(label)}</span><span class="fact-value">${value}</span></div>`;
}

function requirementFacts(requirement) {
  if (!requirement) return '';
  const budget = requirement.budgetMax
    ? `${requirement.budgetMax ? money(requirement.budgetMax, { period: requirement.transaction === 'rent' ? 'month' : null }) : '—'}${requirement.budgetMin ? ` from ${money(requirement.budgetMin, { period: requirement.transaction === 'rent' ? 'month' : null })}` : ''}`
    : 'To confirm';
  const beds =
    requirement.bedroomsMin !== null && requirement.bedroomsMin !== undefined
      ? `${requirement.bedroomsMin}${requirement.bedroomsMax && requirement.bedroomsMax !== requirement.bedroomsMin ? `–${requirement.bedroomsMax}` : ''} bedrooms`
      : 'Flexible';
  return `<div class="facts-grid">
    ${fact('Transaction', requirement.transaction === 'rent' ? 'Long let' : 'Purchase')}
    ${fact('Budget', escapeHtml(budget))}
    ${fact('Location', requirement.locations.length ? escapeHtml(requirement.locations.join(' / ')) : 'To confirm')}
    ${fact('Type', requirement.propertyTypes.length ? escapeHtml(requirement.propertyTypes.join(' / ')) : 'Open to options')}
    ${fact('Bedrooms', escapeHtml(beds))}
    ${fact('Move-in', requirement.moveIn ? escapeHtml(formatMonth(requirement.moveIn)) : requirement.transaction === 'sale' ? 'Flexible' : 'To confirm')}
  </div>`;
}

function featureChips(features, { tone = 'must' } = {}) {
  if (!features?.length) return '<span class="muted">None recorded</span>';
  return `<div class="chip-row">${features
    .map(
      (feature) =>
        `<span class="feature-chip feature-${tone}">${icon(tone === 'must' ? 'check' : 'plus', 12)} ${escapeHtml(feature)}</span>`
    )
    .join('')}</div>`;
}

function stageRail(bundle) {
  const current = stageIndex(bundle.case.stage);
  const closed = bundle.case.stage === 'closed';
  const skippedInventory =
    bundle.case.transaction === 'sale' || bundle.inventoryCheck?.outcome === 'not_applicable';
  return `<div class="stage-rail" aria-label="Case stage">
    ${STAGES.map((stage, index) => {
      let state = 'upcoming';
      if (closed || index < current) state = 'done';
      if (!closed && index === current) state = 'current';
      if (stage.key === 'inventory' && skippedInventory) state = 'skipped';
      return `<button class="stage-step stage-${state}" type="button" data-scroll="${stage.key}">
        <span class="stage-step-dot">${state === 'done' ? icon('check', 13) : state === 'skipped' ? icon('minus', 13) : icon(stage.icon, 14)}</span>
        <span class="stage-step-copy">
          <span class="stage-step-label">${escapeHtml(stage.label)}</span>
          <span class="stage-step-state">${state === 'done' ? 'Done' : state === 'current' ? 'Current' : state === 'skipped' ? 'Skipped' : '—'}</span>
        </span>
      </button>`;
    }).join('')}
  </div>`;
}

function headerActions(bundle) {
  const { case: caseRow, activeRun, currentRequirement, draftRequirement, shortlist, feedback, inventoryCheck } = bundle;
  let primary = null;
  if (caseRow.stage === 'closed') {
    primary = { label: 'Export case', action: 'export-case', icon: 'download' };
  } else if (activeRun) {
    primary = { label: 'View live search', action: 'focus-search', icon: 'sparkles' };
  } else if (
    !currentRequirement ||
    (draftRequirement &&
      !draftRequirement.confirmedAt &&
      (!currentRequirement || draftRequirement.version > currentRequirement.version))
  ) {
    primary = {
      label: currentRequirement || draftRequirement ? 'Confirm requirements' : 'Record requirements',
      action: 'edit-requirements',
      icon: 'check-circle',
    };
  } else if (caseRow.stage === 'inventory') {
    if (inventoryCheck?.outcome === 'gap') {
      primary = { label: 'Start AI search', action: 'start-search', icon: 'sparkles' };
    } else if (inventoryCheck?.outcome === 'suitable') {
      primary = { label: 'Review matches', action: 'focus-review', icon: 'users' };
    } else {
      primary = { label: 'Check inventory', action: 'check-inventory', icon: 'home' };
    }
  } else if (caseRow.stage === 'ai_search') {
    primary = { label: 'Run AI search', action: 'start-search', icon: 'sparkles' };
  } else if (caseRow.stage === 'review') {
    primary = shortlist
      ? { label: 'Review & share', action: 'focus-client', icon: 'send' }
      : { label: 'Build shortlist', action: 'focus-review', icon: 'users' };
  } else if (caseRow.stage === 'client') {
    if (feedback?.length && feedback[0].overall === 'refine') {
      primary = { label: 'Create iteration', action: 'iterate', icon: 'refresh' };
    } else if (feedback?.length) {
      primary = { label: 'Close as won', action: 'close-case', icon: 'check-circle' };
    } else {
      primary = { label: 'Copy client link', action: 'copy-client-link', icon: 'link' };
    }
  }

  const shared = shortlist && ['shared', 'feedback'].includes(shortlist.status);
  return `<div class="case-actions">
    ${shared ? `<a class="button button-ghost" href="/portal/${escapeAttr(shortlist.token)}" target="_blank" rel="noopener">${icon('eye', 15)} Client view</a>` : ''}
    ${primary ? `<button class="button button-primary" type="button" data-action="${primary.action}">${icon(primary.icon, 15)} ${escapeHtml(primary.label)}</button>` : ''}
    <details class="more-menu">
      <summary class="button button-icon-only" aria-label="More case actions">${icon('dots', 18)}</summary>
      <div class="more-menu-panel">
        ${currentRequirement ? `<button type="button" data-action="edit-requirements">${icon('file', 15)} Edit requirements</button>` : ''}
        ${caseRow.transaction === 'rent' && caseRow.stage !== 'closed' ? `<button type="button" data-action="recheck-inventory">${icon('refresh', 15)} Recheck inventory</button>` : ''}
        ${!activeRun && bundle.latestRun?.status === 'completed' && caseRow.stage !== 'closed' ? `<button type="button" data-action="start-search">${icon('sparkles', 15)} Run search again</button>` : ''}
        <a href="/api/cases/${escapeAttr(caseRow.id)}/export.csv">${icon('download', 15)} Export shortlist CSV</a>
        <a href="/api/cases/${escapeAttr(caseRow.id)}/export.json" download>${icon('file', 15)} Export case JSON</a>
        ${activeRun ? `<button type="button" class="danger-text" data-action="cancel-run">${icon('stop', 15)} Cancel search</button>` : ''}
        ${caseRow.stage !== 'closed' ? `<button type="button" data-action="close-case">${icon('flag', 15)} Close case</button>` : ''}
      </div>
    </details>
  </div>`;
}

function priceSummaryBlock(summary, transaction, { compact = false } = {}) {
  if (!summary || !summary.count) {
    return `<div class="price-summary price-summary-empty">
      ${icon('chart', 20)}
      <div><strong>No comparable evidence yet</strong><span>Price checks appear when a search or inventory match produces comparable homes.</span></div>
    </div>`;
  }
  const unit = transaction === 'sale' ? '' : '/month';
  const deltaTone = summary.medianDeltaPct > 0 ? 'warn' : summary.medianDeltaPct < 0 ? 'good' : 'neutral';
  return `<div class="price-summary ${compact ? 'price-summary-compact' : ''}">
    <div class="price-summary-head">
      <span class="price-summary-icon">${icon('chart', 18)}</span>
      <div>
        <span class="kicker">Comparable price read</span>
        <strong>${escapeHtml(summary.narrative)}</strong>
      </div>
      <span class="delta-badge delta-${deltaTone}">${summary.medianDeltaPct === null ? '—' : percent(summary.medianDeltaPct)}</span>
    </div>
    <div class="price-summary-grid">
      <span><span class="meta-label">Asking total</span><b>${money(summary.askTotal, { period: transaction === 'rent' ? 'month' : null })}</b></span>
      <span><span class="meta-label">Comparable median</span><b>${money(summary.compMedianTotal, { period: transaction === 'rent' ? 'month' : null })}</b></span>
      <span><span class="meta-label">${summary.above ? 'Indicative negotiation room' : 'Position'}</span><b>${summary.above ? money(summary.monthlyHeadroom, { period: transaction === 'rent' ? 'month' : null }) : `${summary.at} at market`}</b></span>
    </div>
    <div class="verdict-bar" aria-label="${summary.above} above, ${summary.at} at, ${summary.below} below market">
      ${summary.above ? `<span class="verdict-bar-seg verdict-above" style="flex:${summary.above}"></span>` : ''}
      ${summary.at ? `<span class="verdict-bar-seg verdict-at" style="flex:${summary.at}"></span>` : ''}
      ${summary.below ? `<span class="verdict-bar-seg verdict-below" style="flex:${summary.below}"></span>` : ''}
    </div>
    <p class="price-disclaimer">Indicative analysis of asking prices${unit ? ' per month' : ''}, not a formal valuation. Availability is confirmed by the team.</p>
  </div>`;
}

function pricePanel(listing) {
  const check = listing.priceCheck;
  const verdict = priceVerdict(check);
  if (!check || !check.available) {
    return `<div class="price-panel price-panel-empty">
      <div class="price-panel-head"><span class="kicker">Comparable market</span><span class="confidence-label">${escapeHtml(confidenceLabel(check?.confidence || 'none'))}</span></div>
      <p>No comparable asking prices were captured for this home in the demo market. The team should widen the search before drawing a conclusion.</p>
    </div>`;
  }
  const transaction = listing.transaction;
  const low = Math.min(check.p25, listing.price) * 0.96;
  const high = Math.max(check.p75, listing.price) * 1.04;
  const span = high - low || 1;
  const position = (value) => `${Math.max(2, Math.min(98, ((value - low) / span) * 100)).toFixed(1)}%`;
  return `<div class="price-panel">
    <div class="price-panel-head">
      <div>
        <span class="kicker">Comparable market</span>
        <strong>${escapeHtml(verdict.label)}${check.deltaPct ? ` · ${percent(check.deltaPct)}` : ''}</strong>
      </div>
      <span class="confidence-label">${escapeHtml(confidenceLabel(check.confidence))} · ${plural(check.count, 'comparable')}</span>
    </div>
    <div class="price-panel-numbers">
      <span><span class="meta-label">Comparable median</span><b>${money(check.median, { period: transaction === 'rent' ? 'month' : null })}</b></span>
      <span><span class="meta-label">25th–75th percentile</span><b>${money(check.p25, { period: transaction === 'rent' ? 'month' : null })} – ${money(check.p75, { period: transaction === 'rent' ? 'month' : null })}</b></span>
      <span><span class="meta-label">Asking per m²</span><b>${check.pricePerM2 ? moneyPerM2(check.pricePerM2) : '—'}</b></span>
    </div>
    <div class="price-scale">
      <div class="price-scale-track">
        <span class="price-scale-band" style="left:${position(check.p25)};right:${100 - Number.parseFloat(position(check.p75))}%"></span>
        <span class="price-scale-median" style="left:${position(check.median)}"></span>
        <span class="price-scale-target" style="left:${position(listing.price)}"><span>${money(listing.price, { period: transaction === 'rent' ? 'month' : null })}</span></span>
      </div>
      <div class="price-scale-labels"><span>${money(check.p25, { period: transaction === 'rent' ? 'month' : null })}</span><span>median ${money(check.median, { period: transaction === 'rent' ? 'month' : null })}</span><span>${money(check.p75, { period: transaction === 'rent' ? 'month' : null })}</span></div>
    </div>
    ${check.verdict === 'above' ? `<div class="price-callout price-callout-warn">${icon('info', 15)} ${check.suggestedOffer ? `Indicative offer range ${money(check.offerLow, { period: transaction === 'rent' ? 'month' : null })}–${money(check.offerHigh, { period: transaction === 'rent' ? 'month' : null })}, about ${money(check.potentialSaving, { period: transaction === 'rent' ? 'month' : null })} below the ask.` : 'Above the comparable median.'}</div>` : ''}
    ${check.verdict === 'below' ? `<div class="price-callout price-callout-good">${icon('check-circle', 15)} Below the comparable median. Verify condition, lease terms and availability before treating the gap as value.</div>` : ''}
    ${check.verdict === 'at' ? `<div class="price-callout price-callout-neutral">${icon('target', 15)} Inside the ±${check.corridor}% comparable-market corridor.</div>` : ''}
    ${check.comparables.length ? `<div class="comparable-list">
      <span class="meta-label">Evidence used</span>
      ${check.comparables.slice(0, 4).map((comp) => `<div class="comparable-row">
        <span class="comparable-title">${escapeHtml(comp.title)}</span>
        <span class="comparable-meta">${escapeHtml(comp.sourceName)} · ${comp.bedrooms} bed · ${comp.areaM2 ? `${comp.areaM2} m²` : 'area n/a'}</span>
        <span class="comparable-price">${money(comp.price, { period: transaction === 'rent' ? 'month' : null })}</span>
      </div>`).join('')}
    </div>` : ''}
  </div>`;
}

function listingRow(listing, { selectable = false, checked = false } = {}) {
  const included = listing.included && listing.canonical;
  const duplicate = !listing.canonical && !listing.rejectReason;
  const kind = listing.rejectReason ? 'excluded' : duplicate ? 'duplicate' : included ? 'longlist' : 'other';
  const specs = [
    listing.bedrooms !== null ? `${listing.bedrooms} bed` : null,
    listing.bathrooms !== null ? `${listing.bathrooms} bath` : null,
    listing.areaM2 ? `${listing.areaM2} m²` : null,
    listing.available ? `from ${formatDate(listing.available, 'month')}` : null,
  ]
    .filter(Boolean)
    .map((item) => escapeHtml(item))
    .join('<span class="dot-sep">·</span>');

  return `<article class="listing-row" data-kind="${kind}" data-listing-id="${escapeAttr(listing.id)}" data-price="${listing.price}">
    <div class="listing-main">
      ${selectable && kind === 'longlist'
        ? `<label class="check"><input type="checkbox" data-select-listing value="${escapeAttr(listing.id)}" ${checked ? 'checked' : ''} /><span></span></label>`
        : `<span class="check-spacer"></span>`}
      <div class="listing-thumb">
        <img src="${propertyImage(listing)}" alt="${escapeAttr(propertyAlt(listing))}" loading="lazy" />
        ${listing.rank ? `<span class="rank-badge">${listing.rank}</span>` : ''}
      </div>
      <div class="listing-copy">
        <div class="listing-title-line">
          <strong>${escapeHtml(listing.title)}</strong>
          ${listing.mirrorCount ? `<span class="mirror-badge">${icon('copy', 11)} ${listing.mirrorCount} mirror${listing.mirrorCount === 1 ? '' : 's'}</span>` : ''}
          ${listing.origin === 'inventory' ? `<span class="inventory-badge">${icon('home', 11)} Inventory</span>` : ''}
        </div>
        <span class="listing-meta">${escapeHtml(listing.city)}${listing.area ? ` · ${escapeHtml(listing.area)}` : ''} ${specs ? `<span class="dot-sep">·</span>${specs}` : ''}</span>
        <div class="listing-tags">
          ${listing.matchReasons.slice(0, 3).map((reason) => `<span>${escapeHtml(reason)}</span>`).join('')}
          ${listing.sourceName ? `<span class="source-tag">${escapeHtml(listing.sourceName)}</span>` : ''}
          ${listing.matchScore !== null ? `<span class="match-inline"><span class="match-bar"><span style="width:${Math.round(listing.matchScore)}%"></span></span>${Math.round(listing.matchScore)}% match</span>` : ''}
        </div>
      </div>
      <div class="listing-price">
        <strong>${money(listing.price, { period: listing.period === 'month' ? 'month' : null })}</strong>
        <span>${listing.priceCheck?.pricePerM2 ? moneyPerM2(listing.priceCheck.pricePerM2) : '—'}</span>
      </div>
      <div class="listing-side">
        ${priceChip(listing.priceCheck)}
        <button class="icon-button listing-expand" type="button" data-expand="${escapeAttr(listing.id)}" aria-expanded="false" aria-label="Show evidence">${icon('chevron-down', 16)}</button>
      </div>
    </div>
    ${listing.rejectReason ? `<div class="reject-line">${icon('info', 13)} Excluded: ${escapeHtml(listing.rejectReason)}</div>` : ''}
    <div class="listing-detail" id="detail-${escapeAttr(listing.id)}" hidden>
      <div class="listing-detail-grid">
        <div class="listing-detail-main">
          ${listing.description ? `<p class="listing-description">${escapeHtml(listing.description)}</p>` : ''}
          <div class="detail-block">
            <span class="meta-label">Why it matches</span>
            <div class="chip-row">${listing.matchReasons.map((reason) => `<span class="feature-chip feature-soft">${escapeHtml(reason)}</span>`).join('')}</div>
          </div>
          <div class="detail-block">
            <span class="meta-label">Features</span>
            <div class="chip-row">${listing.features.map((feature) => `<span class="feature-chip feature-soft">${escapeHtml(feature)}</span>`).join('')}</div>
          </div>
          <div class="detail-block detail-source">
            <span class="meta-label">Source and evidence</span>
            <span>${escapeHtml(listing.sourceName)}${listing.externalRef ? ` · ref ${escapeHtml(listing.externalRef)}` : ''} · extraction confidence ${Math.round(listing.confidence * 100)}%</span>
            ${listing.mirrorNote ? `<span class="mirror-note">${icon('copy', 12)} ${escapeHtml(listing.mirrorNote)}</span>` : ''}
          </div>
        </div>
        <div class="listing-detail-price">${pricePanel(listing)}</div>
      </div>
    </div>
  </article>`;
}

function shortlistItem(item, { transaction }) {
  const listing = item.listing;
  if (!listing) return '';
  return `<article class="shortlist-card">
    <div class="shortlist-card-media">
      <img src="${propertyImage(listing)}" alt="${escapeAttr(propertyAlt(listing))}" loading="lazy" />
      <span class="shortlist-position">${item.position}</span>
    </div>
    <div class="shortlist-card-body">
      <div class="shortlist-card-head">
        <div>
          <span class="shortlist-location">${escapeHtml(listing.city)}${listing.area ? ` · ${escapeHtml(listing.area)}` : ''}</span>
          <h3>${escapeHtml(listing.title)}</h3>
        </div>
        <div class="shortlist-price">${money(listing.price, { period: transaction === 'rent' ? 'month' : null })}</div>
      </div>
      <div class="shortlist-specs">
        <span>${icon('bed', 14)} ${listing.bedrooms} bed</span>
        <span>${icon('bath', 14)} ${listing.bathrooms} bath</span>
        <span>${icon('ruler', 14)} ${listing.areaM2} m²</span>
        <span>${icon('home', 14)} ${escapeHtml(listing.type)}</span>
      </div>
      ${item.rationale ? `<p class="shortlist-rationale">${escapeHtml(item.rationale)}</p>` : ''}
      <div class="shortlist-flags">
        ${priceChip(listing.priceCheck)}
        ${listing.mirrorCount ? `<span class="mirror-badge">${icon('copy', 11)} ${listing.mirrorCount} mirror${listing.mirrorCount === 1 ? '' : 's'}</span>` : ''}
      </div>
      ${item.clientDecision && item.clientDecision !== 'pending'
        ? `<div class="client-decision client-decision-${escapeHtml(item.clientDecision)}">
            ${icon(clientDecisionIcon(item.clientDecision), 14)}
            <span>${escapeHtml(choiceLabel(item.clientDecision))}${item.clientComment ? ` — ${escapeHtml(item.clientComment)}` : ''}</span>
          </div>`
        : ''}
    </div>
  </article>`;
}

function stepsList(steps, { live = false } = {}) {
  return `<ol class="console-steps" id="console-steps" aria-live="polite">
    ${steps.map((step) => `<li class="console-step" data-seq="${step.seq}">
      <span class="console-dot console-${escapeAttr(step.level || 'info')}"></span>
      <span class="console-step-copy">
        <span class="console-phase">${escapeHtml(PHASE_LABELS[step.phase] || step.phase)}</span>
        <span class="console-message">${escapeHtml(step.message)}</span>
        ${step.detail ? `<span class="console-detail">${escapeHtml(step.detail)}</span>` : ''}
      </span>
      <span class="console-time">${step.elapsedMs ? duration(step.elapsedMs) : ''}</span>
    </li>`).join('')}
  </ol>`;
}

function inventoryCard(match) {
  return `<div class="inventory-match ${match.eligible ? '' : 'inventory-match-ineligible'}">
    <div class="inventory-match-thumb"><img src="${propertyImage(match)}" alt="" loading="lazy" /></div>
    <div class="inventory-match-body">
      <div class="inventory-match-top">
        <span class="inventory-system">${escapeHtml(match.system)}</span>
        <span class="inventory-status status-${escapeHtml(match.status)}">${escapeHtml(match.status)}</span>
      </div>
      <strong>${escapeHtml(match.title)}</strong>
      <span class="inventory-match-meta">${escapeHtml(match.ref)} · ${escapeHtml(match.city)} · ${match.bedrooms} bed · ${match.areaM2} m²</span>
      <div class="inventory-match-foot">
        <span>${money(match.rent, { period: 'month' })}</span>
        ${match.eligible ? `<span class="match-score"><span class="match-bar"><span style="width:${match.score}%"></span></span>${match.score}% fit</span>` : `<span class="text-warn">${escapeHtml(match.reasons[0] || 'Does not meet the brief')}</span>`}
      </div>
    </div>
  </div>`;
}

export async function renderCase(main, route) {
  let bundle = await api.case(route.id);
  const {
    case: caseRow,
    requirements,
    currentRequirement,
    draftRequirement,
    runs,
    latestRun,
    activeRun,
    steps,
    listings,
    shortlist,
    feedback,
    inventoryCheck,
    events,
    priceSummary,
    stageLabel,
  } = bundle;

  const included = listings.filter((listing) => listing.included && listing.canonical);
  const duplicateCount = listings.filter((listing) => !listing.canonical && !listing.rejectReason).length;
  const excluded = listings.filter((listing) => listing.rejectReason);
  const onBrief = listings.filter((listing) => listing.canonical && !listing.rejectReason);
  const shared = shortlist && ['shared', 'feedback'].includes(shortlist.status);
  const latestFeedback = feedback[0] || null;
  const activePriceSummary = priceSummary.shortlist || priceSummary.longList;
  const priceSummaryChip = activePriceSummary?.count
    ? priceChip({
        available: true,
        verdict:
          activePriceSummary.medianDeltaPct > 7
            ? 'above'
            : activePriceSummary.medianDeltaPct < -7
              ? 'below'
              : 'at',
        deltaPct: activePriceSummary.medianDeltaPct,
        median: activePriceSummary.compMedianTotal,
      })
    : priceChip(null);
  const requirement =
    draftRequirement && (!currentRequirement || draftRequirement.version > currentRequirement.version)
      ? draftRequirement
      : currentRequirement;
  const confirmed = Boolean(
    requirement?.confirmedAt && currentRequirement && requirement.id === currentRequirement.id
  );
  const hasRun = Boolean(latestRun);
  const selectionEnabled = caseRow.stage === 'review' && !shortlist;

  const stats = latestRun?.stats || {};
  const discoveredNames =
    events.find((event) => event.type === 'catalogue')?.detail?.sources || [];
  const sourceRuns = runs.filter((run) => run.kind === 'search').length;

  main.innerHTML = `<div class="page case-page">
    <div class="case-topline">
      <a class="back-link" href="#/pipeline">${icon('arrow-left', 15)} Pipeline</a>
      <span class="topline-sep">/</span>
      <span class="case-ref-large">${escapeHtml(caseRow.ref)}</span>
      <span class="topline-sep">/</span>
      <span>${escapeHtml(caseRow.owner)}</span>
      ${caseRow.priority === 'high' ? '<span class="priority-flag">High priority</span>' : ''}
    </div>

    <header class="case-head">
      <div class="case-head-main">
        <div class="case-client-line">
          <span class="avatar avatar-lg ${avatarClass(caseRow.client.name)}">${escapeHtml(initials(caseRow.client.name))}</span>
          <div>
            <div class="case-head-title-row">
              <h1>${escapeHtml(caseRow.client.name)}</h1>
              <span class="iteration-badge">Iteration ${caseRow.iteration}</span>
              ${stagePill(caseRow.stage)}
            </div>
            <p class="case-head-summary">${escapeHtml(caseRow.summary || '')}</p>
            <div class="case-head-meta">
              <span>${icon('pin', 13)} ${escapeHtml(requirement?.locations?.join(' / ') || 'Location to confirm')}</span>
              <span>${icon('clock', 13)} ${escapeHtml(stageLabel)} · ${relativeTime(caseRow.stageChangedAt)}</span>
              <span>${icon('user', 13)} ${escapeHtml(caseRow.owner)}</span>
              <span>${icon('mail', 13)} ${escapeHtml(caseRow.source || 'Website')}</span>
            </div>
          </div>
        </div>
        ${headerActions(bundle)}
      </div>
    </header>

    ${stageRail(bundle)}

    <div class="case-layout">
      <div class="case-main">
        <section class="panel case-panel" id="section-requirements">
          <div class="panel-head">
            <div>
              <p class="kicker">01 · The brief</p>
              <h2>${confirmed ? 'Confirmed requirements' : draftRequirement ? 'Interpreted requirements' : 'No requirements recorded'}</h2>
            </div>
            <div class="panel-head-meta">
              ${requirement ? `<span class="version-badge">v${requirement.version}</span>` : ''}
              ${requirement ? `<span class="confidence-badge">${Math.round((requirement.confidence || 0) * 100)}% confidence</span>` : ''}
            </div>
          </div>
          ${requirement
            ? `
              ${!confirmed ? `<div class="notice notice-warm">${icon('sparkles', 16)} <div><strong>Interpreted by Farol, not yet confirmed.</strong><span>Check locations, budget and must-haves before anything is searched.</span></div></div>` : ''}
              <blockquote class="brief-quote">${escapeHtml(requirement.brief)}</blockquote>
              ${requirementFacts(requirement)}
              <div class="requirements-columns">
                <div class="detail-block">
                  <span class="meta-label">Must-haves</span>
                  ${featureChips(requirement.mustHaves, { tone: 'must' })}
                </div>
                <div class="detail-block">
                  <span class="meta-label">Nice-to-haves</span>
                  ${featureChips(requirement.niceToHaves, { tone: 'nice' })}
                </div>
              </div>
              ${requirement.assumptions?.length ? `<div class="assumptions"><span class="meta-label">Assumptions</span>${requirement.assumptions.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>` : ''}
              <div class="panel-foot panel-foot-split">
                <span class="panel-foot-note">${confirmed ? `Confirmed by ${escapeHtml(requirement.confirmedBy || 'the team')} ${relativeTime(requirement.confirmedAt)}` : 'Awaiting confirmation'}</span>
                <div class="button-row">
                  <button class="button button-ghost button-sm" type="button" data-action="edit-requirements">${icon('file', 14)} ${confirmed ? 'Revise brief' : 'Edit & confirm'}</button>
                  ${requirements.length > 1 ? `<button class="button button-ghost button-sm" type="button" data-action="versions">${icon('archive', 14)} ${requirements.length} versions</button>` : ''}
                </div>
              </div>
            `
            : `<div class="empty-inline">
                <div><strong>The enquiry is in, but the brief has not been structured yet.</strong><span>Capture the requirements, then confirm them. Farol will interpret budget, location and must-haves.</span></div>
                <button class="button button-primary" type="button" data-action="edit-requirements">${icon('plus', 15)} Record requirements</button>
              </div>`}
        </section>

        <section class="panel case-panel" id="section-inventory">
          <div class="panel-head">
            <div>
              <p class="kicker">02 · Reusable inventory</p>
              <h2>Check existing rental inventory</h2>
            </div>
            ${inventoryCheck ? `<span class="status-chip status-${escapeHtml(inventoryCheck.outcome)}">${inventoryCheck.outcome === 'suitable' ? 'Suitable home found' : inventoryCheck.outcome === 'gap' ? 'Gap — search needed' : 'Not applicable'}</span>` : ''}
          </div>
          ${caseRow.transaction === 'sale'
            ? `<div class="notice notice-neutral">${icon('info', 16)} <div><strong>Purchase brief.</strong><span>Existing inventory is rental-only, so this step is skipped and the AI-assisted search covers the sales market.</span></div></div>`
            : inventoryCheck
              ? `<div class="inventory-verdict inventory-verdict-${escapeHtml(inventoryCheck.outcome)}">
                  <div class="inventory-verdict-icon">${icon(inventoryCheck.outcome === 'suitable' ? 'check-circle' : 'search', 22)}</div>
                  <div class="inventory-verdict-copy">
                    <strong>${inventoryCheck.outcome === 'suitable' ? 'Suitable available inventory found' : 'No suitable available inventory'}</strong>
                    <p>${escapeHtml(inventoryCheck.reasons[0] || '')}</p>
                    ${inventoryCheck.reasons.length > 1 ? `<ul>${inventoryCheck.reasons.slice(1, 4).map((reason) => `<li>${escapeHtml(reason)}</li>`).join('')}</ul>` : ''}
                  </div>
                  <div class="inventory-verdict-side">
                    <span class="meta-label">Checked</span>
                    <span>${escapeHtml(relativeTime(inventoryCheck.createdAt))}</span>
                    ${inventoryCheck.score ? `<span class="meta-label">Best fit</span><span>${Math.round(inventoryCheck.score)}%</span>` : ''}
                  </div>
                </div>
                ${inventoryCheck.matches?.length ? `<div class="inventory-matches">${inventoryCheck.matches.map(inventoryCard).join('')}</div>` : ''}
                <div class="panel-foot panel-foot-split">
                  <span class="panel-foot-note">Algarve Senior Living · Portugal Long Lets · availability and access attributes</span>
                  <div class="button-row">
                    <button class="button button-ghost button-sm" type="button" data-action="recheck-inventory">${icon('refresh', 14)} Recheck</button>
                    ${inventoryCheck.outcome === 'gap' && !activeRun ? `<button class="button button-primary button-sm" type="button" data-action="start-search">${icon('sparkles', 14)} Continue to AI search</button>` : ''}
                  </div>
                </div>`
              : `<div class="empty-inline">
                  <div><strong>${confirmed ? 'No inventory check yet.' : 'Confirm the brief first.'}</strong><span>${confirmed ? 'Farol will check Algarve Senior Living and Portugal Long Lets before looking externally.' : 'Inventory matching needs a confirmed brief so the hard requirements are trustworthy.'}</span></div>
                  <button class="button button-primary" type="button" data-action="${confirmed ? 'check-inventory' : 'edit-requirements'}">${icon(confirmed ? 'home' : 'check-circle', 15)} ${confirmed ? 'Check inventory' : 'Confirm requirements'}</button>
                </div>`}
        </section>

        <section class="panel case-panel" id="section-search">
          <div class="panel-head">
            <div>
              <p class="kicker">03 · AI-assisted search</p>
              <h2>${activeRun ? 'Search running' : latestRun ? 'Search evidence' : 'Search the market'}</h2>
            </div>
            ${latestRun ? `<span class="status-chip status-${escapeHtml(latestRun.status)}">${latestRun.kind === 'inventory' ? 'Inventory run' : 'Market search'} · ${escapeHtml(latestRun.status)}</span>` : ''}
          </div>
          ${activeRun
            ? `<div class="agent-console" data-run-id="${escapeAttr(activeRun.id)}">
                <div class="console-head">
                  <span class="console-live"><span class="live-dot"></span> Agent working · ${escapeHtml(activeRun.kind === 'inventory' ? 'checking inventory' : 'searching the catalogue')}</span>
                  <span class="console-progress-label" id="console-progress-label">${activeRun.progress || 0}%</span>
                </div>
                <div class="console-progress"><span id="console-progress" style="width:${activeRun.progress || 0}%"></span></div>
                ${steps.length ? stepsList(steps, { live: true }) : '<p class="console-waiting">Connecting to the agent…</p>'}
                <div class="console-foot">
                  <span id="console-status">Streaming steps as they happen.</span>
                  <button class="button button-ghost button-sm console-cancel" type="button" data-action="cancel-run">${icon('stop', 13)} Cancel</button>
                </div>
              </div>`
            : latestRun
              ? `<div class="run-summary">
                  <div class="run-summary-head">
                    <div>
                      <span class="kicker">${escapeHtml(latestRun.kind === 'inventory' ? 'Inventory check' : 'Search')} · ${escapeHtml(formatDate(latestRun.createdAt, 'long'))}</span>
                      <strong>${stats.longList ?? 0} homes on the long list${stats.duplicates ? ` · ${stats.duplicates} mirrors collapsed` : ''}</strong>
                    </div>
                    <span class="run-duration">${icon('clock', 14)} ${duration(latestRun.durationMs)}</span>
                  </div>
                  <div class="run-stats">
                    <span><b>${stats.sourcesQueried ?? 0}</b><span>sources</span></span>
                    <span><b>${stats.extracted ?? 0}</b><span>results</span></span>
                    <span><b>${stats.uniqueListings ?? 0}</b><span>unique homes</span></span>
                    <span><b>${stats.duplicates ?? 0}</b><span>duplicates</span></span>
                    <span><b>${stats.priceChecked ?? 0}</b><span>price checks</span></span>
                    <span><b>${stats.discovered ?? 0}</b><span>new sources</span></span>
                  </div>
                  ${stats.priceChecked ? `<div class="run-price-line">${icon('chart', 14)} ${stats.aboveMarket} above market · ${stats.atMarket} at market · ${stats.belowMarket} below · ${stats.comparisons || 0} comparable transactions</div>` : ''}
                  ${discoveredNames.length ? `<div class="discovered-line"><span class="meta-label">Discovered</span>${discoveredNames.map((name) => `<span class="source-pill">${icon('globe', 11)} ${escapeHtml(name)}</span>`).join('')}</div>` : ''}
                  <details class="run-steps">
                    <summary>${icon('list', 14)} See the agent's ${steps.length} steps</summary>
                    ${stepsList(steps)}
                  </details>
                  <div class="panel-foot panel-foot-split">
                    <span class="panel-foot-note">${stats.coverage ? `${escapeHtml(stats.coverage)} coverage` : 'Market coverage'} · human review required before any client output</span>
                    <div class="button-row">
                      ${caseRow.stage !== 'closed' ? `<button class="button button-ghost button-sm" type="button" data-action="start-search">${icon('refresh', 14)} Run again</button>` : ''}
                      ${included.length ? `<button class="button button-primary button-sm" type="button" data-scroll="review">${icon('users', 14)} Review ${included.length} homes</button>` : ''}
                    </div>
                  </div>
                </div>`
              : `<div class="search-explainer">
                  <div class="search-flow">
                    <div><span>01</span><strong>Source catalogue</strong><p>Start from the master list, not a blank browser.</p></div>
                    <div><span>02</span><strong>Discover</strong><p>Surface relevant portals and agencies as it searches.</p></div>
                    <div><span>03</span><strong>Extract & dedupe</strong><p>Normalise, validate and collapse cross-posted mirrors.</p></div>
                    <div><span>04</span><strong>Rank & price-check</strong><p>Score against the brief and benchmark comparable asking prices.</p></div>
                  </div>
                  <div class="search-cta">
                    <div>
                      <strong>${!confirmed ? 'Confirm the brief first.' : caseRow.transaction === 'sale' ? 'Ready for the sales market.' : inventoryCheck ? 'Inventory gap confirmed. Continue to the market.' : 'Check inventory first, or run the external search.'}</strong>
                      <span>The search only produces a long list. A person decides what reaches the client.</span>
                    </div>
                    <button class="button button-primary" type="button" data-action="${confirmed ? 'start-search' : 'edit-requirements'}">${icon(confirmed ? 'sparkles' : 'check-circle', 15)} ${confirmed ? 'Run AI-assisted search' : 'Confirm requirements first'}</button>
                  </div>
                </div>`}
          ${included.length && !activeRun ? priceSummaryBlock(priceSummary.longList, caseRow.transaction) : ''}
        </section>

        <section class="panel case-panel" id="section-review">
          <div class="panel-head">
            <div>
              <p class="kicker">04 · Human review</p>
              <h2>Long list and evidence</h2>
            </div>
            <div class="panel-head-meta">
              ${included.length ? `<span class="count-badge">${included.length} on long list</span>` : ''}
              ${duplicateCount ? `<span class="muted-count">${duplicateCount} mirrors</span>` : ''}
            </div>
          </div>
          ${included.length
            ? `<div class="review-toolbar">
                <div class="filter-tabs" role="tablist">
                  <button class="filter-tab is-active" type="button" data-list-filter="longlist">Long list <span>${included.length}</span></button>
                  <button class="filter-tab" type="button" data-list-filter="all">All on brief <span>${onBrief.length}</span></button>
                  <button class="filter-tab" type="button" data-list-filter="duplicates">Mirrors <span>${duplicateCount}</span></button>
                  <button class="filter-tab" type="button" data-list-filter="excluded">Excluded <span>${excluded.length}</span></button>
                </div>
                <p class="toolbar-note">${icon('shield', 14)} Only the team can promote a home</p>
              </div>
              <div class="listing-list" id="listing-list">
                ${listings.map((listing) => listingRow(listing, { selectable: selectionEnabled })).join('')}
              </div>
              ${selectionEnabled ? `<div class="selection-bar" id="selection-bar" hidden>
                  <span><b id="selection-count">0</b> homes selected</span>
                  <button class="button button-primary button-sm" type="button" data-action="build-shortlist">${icon('users', 14)} Build shortlist</button>
                </div>` : ''}
              <div class="panel-foot panel-foot-split">
                <span class="panel-foot-note">${icon('info', 13)} Asking prices and evidence are indicative; the team confirms condition and availability.</span>
                <span class="panel-foot-note">Sorted by match score, then price</span>
              </div>`
            : `<div class="empty-inline">
                <div><strong>No reviewed long list yet.</strong><span>Run the AI-assisted search, then the team reviews what deserves a client conversation.</span></div>
                ${!activeRun && confirmed ? `<button class="button button-primary" type="button" data-action="start-search">${icon('sparkles', 15)} Run AI-assisted search</button>` : ''}
              </div>`}
        </section>

        <section class="panel case-panel" id="section-client">
          <div class="panel-head">
            <div>
              <p class="kicker">05 · Shortlist & client decision</p>
              <h2>${shortlist ? `Shortlist v${shortlist.version}` : 'The client shortlist'}</h2>
            </div>
            ${shortlist ? `<span class="status-chip status-${escapeHtml(shortlist.status)}">${escapeHtml(shortlist.status)}</span>` : ''}
          </div>
          ${shortlist
            ? `<div class="shortlist-summary">
                <p>${escapeHtml(shortlist.summary || '')}</p>
                <span class="shortlist-meta">Prepared by ${escapeHtml(shortlist.createdBy || caseRow.owner)} · ${relativeTime(shortlist.createdAt)}${shortlist.sharedAt ? ` · shared ${relativeTime(shortlist.sharedAt)}` : ''}</span>
              </div>
              ${priceSummaryBlock(shortlist.priceSummary, caseRow.transaction, { compact: true })}
              <div class="shortlist-grid">
                ${shortlist.items.map((item) => shortlistItem(item, { transaction: caseRow.transaction })).join('')}
              </div>
              <div class="panel-foot panel-foot-split">
                <span class="panel-foot-note">${shortlist.items.filter((item) => item.clientDecision === 'interested').length} interested · ${shortlist.items.filter((item) => item.clientDecision === 'question').length} questions · ${shortlist.items.filter((item) => item.clientDecision === 'not_for_us').length} declined</span>
                <div class="button-row">
                  ${shortlist.status === 'draft' ? `<button class="button button-primary button-sm" type="button" data-action="share-shortlist">${icon('send', 14)} Share with client</button>` : ''}
                  ${shared ? `<button class="button button-ghost button-sm" type="button" data-action="copy-client-link">${icon('link', 14)} Copy client link</button><a class="button button-ghost button-sm" href="/portal/${escapeAttr(shortlist.token)}" target="_blank" rel="noopener">${icon('external', 14)} Open client view</a>` : ''}
                  ${caseRow.stage === 'client' && latestFeedback?.overall === 'refine' ? `<button class="button button-primary button-sm" type="button" data-action="iterate">${icon('refresh', 14)} Create iteration</button>` : ''}
                  ${caseRow.stage === 'client' && latestFeedback?.overall === 'accept' ? `<button class="button button-primary button-sm" type="button" data-action="close-case">${icon('check-circle', 14)} Close as won</button>` : ''}
                </div>
              </div>
              ${latestFeedback ? `<div class="feedback-panel feedback-${escapeHtml(latestFeedback.overall)}">
                  <div class="feedback-head">
                    <span class="feedback-icon">${icon('quote', 18)}</span>
                    <div>
                      <span class="kicker">Client feedback · ${escapeHtml(latestFeedback.submittedBy || 'Client')}</span>
                      <strong>${latestFeedback.overall === 'refine' ? 'Please refine the shortlist' : 'Shortlist accepted'}</strong>
                    </div>
                    <span class="feedback-time">${escapeHtml(relativeTime(latestFeedback.createdAt))}</span>
                  </div>
                  <p>${escapeHtml(latestFeedback.comment || 'No written comment.')}</p>
                  ${latestFeedback.overall === 'refine' ? `<button class="button button-primary button-sm" type="button" data-action="iterate">${icon('refresh', 14)} Start iteration ${caseRow.iteration + 1}</button>` : ''}
                </div>` : ''}`
            : `<div class="empty-inline">
                <div><strong>No shortlist yet.</strong><span>Review the long list, select the homes worth a conversation, and give the client a considered point of view.</span></div>
                ${included.length ? `<button class="button button-primary" type="button" data-action="focus-review">${icon('users', 15)} Build shortlist</button>` : ''}
              </div>`}
        </section>
      </div>

      <aside class="case-rail">
        <section class="rail-card">
          <div class="rail-client">
            <span class="avatar avatar-lg ${avatarClass(caseRow.client.name)}">${escapeHtml(initials(caseRow.client.name))}</span>
            <div>
              <span class="kicker">Client</span>
              <h3>${escapeHtml(caseRow.client.name)}</h3>
              <span class="muted">${escapeHtml(caseRow.client.source || caseRow.source || 'Website')}</span>
            </div>
          </div>
          <div class="rail-contact">
            ${caseRow.client.email ? `<a href="mailto:${escapeAttr(caseRow.client.email)}">${icon('mail', 14)} ${escapeHtml(caseRow.client.email)}</a>` : ''}
            ${caseRow.client.phone ? `<a href="tel:${escapeAttr(caseRow.client.phone)}">${icon('phone', 14)} ${escapeHtml(caseRow.client.phone)}</a>` : ''}
          </div>
          <div class="rail-facts">
            <span><span class="meta-label">Owner</span>${escapeHtml(caseRow.owner)}</span>
            <span><span class="meta-label">Opened</span>${escapeHtml(formatDate(caseRow.createdAt, 'long'))}</span>
            <span><span class="meta-label">Stage since</span>${escapeHtml(relativeTime(caseRow.stageChangedAt))}</span>
            <span><span class="meta-label">Runs</span>${runs.length}${sourceRuns ? ` · ${sourceRuns} search${sourceRuns === 1 ? '' : 'es'}` : ''}</span>
          </div>
        </section>

        <section class="rail-card rail-next">
          <span class="kicker">Next action</span>
          <p>${escapeHtml(caseRow.nextAction || 'Open the case and review the next step.')}</p>
          ${caseRow.stage === 'closed'
            ? `<span class="closed-note">${icon('flag', 15)} ${caseRow.status === 'won' ? 'Closed won' : 'Closed'}</span>`
            : `<button class="text-link text-link-button" type="button" data-action="${
                activeRun
                  ? 'focus-search'
                  : caseRow.stage === 'client'
                    ? 'focus-client'
                    : caseRow.stage === 'requirements' || caseRow.stage === 'enquiry'
                      ? 'focus-requirements'
                      : caseRow.stage === 'inventory'
                        ? 'focus-inventory'
                        : 'focus-review'
              }">Open the next step ${icon('arrow-right', 14)}</button>`}
        </section>

        <section class="rail-card">
          <div class="rail-card-head"><span class="kicker">Price watch</span>${priceSummaryChip}</div>
          ${priceSummary.shortlist || priceSummary.longList
            ? `<p class="rail-price-narrative">${escapeHtml((priceSummary.shortlist || priceSummary.longList).narrative)}</p>
               <div class="rail-price-stats">
                 <span><span class="meta-label">Comparables</span>${(priceSummary.shortlist || priceSummary.longList).count}</span>
                 <span><span class="meta-label">Median Δ</span>${percent((priceSummary.shortlist || priceSummary.longList).medianDeltaPct)}</span>
               </div>
               <a class="text-link" href="#/portfolio">Portfolio benchmark ${icon('arrow-right', 13)}</a>`
            : `<p class="rail-price-narrative">Comparable asking prices will appear once the search has run.</p>`}
        </section>

        ${runs.length ? `<section class="rail-card">
          <div class="rail-card-head"><span class="kicker">Search history</span><span class="muted">${runs.length}</span></div>
          <div class="run-history">
            ${runs.map((run) => `<div class="run-history-item">
              <span class="run-history-icon run-${escapeHtml(run.status)}">${icon(run.kind === 'inventory' ? 'home' : 'sparkles', 14)}</span>
              <div>
                <span class="run-history-title">${run.kind === 'inventory' ? 'Inventory check' : `Iteration ${run.iteration} search`}</span>
                <span class="run-history-meta">${escapeHtml(relativeTime(run.createdAt))} · ${duration(run.durationMs)} · ${run.stats?.longList ?? 0} homes</span>
              </div>
              <span class="status-dot status-${escapeHtml(run.status)}"></span>
            </div>`).join('')}
          </div>
        </section>` : ''}

        <section class="rail-card">
          <div class="rail-card-head"><span class="kicker">Audit trail</span><span class="muted">${events.length}</span></div>
          <ol class="timeline">
            ${events.slice(0, 9).map((event) => `<li class="timeline-item">
              <span class="timeline-icon">${icon(EVENT_ICONS[event.type] || 'circle', 12)}</span>
              <div>
                <span class="timeline-message">${escapeHtml(event.message)}</span>
                <span class="timeline-meta">${escapeHtml(relativeTime(event.ts))} · ${escapeHtml(event.actor || 'Team')}</span>
              </div>
            </li>`).join('')}
          </ol>
        </section>

        <section class="rail-card rail-method">
          <span class="kicker">How this was produced</span>
          <p>Every result carries its source, extraction confidence and comparable evidence. The AI never contacts a client or publishes a shortlist; a person does that.</p>
          <a class="text-link" href="#/systems">Method & systems ${icon('arrow-right', 13)}</a>
        </section>
      </aside>
    </div>
  </div>`;

  // ---------------------------------------------------------------------------
  // Interactions

  const stageRailElement = main.querySelector('.stage-rail');
  const currentStageElement = stageRailElement?.querySelector('.stage-current');
  if (stageRailElement && currentStageElement && stageRailElement.scrollWidth > stageRailElement.clientWidth) {
    stageRailElement.scrollLeft = Math.max(0, currentStageElement.offsetLeft - 40);
  }

  const refresh = () => {
    window.dispatchEvent(new Event('farol:refresh'));
  };

  const scrollToSection = (stageKey) => {
    const map = {
      enquiry: 'requirements',
      requirements: 'requirements',
      inventory: 'inventory',
      ai_search: 'search',
      review: 'review',
      client: 'client',
      closed: 'client',
    };
    const section = main.querySelector(`#section-${map[stageKey] || 'requirements'}`);
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  main.querySelectorAll('[data-scroll]').forEach((button) => {
    button.addEventListener('click', () => scrollToSection(button.dataset.scroll));
  });
  main.querySelectorAll('[data-focus]').forEach((button) => {
    button.addEventListener('click', () => scrollToSection(button.dataset.focus));
  });

  const reqForForm = requirement || null;

  function requirementsModal() {
    const req = reqForForm;
    const fields = req || {
      brief: '',
      transaction: caseRow.transaction,
      propertyTypes: [],
      locations: [],
      budgetMin: '',
      budgetMax: '',
      bedroomsMin: '',
      bedroomsMax: '',
      mustHaves: [],
      niceToHaves: [],
      moveIn: '',
      notes: '',
      confidence: 0.5,
    };
    const types = ['apartment', 'townhouse', 'villa', 'house', 'quinta', 'penthouse'];
    openModal({
      title: req ? 'Review the interpreted brief' : 'Record requirements',
      eyebrow: req ? `Requirements v${req.version} · ${Math.round((req.confidence || 0) * 100)}% confidence` : 'New structured brief',
      body: `<form id="requirements-form" class="form">
        <label class="field">
          <span class="field-label">Client brief</span>
          <textarea class="input textarea" name="brief" rows="4" required>${escapeHtml(fields.brief || '')}</textarea>
          <span class="field-hint">Keep the client's own words. The structured fields below are what the engine uses.</span>
        </label>
        <div class="form-grid form-grid-2">
          <div class="field">
            <span class="field-label">Transaction</span>
            <div class="segmented">
              <label><input type="radio" name="transaction" value="rent" ${fields.transaction !== 'sale' ? 'checked' : ''}/><span>Long let</span></label>
              <label><input type="radio" name="transaction" value="sale" ${fields.transaction === 'sale' ? 'checked' : ''}/><span>Purchase</span></label>
            </div>
          </div>
          <label class="field">
            <span class="field-label">Locations <span class="field-hint">comma separated</span></span>
            <input class="input" name="locations" value="${escapeAttr((fields.locations || []).join(', '))}" placeholder="Lagos, Portimão" />
          </label>
          <label class="field">
            <span class="field-label">Budget max (EUR)</span>
            <input class="input" type="number" min="0" name="budgetMax" value="${fields.budgetMax ?? ''}" placeholder="2200" />
          </label>
          <label class="field">
            <span class="field-label">Budget min (EUR) <span class="field-hint">optional</span></span>
            <input class="input" type="number" min="0" name="budgetMin" value="${fields.budgetMin ?? ''}" placeholder="" />
          </label>
          <label class="field">
            <span class="field-label">Bedrooms min</span>
            <input class="input" type="number" min="0" max="20" name="bedroomsMin" value="${fields.bedroomsMin ?? ''}" />
          </label>
          <label class="field">
            <span class="field-label">Bedrooms max</span>
            <input class="input" type="number" min="0" max="20" name="bedroomsMax" value="${fields.bedroomsMax ?? ''}" />
          </label>
          <label class="field">
            <span class="field-label">Move-in</span>
            <input class="input" type="month" name="moveIn" value="${escapeAttr(fields.moveIn || '')}" />
          </label>
          <label class="field">
            <span class="field-label">Tenure</span>
            <input class="input" name="tenure" value="${escapeAttr(fields.tenure || 'Long let')}" placeholder="Long let" />
          </label>
        </div>
        <div class="field">
          <span class="field-label">Property types</span>
          <div class="checkbox-grid">
            ${types.map((type) => `<label class="check-line"><input type="checkbox" name="propertyTypes" value="${type}" ${fields.propertyTypes?.includes(type) ? 'checked' : ''}/><span>${type}</span></label>`).join('')}
          </div>
        </div>
        <div class="form-grid form-grid-2">
          <label class="field">
            <span class="field-label">Must-haves <span class="field-hint">comma separated</span></span>
            <input class="input" name="mustHaves" value="${escapeAttr((fields.mustHaves || []).join(', '))}" placeholder="Sea view, Pool, Furnished" />
          </label>
          <label class="field">
            <span class="field-label">Nice-to-haves <span class="field-hint">comma separated</span></span>
            <input class="input" name="niceToHaves" value="${escapeAttr((fields.niceToHaves || []).join(', '))}" placeholder="Terrace, Lift" />
          </label>
        </div>
        <label class="field">
          <span class="field-label">Team notes <span class="field-hint">optional</span></span>
          <textarea class="input textarea" name="notes" rows="2">${escapeHtml(fields.notes || '')}</textarea>
        </label>
      </form>`,
      footer: `
        <button class="button button-ghost" type="button" data-modal-close>Cancel</button>
        <button class="button button-primary" type="submit" form="requirements-form" id="save-requirements">${icon('check-circle', 15)} Confirm requirements</button>
      `,
      size: 'lg',
      onMount({ root, close }) {
        const form = root.querySelector('#requirements-form');
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const data = new FormData(form);
          const button = root.querySelector('#save-requirements');
          const body = {
            brief: String(data.get('brief') || '').trim(),
            transaction: String(data.get('transaction') || 'rent'),
            propertyTypes: data.getAll('propertyTypes').map(String),
            locations: String(data.get('locations') || '')
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean),
            budgetMin: data.get('budgetMin') ? Number(data.get('budgetMin')) : null,
            budgetMax: data.get('budgetMax') ? Number(data.get('budgetMax')) : null,
            bedroomsMin: data.get('bedroomsMin') !== '' ? Number(data.get('bedroomsMin')) : null,
            bedroomsMax: data.get('bedroomsMax') !== '' ? Number(data.get('bedroomsMax')) : null,
            mustHaves: String(data.get('mustHaves') || '')
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean),
            niceToHaves: String(data.get('niceToHaves') || '')
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean),
            moveIn: String(data.get('moveIn') || ''),
            tenure: String(data.get('tenure') || ''),
            notes: String(data.get('notes') || ''),
            confirm: true,
          };
          if (!body.brief) {
            toast('Add the client brief first.', { tone: 'error' });
            return;
          }
          button.disabled = true;
          button.innerHTML = '<span class="spinner"></span>Confirming…';
          try {
            await api.confirmRequirements(caseRow.id, body);
            close();
            toast('Requirements confirmed. The next step is ready.', { tone: 'success' });
            refresh();
          } catch (error) {
            toast(error.message, { tone: 'error' });
            button.disabled = false;
            button.innerHTML = `${icon('check-circle', 15)} Confirm requirements`;
          }
        });
      },
    });
  }

  function versionsModal() {
    openModal({
      title: 'Requirement versions',
      eyebrow: `${requirements.length} recorded version${requirements.length === 1 ? '' : 's'}`,
      body: `<div class="version-list">${requirements
        .map(
          (item) => `<article class="version-item">
            <div class="version-head"><strong>v${item.version}</strong><span class="status-chip status-${item.confirmedAt ? 'shared' : 'draft'}">${item.confirmedAt ? 'Confirmed' : 'Draft'}</span></div>
            <p>${escapeHtml(item.brief)}</p>
            <span class="version-meta">${item.confirmedAt ? `Confirmed by ${escapeHtml(item.confirmedBy || 'team')} · ${relativeTime(item.confirmedAt)}` : `Created ${relativeTime(item.createdAt)}`} · ${money(item.budgetMax || 0, { period: item.transaction === 'rent' ? 'month' : null })}</span>
          </article>`
        )
        .join('')}</div>`,
      size: 'md',
    });
  }

  async function startSearch(button) {
    const original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span class="spinner"></span>Starting agent…';
    try {
      await api.startSearch(caseRow.id);
      toast('AI search started. Steps will stream in as they happen.', { tone: 'success' });
      refresh();
    } catch (error) {
      toast(error.message, { tone: 'error' });
      button.disabled = false;
      button.innerHTML = original;
    }
  }

  async function checkInventory(button) {
    const original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span class="spinner"></span>Checking inventory…';
    try {
      const result = await api.checkInventory(caseRow.id);
      if (result.run) {
        toast('Suitable inventory found. Preparing the matches for review.', { tone: 'success' });
      } else {
        toast('No suitable inventory home. The AI-assisted search is the next step.', { tone: 'info' });
      }
      refresh();
    } catch (error) {
      toast(error.message, { tone: 'error' });
      button.disabled = false;
      button.innerHTML = original;
    }
  }

  function shortlistModal() {
    const selected = [...main.querySelectorAll('[data-select-listing]:checked')].map((input) => input.value);
    if (!selected.length) {
      toast('Select at least one home from the long list.', { tone: 'error' });
      return;
    }
    const selectedListings = selected
      .map((id) => listings.find((listing) => listing.id === id))
      .filter(Boolean);
    openModal({
      title: 'Build the client shortlist',
      eyebrow: `${selectedListings.length} homes selected for human review`,
      body: `<form id="shortlist-form" class="form">
        <p class="modal-copy">Give each home a reason the client can understand. The shortlist is a considered point of view, not a data dump.</p>
        <div class="shortlist-form-list">
          ${selectedListings
            .map(
              (listing, index) => `<div class="shortlist-form-item">
                <div class="shortlist-form-head">
                  <span class="shortlist-form-rank">${index + 1}</span>
                  <div>
                    <strong>${escapeHtml(listing.title)}</strong>
                    <span>${escapeHtml(listing.city)} · ${money(listing.price, { period: listing.period === 'month' ? 'month' : null })} · ${listing.bedrooms} bed</span>
                  </div>
                  ${priceChip(listing.priceCheck, { compact: true })}
                </div>
                <label class="field"><span class="field-label">Why this one?</span>
                  <textarea class="input textarea" name="rationale-${escapeAttr(listing.id)}" rows="2" placeholder="The team's rationale…">${escapeHtml(
                    listing.matchReasons.slice(0, 3).join(' · ')
                  )}</textarea>
                </label>
              </div>`
            )
            .join('')}
        </div>
        <label class="field">
          <span class="field-label">Shortlist note to the client</span>
          <textarea class="input textarea" name="summary" rows="3" placeholder="A short, warm introduction to the selection…"></textarea>
        </label>
      </form>`,
      footer: `
        <button class="button button-ghost" type="button" data-modal-close>Cancel</button>
        <button class="button button-primary" type="submit" form="shortlist-form" id="save-shortlist">${icon('users', 15)} Create draft shortlist</button>
      `,
      size: 'lg',
      onMount({ root, close }) {
        const form = root.querySelector('#shortlist-form');
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const data = new FormData(form);
          const button = root.querySelector('#save-shortlist');
          button.disabled = true;
          button.innerHTML = '<span class="spinner"></span>Saving…';
          try {
            await api.createShortlist(caseRow.id, {
              items: selectedListings.map((listing) => ({
                listingId: listing.id,
                rationale: String(data.get(`rationale-${listing.id}`) || '').trim(),
              })),
              summary: String(data.get('summary') || '').trim(),
            });
            close();
            toast('Draft shortlist created. Review it, then share with the client.', { tone: 'success' });
            refresh();
          } catch (error) {
            toast(error.message, { tone: 'error' });
            button.disabled = false;
            button.innerHTML = `${icon('users', 15)} Create draft shortlist`;
          }
        });
      },
    });
  }

  async function shareShortlist(button) {
    if (!shortlist) return;
    button.disabled = true;
    button.innerHTML = '<span class="spinner"></span>Sharing…';
    try {
      const updated = await api.shareShortlist(caseRow.id, shortlist.id);
      const token = updated.shortlist?.token || shortlist.token;
      const url = portalUrl(token);
      openModal({
        title: 'Shortlist shared',
        eyebrow: 'Client link ready',
        body: `<p class="modal-copy">Send this private link to ${escapeHtml(caseRow.client.name)}. They can review each home, leave comments and accept or ask for changes.</p>
          <div class="copy-field"><input class="input" value="${escapeAttr(url)}" readonly /><button class="button button-primary button-sm" type="button" data-copy-link>${icon('copy', 14)} Copy</button></div>
          <div class="notice notice-neutral">${icon('shield', 16)} <div><strong>Private, read-only link.</strong><span>No account needed. It exposes only this shortlist, not the internal long list or notes.</span></div></div>`,
        footer: `<button class="button button-ghost" type="button" data-modal-close>Close</button><a class="button button-primary" href="/portal/${escapeAttr(token)}" target="_blank" rel="noopener">Open client view</a>`,
        size: 'md',
        onMount({ root }) {
          root.querySelector('[data-copy-link]')?.addEventListener('click', () => copyText(url));
        },
      });
      refresh();
    } catch (error) {
      toast(error.message, { tone: 'error' });
      button.disabled = false;
      button.innerHTML = `${icon('send', 14)} Share with client`;
    }
  }

  function iterateModal() {
    openModal({
      title: `Create iteration ${caseRow.iteration + 1}`,
      eyebrow: 'Revised requirements feed the next search',
      body: `<form id="iterate-form" class="form">
        <p class="modal-copy">${latestFeedback ? `Client feedback: “${escapeHtml(latestFeedback.comment || 'No comment')}”` : 'Add the change requested by the client or the team.'}</p>
        <label class="field">
          <span class="field-label">What changes in this iteration?</span>
          <textarea class="input textarea" name="note" rows="4" placeholder="e.g. One more option with a pool under €2,050 and a shorter walk to a café.">${escapeHtml(latestFeedback?.comment || '')}</textarea>
          <span class="field-hint">This becomes a new draft requirements version. You will confirm it before the next search.</span>
        </label>
      </form>`,
      footer: `<button class="button button-ghost" type="button" data-modal-close>Cancel</button><button class="button button-primary" type="submit" form="iterate-form" id="save-iteration">${icon('refresh', 15)} Create draft iteration</button>`,
      size: 'md',
      onMount({ root, close }) {
        root.querySelector('#iterate-form').addEventListener('submit', async (event) => {
          event.preventDefault();
          const button = root.querySelector('#save-iteration');
          button.disabled = true;
          button.innerHTML = '<span class="spinner"></span>Creating…';
          try {
            await api.iterate(caseRow.id, {
              note: String(new FormData(event.currentTarget).get('note') || '').trim(),
              applyFeedback: true,
            });
            close();
            toast(`Iteration ${caseRow.iteration + 1} drafted. Confirm the revised brief.`, { tone: 'success' });
            refresh();
          } catch (error) {
            toast(error.message, { tone: 'error' });
            button.disabled = false;
            button.innerHTML = `${icon('refresh', 15)} Create draft iteration`;
          }
        });
      },
    });
  }

  function closeCaseModal() {
    openModal({
      title: 'Close this case',
      body: `<form id="close-form" class="form">
        <div class="field">
          <span class="field-label">Outcome</span>
          <div class="segmented">
            <label><input type="radio" name="status" value="won" checked /><span>Won</span></label>
            <label><input type="radio" name="status" value="lost" /><span>Not proceeding</span></label>
          </div>
        </div>
        <label class="field"><span class="field-label">Note <span class="field-hint">optional</span></span><textarea class="input textarea" name="reason" rows="3" placeholder="What happened?"></textarea></label>
      </form>`,
      footer: `<button class="button button-ghost" type="button" data-modal-close>Cancel</button><button class="button button-danger" type="submit" form="close-form" id="save-close">Close case</button>`,
      size: 'md',
      onMount({ root, close }) {
        root.querySelector('#close-form').addEventListener('submit', async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const button = root.querySelector('#save-close');
          button.disabled = true;
          button.innerHTML = '<span class="spinner"></span>Closing…';
          try {
            await api.closeCase(caseRow.id, {
              status: String(data.get('status') || 'won'),
              reason: String(data.get('reason') || '').trim(),
            });
            close();
            toast('Case closed.', { tone: 'success' });
            refresh();
          } catch (error) {
            toast(error.message, { tone: 'error' });
            button.disabled = false;
            button.innerHTML = 'Close case';
          }
        });
      },
    });
  }

  main.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.action;
      if (action === 'edit-requirements') requirementsModal();
      else if (action === 'versions') versionsModal();
      else if (action === 'check-inventory' || action === 'recheck-inventory') checkInventory(button);
      else if (action === 'start-search') startSearch(button);
      else if (action === 'focus-requirements') scrollToSection('requirements');
      else if (action === 'focus-inventory') scrollToSection('inventory');
      else if (action === 'focus-search') scrollToSection('ai_search');
      else if (action === 'focus-review') scrollToSection('review');
      else if (action === 'focus-client') scrollToSection('client');
      else if (action === 'build-shortlist') shortlistModal();
      else if (action === 'share-shortlist') shareShortlist(button);
      else if (action === 'copy-client-link' && shortlist) {
        copyText(portalUrl(shortlist.token));
      } else if (action === 'iterate') iterateModal();
      else if (action === 'close-case') closeCaseModal();
      else if (action === 'export-case') {
        window.location.href = `/api/cases/${caseRow.id}/export.json`;
      } else if (action === 'cancel-run' && activeRun) {
        openModal({
          title: 'Cancel this search?',
          body: `<p class="modal-copy">The agent will stop after the current step. Results already captured are retained.</p>`,
          footer: `<button class="button button-ghost" type="button" data-modal-close>Keep running</button><button class="button button-danger" type="button" data-confirm-cancel>Cancel search</button>`,
          size: 'sm',
          onMount({ root, close }) {
            root.querySelector('[data-confirm-cancel]').addEventListener('click', async () => {
              try {
                await api.cancelRun(caseRow.id, activeRun.id);
                close();
                toast('Search cancelled.', { tone: 'info' });
                refresh();
              } catch (error) {
                toast(error.message, { tone: 'error' });
              }
            });
          },
        });
      }
    });
  });

  // Filter the long list. Start on the reviewed long list, not the evidence dump.
  function applyListFilter(filter) {
    main.querySelectorAll('[data-list-filter]').forEach((tab) => {
      tab.classList.toggle('is-active', tab.dataset.listFilter === filter);
    });
    main.querySelectorAll('.listing-row').forEach((row) => {
      const kind = row.dataset.kind;
      const show =
        filter === 'longlist'
          ? kind === 'longlist'
          : filter === 'all'
            ? kind === 'longlist' || kind === 'other'
            : filter === 'duplicates'
              ? kind === 'duplicate'
              : kind === 'excluded';
      row.hidden = !show;
    });
  }
  main.querySelectorAll('[data-list-filter]').forEach((button) => {
    button.addEventListener('click', () => applyListFilter(button.dataset.listFilter));
  });
  if (included.length) applyListFilter('longlist');

  // Expand evidence.
  main.querySelectorAll('[data-expand]').forEach((button) => {
    button.addEventListener('click', () => {
      const row = button.closest('.listing-row');
      const detail = row.querySelector('.listing-detail');
      const open = !detail.hidden;
      detail.hidden = open;
      button.setAttribute('aria-expanded', String(!open));
      button.classList.toggle('is-open', !open);
    });
  });

  // Selection bar.
  const selectionBar = main.querySelector('#selection-bar');
  const selectionCount = main.querySelector('#selection-count');
  function updateSelection() {
    if (!selectionBar) return;
    const count = main.querySelectorAll('[data-select-listing]:checked').length;
    selectionBar.hidden = count === 0;
    if (selectionCount) selectionCount.textContent = String(count);
  }
  main.querySelectorAll('[data-select-listing]').forEach((input) => {
    input.addEventListener('change', updateSelection);
  });
  updateSelection();

  // Live search stream.
  if (activeRun) {
    const consoleElement = main.querySelector('.agent-console');
    const progressBar = main.querySelector('#console-progress');
    const progressLabel = main.querySelector('#console-progress-label');
    const status = main.querySelector('#console-status');
    const stepList = main.querySelector('#console-steps');
    const seen = new Set(stepList ? [...stepList.querySelectorAll('.console-step')].map((item) => item.dataset.seq) : []);
    let done = false;

    if (!stepList) {
      const waiting = consoleElement.querySelector('.console-waiting');
      if (waiting) waiting.outerHTML = `<ol class="console-steps" id="console-steps" aria-live="polite"></ol>`;
    }
    const listElement = main.querySelector('#console-steps');

    const stream = openRunStream(activeRun.id, {
      onStep(payload) {
        const step = payload.step;
        if (seen.has(String(step.seq))) return;
        seen.add(String(step.seq));
        if (!listElement) return;
        const li = document.createElement('li');
        li.className = 'console-step console-step-new';
        li.dataset.seq = step.seq;
        li.innerHTML = `<span class="console-dot console-${escapeHtml(step.level || 'info')}"></span>
          <span class="console-step-copy">
            <span class="console-phase">${escapeHtml(PHASE_LABELS[step.phase] || step.phase)}</span>
            <span class="console-message">${escapeHtml(step.message)}</span>
            ${step.detail ? `<span class="console-detail">${escapeHtml(step.detail)}</span>` : ''}
          </span>
          <span class="console-time">${step.elapsedMs ? duration(step.elapsedMs) : ''}</span>`;
        listElement.appendChild(li);
        listElement.scrollTop = listElement.scrollHeight;
        if (progressBar) progressBar.style.width = `${payload.progress ?? activeRun.progress ?? 0}%`;
        if (progressLabel) progressLabel.textContent = `${payload.progress ?? 0}%`;
      },
      onStatus(payload) {
        if (status && payload.phase) status.textContent = `Agent phase: ${payload.phase}. Streaming steps as they happen.`;
      },
      onDone(payload) {
        if (done) return;
        done = true;
        if (status) status.textContent = payload.cancelled ? 'Search cancelled.' : 'Search complete. Handing the long list to human review…';
        if (payload.run?.status === 'failed') {
          toast(payload.run.error || 'The search failed.', { tone: 'error' });
        } else if (!payload.cancelled) {
          toast('Search complete. The long list is ready for review.', { tone: 'success' });
        }
        setTimeout(refresh, 900);
      },
      onError(payload) {
        if (status) status.textContent = payload.message || 'The agent reported an error.';
        toast(payload.message || 'The search failed.', { tone: 'error' });
      },
      onConnectionError() {
        if (!done && status) status.textContent = 'Reconnecting to the agent…';
      },
    });
    return () => stream.close();
  }

  return () => {};
}
