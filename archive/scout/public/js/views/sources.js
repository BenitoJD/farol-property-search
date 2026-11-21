import { api } from '../api.js';
import {
  esc,
  icon,
  fmtNumber,
  initials,
  relativeTime,
  emptyState,
  openDrawer,
  closeDrawer,
  toast,
} from '../ui.js';

const KIND_LABELS = {
  portal: 'Portal',
  marketplace: 'Marketplace',
  agency: 'Agency',
  other: 'Other',
};

const FILTERS = [
  ['all', 'All sources'],
  ['portal', 'Portals'],
  ['agency', 'Agencies'],
  ['discovered', 'Scout finds'],
  ['disabled', 'Disabled'],
];

function statsMarkup(sources) {
  const enabled = sources.filter((source) => source.enabled).length;
  const discovered = sources.filter((source) => source.discoveredBy === 'agent').length;
  const portals = sources.filter((source) => source.kind === 'portal').length;
  return `<div class="stat-strip">
    <div class="stat-block"><div class="stat-label">Catalogue</div><div class="stat-value">${fmtNumber(sources.length)} <small>sources</small></div><div class="stat-note">${enabled} enabled · ${sources.length - enabled} paused</div></div>
    <div class="stat-block"><div class="stat-label">Portals</div><div class="stat-value">${fmtNumber(portals)}</div><div class="stat-note">Large marketplaces and listing portals.</div></div>
    <div class="stat-block"><div class="stat-label">Local agencies</div><div class="stat-value">${fmtNumber(sources.filter((source) => source.kind === 'agency').length)}</div><div class="stat-note">The long tail of the market.</div></div>
    <div class="stat-block"><div class="stat-label">Found by Scout</div><div class="stat-value">${fmtNumber(discovered)}</div><div class="stat-note">Added during a search, not by hand.</div></div>
  </div>`;
}

function reliabilityMarkup(value) {
  const pct = Math.round((Number(value) || 0) * 100);
  return `<div class="reliability"><span class="reliability-track"><span style="width:${pct}%"></span></span><span class="reliability-num">${pct}</span></div>`;
}

function sourceRow(source) {
  return `<tr data-source-row data-id="${esc(source.id)}" data-kind="${esc(source.kind)}" data-discovered="${source.discoveredBy === 'agent' ? '1' : '0'}" data-disabled="${source.enabled ? '0' : '1'}" data-search="${esc([source.name, source.domain, source.region, source.country, source.kind].join(' ').toLowerCase())}" class="${source.enabled ? '' : 'row-disabled'}">
    <td>
      <div class="source-name-cell">
        <span class="source-mark">${esc(initials(source.name))}</span>
        <div>
          <div class="source-name">${esc(source.name)}${source.discoveredBy === 'agent' ? '<span class="source-tag">Scout find</span>' : ''}</div>
          <div class="source-domain">${esc(source.domain)}</div>
        </div>
      </div>
    </td>
    <td><span class="badge badge-neutral">${esc(KIND_LABELS[source.kind] || source.kind)}</span></td>
    <td class="hide-sm"><span style="font-size:10.5px;color:var(--ink-2)">${esc(source.region || '—')}</span><span class="compare-note">${esc(source.country || '')}</span></td>
    <td class="hide-sm">${reliabilityMarkup(source.reliability)}</td>
    <td class="hide-sm"><span class="mono" style="font-size:10px">${source.timesUsed}</span><span class="compare-note">${source.lastUsedAt ? `last ${relativeTime(source.lastUsedAt)}` : 'not used yet'}</span></td>
    <td style="text-align:right"><button class="switch" type="button" role="switch" aria-checked="${source.enabled ? 'true' : 'false'}" aria-label="${source.enabled ? 'Disable' : 'Enable'} ${esc(source.name)}" data-source-toggle="${esc(source.id)}"></button></td>
  </tr>`;
}

function addSourceDrawer(onCreated) {
  openDrawer({
    kicker: 'Source catalogue',
    title: 'Add a property source',
    body: `<form class="drawer-form" data-add-source-form>
      <div class="field-grid">
        <label class="field"><span class="field-label">Source name</span><input class="input" name="name" required minlength="2" maxlength="80" placeholder="e.g. Algarve Coast Properties"></label>
        <label class="field"><span class="field-label">Domain</span><input class="input" name="domain" required placeholder="algarvecoastproperties.pt" autocomplete="off"></label>
      </div>
      <div class="field-grid">
        <label class="field"><span class="field-label">Type</span><select class="select" name="kind"><option value="agency">Agency</option><option value="portal">Portal</option><option value="marketplace">Marketplace</option><option value="other">Other</option></select></label>
        <label class="field"><span class="field-label">Country</span><select class="select" name="country"><option value="Portugal">Portugal</option><option value="Spain">Spain</option><option value="Other">Other</option></select></label>
      </div>
      <div class="field-grid">
        <label class="field"><span class="field-label">Region</span><input class="input" name="region" placeholder="Algarve"></label>
        <label class="field"><span class="field-label">Reliability</span><select class="select" name="reliability"><option value="0.9">High — 0.90</option><option value="0.8">Good — 0.80</option><option value="0.65" selected>Fair — 0.65</option><option value="0.5">Unknown — 0.50</option></select></label>
      </div>
      <label class="field"><span class="field-label">Notes</span><textarea class="input" name="notes" rows="3" maxlength="500" placeholder="What is this source good for?"></textarea></label>
      <div class="error-banner" data-form-error hidden>${icon('alert', 15)} <span></span></div>
      <p class="drawer-note">In live mode, Scout fetches only pages linked from this domain and respects robots.txt. Only add sources whose terms permit automated access.</p>
      <div class="drawer-form-actions">
        <button class="button button-ghost" type="button" data-close-drawer>Cancel</button>
        <button class="button button-primary" type="submit">${icon('plus', 14)} Add source</button>
      </div>
    </form>`,
    onMount(drawer) {
      const form = drawer.querySelector('[data-add-source-form]');
      const errorBox = drawer.querySelector('[data-form-error]');
      const submit = form.querySelector('button[type="submit"]');
      drawer.querySelector('[data-close-drawer]')?.addEventListener('click', () => closeDrawer());
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        errorBox.hidden = true;
        const data = new FormData(form);
        const payload = {
          name: String(data.get('name') || '').trim(),
          domain: String(data.get('domain') || '').trim(),
          kind: String(data.get('kind') || 'agency'),
          country: String(data.get('country') || 'Portugal'),
          region: String(data.get('region') || '').trim(),
          reliability: Number(data.get('reliability') || 0.65),
          notes: String(data.get('notes') || '').trim(),
        };
        submit.disabled = true;
        submit.textContent = 'Adding…';
        try {
          const response = await api.createSource(payload);
          closeDrawer({ restoreFocus: false });
          toast(`${payload.name} added to the catalogue.`);
          onCreated(response.source);
        } catch (error) {
          errorBox.querySelector('span').textContent = error.message || 'Could not add this source.';
          errorBox.hidden = false;
          submit.disabled = false;
          submit.innerHTML = `${icon('plus', 14)} Add source`;
        }
      });
    },
  });
}

export async function renderSources(root, ctx) {
  root.innerHTML = '<div class="page-loader"><span class="loader-star"></span><p>Opening the source catalogue…</p></div>';
  let sources = [];
  try {
    const response = await api.sources();
    sources = response.sources || [];
  } catch (error) {
    if (ctx.isStale()) return;
    root.innerHTML = emptyState({
      title: 'The catalogue could not be loaded',
      message: error.message || 'Scout could not reach the source catalogue.',
      action: '<button class="button button-quiet" type="button" data-retry-page>Try again</button>',
      mark: 'alert',
    });
    return;
  }
  if (ctx.isStale()) return;

  const state = { filter: 'all', search: '' };
  root.innerHTML = `<header class="page-head">
    <div>
      <div class="eyebrow">Source catalogue / ${fmtNumber(sources.length)} catalogued</div>
      <h1>The map gets wider every run<span style="color:var(--terracotta)">.</span></h1>
      <p class="lede">Portals, marketplaces and local agencies Scout is allowed to search. New domains it discovers during a run are added here, so every search starts from a broader map.</p>
    </div>
    <div class="page-actions">
      <button class="button button-primary" type="button" data-add-source>${icon('plus', 16)} Add source</button>
    </div>
  </header>
  <div data-source-stats>${statsMarkup(sources)}</div>
  <div class="card source-card">
    <div class="ledger-head">
      <div>
        <div class="ledger-title">Catalogue</div>
        <div class="position-sub">Reliability informs deduplication: the most trustworthy copy of a duplicated listing becomes canonical.</div>
      </div>
      <span class="chip">${icon('shield', 11)} curated + discovered</span>
    </div>
    <div class="ledger-toolbar">
      <div class="segmented" role="group" aria-label="Filter sources">
        ${FILTERS.map(([value, label]) => `<button class="segment ${value === 'all' ? 'active' : ''}" type="button" data-source-filter="${value}">${label}</button>`).join('')}
      </div>
      <div class="ledger-search">
        ${icon('search', 12)}
        <input type="search" placeholder="Search name, domain, region" data-source-search aria-label="Search sources">
      </div>
    </div>
    <div class="table-wrap">
      <table class="data-table source-table">
        <thead><tr><th>Source</th><th>Type</th><th class="hide-sm">Region</th><th class="hide-sm">Reliability</th><th class="hide-sm">Used</th><th></th></tr></thead>
        <tbody data-source-body></tbody>
      </table>
    </div>
    <div class="sources-note">${icon('info', 13)} Scout treats discovered sources as provisional. Review auto-discovered domains periodically before relying on them in production.</div>
  </div>`;

  const statsWrap = root.querySelector('[data-source-stats]');
  const tbody = root.querySelector('[data-source-body]');
  const searchInput = root.querySelector('[data-source-search]');

  function matches(source) {
    if (state.filter === 'disabled') {
      if (source.enabled) return false;
    } else if (state.filter === 'portal' && source.kind !== 'portal') {
      return false;
    } else if (state.filter === 'agency' && source.kind !== 'agency') {
      return false;
    } else if (state.filter === 'discovered' && source.discoveredBy !== 'agent') {
      return false;
    }
    if (state.search) {
      const haystack = [source.name, source.domain, source.region, source.country].join(' ').toLowerCase();
      if (!haystack.includes(state.search)) return false;
    }
    return true;
  }

  function renderRows() {
    const visible = sources.filter(matches).sort((a, b) => {
      if (a.discoveredBy !== b.discoveredBy) return a.discoveredBy === 'agent' ? -1 : 1;
      return b.reliability - a.reliability;
    });
    tbody.innerHTML = visible.length
      ? visible.map(sourceRow).join('')
      : `<tr><td colspan="6" class="no-rows">No sources match this view.</td></tr>`;
    statsWrap.innerHTML = statsMarkup(sources);
  }

  root.querySelectorAll('[data-source-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      root.querySelectorAll('[data-source-filter]').forEach((node) => node.classList.remove('active'));
      button.classList.add('active');
      state.filter = button.dataset.sourceFilter;
      renderRows();
    });
  });

  searchInput.addEventListener('input', () => {
    state.search = searchInput.value.trim().toLowerCase();
    renderRows();
  });

  tbody.addEventListener('click', async (event) => {
    const toggle = event.target.closest('[data-source-toggle]');
    if (!toggle) return;
    const source = sources.find((item) => item.id === toggle.dataset.sourceToggle);
    if (!source) return;
    const nextEnabled = !source.enabled;
    toggle.disabled = true;
    try {
      const response = await api.updateSource(source.id, { enabled: nextEnabled });
      const updated = response.source;
      sources = sources.map((item) => (item.id === updated.id ? updated : item));
      toast(`${updated.name} ${nextEnabled ? 'enabled' : 'paused'}.`);
      renderRows();
      ctx.refreshShell?.();
    } catch (error) {
      toggle.disabled = false;
      toast(error.message || 'Could not update this source.', 'error');
    }
  });

  root.querySelector('[data-add-source]').addEventListener('click', () => {
    addSourceDrawer((created) => {
      sources = [created, ...sources];
      renderRows();
      ctx.refreshShell?.();
    });
  });

  renderRows();
}
