import { api } from './api.js';
import {
  esc,
  icon,
  toast,
  clearToasts,
  closeDrawer,
  isDrawerOpen,
  openDrawer,
  openMethodDrawer,
  emptyState,
} from './ui.js';
import { renderScout } from './views/scout.js';
import { renderPortfolio } from './views/portfolio.js';
import { renderSources } from './views/sources.js';
import { renderRuns, renderRunDetail } from './views/runs.js';

const main = document.getElementById('main');
const scrim = document.getElementById('scrim');
const sidebar = document.getElementById('sidebar');
const menuButton = document.getElementById('menu-button');
const breadcrumb = document.getElementById('breadcrumb');
const routeProgress = document.getElementById('route-progress');

let active = { token: null, cleanups: [] };
let currentRoute = { name: 'scout', params: {} };
let shellMeta = null;

function parseRoute() {
  const raw = location.hash.replace(/^#/, '');
  const path = (raw.split('?')[0] || '/scout').replace(/\/+$/, '') || '/scout';
  if (path === '/scout' || path === '/') return { name: 'scout', params: {} };
  if (path === '/portfolio') return { name: 'portfolio', params: {} };
  if (path === '/sources') return { name: 'sources', params: {} };
  if (path === '/runs') return { name: 'runs', params: {} };
  const runMatch = path.match(/^\/runs\/(run_[a-z0-9]{6,40})$/i);
  if (runMatch) return { name: 'run', params: { id: runMatch[1] } };
  return { name: 'not-found', params: { path } };
}

function setBreadcrumb(route) {
  let parts = ['Workspace', 'Scout'];
  if (route.name === 'portfolio') parts = ['Workspace', 'Portfolio'];
  if (route.name === 'sources') parts = ['Workspace', 'Sources'];
  if (route.name === 'runs') parts = ['Workspace', 'Run history'];
  if (route.name === 'run') parts = ['Workspace', 'Run history', 'Report'];
  if (route.name === 'not-found') parts = ['Workspace', 'Not found'];
  breadcrumb.innerHTML = parts
    .map((part, index) =>
      index === parts.length - 1 ? `<strong>${esc(part)}</strong>` : `<span>${esc(part)}</span><span class="crumb-sep">/</span>`
    )
    .join('');
}

function setActiveNav(route) {
  const navName = route.name === 'run' ? 'runs' : route.name;
  document.querySelectorAll('[data-nav]').forEach((link) => {
    const isActive = link.dataset.nav === navName;
    link.classList.toggle('active', isActive);
    if (isActive) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

function setShellMeta(meta) {
  if (!meta) return;
  shellMeta = meta;
  const demo = meta.mode === 'demo';
  const modePill = document.getElementById('mode-pill');
  const modeLabel = document.getElementById('mode-label');
  modePill.dataset.mode = meta.mode;
  modeLabel.textContent = demo ? 'Simulation' : 'Live web';
  document.getElementById('footer-mode').textContent = demo ? 'Simulated market data' : 'Live web extraction';
  document.getElementById('nav-property-count').textContent = meta.overview?.properties ?? '';
  document.getElementById('nav-source-count').textContent = meta.overview?.sources ?? '';
  const reset = document.getElementById('reset-demo');
  reset.style.display = demo ? '' : 'none';
  reset.disabled = false;
}

async function refreshShell() {
  try {
    const meta = await api.meta();
    setShellMeta(meta);
  } catch {
    // The page can keep working with its already-rendered data.
  }
}

function closeSidebar() {
  sidebar.classList.remove('open');
  menuButton.setAttribute('aria-expanded', 'false');
  if (!isDrawerOpen()) scrim.hidden = true;
}

function openSidebar() {
  if (isDrawerOpen()) closeDrawer({ restoreFocus: false });
  sidebar.classList.add('open');
  menuButton.setAttribute('aria-expanded', 'true');
  scrim.hidden = false;
}

function cleanupActive() {
  for (const cleanup of active.cleanups.reverse()) {
    try {
      cleanup();
    } catch {
      /* ignore */
    }
  }
  active.cleanups = [];
}

function routeContext(token) {
  return {
    isStale: () => active.token !== token,
    onCleanup(fn) {
      if (typeof fn !== 'function') return;
      if (active.token !== token) {
        try {
          fn();
        } catch {
          /* ignore */
        }
        return;
      }
      active.cleanups.push(fn);
    },
    refreshShell,
    navigate: (hash) => {
      if (location.hash === hash) renderRoute();
      else location.hash = hash;
    },
  };
}

function renderNotFound(path) {
  return emptyState({
    title: 'That page is off the map',
    message: `Scout has no route for “${path}”. Head back to the workspace and start from a brief.`,
    action: '<a class="button button-primary" href="#/scout">Back to Scout</a>',
    mark: 'compass',
  });
}

async function renderRoute() {
  cleanupActive();
  clearToasts();
  const token = {};
  active = { token, cleanups: [] };
  closeDrawer({ restoreFocus: false });
  closeSidebar();
  const route = parseRoute();
  currentRoute = route;
  setActiveNav(route);
  setBreadcrumb(route);
  const ctx = routeContext(token);
  routeProgress.hidden = false;
  window.scrollTo({ top: 0, behavior: 'auto' });

  try {
    if (route.name === 'scout') await renderScout(main, ctx);
    else if (route.name === 'portfolio') await renderPortfolio(main, ctx);
    else if (route.name === 'sources') await renderSources(main, ctx);
    else if (route.name === 'runs') await renderRuns(main, ctx);
    else if (route.name === 'run') await renderRunDetail(main, ctx, route.params.id);
    else main.innerHTML = renderNotFound(route.params.path);
  } catch (error) {
    if (ctx.isStale()) return;
    console.error('Route render failed', error);
    main.innerHTML = emptyState({
      title: 'This page could not be rendered',
      message: error?.message || 'An unexpected client error occurred.',
      action: '<button class="button button-quiet" type="button" data-retry-page>Reload this page</button>',
      mark: 'alert',
    });
    toast('Something went wrong while opening this page.', 'error');
  } finally {
    if (active.token === token) routeProgress.hidden = true;
  }
}

function newBrief() {
  if (currentRoute.name === 'scout') {
    document.dispatchEvent(new CustomEvent('scout:reset'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    location.hash = '#/scout';
  }
}

function openResetDrawer() {
  if (!shellMeta || shellMeta.mode !== 'demo') {
    toast('Demo reset is only available in simulation mode.', 'error');
    return;
  }
  openDrawer({
    kicker: 'Demo workspace',
    title: 'Clear the demo ledger?',
    body: `<div class="method-copy">
      <p>This removes every search, offer, match and Scout-discovered source. The property portfolio and the seeded source catalogue are kept intact.</p>
      <div class="method-callout"><strong>Use this between client demos.</strong> It cannot be undone. Any source you added manually will also be removed.</div>
      <div class="error-banner" data-reset-error hidden>${icon('alert', 15)} <span></span></div>
      <div class="drawer-actions" style="margin-top:18px">
        <button class="button button-quiet" type="button" data-cancel-reset>Cancel</button>
        <button class="button button-accent" type="button" data-confirm-reset>${icon('refresh', 14)} Reset demo data</button>
      </div>
    </div>`,
    onMount(drawer) {
      const errorBox = drawer.querySelector('[data-reset-error]');
      drawer.querySelector('[data-cancel-reset]')?.addEventListener('click', () => closeDrawer());
      const confirm = drawer.querySelector('[data-confirm-reset]');
      confirm?.addEventListener('click', async () => {
        confirm.disabled = true;
        confirm.textContent = 'Resetting…';
        try {
          await api.resetDemo();
          closeDrawer({ restoreFocus: false });
          toast('Demo data reset. A clean workspace is ready.');
          await refreshShell();
          if (location.hash === '#/scout') await renderRoute();
          else location.hash = '#/scout';
        } catch (error) {
          errorBox.querySelector('span').textContent = error.message || 'Reset failed.';
          errorBox.hidden = false;
          confirm.disabled = false;
          confirm.innerHTML = `${icon('refresh', 14)} Reset demo data`;
        }
      });
    },
  });
}

/* Global interactions */

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-open-method]')) {
    openMethodDrawer();
    return;
  }
  if (event.target.closest('[data-retry-page]')) {
    renderRoute();
  }
});

menuButton.addEventListener('click', () => {
  if (sidebar.classList.contains('open')) closeSidebar();
  else openSidebar();
});

scrim.addEventListener('click', () => {
  if (isDrawerOpen()) closeDrawer({ restoreFocus: false });
  closeSidebar();
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (isDrawerOpen()) closeDrawer();
  if (sidebar.classList.contains('open')) closeSidebar();
});

sidebar.querySelectorAll('a[href^="#/"]').forEach((link) => {
  link.addEventListener('click', () => closeSidebar());
});

document.getElementById('new-brief-button').addEventListener('click', newBrief);
document.getElementById('reset-demo').addEventListener('click', openResetDrawer);

const dateLabel = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
}).format(new Date());
document.getElementById('topbar-date').textContent = dateLabel;

if (!location.hash) {
  history.replaceState(null, '', '#/scout');
}

window.addEventListener('hashchange', () => {
  renderRoute();
});

(async function boot() {
  await refreshShell();
  await renderRoute();
})();
