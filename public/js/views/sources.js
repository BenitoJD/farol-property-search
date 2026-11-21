import { api } from '../api.js';
import {
  escapeAttr,
  escapeHtml,
  growthChart,
  icon,
  openModal,
  relativeTime,
  sourceKindLabel,
  toast,
} from '../ui.js';

function sourceBadges(source) {
  return [
    source.discoveredBy === 'agent' ? `<span class="source-badge source-badge-ai">${icon('sparkles', 11)} AI discovered</span>` : '',
    source.discoveredBy === 'import' ? `<span class="source-badge">${icon('file', 11)} Imported</span>` : '',
    source.discoveredBy === 'team' ? `<span class="source-badge">${icon('plus', 11)} Added by team</span>` : '',
  ]
    .filter(Boolean)
    .join('');
}

function sourceRow(source) {
  return `<tr class="source-row" data-enabled="${source.enabled ? 'true' : 'false'}" data-discovered="${source.discoveredBy === 'agent' ? 'true' : 'false'}" data-search="${escapeAttr(
    `${source.name} ${source.domain} ${source.kind} ${source.coverage}`.toLowerCase()
  )}">
    <td>
      <label class="switch" title="${source.enabled ? 'Enabled for searches' : 'Disabled'}">
        <input type="checkbox" data-toggle-source="${escapeAttr(source.id)}" ${source.enabled ? 'checked' : ''} aria-label="Toggle ${escapeAttr(source.name)}" />
        <span></span>
      </label>
    </td>
    <td>
      <div class="source-name-cell">
        <span class="source-mark">${escapeHtml(source.name.slice(0, 1))}</span>
        <div>
          <strong>${escapeHtml(source.name)}</strong>
          <span class="source-domain">${escapeHtml(source.domain)}</span>
          <div class="source-badges">${sourceBadges(source)}</div>
        </div>
      </div>
    </td>
    <td><span class="kind-pill">${escapeHtml(sourceKindLabel(source.kind))}</span></td>
    <td>${escapeHtml(source.coverage)}</td>
    <td>
      <div class="reliability">
        <span class="reliability-bar"><span style="width:${Math.round(source.reliability * 100)}%"></span></span>
        <span>${source.reliability.toFixed(2)}</span>
      </div>
    </td>
    <td class="numeric">${source.timesUsed}</td>
    <td class="muted">${source.lastUsedAt ? escapeHtml(relativeTime(source.lastUsedAt)) : 'Not used yet'}</td>
    <td class="source-note-cell" title="${escapeAttr(source.notes || '')}">
      <span class="truncate">${escapeHtml(source.notes || '—')}</span>
    </td>
  </tr>`;
}

function addSourceModal() {
  openModal({
    title: 'Add a source',
    eyebrow: 'Master source catalogue',
    body: `<form id="source-form" class="form">
      <p class="modal-copy">Add a portal, marketplace or agency to the catalogue. It becomes available to every future search.</p>
      <div class="form-grid form-grid-2">
        <label class="field"><span class="field-label">Source name</span><input class="input" name="name" placeholder="Algarve Coast Homes" required /></label>
        <label class="field"><span class="field-label">Domain</span><input class="input" name="domain" placeholder="algarvecoasthomes.pt" required /></label>
        <label class="field"><span class="field-label">Kind</span><select class="input" name="kind"><option value="portal">Portal</option><option value="marketplace">Marketplace</option><option value="agency" selected>Agency</option><option value="network">Network</option><option value="other">Other</option></select></label>
        <label class="field"><span class="field-label">Coverage</span><select class="input" name="coverage"><option>Algarve</option><option>Lisbon</option><option selected>Portugal</option><option>Other</option></select></label>
        <label class="field"><span class="field-label">Reliability <span class="field-hint">0.1–1.0</span></span><input class="input" type="number" name="reliability" min="0.1" max="1" step="0.01" value="0.7" /></label>
      </div>
      <label class="field"><span class="field-label">Notes</span><textarea class="input textarea" name="notes" rows="2" placeholder="What is it good for?"></textarea></label>
    </form>`,
    footer: `<button class="button button-ghost" type="button" data-modal-close>Cancel</button><button class="button button-primary" type="submit" form="source-form" id="save-source">${icon('plus', 15)} Add source</button>`,
    size: 'md',
    onMount({ root, close }) {
      root.querySelector('#source-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const button = root.querySelector('#save-source');
        button.disabled = true;
        button.innerHTML = '<span class="spinner"></span>Adding…';
        try {
          await api.addSource({
            name: String(data.get('name') || '').trim(),
            domain: String(data.get('domain') || '').trim(),
            kind: String(data.get('kind')),
            coverage: String(data.get('coverage')),
            reliability: Number(data.get('reliability') || 0.7),
            notes: String(data.get('notes') || '').trim(),
          });
          close();
          toast('Source added to the catalogue.', { tone: 'success' });
          window.dispatchEvent(new Event('farol:refresh'));
        } catch (error) {
          toast(error.message, { tone: 'error' });
          button.disabled = false;
          button.innerHTML = `${icon('plus', 15)} Add source`;
        }
      });
    },
  });
}

function importModal() {
  openModal({
    title: 'Import the source list',
    eyebrow: 'Excel / Dropbox · CSV',
    body: `<form id="import-form" class="form">
      <p class="modal-copy">Paste or choose the CSV that currently lives in Excel or Dropbox. Expected columns: <code>name, domain, kind, coverage, reliability, notes</code>.</p>
      <label class="field">
        <span class="field-label">Choose a CSV file</span>
        <input class="input file-input" type="file" id="csv-file" accept=".csv,text/csv" />
      </label>
      <label class="field">
        <span class="field-label">…or paste the rows</span>
        <textarea class="input textarea code-input" name="csv" id="csv-text" rows="8" placeholder="name,domain,kind,coverage,reliability,notes
Algarve Coast Homes,algarvecoasthomes.pt,agency,Algarve,0.76,Independent agency"></textarea>
      </label>
      <div class="notice notice-neutral">${icon('info', 16)} <div><strong>Duplicate domains are skipped.</strong><span>The import never overwrites an existing source or its usage history.</span></div></div>
    </form>`,
    footer: `<button class="button button-ghost" type="button" data-modal-close>Cancel</button><button class="button button-primary" type="submit" form="import-form" id="run-import">${icon('download', 15)} Import sources</button>`,
    size: 'lg',
    onMount({ root, close }) {
      const fileInput = root.querySelector('#csv-file');
      const textarea = root.querySelector('#csv-text');
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        if (file.size > 180_000) {
          toast('Keep the CSV under 180 KB.', { tone: 'error' });
          return;
        }
        textarea.value = await file.text();
      });
      root.querySelector('#import-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = root.querySelector('#run-import');
        const csv = textarea.value.trim();
        if (!csv) {
          toast('Add a CSV first.', { tone: 'error' });
          return;
        }
        button.disabled = true;
        button.innerHTML = '<span class="spinner"></span>Importing…';
        try {
          const result = await api.importSources(csv);
          close();
          toast(`${result.created} source${result.created === 1 ? '' : 's'} imported${result.skipped ? `, ${result.skipped} skipped` : ''}.`, {
            tone: result.created ? 'success' : 'info',
          });
          window.dispatchEvent(new Event('farol:refresh'));
        } catch (error) {
          toast(error.message, { tone: 'error' });
          button.disabled = false;
          button.innerHTML = `${icon('download', 15)} Import sources`;
        }
      });
    },
  });
}

export async function renderSources(main) {
  const data = await api.sources();
  const { sources, summary, growth } = data;
  const enabled = sources.filter((source) => source.enabled);
  const discovered = sources.filter((source) => source.discoveredBy === 'agent');

  main.innerHTML = `<div class="page sources-page">
    <header class="page-head">
      <div class="page-head-copy">
        <p class="kicker">Reusable systems · master source catalogue</p>
        <h1>The source catalogue</h1>
        <p class="page-intro">One list of portals, marketplaces and agencies, seeded from the Excel / Dropbox list. Every search adds what it discovers and what performed.</p>
      </div>
      <div class="page-actions">
        <button class="button button-ghost" type="button" id="import-sources">${icon('download', 15)} Import CSV</button>
        <a class="button button-ghost" href="/api/sources/export.csv">${icon('file', 15)} Export</a>
        <button class="button button-primary" type="button" id="add-source">${icon('plus', 15)} Add source</button>
      </div>
    </header>

    <section class="kpi-grid kpi-grid-4">
      <article class="kpi-card">
        <div class="kpi-top"><span class="kpi-label">Sources</span><span class="kpi-icon">${icon('globe', 18)}</span></div>
        <div class="kpi-value">${summary.total}</div>
        <p class="kpi-sub">${summary.enabled} enabled for search</p>
      </article>
      <article class="kpi-card">
        <div class="kpi-top"><span class="kpi-label">Discovered by AI</span><span class="kpi-icon">${icon('sparkles', 18)}</span></div>
        <div class="kpi-value">${summary.discovered}</div>
        <p class="kpi-sub">Written back after a run</p>
      </article>
      <article class="kpi-card">
        <div class="kpi-top"><span class="kpi-label">Average reliability</span><span class="kpi-icon">${icon('shield', 18)}</span></div>
        <div class="kpi-value">${summary.averageReliability.toFixed(2)}</div>
        <p class="kpi-sub">Across enabled sources</p>
      </article>
      <article class="kpi-card">
        <div class="kpi-top"><span class="kpi-label">Reuse</span><span class="kpi-icon">${icon('refresh', 18)}</span></div>
        <div class="kpi-value">${summary.uses}</div>
        <p class="kpi-sub">Source uses across searches</p>
      </article>
    </section>

    <section class="panel sources-growth-panel">
      <div class="panel-head">
        <div><p class="kicker">Compounding coverage</p><h2>The catalogue grows with every search</h2></div>
        <span class="delta-badge">+${discovered.length} discovered</span>
      </div>
      <div class="sources-growth-grid">
        ${growthChart(growth, { height: 132 })}
        <div class="growth-notes">
          <div class="growth-note"><span class="growth-note-icon">${icon('search', 16)}</span><div><strong>Start from the master list</strong><p>Every run begins with the Excel / Dropbox seed list, so institutional knowledge is not lost between searches.</p></div></div>
          <div class="growth-note"><span class="growth-note-icon">${icon('sparkles', 16)}</span><div><strong>Discover what is relevant</strong><p>New agencies and portals are added only when a search surfaces them, with coverage and reliability recorded.</p></div></div>
          <div class="growth-note"><span class="growth-note-icon">${icon('chart', 16)}</span><div><strong>Remember what performed</strong><p>Usage and last-used dates make the next search faster to plan and easier to audit.</p></div></div>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <div><p class="kicker">Master list</p><h2>${summary.total} sources, one search plan</h2></div>
        <span class="panel-count">${enabled.length} enabled</span>
      </div>
      <div class="sources-toolbar">
        <div class="filter-tabs" role="tablist">
          <button class="filter-tab is-active" type="button" data-source-filter="all">All <span>${sources.length}</span></button>
          <button class="filter-tab" type="button" data-source-filter="enabled">Enabled <span>${enabled.length}</span></button>
          <button class="filter-tab" type="button" data-source-filter="discovered">AI discovered <span>${discovered.length}</span></button>
          <button class="filter-tab" type="button" data-source-filter="disabled">Disabled <span>${sources.length - enabled.length}</span></button>
        </div>
        <label class="search-field">${icon('search', 15)}<input type="search" id="source-search" placeholder="Search source or domain" /></label>
      </div>
      <div class="table-scroll">
        <table class="data-table sources-table">
          <thead><tr><th></th><th>Source</th><th>Kind</th><th>Coverage</th><th>Reliability</th><th class="numeric">Uses</th><th>Last used</th><th>Notes</th></tr></thead>
          <tbody id="source-rows">${sources.map(sourceRow).join('')}</tbody>
        </table>
      </div>
      <div class="empty-state" id="sources-empty" hidden><span class="empty-icon">${icon('search', 22)}</span><h3>No sources match</h3><p>Try another filter or clear the search.</p></div>
      <div class="panel-foot panel-foot-split">
        <span class="panel-foot-note">${icon('info', 13)} Reliability guides source ordering; the human review still decides what reaches the client.</span>
        <a class="text-link" href="#/outputs">See source reuse in outputs ${icon('arrow-right', 14)}</a>
      </div>
    </section>
  </div>`;

  main.querySelector('#add-source')?.addEventListener('click', addSourceModal);
  main.querySelector('#import-sources')?.addEventListener('click', importModal);

  let filter = 'all';
  let search = '';
  const rows = [...main.querySelectorAll('.source-row')];
  const empty = main.querySelector('#sources-empty');
  function applyFilters() {
    let visible = 0;
    rows.forEach((row) => {
      const matchesFilter =
        filter === 'all' ||
        (filter === 'enabled' && row.dataset.enabled === 'true') ||
        (filter === 'disabled' && row.dataset.enabled === 'false') ||
        (filter === 'discovered' && row.dataset.discovered === 'true');
      const matchesSearch = !search || row.dataset.search.includes(search);
      const show = matchesFilter && matchesSearch;
      row.hidden = !show;
      if (show) visible += 1;
    });
    empty.hidden = visible !== 0;
  }
  main.querySelectorAll('[data-source-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      filter = button.dataset.sourceFilter;
      main.querySelectorAll('[data-source-filter]').forEach((tab) => tab.classList.toggle('is-active', tab === button));
      applyFilters();
    });
  });
  main.querySelector('#source-search')?.addEventListener('input', (event) => {
    search = event.target.value.trim().toLowerCase();
    applyFilters();
  });

  main.querySelectorAll('[data-toggle-source]').forEach((input) => {
    input.addEventListener('change', async () => {
      const sourceId = input.dataset.toggleSource;
      input.disabled = true;
      try {
        await api.updateSource(sourceId, { enabled: input.checked });
        toast(input.checked ? 'Source enabled.' : 'Source disabled for future searches.', { tone: 'success' });
        window.dispatchEvent(new Event('farol:refresh'));
      } catch (error) {
        toast(error.message, { tone: 'error' });
        input.checked = !input.checked;
        input.disabled = false;
      }
    });
  });

  return () => {};
}
