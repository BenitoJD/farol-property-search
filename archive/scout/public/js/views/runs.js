import { api } from '../api.js';
import {
  esc,
  icon,
  fmtNumber,
  formatDuration,
  formatDateShort,
  formatTime,
  formatDateTime,
  relativeTime,
  shortId,
  splitThread,
  statusBadge,
  emptyState,
  prefillFromProperty,
} from '../ui.js';
import { reportMarkup, mountReport, reportFailureMarkup } from './report.js';

function statusGroup(status) {
  if (status === 'completed') return 'completed';
  if (status === 'running' || status === 'queued' || status === 'cancelling') return 'active';
  return 'failed';
}

function runsStatsMarkup(runs) {
  const completed = runs.filter((run) => run.status === 'completed');
  const active = runs.filter((run) => statusGroup(run.status) === 'active');
  const offers = completed.reduce((sum, run) => sum + (run.stats?.uniqueOffers || 0), 0);
  const durations = completed.map((run) => run.durationMs).filter((value) => Number.isFinite(value));
  const avg = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : null;
  return `<div class="stat-strip">
    <div class="stat-block"><div class="stat-label">Searches</div><div class="stat-value">${fmtNumber(runs.length)}</div><div class="stat-note">${completed.length ? `${completed.length} completed` : 'No completed runs'} · ${active.length} in flight</div></div>
    <div class="stat-block"><div class="stat-label">Completed</div><div class="stat-value">${fmtNumber(completed.length)}</div><div class="stat-note">Reports available for download.</div></div>
    <div class="stat-block"><div class="stat-label">Offers analysed</div><div class="stat-value">${fmtNumber(offers)} <small>unique</small></div><div class="stat-note">Duplicates stripped before benchmarking.</div></div>
    <div class="stat-block"><div class="stat-label">Average run</div><div class="stat-value">${avg ? formatDuration(avg) : '—'}</div><div class="stat-note">From brief to signed-off report.</div></div>
  </div>`;
}

function runCard(run, index) {
  const stats = run.stats || {};
  const title = stats.headline || run.filters?.summary || 'Untitled search';
  const brief = (run.brief || '').replace(/\s+/g, ' ');
  const when = run.finishedAt || run.createdAt;
  return `<a class="run-card" href="#/runs/${esc(run.id)}" style="--i:${index}">
    <div class="run-card-when">
      <strong>${formatDateShort(when)}</strong>
      <span>${formatTime(when)}</span>
      <span>${relativeTime(when)}</span>
    </div>
    <div class="run-card-main">
      <div class="run-card-title">
        ${statusBadge(run.status)}
        <span class="chip">Iteration ${run.iteration}</span>
        <span class="chip">${esc(run.mode === 'demo' ? 'Simulation' : 'Live web')}</span>
      </div>
      <div class="run-card-brief">${esc(title)}</div>
      <div class="run-card-meta">
        <span>Thread ${esc(splitThread(run.threadId))}</span><span class="meta-divider"></span>
        <span>${esc(brief.length > 110 ? `${brief.slice(0, 110)}…` : brief)}</span>
      </div>
    </div>
    <div class="run-card-right">
      <div class="run-card-stat">
        <strong>${stats.uniqueOffers ?? '—'}</strong>
        <span>offers</span>
      </div>
      <div class="run-card-stat">
        <strong>${run.durationMs ? formatDuration(run.durationMs) : '—'}</strong>
        <span>runtime</span>
      </div>
      <span class="icon-arrow">${icon('chevron-right', 12)}</span>
    </div>
  </a>`;
}

export async function renderRuns(root, ctx) {
  root.innerHTML = '<div class="page-loader"><span class="loader-star"></span><p>Reading the run ledger…</p></div>';
  let runs = [];
  try {
    const response = await api.runs(60);
    runs = response.runs || [];
  } catch (error) {
    if (ctx.isStale()) return;
    root.innerHTML = emptyState({
      title: 'The run ledger could not be loaded',
      message: error.message || 'Scout could not read its run history.',
      action: '<button class="button button-quiet" type="button" data-retry-page>Try again</button>',
      mark: 'alert',
    });
    return;
  }
  if (ctx.isStale()) return;

  const state = { filter: 'all', search: '' };
  root.innerHTML = `<header class="page-head">
    <div>
      <div class="eyebrow">Run ledger / ${fmtNumber(runs.length)} searches</div>
      <h1>Every search, on the record<span style="color:var(--terracotta)">.</span></h1>
      <p class="lede">Every brief, iteration and agent step is persisted. Reports can be reopened, exported or refined without re-running the search.</p>
    </div>
    <div class="page-actions">
      <a class="button button-primary" href="#/scout">${icon('compass', 16)} New scout</a>
    </div>
  </header>
  <div data-runs-stats>${runsStatsMarkup(runs)}</div>
  <div class="toolbar">
    <div class="segmented" role="group" aria-label="Filter runs">
      ${[
        ['all', 'All'],
        ['completed', 'Completed'],
        ['active', 'In progress'],
        ['failed', 'Failed / stopped'],
      ]
        .map(
          ([value, label]) =>
            `<button class="segment ${value === 'all' ? 'active' : ''}" type="button" data-run-filter="${value}">${label}</button>`
        )
        .join('')}
    </div>
    <div class="toolbar-search" style="margin-left:auto">${icon('search', 14)}<input type="search" placeholder="Search brief or finding…" data-runs-search aria-label="Search runs"></div>
    <span class="toolbar-count" data-runs-count>${runs.length} runs</span>
  </div>
  <div class="runs-list" data-runs-list></div>`;

  const listEl = root.querySelector('[data-runs-list]');
  const countEl = root.querySelector('[data-runs-count]');
  const searchInput = root.querySelector('[data-runs-search]');

  function filteredRuns() {
    return runs.filter((run) => {
      if (state.filter !== 'all' && statusGroup(run.status) !== state.filter) return false;
      if (!state.search) return true;
      const haystack = [run.brief, run.stats?.headline, run.stats?.summary, run.filters?.summary]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(state.search);
    });
  }

  function renderList() {
    const list = filteredRuns();
    listEl.innerHTML = list.length
      ? list.map((run, index) => runCard(run, index)).join('')
      : emptyState({
          title: state.search || state.filter !== 'all' ? 'No runs match this view' : 'No searches yet',
          message:
            state.search || state.filter !== 'all'
              ? 'Try a different status filter or clear the search.'
              : 'Write a client brief and Scout will build the first report.',
          action: '<a class="button button-primary" href="#/scout">Start a search</a>',
          mark: 'compass',
        });
    countEl.textContent = `${list.length} of ${runs.length} runs`;
  }

  root.querySelectorAll('[data-run-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      root.querySelectorAll('[data-run-filter]').forEach((node) => node.classList.remove('active'));
      button.classList.add('active');
      state.filter = button.dataset.runFilter;
      renderList();
    });
  });

  searchInput.addEventListener('input', () => {
    state.search = searchInput.value.trim().toLowerCase();
    renderList();
  });

  renderList();
}

function runHeaderBar(run) {
  return `<div class="detail-bar">
    <a class="text-button" href="#/runs">${icon('arrow-left', 13)} Run history</a>
    <div class="detail-bar-right">
      <span class="chip">Run ${esc(shortId(run.id))}</span>
      <span class="chip">Iteration ${run.iteration}</span>
      ${statusBadge(run.status)}
    </div>
  </div>`;
}

function pendingMarkup(run) {
  return `${runHeaderBar(run)}
  <div class="card" style="margin-top:18px">
    <div class="run-pending">
      <span class="loader-star"></span>
      <h2>Scout is still on the ground.</h2>
      <p>This run is ${run.status === 'queued' ? 'queued' : 'in progress'}. The page will update automatically; you can safely leave and come back through the run ledger.</p>
      <div class="run-progress" style="width:min(320px,80%);height:3px;background:var(--line);border-radius:2px">
        <span style="width:${Math.max(2, Number(run.progress) || 0)}%;background:var(--terracotta)"></span>
      </div>
      <span class="mono" style="font-size:10px;color:var(--muted)">${Math.round(Number(run.progress) || 0)}% · ${esc(statusBadge(run.status))}</span>
    </div>
  </div>`;
}

function stepsMarkup(steps) {
  if (!steps?.length) return '';
  return `<div class="card" style="margin-top:18px;padding:22px 24px">
    <div class="position-title" style="font-size:20px">Run log</div>
    <div class="run-log">
      ${steps
        .map(
          (step) => `<div class="run-log-row" data-level="${esc(step.level)}">
            <span class="mono">${(step.elapsedMs / 1000).toFixed(1)}s</span>
            <span class="run-log-dot"></span>
            <span>${esc(step.message)}${step.detail ? `<small>${esc(step.detail)}</small>` : ''}</span>
          </div>`
        )
        .join('')}
    </div>
  </div>`;
}

export async function renderRunDetail(root, ctx, runId) {
  root.innerHTML = '<div class="page-loader"><span class="loader-star"></span><p>Opening the report…</p></div>';
  let data;
  try {
    data = await api.run(runId);
  } catch (error) {
    if (ctx.isStale()) return;
    root.innerHTML = emptyState({
      title: 'Run not found',
      message: error.message || 'This run does not exist or could not be loaded.',
      action: '<a class="button button-quiet" href="#/runs">Back to run history</a>',
      mark: 'alert',
    });
    return;
  }
  if (ctx.isStale()) return;

  let run = data.run;
  if (!['completed', 'failed', 'cancelled'].includes(run.status)) {
    root.innerHTML = pendingMarkup(run);
    let timer = null;
    const poll = async () => {
      try {
        const latest = await api.run(runId);
        run = latest.run;
        if (['completed', 'failed', 'cancelled'].includes(run.status)) {
          if (timer) clearTimeout(timer);
          renderRunDetail(root, ctx, runId);
          return;
        }
        root.innerHTML = pendingMarkup(run);
      } catch {
        // transient; keep polling
      }
      timer = setTimeout(poll, 1600);
    };
    timer = setTimeout(poll, 1600);
    ctx.onCleanup(() => {
      if (timer) clearTimeout(timer);
    });
    return;
  }

  if (run.status !== 'completed') {
    root.innerHTML = `${runHeaderBar(run)}
      <div style="margin-top:18px">${reportFailureMarkup(run)}</div>
      ${stepsMarkup(data.steps || [])}`;
    const retry = root.querySelector('[data-run-again]');
    retry?.addEventListener('click', () => {
      sessionStorage.setItem('scout:prefill', JSON.stringify({ brief: run.brief, threadId: run.threadId }));
      location.hash = '#/scout';
    });
    return;
  }

  let report;
  try {
    report = await api.results(runId);
  } catch (error) {
    if (ctx.isStale()) return;
    root.innerHTML = `${runHeaderBar(run)}<div style="margin-top:18px">${emptyState({
      title: 'Report unavailable',
      message: error.message || 'The run completed but the report could not be loaded.',
      action: '<button class="button button-quiet" type="button" data-retry-page>Try again</button>',
      mark: 'alert',
    })}</div>`;
    return;
  }
  if (ctx.isStale()) return;

  const completedLabel = run.finishedAt ? formatDateTime(run.finishedAt) : formatDateTime(run.createdAt);
  root.innerHTML = `${runHeaderBar(run)}
    <div class="detail-meta-line">
      <span>${esc(run.brief)}</span>
      <span>Completed ${esc(completedLabel)} · ${formatDuration(run.durationMs)}</span>
    </div>
    ${reportMarkup(report)}`;
  mountReport(root, report, {
    onRefine: (currentReport) => {
      sessionStorage.setItem(
        'scout:prefill',
        JSON.stringify({ brief: currentReport.run.brief, threadId: currentReport.run.threadId })
      );
      location.hash = '#/scout';
    },
    onScoutProperty: (property) => {
      sessionStorage.setItem('scout:prefill', JSON.stringify({ brief: prefillFromProperty(property) }));
      location.hash = '#/scout';
    },
  });
}
