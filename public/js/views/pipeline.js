import { api } from '../api.js';
import {
  avatarClass,
  escapeHtml,
  formatDate,
  growthChart,
  icon,
  initials,
  money,
  plural,
  relativeTime,
  stageIndex,
  stagePill,
  STAGES,
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

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function kpiCard({ label, value, unit = '', sub, iconName, tone = '', extra = '' }) {
  return `<article class="kpi-card ${tone ? `kpi-${tone}` : ''}">
    <div class="kpi-top">
      <span class="kpi-label">${escapeHtml(label)}</span>
      <span class="kpi-icon">${icon(iconName, 18)}</span>
    </div>
    <div class="kpi-value">${escapeHtml(String(value))}${unit ? `<span class="kpi-unit">${escapeHtml(unit)}</span>` : ''}</div>
    ${sub ? `<p class="kpi-sub">${sub}</p>` : ''}
    ${extra}
  </article>`;
}

function stageTrack(currentIndex, { closed = false } = {}) {
  return `<span class="mini-track" aria-hidden="true">${STAGES.map((stage, index) => {
    const state = closed || index < currentIndex ? 'done' : index === currentIndex ? 'current' : '';
    return `<span class="mini-seg ${state} stage-bg-${stage.key}"></span>`;
  }).join('')}</span>`;
}

function caseRow(item) {
  const index = stageIndex(item.stage);
  const closed = item.stage === 'closed';
  const budget = item.requirement?.budgetMax
    ? money(item.requirement.budgetMax, { period: item.transaction === 'rent' ? 'month' : null })
    : null;
  const meta = [
    item.requirement?.locations?.length ? item.requirement.locations.join(' / ') : null,
    item.requirement
      ? `${item.requirement.bedroomsMin ?? ''}${item.requirement.bedroomsMax && item.requirement.bedroomsMax !== item.requirement.bedroomsMin ? `–${item.requirement.bedroomsMax}` : ''} bed`
      : null,
    budget,
  ]
    .filter(Boolean)
    .map((part) => escapeHtml(part))
    .join('<span class="dot-sep">·</span>');

  return `<a class="case-row" href="#/cases/${escapeHtml(item.id)}" data-stage="${escapeHtml(item.stage)}">
    <span class="avatar ${avatarClass(item.client.name)}">${escapeHtml(initials(item.client.name))}</span>
    <span class="case-main">
      <span class="case-title-line">
        <strong>${escapeHtml(item.client.name)}</strong>
        <span class="case-ref">${escapeHtml(item.ref)}</span>
        ${item.priority === 'high' ? '<span class="priority-flag">High priority</span>' : ''}
        ${item.latestFeedback ? '<span class="feedback-flag">Feedback in</span>' : ''}
      </span>
      <span class="case-summary">${escapeHtml(item.summary || '')}</span>
      <span class="case-meta">${meta || '<span class="muted">Requirements pending</span>'}</span>
      <span class="case-next-inline"><span class="meta-label">Next</span> ${escapeHtml(item.nextAction || 'Open the case')}</span>
    </span>
    <span class="case-stage">
      ${stagePill(item.stage)}
      ${stageTrack(index, { closed })}
    </span>
    <span class="case-updated" title="${escapeHtml(formatDate(item.updatedAt, 'long'))}">${escapeHtml(relativeTime(item.updatedAt))}</span>
    <span class="case-chevron">${icon('chevron-right', 18)}</span>
  </a>`;
}

function attentionItem(item) {
  return `<a class="attention-item" href="#/cases/${escapeHtml(item.caseId)}">
    <span class="attention-sev attention-${escapeHtml(item.severity)}" aria-hidden="true"></span>
    <span class="attention-copy">
      <span class="attention-title">${escapeHtml(item.title)}</span>
      <span class="attention-detail">${escapeHtml(item.detail)}</span>
      <span class="attention-meta">${escapeHtml(item.client)} · ${escapeHtml(item.ref)}</span>
    </span>
    <span class="attention-time">${escapeHtml(relativeTime(new Date(Date.now() - item.ageHours * 3_600_000).toISOString()))}</span>
  </a>`;
}

function activityItem(event) {
  const iconName = EVENT_ICONS[event.type] || 'circle';
  return `<li class="activity-item">
    <span class="activity-icon">${icon(iconName, 14)}</span>
    <span class="activity-copy">
      <span>${escapeHtml(event.message)}</span>
      <span class="activity-meta">${escapeHtml(event.caseRef ? `${event.caseRef} · ` : '')}${escapeHtml(event.actor || 'Team')}</span>
    </span>
    <span class="activity-time">${escapeHtml(relativeTime(event.ts))}</span>
  </li>`;
}

export async function renderPipeline(main) {
  const data = await api.dashboard();
  const { metrics, pipeline, cases, attention, activity, catalogueGrowth, portfolio } = data;
  const activeCases = cases.filter((item) => item.status === 'active');
  const closedCases = cases.filter((item) => item.status !== 'active');
  const stageCounts = { ...pipeline, closed: closedCases.length };
  const totalCases = cases.length;
  const sourceCount = metrics.sources.total;
  const avgDays = metrics.averageDaysToShortlist;
  const withClient = activeCases.filter((item) => item.stage === 'client').length;
  const navCount = document.getElementById('nav-active-count');
  if (navCount) navCount.textContent = String(activeCases.length);

  const activeSummary = plural(activeCases.length, 'case');
  const portfolioDelta = portfolio?.summary?.medianDeltaPct;
  const portfolioDeltaText =
    portfolioDelta === null || portfolioDelta === undefined
      ? 'No portfolio benchmark yet'
      : portfolioDelta === 0
        ? 'The portfolio sits level with the comparable market'
        : `The portfolio sits ${Math.abs(portfolioDelta).toFixed(1)}% ${portfolioDelta > 0 ? 'above' : 'below'} the comparable market`;

  main.innerHTML = `<div class="page pipeline-page">
    <header class="page-head">
      <div class="page-head-copy">
        <p class="kicker">Casebook · ${escapeHtml(formatDate(new Date(), 'long'))}</p>
        <h1>${greeting()}, Inês.</h1>
        <p class="page-intro">${escapeHtml(activeSummary)} in motion. ${withClient ? `${withClient} shortlist${withClient === 1 ? '' : 's'} with a client, ` : ''}${attention.length ? `${attention.length} thing${attention.length === 1 ? '' : 's'} need${attention.length === 1 ? 's' : ''} you.` : 'Everything is moving.'}</p>
      </div>
      <div class="page-actions">
        <button class="button button-ghost" type="button" data-new-enquiry>${icon('plus', 15)} New enquiry</button>
        <a class="button button-primary" href="#/compare">${icon('target', 15)} Analyse a listing</a>
      </div>
    </header>

    <section class="kpi-grid" aria-label="Casebook metrics">
      ${kpiCard({
        label: 'Active cases',
        value: metrics.activeCases,
        sub: `${stageCounts.enquiry} new · ${stageCounts.review} in review · ${stageCounts.client} with clients`,
        iconName: 'pipeline',
      })}
      ${kpiCard({
        label: 'With clients',
        value: withClient,
        sub: metrics.feedbackCount ? `${metrics.feedbackCount} feedback response${metrics.feedbackCount === 1 ? '' : 's'} received` : 'No responses yet',
        iconName: 'send',
        tone: withClient ? 'warm' : '',
      })}
      ${kpiCard({
        label: 'Average to shortlist',
        value: avgDays === null ? '—' : avgDays.toFixed(1),
        unit: avgDays === null ? '' : ' days',
        sub: `${metrics.sharedShortlists} shared shortlist${metrics.sharedShortlists === 1 ? '' : 's'} · from enquiry to client`,
        iconName: 'clock',
      })}
      ${kpiCard({
        label: 'Source catalogue',
        value: sourceCount,
        sub: `${metrics.sources.discovered} discovered by AI · ${metrics.sources.enabled} enabled`,
        iconName: 'globe',
      })}
    </section>

    <a class="price-strip" href="#/portfolio">
      <span class="price-strip-icon">${icon('chart', 22)}</span>
      <span class="price-strip-copy">
        <span class="kicker">Price intelligence · ${portfolio.summary.benchmarked} of ${portfolio.summary.total} portfolio homes benchmarked</span>
        <strong>${escapeHtml(portfolioDeltaText)}.</strong>
        <span class="price-strip-sub">${portfolio.summary.below} with pricing headroom · ${portfolio.summary.above} above market · comparable asking prices, not a valuation</span>
      </span>
      <span class="price-strip-stats">
        <span><b>${portfolio.summary.above}</b> above</span>
        <span><b>${portfolio.summary.at}</b> at market</span>
        <span><b>${portfolio.summary.below}</b> below</span>
      </span>
      <span class="price-strip-arrow">${icon('arrow-right', 18)}</span>
    </a>

    <section class="panel pipeline-board" aria-labelledby="pipeline-title">
      <div class="panel-head">
        <div>
          <p class="kicker">The flow</p>
          <h2 id="pipeline-title">Where every case sits</h2>
        </div>
        <p class="panel-hint">Click a stage to filter the case list</p>
      </div>
      <div class="stage-strip" role="group" aria-label="Filter by stage">
        <button class="stage-chip stage-chip-all is-active" type="button" data-stage-filter="all">
          <span class="stage-chip-dot stage-bg-all"></span>
          <span class="stage-chip-copy"><span class="stage-chip-label">All cases</span><span class="stage-chip-count">${totalCases}</span></span>
        </button>
        ${STAGES.map((stage) => `
          <button class="stage-chip" type="button" data-stage-filter="${stage.key}">
            <span class="stage-chip-dot stage-bg-${stage.key}"></span>
            <span class="stage-chip-copy"><span class="stage-chip-label">${escapeHtml(stage.label)}</span><span class="stage-chip-count">${stageCounts[stage.key] ?? 0}</span></span>
          </button>
        `).join('')}
      </div>
    </section>

    <div class="dashboard-grid">
      <section class="panel case-panel" aria-labelledby="cases-title">
        <div class="panel-head">
          <div>
            <p class="kicker">Live work</p>
            <h2 id="cases-title">Active casebook</h2>
          </div>
          <span class="panel-count" id="case-count-label">${activeCases.length} active</span>
        </div>
        <div class="case-list" id="case-list">
          ${cases.map(caseRow).join('')}
        </div>
        <div class="case-list-empty" id="case-list-empty" hidden>
          ${icon('search', 18)} No cases in this stage right now.
        </div>
        <div class="panel-foot">
          <a class="text-link" href="#/outputs">See the full search history ${icon('arrow-right', 14)}</a>
          <span class="panel-foot-note">${closedCases.length} closed · ${metrics.won} won</span>
        </div>
      </section>

      <aside class="dashboard-rail">
        <section class="panel attention-panel" aria-labelledby="attention-title">
          <div class="panel-head">
            <div>
              <p class="kicker">Today</p>
              <h2 id="attention-title">Needs you</h2>
            </div>
            ${attention.length ? `<span class="count-badge">${attention.length}</span>` : ''}
          </div>
          ${attention.length
            ? `<div class="attention-list">${attention.map(attentionItem).join('')}</div>`
            : `<p class="panel-empty">Nothing is waiting. The casebook is clear.</p>`}
        </section>

        <section class="panel growth-panel" aria-labelledby="growth-title">
          <div class="panel-head">
            <div>
              <p class="kicker">Learning loop</p>
              <h2 id="growth-title">Growing catalogue</h2>
            </div>
            <span class="delta-badge">+${metrics.sources.discovered} by AI</span>
          </div>
          ${growthChart(catalogueGrowth, { height: 118 })}
          <p class="panel-note">Every search writes back the sources it discovered and the ones that performed. The next search starts from a richer list.</p>
          <a class="text-link" href="#/sources">Open source catalogue ${icon('arrow-right', 14)}</a>
        </section>

        <section class="panel activity-panel" aria-labelledby="activity-title">
          <div class="panel-head">
            <div>
              <p class="kicker">Audit trail</p>
              <h2 id="activity-title">Latest from the agent</h2>
            </div>
          </div>
          <ul class="activity-list">
            ${activity.map(activityItem).join('')}
          </ul>
        </section>
      </aside>
    </div>

    <footer class="page-foot">
      <span>Farol is a working demo on a synthetic Iberian market.</span>
      <span>${metrics.runStats.total} agent runs · ${metrics.listingsScanned.toLocaleString('en-GB')} listings scanned · human review on every shortlist</span>
    </footer>
  </div>`;

  main.querySelectorAll('[data-new-enquiry]').forEach((button) => {
    button.addEventListener('click', () => document.getElementById('new-enquiry')?.click());
  });

  const list = main.querySelector('#case-list');
  const empty = main.querySelector('#case-list-empty');
  const countLabel = main.querySelector('#case-count-label');
  const chips = [...main.querySelectorAll('[data-stage-filter]')];
  let filter = 'all';
  function applyFilter(next) {
    filter = next;
    let visible = 0;
    list.querySelectorAll('.case-row').forEach((row) => {
      const show = filter === 'all' || row.dataset.stage === filter;
      row.hidden = !show;
      if (show) visible += 1;
    });
    chips.forEach((chip) => chip.classList.toggle('is-active', chip.dataset.stageFilter === filter));
    empty.hidden = visible !== 0;
    countLabel.textContent = filter === 'all' ? `${visible} active` : `${visible} ${filter.replace('_', ' ')}`;
  }
  chips.forEach((chip) => {
    chip.addEventListener('click', () => applyFilter(chip.dataset.stageFilter));
  });
  return () => {};
}
