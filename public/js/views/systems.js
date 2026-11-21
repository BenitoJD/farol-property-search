import { api } from '../api.js';
import { escapeHtml, icon } from '../ui.js';

const SYSTEM_ICONS = {
  zoho: 'users',
  'source-list': 'file',
  asl: 'home',
  pll: 'key',
  portal: 'building',
  ai: 'sparkles',
};

const SYSTEM_LINKS = {
  'source-list': { href: '#/sources', label: 'Open source catalogue' },
  asl: { href: '#/inventory', label: 'Open inventory' },
  pll: { href: '#/inventory', label: 'Open inventory' },
  portal: { href: '#/portfolio', label: 'Open price intelligence' },
  ai: { href: '#/outputs', label: 'See run history' },
};

function systemCard(system) {
  const link = SYSTEM_LINKS[system.key];
  return `<article class="system-card system-status-${escapeHtml(system.status)}">
    <div class="system-card-top">
      <span class="system-icon">${icon(SYSTEM_ICONS[system.key] || 'plug', 20)}</span>
      <span class="system-category">${escapeHtml(system.category)}</span>
      <span class="status-chip system-status-chip status-${escapeHtml(system.status)}">${escapeHtml(system.statusLabel)}</span>
    </div>
    <h3>${escapeHtml(system.name)}</h3>
    <p class="system-detail">${escapeHtml(system.detail)}</p>
    <div class="system-feeds"><span class="meta-label">Feeds</span><span>${escapeHtml(system.whatItFeeds)}</span></div>
    <div class="system-card-foot">
      <span class="system-mode">${escapeHtml(system.mode)}</span>
      ${link ? `<a class="text-link" href="${link.href}">${escapeHtml(link.label)} ${icon('arrow-right', 13)}</a>` : ''}
    </div>
  </article>`;
}

export async function renderSystems(main) {
  const data = await api.systems();
  const { systems, totals } = data;

  main.innerHTML = `<div class="page systems-page">
    <header class="page-head">
      <div class="page-head-copy">
        <p class="kicker">Architecture · systems & assets</p>
        <h1>One listing, connected to the evidence you need.</h1>
        <p class="page-intro">Farol sits between your listing, the source catalogue and your team. It does not replace the CRM, the portal or human judgement — it turns dispersed competitor evidence into a defensible value read.</p>
      </div>
      <div class="page-actions">
        <a class="button button-ghost" href="#/sources">${icon('globe', 15)} Sources</a>
        <a class="button button-ghost" href="#/inventory">${icon('home', 15)} Inventory</a>
      </div>
    </header>

    <section class="system-flow" aria-label="Business user flow">
      <div class="flow-step flow-client">
        <span class="flow-icon">${icon('target', 20)}</span>
        <span class="flow-kicker">Your listing</span>
        <strong>Start with one property</strong>
        <span>Choose from the portfolio or enter the details.</span>
      </div>
      <span class="flow-arrow">${icon('arrow-right', 18)}</span>
      <div class="flow-step flow-ai">
        <span class="flow-icon">${icon('sparkles', 20)}</span>
        <span class="flow-kicker">Farol comparable agent</span>
        <strong>Finds similar listings</strong>
        <span>Source catalogue → extract → dedupe.</span>
      </div>
      <span class="flow-arrow">${icon('arrow-right', 18)}</span>
      <div class="flow-step flow-team">
        <span class="flow-icon">${icon('chart', 20)}</span>
        <span class="flow-kicker">Competitor evidence</span>
        <strong>Prices and groups the segment</strong>
        <span>Median, range, €/m², source-level pricing.</span>
      </div>
      <span class="flow-arrow">${icon('arrow-right', 18)}</span>
      <div class="flow-step flow-human">
        <span class="flow-icon">${icon('shield', 20)}</span>
        <span class="flow-kicker">Human decision</span>
        <strong>Reprice, hold or investigate</strong>
        <span>The evidence informs the team; it does not decide.</span>
      </div>
    </section>

    <section class="panel systems-panel">
      <div class="panel-head">
        <div><p class="kicker">Reusable systems / assets</p><h2>The tools that feed the flow</h2></div>
        <span class="panel-count">${systems.length} systems</span>
      </div>
      <div class="systems-grid">
        ${systems.map(systemCard).join('')}
      </div>
      <div class="panel-foot panel-foot-split">
        <span class="panel-foot-note">${icon('info', 13)} Connection status is honest about what this demo does: file import, seeded inventory and exports. No external write is simulated as live.</span>
        <span class="panel-foot-note">${totals.sources} sources · ${totals.portfolio} portfolio homes · ${totals.availableInventory} available inventory homes</span>
      </div>
    </section>

    <section class="panel expected-panel">
      <div class="panel-head">
        <div><p class="kicker">Expected state · what changed</p><h2>The improvements the flow is meant to create</h2></div>
        <span class="panel-count">measured on the demo</span>
      </div>
      <div class="expected-grid">
        <div class="expected-card"><span class="expected-icon">${icon('globe', 16)}</span><strong>Broader coverage</strong><p>${totals.sources} sources, ${totals.discovered} discovered by the engine, selected by coverage and reliability rather than a single portal.</p></div>
        <div class="expected-card"><span class="expected-icon">${icon('zap', 16)}</span><strong>Faster search</strong><p>${totals.avgRunSeconds ?? '—'}s average agent run. Extraction, dedupe, ranking and price checks happen in one pass.</p></div>
        <div class="expected-card"><span class="expected-icon">${icon('sparkles', 16)}</span><strong>Continuous growth</strong><p>Every run writes back the sources it discovers and the ones that performed, so the catalogue compounds.</p></div>
        <div class="expected-card"><span class="expected-icon">${icon('refresh', 16)}</span><strong>Better reuse</strong><p>${totals.sourceReuse} sources reused; ${totals.comparisons ?? 0} value reports and ${totals.longList} client long-list homes retained.</p></div>
        <div class="expected-card"><span class="expected-icon">${icon('shield', 16)}</span><strong>Human review in control</strong><p>Every client shortlist passes through a person, and every price read exposes its comparable evidence.</p></div>
      </div>
    </section>

    <div class="systems-bottom">
      <section class="panel human-panel">
        <div class="panel-head"><div><p class="kicker">Control</p><h2>The team remains in control</h2></div></div>
        <div class="human-points">
          <div class="human-point"><span>${icon('shield', 18)}</span><div><strong>A value report is evidence, not an instruction</strong><p>The agent finds the comparables and the range. A person decides whether a premium, a condition difference or a stale listing explains the gap.</p></div></div>
          <div class="human-point"><span>${icon('chart', 18)}</span><div><strong>Every price has an evidence trail</strong><p>Comparable median, p25/p75, €/m², competitor grouping, count and confidence. Thin evidence is labelled, not hidden.</p></div></div>
          <div class="human-point"><span>${icon('link', 18)}</span><div><strong>Client casework still has a review gate</strong><p>When a comparison feeds a client shortlist, the property finder still selects, explains and shares it.</p></div></div>
        </div>
      </section>

      <section class="panel demo-boundary">
        <div class="panel-head"><div><p class="kicker">This build</p><h2>What is real, what is synthetic</h2></div></div>
        <ul class="boundary-list">
          <li><span class="boundary-check">${icon('check', 13)}</span><span><strong>Real:</strong> case lifecycle, SSE agent runs, dedupe/ranking, comparable-price engine, shortlist sharing, client feedback, iteration, SQLite persistence and exports.</span></li>
          <li><span class="boundary-check">${icon('check', 13)}</span><span><strong>Real:</strong> listing-first comparable agent, competitor grouping, value range, source catalogue import/export, portfolio benchmark and audit trail.</span></li>
          <li><span class="boundary-warn">${icon('info', 13)}</span><span><strong>Synthetic:</strong> the demo catalogue's listings, prices, clients and availability dates. The demo market is deterministic.</span></li>
          <li><span class="boundary-check">${icon('check', 13)}</span><span><strong>Live source:</strong> Imovirtual public search results are fetched on demand in the Live market mode. They are real current listings; verify terms, availability and condition before acting.</span></li>
          <li><span class="boundary-warn">${icon('info', 13)}</span><span><strong>Not connected:</strong> Zoho CRM writes, the PHP/MySQL portal and licensed feeds. These remain adapter boundaries with clear contracts.</span></li>
        </ul>
        <p class="boundary-note">Production would use licensed feeds or permitted APIs first. Portal terms and robots directives take precedence over coverage.</p>
      </section>
    </div>

    <footer class="page-foot">
      <span>Farol · Property Buy or Rent · demo architecture</span>
      <span>${totals.activeCases} active cases across the flow</span>
    </footer>
  </div>`;

  return () => {};
}
