import { api } from './api.js';
import {
  escapeHtml,
  hydrateIcons,
  icon,
  openModal,
  spinnerBlock,
  toast,
  confirmModal,
} from './ui.js';
import { renderCompare } from './views/compare.js';
import { renderComparison } from './views/comparison.js';
import { renderPipeline } from './views/pipeline.js';
import { renderCase } from './views/case.js';
import { renderInventory } from './views/inventory.js';
import { renderSources } from './views/sources.js';
import { renderPortfolio } from './views/portfolio.js';
import { renderOutputs } from './views/outputs.js';
import { renderSystems } from './views/systems.js';
import { renderPortal } from './views/portal.js';

const main = document.getElementById('main');
const sidebar = document.getElementById('sidebar');
const scrim = document.getElementById('sidebar-scrim');
const modalRoot = document.getElementById('modal-root');
let cleanup = null;
let renderToken = 0;

const NAV_FOR_ROUTE = {
  compare: 'compare',
  comparison: 'compare',
  pipeline: 'pipeline',
  case: 'pipeline',
  inventory: 'inventory',
  sources: 'sources',
  portfolio: 'portfolio',
  outputs: 'outputs',
  systems: 'systems',
  portal: null,
};

function currentRoute() {
  const pathname = window.location.pathname;
  if (pathname.startsWith('/portal/')) {
    return { name: 'portal', token: decodeURIComponent(pathname.replace('/portal/', '')), path: pathname };
  }
  let path = window.location.hash.replace(/^#/, '');
  if (!path) path = '/compare';
  const [clean, search] = path.split('?');
  const segments = clean.split('/').filter(Boolean);
  const params = new URLSearchParams(search || '');
  if (!segments.length) return { name: 'pipeline', path: '/pipeline' };
  if (segments[0] === 'compare') return { name: 'compare' };
  if (segments[0] === 'comparisons' && segments[1]) {
    return { name: 'comparison', id: decodeURIComponent(segments[1]) };
  }
  if (segments[0] === 'pipeline') return { name: 'pipeline', params };
  if (segments[0] === 'cases' && segments[1]) return { name: 'case', id: decodeURIComponent(segments[1]) };
  if (segments[0] === 'inventory') return { name: 'inventory' };
  if (segments[0] === 'sources') return { name: 'sources' };
  if (segments[0] === 'portfolio') return { name: 'portfolio' };
  if (segments[0] === 'outputs') return { name: 'outputs' };
  if (segments[0] === 'systems') return { name: 'systems' };
  if (segments[0] === 'portal' && segments[1]) {
    return { name: 'portal', token: decodeURIComponent(segments[1]) };
  }
  return { name: 'notfound', path: clean };
}

function setActiveNav(name) {
  document.querySelectorAll('[data-nav]').forEach((link) => {
    link.classList.toggle('is-active', link.dataset.nav === name);
  });
}

function setTitle(title) {
  document.title = title ? `${title} · Farol` : 'Farol — know what your listing is worth';
}

function closeSidebar() {
  document.body.classList.remove('nav-open');
}

function openSidebar() {
  document.body.classList.add('nav-open');
}

function renderError(error) {
  main.innerHTML = `<div class="page">
    <div class="error-panel">
      <span class="error-icon">${icon('alert', 26)}</span>
      <p class="kicker">Something went wrong</p>
      <h1>${escapeHtml(error.message || 'The page could not be loaded.')}</h1>
      <p class="muted">Check that the Farol server is running, then try again.</p>
      <div class="button-row">
        <button class="button button-primary" type="button" id="retry-page">Try again</button>
        <a class="button button-ghost" href="#/pipeline">Back to pipeline</a>
      </div>
    </div>
  </div>`;
  main.querySelector('#retry-page')?.addEventListener('click', () => render());
}

async function render(options = {}) {
  const token = ++renderToken;
  const route = currentRoute();
  if (cleanup) {
    try {
      cleanup();
    } catch {
      /* ignore */
    }
    cleanup = null;
  }
  if (modalRoot && !options.preserveModal) modalRoot.innerHTML = '';
  closeSidebar();

  const isPortal = route.name === 'portal';
  document.body.classList.toggle('portal-mode', isPortal);
  document.body.classList.toggle('notfound-mode', route.name === 'notfound');
  setActiveNav(NAV_FOR_ROUTE[route.name] ?? null);

  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  main.className = 'main';

  if (route.name === 'notfound') {
    setTitle('Page not found');
    main.innerHTML = `<div class="page"><div class="error-panel">
      <span class="error-icon">${icon('map', 26)}</span>
      <p class="kicker">404</p>
      <h1>That page is not on the map.</h1>
      <p class="muted">Head back to the pipeline to pick up a case.</p>
      <a class="button button-primary" href="#/pipeline">Back to pipeline</a>
    </div></div>`;
    return;
  }

  const view = {
    compare: { render: renderCompare, title: 'Compare a listing' },
    comparison: { render: renderComparison, title: 'Comparable report' },
    pipeline: { render: renderPipeline, title: 'Pipeline' },
    case: { render: renderCase, title: 'Case' },
    inventory: { render: renderInventory, title: 'Inventory' },
    sources: { render: renderSources, title: 'Sources' },
    portfolio: { render: renderPortfolio, title: 'Price intelligence' },
    outputs: { render: renderOutputs, title: 'Outputs' },
    systems: { render: renderSystems, title: 'Systems' },
    portal: { render: renderPortal, title: 'Your shortlist' },
  }[route.name];

  if (!isPortal) main.innerHTML = spinnerBlock('Opening the casebook…');
  else main.innerHTML = '';

  try {
    const result = await view.render(main, route);
    if (token !== renderToken) return;
    if (typeof result === 'function') cleanup = result;
    hydrateIcons(main);
    if (route.name !== 'portal') {
      const heading = main.querySelector('h1')?.textContent?.trim();
      setTitle(heading || view.title);
    } else {
      setTitle('Your shortlist');
    }
    main.focus({ preventScroll: true });
  } catch (error) {
    if (token !== renderToken) return;
    renderError(error);
  }
}

function newEnquiryModal() {
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  openModal({
    title: 'Log a new enquiry',
    eyebrow: `New enquiry · ${today}`,
    body: `
      <form id="enquiry-form" class="form" novalidate>
        <div class="form-grid form-grid-2">
          <label class="field">
            <span class="field-label">Client name</span>
            <input class="input" name="name" autocomplete="name" placeholder="e.g. Clara & Johannes Hartmann" required />
          </label>
          <label class="field">
            <span class="field-label">Email</span>
            <input class="input" type="email" name="email" autocomplete="email" placeholder="client@example.com" required />
          </label>
          <label class="field">
            <span class="field-label">Phone <span class="field-hint">optional</span></span>
            <input class="input" name="phone" autocomplete="tel" placeholder="+351 …" />
          </label>
          <label class="field">
            <span class="field-label">Enquiry source</span>
            <select class="input" name="source">
              <option>Website</option>
              <option>Zoho CRM</option>
              <option>Referral</option>
              <option>Email</option>
              <option>Phone</option>
            </select>
          </label>
        </div>

        <div class="field">
          <span class="field-label">Brief</span>
          <textarea class="input textarea" name="brief" rows="5" placeholder="What is the client looking for? Location, budget, bedrooms, timing, must-haves…" required></textarea>
          <span class="field-hint">Farol will interpret the brief. Nothing is searched until the team confirms it.</span>
        </div>

        <div class="form-grid form-grid-2">
          <div class="field">
            <span class="field-label">Transaction</span>
            <div class="segmented" data-segmented="transaction">
              <label><input type="radio" name="transaction" value="rent" checked /><span>Long let</span></label>
              <label><input type="radio" name="transaction" value="sale" /><span>Purchase</span></label>
            </div>
          </div>
          <label class="field">
            <span class="field-label">Owner</span>
            <select class="input" name="owner">
              <option>Inês Duarte</option>
              <option>Tomás Reis</option>
              <option>Unassigned</option>
            </select>
          </label>
        </div>
      </form>
    `,
    footer: `
      <button class="button button-ghost" type="button" data-modal-close>Cancel</button>
      <button class="button button-primary" type="submit" form="enquiry-form" id="create-enquiry">
        ${icon('plus', 16)} Create case
      </button>
    `,
    size: 'lg',
    onMount({ root, close }) {
      const form = root.querySelector('#enquiry-form');
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = root.querySelector('#create-enquiry');
        const data = new FormData(form);
        const name = String(data.get('name') || '').trim();
        const email = String(data.get('email') || '').trim();
        const brief = String(data.get('brief') || '').trim();
        if (!name || !email || !brief) {
          toast('Name, email and brief are required.', { tone: 'error' });
          return;
        }
        button.disabled = true;
        button.innerHTML = '<span class="spinner"></span>Creating case…';
        try {
          const bundle = await api.createCase({
            client: {
              name,
              email,
              phone: String(data.get('phone') || '').trim(),
              source: String(data.get('source') || 'Website'),
            },
            transaction: String(data.get('transaction') || 'rent'),
            brief,
            owner: String(data.get('owner') || 'Unassigned'),
            source: String(data.get('source') || 'Website'),
          });
          close();
          toast('Enquiry logged. Confirm the interpreted brief next.', { tone: 'success' });
          window.location.hash = `#/cases/${bundle.case.id}`;
        } catch (error) {
          toast(error.message, { tone: 'error' });
          button.disabled = false;
          button.innerHTML = `${icon('plus', 16)} Create case`;
        }
      });
    },
  });
}

function resetDemo() {
  confirmModal({
    title: 'Reset the demo?',
    message:
      'This clears every case, run, shortlist and discovery, then restores the seeded casebook. The source catalogue, inventory and portfolio return to their demo state.',
    confirmLabel: 'Reset demo',
    tone: 'danger',
    async onConfirm() {
      await api.resetDemo();
      toast('Demo reset. The original casebook is back.', { tone: 'success' });
      setTimeout(() => window.location.reload(), 500);
    },
  });
}

function bindShell() {
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-new-enquiry]');
    if (trigger) {
      event.preventDefault();
      newEnquiryModal();
    }
  });
  document.getElementById('new-enquiry')?.addEventListener('click', newEnquiryModal);
  document.getElementById('reset-demo')?.addEventListener('click', resetDemo);
  document.getElementById('menu-toggle')?.addEventListener('click', openSidebar);
  document.getElementById('sidebar-close')?.addEventListener('click', closeSidebar);
  scrim?.addEventListener('click', closeSidebar);
  document.querySelectorAll('.nav-item').forEach((link) => link.addEventListener('click', closeSidebar));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeSidebar();
  });

  const dateElement = document.getElementById('topbar-date');
  if (dateElement) {
    const compact = window.matchMedia('(max-width: 560px)').matches;
    dateElement.textContent = new Date().toLocaleDateString(
      'en-GB',
      compact ? { day: 'numeric', month: 'short' } : { weekday: 'long', day: 'numeric', month: 'long' }
    );
  }
}

async function boot() {
  hydrateIcons();
  bindShell();
  try {
    const meta = await api.meta();
    const count = document.getElementById('nav-active-count');
    if (count) count.textContent = String(Math.max(0, meta.counts.activeCases ?? meta.counts.cases));
  } catch {
    /* the dashboard view will surface a connection problem */
  }
  await render();
  window.addEventListener('hashchange', () => render());
  window.addEventListener('popstate', () => render());
  window.addEventListener('farol:refresh', () => render({ preserveModal: true }));
}

boot();
