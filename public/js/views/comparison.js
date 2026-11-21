import { api, openComparisonStream } from '../api.js';
import {
  confidenceLabel,
  escapeAttr,
  escapeHtml,
  formatDate,
  icon,
  money,
  percent,
  priceChip,
  propertyAlt,
  propertyImage,
  toast,
} from '../ui.js';

const PHASE_LABELS = {
  read: 'Read',
  plan: 'Plan',
  search: 'Search',
  extract: 'Extract',
  filter: 'Filter',
  dedupe: 'Dedupe',
  value: 'Value',
  competitors: 'Competitors',
  complete: 'Done',
};

function toneForVerdict(verdict) {
  if (verdict === 'above') return 'warn';
  if (verdict === 'below') return 'opportunity';
  if (verdict === 'at') return 'good';
  return 'neutral';
}

function moneyRange(low, high, period) {
  if (!Number.isFinite(Number(low)) || !Number.isFinite(Number(high))) return '—';
  const formatter = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  });
  return `${formatter.format(Number(low))}–${formatter.format(Number(high))}${period === 'month' ? '/mo' : ''}`;
}

function duration(ms) {
  if (!Number.isFinite(Number(ms))) return '—';
  const value = Number(ms);
  if (value < 1000) return `${Math.round(value)} ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}s`;
  return `${Math.floor(value / 60_000)}m ${Math.round((value % 60_000) / 1000)}s`;
}

function stepsMarkup(steps, { live = false } = {}) {
  return `<ol class="console-steps" id="comparison-steps" ${live ? 'aria-live="polite"' : ''}>
    ${steps
      .map(
        (step) => `<li class="console-step" data-seq="${step.seq}">
          <span class="console-dot console-${escapeAttr(step.level || 'info')}"></span>
          <span class="console-step-copy">
            <span class="console-phase">${escapeHtml(PHASE_LABELS[step.phase] || step.phase)}</span>
            <span class="console-message">${escapeHtml(step.message)}</span>
            ${step.detail ? `<span class="console-detail">${escapeHtml(step.detail)}</span>` : ''}
          </span>
          <span class="console-time">${step.elapsedMs ? duration(step.elapsedMs) : ''}</span>
        </li>`
      )
      .join('')}
  </ol>`;
}

function liveView(comparison, steps) {
  const subject = comparison.subject;
  return `<div class="page comparison-page">
    <div class="case-topline"><a class="back-link" href="#/compare">${icon('arrow-left', 15)} Compare</a><span class="topline-sep">/</span><span class="mono">${escapeHtml(comparison.ref)}</span></div>
    <header class="comparison-head">
      <div class="comparison-subject">
        <span class="comparison-subject-media"><img src="${propertyImage(subject)}" alt="" /></span>
        <div>
          <span class="kicker">Analyzing your listing</span>
          <h1>${escapeHtml(subject.title)}</h1>
          <p>${escapeHtml(subject.city)}${subject.area ? ` · ${escapeHtml(subject.area)}` : ''} · ${money(subject.price, { period: subject.transaction === 'rent' ? 'month' : null })}</p>
        </div>
      </div>
      <span class="status-chip status-running"><span class="live-dot"></span> Agent running</span>
    </header>
    <section class="agent-console comparison-console">
      <div class="console-head">
        <span class="console-live"><span class="live-dot"></span> Searching the source catalogue · finding similar listings</span>
        <span class="console-progress-label" id="comparison-progress-label">0%</span>
      </div>
      <div class="console-progress"><span id="comparison-progress" style="width:0%"></span></div>
      ${steps.length ? stepsMarkup(steps, { live: true }) : '<p class="console-waiting">Connecting to the agent…</p>'}
      <div class="console-foot"><span id="comparison-status">Streaming steps as they happen.</span><span>Esc to go back</span></div>
    </section>
  </div>`;
}

function failedView(comparison) {
  return `<div class="page">
    <div class="error-panel">
      <span class="error-icon">${icon('alert', 26)}</span>
      <p class="kicker">Analysis failed</p>
      <h1>Analysis failed</h1>
      <p class="muted">${escapeHtml(comparison.error || 'The comparable search did not finish.')}</p>
      <p class="muted">You can run this analysis again; the listing is saved.</p>
      <div class="button-row">
        <button class="button button-primary" type="button" id="retry-comparison">${icon('refresh', 15)} Retry analysis</button>
        <a class="button button-ghost" href="#/compare">Back to compare</a>
      </div>
    </div>
  </div>`;
}

function subjectCard(subject, comparison) {
  return `<section class="comparison-subject-card">
    <div class="comparison-subject-media"><img src="${propertyImage(subject)}" alt="${escapeAttr(propertyAlt(subject))}" /></div>
    <div class="comparison-subject-copy">
      <span class="kicker">${escapeHtml(subject.source === 'portfolio' ? subject.ref : 'Your listing')} · ${escapeHtml(formatDate(comparison.createdAt, 'long'))}</span>
      <h1>${escapeHtml(subject.title)}</h1>
      <p class="comparison-location">${icon('pin', 14)} ${escapeHtml(subject.city)}${subject.area ? ` · ${escapeHtml(subject.area)}` : ''}</p>
      <div class="comparison-meta">
        <span>${icon('home', 14)} ${escapeHtml(subject.type)}</span>
        <span>${icon('bed', 14)} ${subject.bedrooms ?? '—'} bed</span>
        <span>${icon('bath', 14)} ${subject.bathrooms ?? '—'} bath</span>
        <span>${icon('ruler', 14)} ${subject.areaM2 ?? '—'} m²</span>
      </div>
      <div class="comparison-features">${(subject.features || []).slice(0, 6).map((feature) => `<span>${escapeHtml(feature)}</span>`).join('')}</div>
    </div>
    <div class="comparison-asking">
      <span class="meta-label">Your asking price</span>
      <strong>${money(subject.price, { period: subject.transaction === 'rent' ? 'month' : null })}</strong>
      <span>${escapeHtml(comparison.mode === 'demo' ? 'Demo market' : 'Live · Imovirtual')}</span>
    </div>
  </section>`;
}

function verdictHero(report) {
  const check = report.check;
  const narrative = report.narrative;
  const tone = toneForVerdict(check.verdict);
  const headline =
    check.verdict === 'above'
      ? `${Math.abs(check.deltaPct).toFixed(1)}% above the comparable median`
      : check.verdict === 'below'
        ? `${Math.abs(check.deltaPct).toFixed(1)}% below the comparable median`
        : check.available
          ? 'Priced inside the comparable market'
          : 'Not enough comparable evidence';

  if (!check.available) {
    return `<section class="comparison-verdict comparison-verdict-neutral">
      <div class="comparison-verdict-copy">
        <span class="kicker">Comparable verdict</span>
        <h2>${escapeHtml(headline)}</h2>
        <p>${escapeHtml(narrative.summary)}</p>
      </div>
      <div class="comparison-verdict-range">
        <span>Next move</span><strong>${escapeHtml(narrative.recommendation.action)}</strong>
        <span>${escapeHtml(narrative.recommendation.detail)}</span>
      </div>
    </section>`;
  }

  return `<section class="comparison-verdict comparison-verdict-${tone}">
    <div class="comparison-verdict-copy">
      <span class="kicker">Comparable verdict</span>
      <h2><strong>${Math.abs(check.deltaPct).toFixed(1)}%</strong> ${check.verdict === 'above' ? 'above' : check.verdict === 'below' ? 'below' : 'inside'} the comparable median</h2>
      <p>${escapeHtml(narrative.summary)}</p>
      <div class="comparison-recommendation-line">${icon(narrative.recommendation.tone === 'warn' ? 'alert' : narrative.recommendation.tone === 'opportunity' ? 'trend' : 'check-circle', 15)} <strong>${escapeHtml(narrative.recommendation.action)}</strong><span>${escapeHtml(narrative.recommendation.detail)}</span></div>
    </div>
    <div class="comparison-verdict-range">
      <span class="meta-label">Market-supported range</span>
      <strong>${moneyRange(narrative.valueRange?.[0], narrative.valueRange?.[1], report.subject.transaction === 'rent' ? 'month' : null)}</strong>
      <span class="comparison-suggested">Suggested ask <b>${money(narrative.suggestedPrice, { period: report.subject.transaction === 'rent' ? 'month' : null })}</b></span>
      <span class="comparison-ask-gap">${narrative.recommendation.label}</span>
    </div>
  </section>`;
}

function distribution(report) {
  const check = report.check;
  if (!check.available) {
    return `<div class="comparison-dist-empty">${icon('search', 20)} No comparable distribution to plot. Widen coverage before making a price decision.</div>`;
  }
  const values = [check.min, check.p25, check.median, check.p75, check.max, report.subject.price].filter(Number.isFinite);
  const low = Math.min(...values) * 0.96;
  const high = Math.max(...values) * 1.04;
  const span = high - low || 1;
  const position = (value) => Math.max(1, Math.min(99, ((value - low) / span) * 100));
  return `<div class="distribution">
    <div class="distribution-head">
      <span class="kicker">Comparable distribution</span>
      <span>${check.count} homes · ${confidenceLabel(check.confidence)}</span>
    </div>
    <div class="distribution-track">
      <span class="distribution-band" style="left:${position(check.p25)}%;right:${100 - position(check.p75)}%"></span>
      <span class="distribution-median" style="left:${position(check.median)}%"></span>
      <span class="distribution-subject" style="left:${position(report.subject.price)}%"><span>Your ask</span></span>
      ${check.comparables.map((comp) => `<span class="distribution-dot" style="left:${position(comp.price)}%" title="${escapeAttr(`${comp.title} · ${money(comp.price, { period: report.subject.transaction === 'rent' ? 'month' : null })}`)}"></span>`).join('')}
    </div>
    <div class="distribution-labels">
      <span>${money(check.min, { period: report.subject.transaction === 'rent' ? 'month' : null })}</span>
      <span>p25 ${money(check.p25, { period: report.subject.transaction === 'rent' ? 'month' : null })}</span>
      <span>median ${money(check.median, { period: report.subject.transaction === 'rent' ? 'month' : null })}</span>
      <span>p75 ${money(check.p75, { period: report.subject.transaction === 'rent' ? 'month' : null })}</span>
      <span>${money(check.max, { period: report.subject.transaction === 'rent' ? 'month' : null })}</span>
    </div>
  </div>`;
}

function vsAskChip(delta) {
  if (!Number.isFinite(delta)) return '<span class="price-chip price-chip-neutral">—</span>';
  const tone = delta > 7 ? 'warn' : delta < -7 ? 'good' : 'neutral';
  return `<span class="price-chip price-chip-${tone}">${delta > 0 ? '+' : ''}${delta.toFixed(1)}% vs your ask</span>`;
}

function kpi(label, value, sub = '', iconName = 'chart') {
  return `<article class="comparison-kpi">
    <span class="comparison-kpi-icon">${icon(iconName, 16)}</span>
    <span class="comparison-kpi-label">${escapeHtml(label)}</span>
    <strong>${value}</strong>
    ${sub ? `<span class="comparison-kpi-sub">${sub}</span>` : ''}
  </article>`;
}

function competitorsTable(report) {
  if (!report.competitors.length) return '<p class="muted">No competitor had a comparable listing.</p>';
  return `<div class="table-scroll"><table class="data-table competitor-table">
    <thead><tr><th>Competitor</th><th class="numeric">Comps</th><th class="numeric">Median</th><th class="numeric">€/m²</th><th class="numeric">Range</th><th>Vs your ask</th></tr></thead>
    <tbody>
      ${report.competitors
        .map(
          (competitor) => `<tr>
            <td><div class="competitor-name"><span class="competitor-mark">${escapeHtml(competitor.sourceName.slice(0, 1))}</span><div><strong>${escapeHtml(competitor.sourceName)}</strong><span>${escapeHtml(competitor.sourceDomain || '')}</span></div></div></td>
            <td class="numeric">${competitor.listings}</td>
            <td class="numeric">${money(competitor.median, { period: report.subject.transaction === 'rent' ? 'month' : null })}</td>
            <td class="numeric">${competitor.medianPerM2 ? `€${competitor.medianPerM2.toLocaleString('en-GB')}` : '—'}</td>
            <td class="numeric">${moneyRange(competitor.min, competitor.max, report.subject.transaction === 'rent' ? 'month' : null)}</td>
            <td>${vsAskChip(competitor.deltaPct)}</td>
          </tr>`
        )
        .join('')}
    </tbody>
  </table></div>`;
}

function comparableRow(comp, subject) {
  return `<article class="comparison-comp">
    <div class="comparison-comp-thumb"><img src="${propertyImage(comp)}" alt="" loading="lazy" /></div>
    <div class="comparison-comp-copy">
      <div class="comparison-comp-title"><strong>${escapeHtml(comp.title)}</strong>${comp.mirrorCount ? `<span class="mirror-badge">${icon('copy', 11)} ${comp.mirrorCount} mirror${comp.mirrorCount === 1 ? '' : 's'}</span>` : ''}</div>
      <span class="comparison-comp-meta">${escapeHtml(comp.sourceName)}${comp.sourceDomain ? ` · ${escapeHtml(comp.sourceDomain)}` : ''} · ${escapeHtml(comp.city)}${comp.area ? ` · ${escapeHtml(comp.area)}` : ''}</span>
      <span class="comparison-comp-specs">${comp.bedrooms} bed · ${comp.bathrooms ?? '—'} bath · ${comp.areaM2 ?? '—'} m²${comp.features?.length ? ` · ${comp.features.slice(0, 3).map((feature) => escapeHtml(feature)).join(' · ')}` : ''}</span>
    </div>
    <div class="comparison-comp-price">
      <strong>${money(comp.price, { period: subject.transaction === 'rent' ? 'month' : null })}</strong>
      <span>${comp.pricePerM2 ? `€${comp.pricePerM2.toLocaleString('en-GB')}/m²` : '—'}</span>
    </div>
    <div class="comparison-comp-delta">
      ${priceChip({ available: true, median: comp.price, verdict: comp.deltaPct > 7 ? 'above' : comp.deltaPct < -7 ? 'below' : 'at', deltaPct: comp.deltaPct })}
      <span>${Math.round(comp.matchScore)}% similar</span>
    </div>
  </article>`;
}

function reportView(bundle) {
  const { comparison, steps } = bundle;
  const report = comparison.report;
  const subject = report.subject;
  const check = report.check;
  const unit = subject.transaction === 'rent' ? 'month' : null;
  return `<div class="page comparison-page">
    <div class="case-topline">
      <a class="back-link" href="#/compare">${icon('arrow-left', 15)} Compare</a>
      <span class="topline-sep">/</span>
      <span class="mono">${escapeHtml(comparison.ref)}</span>
      <span class="topline-sep">/</span>
      <span>${escapeHtml(formatDate(comparison.createdAt, 'long'))}</span>
      <span class="status-chip status-completed">Completed</span>
      <span class="status-chip ${comparison.mode === 'demo' ? 'status-demo' : 'status-live'}">${escapeHtml(comparison.mode === 'demo' ? 'Demo market' : 'Live · Imovirtual')}</span>
    </div>

    <header class="comparison-page-head">
      <div>
        <p class="kicker">Listing intelligence · ${duration(comparison.durationMs)}</p>
        <h1>Comparable value report</h1>
      </div>
      <div class="page-actions">
        <a class="button button-ghost" href="/api/comparisons/${escapeAttr(comparison.id)}/export.csv">${icon('download', 15)} Export CSV</a>
        <a class="button button-ghost" href="/api/comparisons/${escapeAttr(comparison.id)}/export.json">${icon('file', 15)} Export JSON</a>
        <a class="button button-primary" href="#/compare">${icon('plus', 15)} New analysis</a>
      </div>
    </header>

    ${subjectCard(subject, comparison)}
    ${verdictHero(report)}

    <section class="comparison-kpis">
      ${kpi('Your asking price', money(subject.price, { period: unit }), subject.transaction === 'rent' ? 'per month' : 'total', 'home')}
      ${kpi('Comparable median', check.available ? money(check.median, { period: unit }) : '—', `${check.count} comparable${check.count === 1 ? '' : 's'}`, 'target')}
      ${kpi('Suggested ask', narrativeMoney(report.narrative.suggestedPrice, unit), `${confidenceLabel(check.confidence)} evidence`, 'sparkles')}
      ${kpi('Your €/m²', check.pricePerM2 ? `€${check.pricePerM2.toLocaleString('en-GB')}` : '—', check.medianPerM2 ? `median €${check.medianPerM2.toLocaleString('en-GB')}/m²` : 'no size evidence', 'ruler')}
      ${kpi('Market position', check.available ? `${check.deltaPct > 0 ? '+' : ''}${check.deltaPct.toFixed(1)}%` : '—', `±${check.corridor}% corridor`, 'trend')}
      ${kpi('Competitors', String(report.competitors.length), `${report.coverage.sourcesWithComps} sources with comps`, 'globe')}
    </section>

    ${distribution(report)}

    <div class="comparison-grid">
      <section class="panel">
        <div class="panel-head">
          <div><p class="kicker">Competitor pricing</p><h2>Who is pricing what</h2></div>
          <span class="panel-count">${report.competitors.length} competitors</span>
        </div>
        ${competitorsTable(report)}
        <p class="panel-note">Competitor counts include the listing observations that survived dedupe. Mirrors are collapsed at property level, then attributed to the sources that carried them.</p>
      </section>

      <section class="panel comparison-recommendations">
        <div class="panel-head"><div><p class="kicker">What this means</p><h2>Recommended next moves</h2></div></div>
        <div class="recommendation-hero recommendation-${escapeAttr(report.narrative.recommendation.tone)}">
          <span>${icon(report.narrative.recommendation.tone === 'warn' ? 'alert' : report.narrative.recommendation.tone === 'opportunity' ? 'trend' : 'check-circle', 20)}</span>
          <div><strong>${escapeHtml(report.narrative.recommendation.action)}</strong><p>${escapeHtml(report.narrative.recommendation.detail)}</p></div>
        </div>
        <ul class="recommendation-bullets">
          ${report.narrative.bullets.map((bullet) => `<li>${icon('arrow-right', 12)} <span>${escapeHtml(bullet)}</span></li>`).join('')}
        </ul>
      </section>
    </div>

    <section class="panel">
      <div class="panel-head">
        <div><p class="kicker">Evidence</p><h2>${report.comps.length} comparable listings used</h2></div>
        <span class="panel-count">${report.coverage.mirrorsCollapsed} mirrors collapsed</span>
      </div>
      ${report.comps.length ? `<div class="comparison-comps">${report.comps.map((comp) => comparableRow(comp, subject)).join('')}</div>` : '<div class="empty-state"><span class="empty-icon">' + icon('search', 22) + '</span><h3>No similar homes found</h3><p>Try widening the area or adding a source.</p></div>'}
      <div class="panel-foot panel-foot-split">
        <span class="panel-foot-note">${icon('info', 13)} Asking prices only. Condition, title, lease terms and availability remain human checks.</span>
        <span class="panel-foot-note">Similarity: same city and type, bedrooms ±1, area 60–160%</span>
      </div>
    </section>

    <div class="comparison-grid comparison-bottom">
      <section class="panel comparison-coverage-panel">
        <div class="panel-head"><div><p class="kicker">Coverage & confidence</p><h2>What the agent saw</h2></div><span class="status-chip status-${escapeHtml(check.confidence)}">${escapeHtml(confidenceLabel(check.confidence))}</span></div>
        <div class="comparison-coverage-grid">
          <span><b>${report.coverage.sourcesPlanned}</b><span>sources planned</span></span>
          <span><b>${report.coverage.sourcesWithComps}</b><span>with comps</span></span>
          <span><b>${report.coverage.marketListings}</b><span>unique listings</span></span>
          <span><b>${report.coverage.marketCopies}</b><span>observations</span></span>
          <span><b>${report.coverage.comps}</b><span>comparables</span></span>
          <span><b>${report.coverage.mirrorsCollapsed}</b><span>mirrors</span></span>
          <span><b>${report.coverage.selfExcluded ?? 0}</b><span>own-listing matches removed</span></span>
        </div>
        <div class="comparison-queries">
          <span class="meta-label">Search plan</span>
          ${report.queries.map((query) => `<span class="source-pill">${icon('search', 11)} ${escapeHtml(query)}</span>`).join('')}
        </div>
        <p class="panel-note">${escapeHtml(comparison.mode === 'demo' ? 'Demo market: every listing and price is synthetic.' : `Live comparison: ${report.sourceLabel || 'Imovirtual public search results'}. Confirm source terms and availability before acting on the evidence.`)}</p>
      </section>

      <section class="panel">
        <div class="panel-head"><div><p class="kicker">Audit</p><h2>How the report was built</h2></div><span class="panel-count">${steps.length} steps</span></div>
        <div class="agent-console comparison-console">
          <div class="console-head"><span class="console-live">${icon('sparkles', 14)} Comparable agent</span><span class="console-progress-label">${duration(comparison.durationMs)}</span></div>
          ${stepsMarkup(steps)}
        </div>
      </section>
    </div>

    <footer class="page-foot">
      <span>Farol comparable value report · ${escapeHtml(comparison.ref)}</span>
      <span>Indicative asking-price analysis, not a formal valuation</span>
    </footer>
  </div>`;
}

function narrativeMoney(value, period) {
  return value ? money(value, { period }) : '—';
}

export async function renderComparison(main, route) {
  const bundle = await api.comparison(route.id);
  const { comparison, steps } = bundle;

  if (comparison.status === 'failed') {
    main.innerHTML = failedView(comparison);
    main.querySelector('#retry-comparison')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.innerHTML = '<span class="spinner"></span>Retrying…';
      try {
        await api.retryComparison(comparison.id);
        window.dispatchEvent(new Event('farol:refresh'));
      } catch (error) {
        toast(error.message, { tone: 'error' });
        button.disabled = false;
        button.innerHTML = `${icon('refresh', 15)} Retry analysis`;
      }
    });
    return () => {};
  }

  if (comparison.status === 'queued' || comparison.status === 'running') {
    main.innerHTML = liveView(comparison, steps);
    const stepList = main.querySelector('#comparison-steps');
    const progress = main.querySelector('#comparison-progress');
    const progressLabel = main.querySelector('#comparison-progress-label');
    const status = main.querySelector('#comparison-status');
    const seen = new Set(stepList ? [...stepList.querySelectorAll('.console-step')].map((node) => node.dataset.seq) : []);
    const list = stepList || (() => {
      const waiting = main.querySelector('.console-waiting');
      if (!waiting) return null;
      waiting.outerHTML = '<ol class="console-steps" id="comparison-steps" aria-live="polite"></ol>';
      return main.querySelector('#comparison-steps');
    })();
    let done = false;
    const stream = openComparisonStream(comparison.id, {
      onStep(payload) {
        if (!list || seen.has(String(payload.step.seq))) return;
        seen.add(String(payload.step.seq));
        const li = document.createElement('li');
        li.className = 'console-step console-step-new';
        li.dataset.seq = payload.step.seq;
        li.innerHTML = `<span class="console-dot console-${escapeHtml(payload.step.level || 'info')}"></span>
          <span class="console-step-copy">
            <span class="console-phase">${escapeHtml(PHASE_LABELS[payload.step.phase] || payload.step.phase)}</span>
            <span class="console-message">${escapeHtml(payload.step.message)}</span>
            ${payload.step.detail ? `<span class="console-detail">${escapeHtml(payload.step.detail)}</span>` : ''}
          </span>
          <span class="console-time">${payload.step.elapsedMs ? duration(payload.step.elapsedMs) : ''}</span>`;
        list.appendChild(li);
        list.scrollTop = list.scrollHeight;
        if (progress) progress.style.width = `${payload.progress || 0}%`;
        if (progressLabel) progressLabel.textContent = `${payload.progress || 0}%`;
      },
      onDone() {
        if (done) return;
        done = true;
        if (status) status.textContent = 'Analysis complete. Opening the value report…';
        setTimeout(() => window.dispatchEvent(new Event('farol:refresh')), 500);
      },
      onError(payload) {
        if (status) status.textContent = payload.message || 'The analysis failed.';
      },
      onConnectionError() {
        if (!done && status) status.textContent = 'Reconnecting to the agent…';
      },
    });
    return () => stream.close();
  }

  if (!comparison.report) {
    main.innerHTML = failedView({ ...comparison, error: 'The report is missing.' });
    return () => {};
  }

  main.innerHTML = reportView(bundle);
  return () => {};
}
