import { api } from '../api.js';
import {
  escapeAttr,
  escapeHtml,
  formatDate,
  growthChart,
  icon,
  percent,
  relativeTime,
} from '../ui.js';

function runStatusChip(status) {
  const label = { completed: 'Complete', running: 'Running', failed: 'Failed', cancelled: 'Cancelled', queued: 'Queued' }[status] || status;
  return `<span class="status-chip status-${escapeHtml(status)}">${escapeHtml(label)}</span>`;
}

function decisionBar(decisions) {
  const total = Object.values(decisions).reduce((sum, value) => sum + value, 0) || 1;
  return `<div class="decision-bar">
    <span class="decision-seg decision-interested" style="flex:${decisions.interested}"></span>
    <span class="decision-seg decision-question" style="flex:${decisions.question}"></span>
    <span class="decision-seg decision-not_for_us" style="flex:${decisions.not_for_us}"></span>
    <span class="decision-seg decision-pending" style="flex:${decisions.pending}"></span>
  </div>
  <div class="decision-legend">
    <span><i class="legend-dot decision-interested"></i>${decisions.interested} interested</span>
    <span><i class="legend-dot decision-question"></i>${decisions.question} questions</span>
    <span><i class="legend-dot decision-not_for_us"></i>${decisions.not_for_us} declined</span>
    <span><i class="legend-dot decision-pending"></i>${decisions.pending} waiting</span>
  </div>`;
}

export async function renderOutputs(main) {
  const data = await api.outputs();
  const { metrics, runs, growth, portfolio, discoveredSources, caseSources } = data;
  const priceTotal = metrics.price.above + metrics.price.at + metrics.price.below || 1;
  const avgRun = metrics.runStats.avg_ms ? metrics.runStats.avg_ms / 1000 : null;

  main.innerHTML = `<div class="page outputs-page">
    <header class="page-head">
      <div class="page-head-copy">
        <p class="kicker">Outputs · evidence of the loop</p>
        <h1>What the work leaves behind.</h1>
        <p class="page-intro">Long lists, reviewed shortlists, a growing source catalogue and search history. Every run compounds what the team knows and can reuse.</p>
      </div>
      <div class="page-actions">
        <a class="button button-ghost" href="/api/sources/export.csv">${icon('download', 15)} Source catalogue</a>
        <a class="button button-ghost" href="#/portfolio">${icon('chart', 15)} Price intelligence</a>
      </div>
    </header>

    <section class="kpi-grid kpi-grid-4">
      <article class="kpi-card">
        <div class="kpi-top"><span class="kpi-label">Agent searches</span><span class="kpi-icon">${icon('sparkles', 18)}</span></div>
        <div class="kpi-value">${metrics.searchRuns}</div>
        <p class="kpi-sub">${metrics.runStats.completed} completed · ${metrics.runStats.failed} failed · avg ${avgRun ? `${avgRun.toFixed(0)}s` : '—'}</p>
      </article>
      <article class="kpi-card">
        <div class="kpi-top"><span class="kpi-label">Long-list homes</span><span class="kpi-icon">${icon('list', 18)}</span></div>
        <div class="kpi-value">${metrics.longList}</div>
        <p class="kpi-sub">${metrics.duplicateGroups} mirror groups collapsed</p>
      </article>
      <article class="kpi-card">
        <div class="kpi-top"><span class="kpi-label">Shortlist decisions</span><span class="kpi-icon">${icon('users', 18)}</span></div>
        <div class="kpi-value">${metrics.shortlistItems}</div>
        <p class="kpi-sub">${metrics.sharedShortlists} shared · ${metrics.feedbackCount} feedback responses</p>
      </article>
      <article class="kpi-card">
        <div class="kpi-top"><span class="kpi-label">Source reuse</span><span class="kpi-icon">${icon('refresh', 18)}</span></div>
        <div class="kpi-value">${metrics.sourceReuse}</div>
        <p class="kpi-sub">sources used more than once</p>
      </article>
    </section>

    <div class="outputs-grid">
      <section class="panel">
        <div class="panel-head">
          <div><p class="kicker">Compounding coverage</p><h2>Catalogue and search history</h2></div>
          <span class="delta-badge">+${metrics.sources.discovered} AI sources</span>
        </div>
        ${growthChart(growth, { height: 150 })}
        <p class="panel-note">Each week adds sources that the engine discovered or the team imported. Search history remains attached to the case, so an iteration can start from the last brief rather than a blank page.</p>
        <div class="output-mini-grid">
          <span><b>${metrics.sources.total}</b><span>sources in catalogue</span></span>
          <span><b>${metrics.listingsScanned.toLocaleString('en-GB')}</b><span>listings scanned</span></span>
          <span><b>${metrics.averageDaysToShortlist === null ? '—' : metrics.averageDaysToShortlist.toFixed(1)}</b><span>days to shortlist</span></span>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <div><p class="kicker">Price intelligence</p><h2>The price read across the book</h2></div>
          <a class="text-link" href="#/portfolio">Open ${icon('arrow-right', 13)}</a>
        </div>
        <div class="price-read-big">
          <span class="price-read-number">${metrics.price.above + metrics.price.at + metrics.price.below}</span>
          <span class="price-read-copy">long-list homes price-checked against comparable asking prices</span>
        </div>
        <div class="price-read-bar">
          <span class="price-read-seg price-read-above" style="flex:${metrics.price.above}">${metrics.price.above}</span>
          <span class="price-read-seg price-read-at" style="flex:${metrics.price.at}">${metrics.price.at}</span>
          <span class="price-read-seg price-read-below" style="flex:${metrics.price.below}">${metrics.price.below}</span>
        </div>
        <div class="price-read-legend">
          <span><i class="legend-dot price-read-above"></i>${metrics.price.above} above market</span>
          <span><i class="legend-dot price-read-at"></i>${metrics.price.at} at market</span>
          <span><i class="legend-dot price-read-below"></i>${metrics.price.below} below market</span>
        </div>
        <div class="panel-divider"></div>
        <div class="portfolio-lite">
          <div><span class="meta-label">Portfolio median position</span><strong>${portfolio.summary.medianDeltaPct === null ? '—' : percent(portfolio.summary.medianDeltaPct)}</strong></div>
          <div><span class="meta-label">Benchmarked</span><strong>${portfolio.summary.benchmarked}/${portfolio.summary.total}</strong></div>
          <div><span class="meta-label">Headroom</span><strong>${portfolio.summary.below} homes</strong></div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <div><p class="kicker">Client response</p><h2>What clients decided</h2></div>
          <span class="panel-count">${metrics.feedbackCount} responses</span>
        </div>
        ${decisionBar(metrics.decisions)}
        <div class="panel-divider"></div>
        <div class="turnaround-grid">
          <span><b>${metrics.averageDaysToShortlist === null ? '—' : metrics.averageDaysToShortlist.toFixed(1)}</b><span>days enquiry → shortlist</span></span>
          <span><b>${avgRun ? `${avgRun.toFixed(0)}s` : '—'}</b><span>average agent run</span></span>
          <span><b>${metrics.averageDaysToClose === null ? '—' : metrics.averageDaysToClose.toFixed(1)}</b><span>days to close</span></span>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <div><p class="kicker">Reusable systems</p><h2>Where enquiries come from</h2></div>
        </div>
        <div class="source-mix">
          ${caseSources
            .map(
              (source) => `<div class="source-mix-row">
                <span>${escapeHtml(source.source)}</span>
                <span class="source-mix-bar"><span style="width:${Math.round((source.count / Math.max(1, caseSources.reduce((sum, item) => sum + item.count, 0))) * 100)}%"></span></span>
                <b>${source.count}</b>
              </div>`
            )
            .join('')}
        </div>
        <div class="panel-divider"></div>
        <span class="meta-label">Sources discovered by the engine</span>
        <div class="discovered-sources">
          ${discoveredSources.length
            ? discoveredSources
                .map(
                  (source) => `<span class="source-pill">${icon('sparkles', 11)} ${escapeHtml(source.name)} <em>${escapeHtml(source.domain)}</em></span>`
                )
                .join('')
            : '<span class="muted">No sources discovered yet.</span>'}
        </div>
        <a class="text-link" href="#/sources">Open the full catalogue ${icon('arrow-right', 13)}</a>
      </section>
    </div>

    <section class="panel">
      <div class="panel-head">
        <div><p class="kicker">Search history</p><h2>Every agent run, retained</h2></div>
        <span class="panel-count">${runs.length} runs</span>
      </div>
      <div class="table-scroll">
        <table class="data-table runs-table">
          <thead>
            <tr><th>Case</th><th>Run</th><th>Status</th><th class="numeric">Sources</th><th class="numeric">Results</th><th class="numeric">Duplicates</th><th class="numeric">Long list</th><th class="numeric">Duration</th><th>When</th></tr>
          </thead>
          <tbody>
            ${runs
              .map(
                (run) => `<tr>
                  <td><a class="table-link" href="#/cases/${escapeAttr(run.caseId)}"><strong>${escapeHtml(run.caseRef)}</strong><span>${escapeHtml(run.clientName)}</span></a></td>
                  <td><span class="run-kind">${icon(run.kind === 'inventory' ? 'home' : 'sparkles', 13)} ${run.kind === 'inventory' ? 'Inventory' : `Search v${run.iteration}`}</span></td>
                  <td>${runStatusChip(run.status)}</td>
                  <td class="numeric">${run.stats?.sourcesQueried ?? '—'}</td>
                  <td class="numeric">${run.stats?.extracted ?? '—'}</td>
                  <td class="numeric">${run.stats?.duplicates ?? '—'}</td>
                  <td class="numeric">${run.stats?.longList ?? '—'}</td>
                  <td class="numeric">${run.durationMs ? `${(run.durationMs / 1000).toFixed(0)}s` : '—'}</td>
                  <td class="muted">${escapeHtml(relativeTime(run.createdAt))}</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
      <div class="panel-foot panel-foot-split">
        <span class="panel-foot-note">Every run is reproducible from its stored requirements, source catalogue and extracted evidence.</span>
        <span class="panel-foot-note">${metrics.runStats.total} total runs · ${metrics.runStats.failed} failed</span>
      </div>
    </section>

    <footer class="page-foot">
      <span>Outputs map to the flow: long list, shortlist, growing catalogue, search history, faster turnaround.</span>
      <span>${formatDate(new Date(), 'long')} · demo market</span>
    </footer>
  </div>`;

  return () => {};
}
