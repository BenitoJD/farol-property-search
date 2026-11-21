import { api } from '../api.js';
import {
  esc,
  icon,
  fmtNumber,
  relativeTime,
  shortId,
  toast,
  clearToasts,
  emptyState,
  prefillFromProperty,
} from '../ui.js';
import { showReportIn, reportFailureMarkup } from './report.js';

const DEFAULT_BRIEF =
  'Long-term rental for a retired couple: 2–3 bedroom apartment or townhouse with sea view and pool access, around Lagos or Portimão, budget up to €2,200/month. Prefer walkable to amenities.';

const EXAMPLES = [
  {
    label: 'Algarve long let',
    brief: DEFAULT_BRIEF,
  },
  {
    label: 'Vilamoura purchase',
    brief:
      'Purchase for a family relocating from the UK: 3-bedroom villa or apartment in Vilamoura with a pool and parking, budget up to €750,000. Prefer walking distance to the marina.',
  },
  {
    label: 'Lisbon rental',
    brief:
      'Long-term rental in Lisbon or Cascais for a professional couple: 2–3 bedrooms, furnished, with parking and outdoor space, up to €3,200 per month.',
  },
  {
    label: 'Marbella rental',
    brief:
      'Long-term rental on the Costa del Sol around Marbella: 2–3 bedroom apartment with pool and sea views, budget up to €2,300/month.',
  },
];

const LOCATIONS = [
  ['', 'Auto from brief'],
  ['Algarve', 'Algarve (all)'],
  ['Lagos', 'Lagos'],
  ['Portimão', 'Portimão'],
  ['Albufeira', 'Albufeira'],
  ['Vilamoura', 'Vilamoura'],
  ['Tavira', 'Tavira'],
  ['Faro', 'Faro'],
  ['Olhão', 'Olhão'],
  ['Lisbon', 'Lisbon'],
  ['Cascais', 'Cascais'],
  ['Marbella', 'Marbella'],
  ['Estepona', 'Estepona'],
  ['Spain', 'Spain (all)'],
  ['Portugal', 'Portugal (all)'],
];

const PHASES = [
  { key: 'interpret', label: 'Interpret brief' },
  { key: 'plan', label: 'Plan sources' },
  { key: 'search', label: 'Search market' },
  { key: 'normalise', label: 'Normalise & filter' },
  { key: 'match', label: 'Match portfolio' },
  { key: 'benchmark', label: 'Benchmark prices' },
  { key: 'report', label: 'Write report' },
];

const PHASE_TITLES = {
  interpret: 'Reading the brief',
  plan: 'Planning the search',
  search: 'Scout is on the ground',
  normalise: 'Normalising the market',
  match: 'Matching your portfolio',
  benchmark: 'Turning data into a position',
  report: 'Writing the report',
};

function readPrefill() {
  try {
    const raw = sessionStorage.getItem('scout:prefill');
    if (!raw) return null;
    sessionStorage.removeItem('scout:prefill');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.brief !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

function exampleButtons() {
  return EXAMPLES.map(
    (example, index) =>
      `<button class="example-chip" type="button" data-example="${index}">${esc(example.label)}</button>`
  ).join('');
}

function phaseListMarkup() {
  return PHASES.map(
    (phase, index) => `<div class="phase-item ${index === 0 ? 'active' : ''}" data-phase="${phase.key}">
      <span class="phase-dot">${icon('check', 7)}</span>
      <span class="phase-name">${esc(phase.label)}</span>
    </div>`
  ).join('');
}

function heroMarkup(meta) {
  const overview = meta?.overview || {};
  const sources = overview.sources ?? 14;
  const homes = overview.properties ?? 20;
  const lastRun = overview.lastRun;
  const lastScan = lastRun?.finished_at ? relativeTime(lastRun.finished_at) : 'No scans yet';
  return `<div class="scout-hero">
    <div class="hero-copy">
      <div class="eyebrow">Price intelligence / Property Buy or Rent</div>
      <h1>Know what the market is asking<span class="dot">.</span></h1>
      <p class="hero-lede">Write a client brief. Scout searches the property market, strips out duplicate listings and benchmarks your portfolio against what buyers and tenants are actually being quoted.</p>
      <div class="hero-meta">
        <span class="chip">${icon('source', 11)} ${fmtNumber(sources)} catalogue sources</span>
        <span class="chip">${icon('building', 11)} ${fmtNumber(homes)} portfolio homes</span>
        <span class="chip">${icon('shield', 11)} EUR-normalised</span>
      </div>
    </div>
    <aside class="hero-panel" aria-label="Market coverage">
      <div class="hero-panel-head">
        <span class="hero-panel-title">Market coverage</span>
        <span class="hero-panel-live">catalogue ${meta?.mode === 'live' ? 'live' : 'simulated'}</span>
      </div>
      <div class="hero-map-wrap">
        <img src="/assets/hero-map.svg" alt="Stylised map of the Algarve with Lagos, Portimão, Albufeira and Tavira marked" />
      </div>
      <div class="hero-stats">
        <div class="hero-stat"><span class="hero-stat-label">Sources</span><span class="hero-stat-value">${fmtNumber(sources)}</span></div>
        <div class="hero-stat"><span class="hero-stat-label">Portfolio</span><span class="hero-stat-value">${fmtNumber(homes)}</span></div>
        <div class="hero-stat"><span class="hero-stat-label">Last scan</span><span class="hero-stat-value" style="font-size:15px;line-height:1.4">${esc(lastScan)}</span></div>
      </div>
    </aside>
  </div>`;
}

function sideMarkup(meta) {
  const overview = meta?.overview || {};
  const total = overview.properties ?? 20;
  const rentals = overview.rentals ?? 13;
  const sales = overview.sales ?? 7;
  const rentPct = total ? Math.round((rentals / total) * 100) : 0;
  return `<aside class="side-stack">
    <div class="card how-card">
      <div class="eyebrow no-rule" style="font-size:8px">The loop</div>
      <div class="card-title" style="margin-top:7px">From brief to a defensible ask.</div>
      <div class="how-steps">
        <div class="how-step"><span class="how-num">01</span><div><h4>Read the brief</h4><p>Intent, geography, budget and must-haves, with assumptions made explicit.</p></div></div>
        <div class="how-step"><span class="how-num">02</span><div><h4>Search wide</h4><p>Every relevant source, including new agencies Scout discovers along the way.</p></div></div>
        <div class="how-step"><span class="how-num">03</span><div><h4>Strip duplicates</h4><p>Cross-posted listings collapse before a median is ever calculated.</p></div></div>
        <div class="how-step"><span class="how-num">04</span><div><h4>Take a position</h4><p>Mirrors, comparables and a recommended ask — with the evidence attached.</p></div></div>
      </div>
    </div>
    <div class="card portfolio-mini">
      <div class="section-kicker">In the portfolio</div>
      <div class="mini-number">${fmtNumber(total)}</div>
      <div class="mini-label">active homes across the western Algarve, Lisbon and Andalusia.</div>
      <div class="mini-split" aria-hidden="true"><span class="rent" style="width:${rentPct}%"></span><span class="sale" style="width:${100 - rentPct}%"></span></div>
      <div class="mini-legend">
        <span><i style="background:var(--pine-3)"></i>Long lets ${rentals}</span>
        <span><i style="background:var(--terracotta)"></i>For sale ${sales}</span>
      </div>
      <a class="text-button" href="#/portfolio">View the portfolio ${icon('arrow-right', 12)}</a>
    </div>
  </aside>`;
}

function briefMarkup(prefill) {
  return `<form class="card brief-card" id="brief-form" novalidate>
    <div class="brief-head">
      <div class="brief-kicker">Client brief</div>
      <span class="char-count" data-char-count>0 / 1500</span>
    </div>
    <div class="brief-body">
      <label class="sr-only" for="brief">Describe the client requirement</label>
      <textarea class="brief-textarea" id="brief" name="brief" maxlength="1500" rows="4" spellcheck="true" placeholder="Describe who the home is for, where, how many bedrooms, the budget and anything that matters…">${esc(prefill)}</textarea>
      <div class="brief-examples" aria-label="Example briefs">
        ${exampleButtons()}
      </div>
    </div>
    <div class="brief-actions">
      <span class="brief-note">${icon('info', 13)} Runs in seconds. Demo uses a synthetic market.</span>
      <div class="brief-actions-right">
        <button class="button button-ghost button-sm" type="button" data-toggle-advanced aria-expanded="false">${icon('plus', 13)} Fine-tune</button>
        <button class="brief-submit" type="submit" data-submit>
          <span data-submit-label>Run Scout</span>
          <span class="submit-arrow">${icon('arrow-right', 14)}</span>
        </button>
      </div>
    </div>
    <div class="advanced-panel" data-advanced hidden>
      <div class="advanced-grid">
        <div class="field">
          <label class="field-label" for="filter-transaction">Transaction</label>
          <select class="select" id="filter-transaction" data-filter-transaction>
            <option value="auto">Auto from brief</option>
            <option value="rent">Long-term rental</option>
            <option value="sale">Purchase</option>
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="filter-location">Location</label>
          <select class="select" id="filter-location" data-filter-location>
            ${LOCATIONS.map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="filter-budget">Budget (EUR)</label>
          <input class="input" id="filter-budget" data-filter-budget type="number" inputmode="numeric" min="100" step="50" placeholder="e.g. 2200" />
        </div>
        <div class="field">
          <span class="field-label">Bedrooms</span>
          <div style="display:flex;gap:6px">
            <select class="select" data-filter-beds-min aria-label="Minimum bedrooms">
              <option value="">Min</option>
              ${[1, 2, 3, 4, 5].map((n) => `<option value="${n}">${n}</option>`).join('')}
            </select>
            <select class="select" data-filter-beds-max aria-label="Maximum bedrooms">
              <option value="">Max</option>
              ${[1, 2, 3, 4, 5].map((n) => `<option value="${n}">${n}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="field" style="grid-column:1/-1">
          <span class="field-label">Property types</span>
          <div class="type-checks">
            ${[
              ['apartment', 'Apartment'],
              ['villa', 'Villa'],
              ['townhouse', 'Townhouse'],
            ]
              .map(
                ([value, label]) =>
                  `<label class="type-check"><input type="checkbox" value="${value}" data-filter-type><span>${label}</span></label>`
              )
              .join('')}
          </div>
        </div>
      </div>
      <p class="advanced-note">Anything set here overrides the prose. Leave fields blank to let Scout read the brief.</p>
    </div>
  </form>`;
}

function pageMarkup(meta, prefill) {
  return `<section class="scout-page">
    ${heroMarkup(meta)}
    <div class="scout-grid">
      <div class="scout-main">
        ${briefMarkup(prefill)}
        <div class="card deliverables-card">
          <div class="deliverables-head">
            <span class="section-kicker">What lands on your desk</span>
            <span class="chip">position, not guesswork</span>
          </div>
          <div class="deliverables-grid">
            <div class="deliverable"><span class="deliverable-num">01</span><h4>Mirror alerts</h4><p>Know when another portal advertises your own home for less.</p></div>
            <div class="deliverable"><span class="deliverable-num">02</span><h4>A market range</h4><p>p25, median and p75 for every home that matched the brief.</p></div>
            <div class="deliverable"><span class="deliverable-num">03</span><h4>A recommended ask</h4><p>One number, with the comparable offers behind it.</p></div>
          </div>
        </div>
      </div>
      ${sideMarkup(meta)}
    </div>
    <div class="run-stage" id="run-stage" hidden></div>
  </section>`;
}

function runPanelMarkup(run) {
  return `<div class="run-panel" id="run-panel">
    <div class="run-panel-top">
      <div class="run-status">
        <div class="run-orb" data-run-orb></div>
        <div class="run-status-text">
          <div class="run-status-title" data-run-title>Scout is on the ground</div>
          <div class="run-status-sub">Run ${esc(shortId(run.id))} · Iteration ${run.iteration} · ${run.mode === 'demo' ? 'simulation' : 'live web'}</div>
        </div>
      </div>
      <div class="run-top-right">
        <span class="run-clock" data-run-clock>0.0s</span>
        <span class="run-percent" data-run-percent>0%</span>
      </div>
    </div>
    <div class="run-progress"><span data-run-progress style="width:2%"></span></div>
    <div class="run-panel-body">
      <aside class="run-side">
        <span class="section-kicker">Agent pipeline</span>
        <div class="phase-list" data-phase-list>
          ${phaseListMarkup()}
        </div>
        <div class="run-side-note">Every phase is written to the run ledger. If a source drops out, the rest of the scan continues.</div>
      </aside>
      <div class="run-console-wrap">
        <div class="console-head">
          <span style="display:inline-flex;align-items:center;gap:6px">${icon('source', 12)} live agent log</span>
          <span class="console-lights"><i></i><i></i><i></i></span>
        </div>
        <div class="console" data-run-console role="log" aria-live="polite" aria-relevant="additions">
          <div class="log-line" data-level="info">
            <span class="log-time">0.0s</span><span class="log-mark"><i></i></span>
            <span class="log-content"><span class="log-message">Opening a line to the search agent…</span></span>
          </div>
        </div>
        <div class="console-foot">
          <span class="console-status"><span class="mode-dot" style="width:5px;height:5px"></span><span data-console-status>Streaming</span></span>
          <button class="console-stop" type="button" data-stop-run>Stop run</button>
        </div>
      </div>
    </div>
  </div>`;
}

function elapsedLabel(ms, prefix = '') {
  return `${prefix}${(ms / 1000).toFixed(1)}s`;
}

export async function renderScout(root, ctx) {
  const prefillData = readPrefill();
  let meta = null;
  try {
    meta = await api.meta();
  } catch {
    meta = null;
  }
  if (ctx.isStale()) return;

  const state = {
    busy: false,
    run: null,
    report: null,
    finished: false,
    es: null,
    pollTimer: null,
    clockTimer: null,
    startedAt: 0,
    progress: 0,
    activePhase: 'interpret',
    seenSeq: new Set(),
    threadId: prefillData?.threadId || null,
    disposed: false,
  };

  const prefill = prefillData?.brief || DEFAULT_BRIEF;
  root.innerHTML = pageMarkup(meta, prefill);

  const page = root.querySelector('.scout-page');
  const form = root.querySelector('#brief-form');
  const textarea = root.querySelector('#brief');
  const submitButton = root.querySelector('[data-submit]');
  const submitLabel = root.querySelector('[data-submit-label]');
  const charCount = root.querySelector('[data-char-count]');
  const stage = root.querySelector('#run-stage');
  const advanced = root.querySelector('[data-advanced]');
  const advancedToggle = root.querySelector('[data-toggle-advanced]');

  function autoSizeBrief() {
    if (window.CSS?.supports?.('field-sizing', 'content')) {
      // Modern browsers size the control from its content via CSS.
      textarea.style.height = '';
      return;
    }
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(340, Math.max(132, textarea.scrollHeight))}px`;
  }

  function updateCharCount() {
    charCount.textContent = `${textarea.value.length} / 1500`;
  }
  updateCharCount();
  autoSizeBrief();
  const settleBriefSize = () => {
    autoSizeBrief();
    requestAnimationFrame(autoSizeBrief);
  };
  settleBriefSize();
  textarea.addEventListener('input', () => {
    updateCharCount();
    autoSizeBrief();
  });
  window.addEventListener('resize', autoSizeBrief);
  window.addEventListener('load', settleBriefSize, { once: true });
  document.fonts?.ready.then(settleBriefSize).catch(() => {});

  root.querySelectorAll('[data-example]').forEach((button) => {
    button.addEventListener('click', () => {
      const example = EXAMPLES[Number(button.dataset.example)];
      if (!example || state.busy) return;
      textarea.value = example.brief;
      updateCharCount();
      autoSizeBrief();
      resetAdvancedFields();
      textarea.focus();
    });
  });

  advancedToggle.addEventListener('click', () => {
    const open = advanced.hidden;
    advanced.hidden = !open;
    advancedToggle.setAttribute('aria-expanded', String(open));
    advancedToggle.innerHTML = open
      ? `${icon('close', 13)} Hide fields`
      : `${icon('plus', 13)} Fine-tune`;
  });

  function resetAdvancedFields() {
    root.querySelector('[data-filter-transaction]').value = 'auto';
    root.querySelector('[data-filter-location]').value = '';
    root.querySelector('[data-filter-budget]').value = '';
    root.querySelector('[data-filter-beds-min]').value = '';
    root.querySelector('[data-filter-beds-max]').value = '';
    root.querySelectorAll('[data-filter-type]').forEach((input) => {
      input.checked = false;
    });
  }

  function setBusy(busy) {
    state.busy = busy;
    submitButton.disabled = busy;
    submitLabel.textContent = busy ? 'Scouting…' : 'Run Scout';
    textarea.disabled = busy;
    form.querySelectorAll('input, select').forEach((input) => {
      input.disabled = busy;
    });
  }

  function setProgress(progress) {
    const next = Math.max(state.progress, Math.min(100, Number(progress) || 0));
    state.progress = next;
    const bar = stage.querySelector('[data-run-progress]');
    const percent = stage.querySelector('[data-run-percent]');
    if (bar) bar.style.width = `${next}%`;
    if (percent) percent.textContent = `${Math.round(next)}%`;
  }

  function setActivePhase(phase, { completed = false } = {}) {
    const list = stage.querySelector('[data-phase-list]');
    if (!list) return;
    const currentIndex = PHASES.findIndex((item) => item.key === phase);
    state.activePhase = phase;
    list.querySelectorAll('.phase-item').forEach((item) => {
      const index = PHASES.findIndex((entry) => entry.key === item.dataset.phase);
      item.classList.toggle('done', completed || (currentIndex > -1 && index < currentIndex));
      item.classList.toggle('active', !completed && item.dataset.phase === phase);
    });
    const title = stage.querySelector('[data-run-title]');
    if (title && !completed) title.textContent = PHASE_TITLES[phase] || 'Scout is on the ground';
  }

  function appendLog(step) {
    if (state.seenSeq.has(step.seq)) return;
    state.seenSeq.add(step.seq);
    const consoleEl = stage.querySelector('[data-run-console]');
    if (!consoleEl) return;
    const line = document.createElement('div');
    line.className = 'log-line';
    line.dataset.level = step.level || 'info';
    line.innerHTML = `<span class="log-time">${elapsedLabel(step.elapsedMs ?? step.elapsed_ms ?? 0)}</span>
      <span class="log-mark"><i></i></span>
      <span class="log-content"><span class="log-message">${esc(step.message)}</span>${
        step.detail ? `<span class="log-detail">${esc(step.detail)}</span>` : ''
      }</span>`;
    consoleEl.appendChild(line);
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }

  function closeStream() {
    if (state.es) {
      state.es.close();
      state.es = null;
    }
    if (state.pollTimer) {
      clearTimeout(state.pollTimer);
      state.pollTimer = null;
    }
    if (state.clockTimer) {
      clearInterval(state.clockTimer);
      state.clockTimer = null;
    }
  }

  function startClock() {
    state.startedAt = Date.now();
    state.clockTimer = setInterval(() => {
      const clock = stage.querySelector('[data-run-clock]');
      if (clock) clock.textContent = elapsedLabel(Date.now() - state.startedAt);
    }, 100);
  }

  async function finishRun(run) {
    if (state.finished || state.disposed) return;
    state.finished = true;
    closeStream();
    setBusy(false);
    setProgress(100);
    setActivePhase('report', { completed: run.status === 'completed' });
    const title = stage.querySelector('[data-run-title]');
    const status = stage.querySelector('[data-console-status]');
    const orb = stage.querySelector('[data-run-orb]');
    if (title) title.textContent = run.status === 'completed' ? 'Scout complete' : run.status === 'cancelled' ? 'Run stopped' : 'Run failed';
    if (status) status.textContent = run.status === 'completed' ? 'Complete' : 'Closed';
    if (orb) orb.classList.add('complete');
    const clock = stage.querySelector('[data-run-clock]');
    if (clock) clock.textContent = elapsedLabel(run.durationMs || Date.now() - state.startedAt);

    if (run.status !== 'completed') {
      stage.innerHTML = reportFailureMarkup(run);
      stage.querySelector('[data-run-again]')?.addEventListener('click', () => {
        textarea.focus();
        textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      ctx.refreshShell?.();
      return;
    }

    const statusLine = stage.querySelector('[data-console-status]');
    if (statusLine) statusLine.textContent = 'Composing report';
    try {
      const report = await api.results(run.id);
      if (state.disposed || ctx.isStale()) return;
      state.report = report;
      showReportIn(stage, report, {
        focusReport: true,
        onRefine: (currentReport) => refine(currentReport),
        onScoutProperty: (property) => useProperty(property),
      });
      history.replaceState(null, '', `#/runs/${run.id}`);
      ctx.refreshShell?.();
      toast('Scout report ready.');
      requestAnimationFrame(() => stage.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (error) {
      stage.innerHTML = emptyState({
        title: 'The report could not be loaded',
        message: error.message || 'The run completed but the report request failed.',
        action: '<button class="button button-quiet" type="button" data-retry-results>Try again</button>',
        mark: 'alert',
      });
      stage.querySelector('[data-retry-results]')?.addEventListener('click', () => {
        state.finished = false;
        finishRun(run);
      });
    }
  }

  async function pollOnce() {
    if (state.finished || state.disposed) return;
    try {
      const data = await api.run(state.run.id);
      const run = data.run;
      if (typeof run.progress === 'number') setProgress(run.progress);
      if (run.phase) setActivePhase(run.phase);
      (data.steps || []).forEach(appendLog);
      if (['completed', 'failed', 'cancelled'].includes(run.status)) {
        await finishRun(run);
      } else {
        state.pollTimer = setTimeout(pollOnce, 1200);
      }
    } catch {
      state.pollTimer = setTimeout(pollOnce, 2200);
    }
  }

  function startStream(run) {
    if (!('EventSource' in window)) {
      pollOnce();
      return;
    }
    const source = new EventSource(`/api/runs/${run.id}/events`);
    state.es = source;
    source.addEventListener('step', (event) => {
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      const step = payload.step;
      if (!step) return;
      appendLog(step);
      if (step.phase) setActivePhase(step.phase);
      if (typeof payload.progress === 'number') setProgress(payload.progress);
    });
    source.addEventListener('done', (event) => {
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      if (payload.run) finishRun(payload.run);
    });
    source.onerror = () => {
      if (state.finished || state.disposed) return;
      source.close();
      state.es = null;
      if (!state.pollTimer) {
        state.pollTimer = setTimeout(pollOnce, 400);
      }
    };
  }

  async function startRun() {
    if (state.busy) return;
    const brief = textarea.value.trim();
    if (brief.length < 3) {
      toast('Please describe the client requirement first.', 'error');
      textarea.focus();
      return;
    }
    const overrides = {};
    const transaction = root.querySelector('[data-filter-transaction]').value;
    if (transaction !== 'auto') overrides.transaction = transaction;
    const location = root.querySelector('[data-filter-location]').value;
    if (location) overrides.location = location;
    const budget = root.querySelector('[data-filter-budget]').value;
    if (budget) overrides.budget = Number(budget);
    const bedsMin = root.querySelector('[data-filter-beds-min]').value;
    const bedsMax = root.querySelector('[data-filter-beds-max]').value;
    if (bedsMin) overrides.bedsMin = Number(bedsMin);
    if (bedsMax) overrides.bedsMax = Number(bedsMax);
    const types = [...root.querySelectorAll('[data-filter-type]:checked')].map((input) => input.value);
    if (types.length) overrides.types = types;

    clearToasts();
    setBusy(true);
    state.finished = false;
    state.progress = 0;
    state.seenSeq = new Set();
    stage.hidden = false;
    stage.innerHTML = '<div class="page-loader"><span class="loader-star"></span><p>Waking the agent…</p></div>';
    stage.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
      const payload = { brief };
      if (Object.keys(overrides).length) payload.overrides = overrides;
      if (state.threadId) payload.threadId = state.threadId;
      const result = await api.createRun(payload);
      const run = result.run;
      state.run = run;
      state.threadId = run.threadId;
      state.report = null;
      stage.innerHTML = runPanelMarkup(run);
      stage.querySelector('[data-stop-run]')?.addEventListener('click', async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        button.textContent = 'Stopping…';
        try {
          await api.cancelRun(run.id);
        } catch (error) {
          toast(error.message || 'Could not stop the run.', 'error');
        }
      });
      startClock();
      startStream(run);
      setProgress(2);
    } catch (error) {
      setBusy(false);
      stage.innerHTML = `<div class="card run-failure">
        <div class="failure-mark">!</div>
        <div class="eyebrow">Could not start</div>
        <h2>The search did not launch.</h2>
        <p>${esc(error.message || 'Scout rejected the request.')}</p>
        <div class="drawer-actions"><button class="button button-primary button-sm" type="button" data-retry-start>${icon('refresh', 13)} Try again</button></div>
      </div>`;
      stage.querySelector('[data-retry-start]')?.addEventListener('click', startRun);
    }
  }

  function resetForm({ keepBrief = false } = {}) {
    closeStream();
    state.finished = true;
    state.run = null;
    state.report = null;
    state.progress = 0;
    state.threadId = null;
    setBusy(false);
    stage.hidden = true;
    stage.innerHTML = '';
    if (!keepBrief) {
      textarea.value = DEFAULT_BRIEF;
      updateCharCount();
      autoSizeBrief();
    }
    resetAdvancedFields();
    history.replaceState(null, '', '#/scout');
    textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => textarea.focus({ preventScroll: true }), 220);
  }

  function refine(report) {
    const brief = report.run.brief || report.filters.brief || textarea.value;
    const threadId = report.run.threadId || null;
    resetForm({ keepBrief: true });
    textarea.value = brief;
    state.threadId = threadId;
    updateCharCount();
    autoSizeBrief();
  }

  function useProperty(property) {
    resetForm({ keepBrief: true });
    textarea.value = prefillFromProperty(property);
    updateCharCount();
    autoSizeBrief();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    startRun();
  });

  textarea.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      startRun();
    }
  });

  function onResetEvent() {
    if (state.busy) {
      toast('A scout is running. Stop it before starting a new brief.', 'error');
      return;
    }
    resetForm();
    history.replaceState(null, '', '#/scout');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  document.addEventListener('scout:reset', onResetEvent);

  ctx.onCleanup(() => {
    state.disposed = true;
    closeStream();
    document.removeEventListener('scout:reset', onResetEvent);
    window.removeEventListener('resize', autoSizeBrief);
  });

  updateCharCount();
  if (prefillData?.brief) {
    requestAnimationFrame(() => {
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    });
  }
}
