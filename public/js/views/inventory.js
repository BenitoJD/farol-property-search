import { api } from '../api.js';
import {
  escapeAttr,
  escapeHtml,
  formatMonth,
  icon,
  money,
  openModal,
  propertyImage,
  toast,
} from '../ui.js';

function inventoryCard(item) {
  const statusLabel = item.status === 'available' ? 'Available' : item.status === 'reserved' ? 'Reserved' : 'Let';
  return `<article class="inventory-card" data-system="${escapeAttr(item.system)}" data-status="${escapeAttr(item.status)}" data-search="${escapeAttr(
    `${item.title} ${item.city} ${item.ref} ${item.system}`.toLowerCase()
  )}">
    <div class="inventory-card-media">
      <img src="${propertyImage(item)}" alt="${escapeAttr(`${item.type} in ${item.city}`)}" loading="lazy" />
      <span class="status-chip inventory-status status-${escapeHtml(item.status)}">${statusLabel}</span>
      <span class="inventory-system-pill">${escapeHtml(item.system)}</span>
    </div>
    <div class="inventory-card-body">
      <div class="inventory-card-head">
        <span class="inventory-ref">${escapeHtml(item.ref)}</span>
        ${item.seniorFriendly ? `<span class="senior-badge">${icon('shield', 11)} Senior-friendly</span>` : ''}
      </div>
      <h3>${escapeHtml(item.title)}</h3>
      <p class="inventory-location">${icon('pin', 13)} ${escapeHtml(item.city)}${item.area ? ` · ${escapeHtml(item.area)}` : ''}</p>
      <div class="inventory-specs">
        <span>${icon('bed', 13)} ${item.bedrooms} bed</span>
        <span>${icon('bath', 13)} ${item.bathrooms} bath</span>
        <span>${icon('ruler', 13)} ${item.areaM2} m²</span>
      </div>
      <div class="inventory-features">${item.features.slice(0, 5).map((feature) => `<span>${escapeHtml(feature)}</span>`).join('')}</div>
      <div class="inventory-card-foot">
        <div><strong>${money(item.rent, { period: 'month' })}</strong><span>from ${escapeHtml(formatMonth(item.availableFrom))}</span></div>
        <button class="button button-ghost button-sm" type="button" data-toggle-status="${escapeAttr(item.id)}" data-next-status="${item.status === 'available' ? 'let' : 'available'}">
          ${item.status === 'available' ? 'Mark as let' : 'Make available'}
        </button>
      </div>
    </div>
  </article>`;
}

function addInventoryModal() {
  openModal({
    title: 'Add an inventory home',
    eyebrow: 'Reusable inventory',
    body: `<form id="inventory-form" class="form">
      <div class="form-grid form-grid-2">
        <label class="field"><span class="field-label">System</span><select class="input" name="system"><option>Algarve Senior Living</option><option>Portugal Long Lets</option></select></label>
        <label class="field"><span class="field-label">Reference</span><input class="input" name="ref" placeholder="Generated if left blank" /></label>
      </div>
      <label class="field"><span class="field-label">Title</span><input class="input" name="title" placeholder="Two-bedroom apartment with pool, Lagos" required /></label>
      <div class="form-grid form-grid-2">
        <label class="field"><span class="field-label">Type</span><select class="input" name="type"><option>apartment</option><option>townhouse</option><option>villa</option><option>house</option><option>quinta</option></select></label>
        <label class="field"><span class="field-label">City</span><input class="input" name="city" placeholder="Lagos" required /></label>
        <label class="field"><span class="field-label">Area / neighbourhood</span><input class="input" name="area" placeholder="Meia Praia" /></label>
        <label class="field"><span class="field-label">Monthly rent (EUR)</span><input class="input" type="number" min="0" name="rent" placeholder="1950" required /></label>
        <label class="field"><span class="field-label">Bedrooms</span><input class="input" type="number" min="0" name="bedrooms" value="2" /></label>
        <label class="field"><span class="field-label">Bathrooms</span><input class="input" type="number" min="0" name="bathrooms" value="2" /></label>
        <label class="field"><span class="field-label">Area m²</span><input class="input" type="number" min="10" name="areaM2" value="85" /></label>
        <label class="field"><span class="field-label">Available from</span><input class="input" type="date" name="availableFrom" /></label>
      </div>
      <label class="field"><span class="field-label">Features <span class="field-hint">comma separated</span></span><input class="input" name="features" placeholder="Lift, Near shops, Near medical, Senior friendly" /></label>
      <label class="field"><span class="field-label">Description</span><textarea class="input textarea" name="description" rows="2"></textarea></label>
      <label class="check-line"><input type="checkbox" name="seniorFriendly" /><span>Senior-friendly / step-free</span></label>
    </form>`,
    footer: `<button class="button button-ghost" type="button" data-modal-close>Cancel</button><button class="button button-primary" type="submit" form="inventory-form" id="save-inventory">${icon('plus', 15)} Add home</button>`,
    size: 'lg',
    onMount({ root, close }) {
      root.querySelector('#inventory-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const button = root.querySelector('#save-inventory');
        button.disabled = true;
        button.innerHTML = '<span class="spinner"></span>Saving…';
        try {
          await api.addInventory({
            system: String(data.get('system')),
            title: String(data.get('title') || '').trim(),
            type: String(data.get('type')),
            city: String(data.get('city') || '').trim(),
            area: String(data.get('area') || '').trim(),
            bedrooms: Number(data.get('bedrooms') || 0),
            bathrooms: Number(data.get('bathrooms') || 0),
            areaM2: Number(data.get('areaM2') || 0),
            rent: Number(data.get('rent') || 0),
            availableFrom: String(data.get('availableFrom') || ''),
            status: 'available',
            features: String(data.get('features') || '')
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean),
            seniorFriendly: data.get('seniorFriendly') === 'on',
            description: String(data.get('description') || '').trim(),
          });
          close();
          toast('Inventory home added.', { tone: 'success' });
          window.dispatchEvent(new Event('farol:refresh'));
        } catch (error) {
          toast(error.message, { tone: 'error' });
          button.disabled = false;
          button.innerHTML = `${icon('plus', 15)} Add home`;
        }
      });
    },
  });
}

export async function renderInventory(main) {
  const data = await api.inventory();
  const { items, summary } = data;

  main.innerHTML = `<div class="page inventory-page">
    <header class="page-head">
      <div class="page-head-copy">
        <p class="kicker">Reusable systems · rental inventory</p>
        <h1>Existing inventory</h1>
        <p class="page-intro">Algarve Senior Living and Portugal Long Lets are checked before the external market. Availability is the first question, not an afterthought.</p>
      </div>
      <div class="page-actions">
        <button class="button button-ghost" type="button" id="inventory-add">${icon('plus', 15)} Add home</button>
        <a class="button button-ghost" href="#/systems">${icon('plug', 15)} Systems</a>
      </div>
    </header>

    <section class="kpi-grid kpi-grid-3">
      <article class="kpi-card">
        <div class="kpi-top"><span class="kpi-label">Homes in inventory</span><span class="kpi-icon">${icon('home', 18)}</span></div>
        <div class="kpi-value">${summary.total}</div>
        <p class="kpi-sub">${summary.systems.map((system) => escapeHtml(system)).join(' · ')}</p>
      </article>
      <article class="kpi-card">
        <div class="kpi-top"><span class="kpi-label">Available now</span><span class="kpi-icon">${icon('check-circle', 18)}</span></div>
        <div class="kpi-value">${summary.available}</div>
        <p class="kpi-sub">${summary.reserved} reserved · ${summary.let} currently let</p>
      </article>
      <article class="kpi-card">
        <div class="kpi-top"><span class="kpi-label">Available monthly rent</span><span class="kpi-icon">${icon('chart', 18)}</span></div>
        <div class="kpi-value">${money(summary.monthlyRentAvailable, { compact: true })}</div>
        <p class="kpi-sub">Across the available long-let stock</p>
      </article>
    </section>

    <section class="panel">
      <div class="panel-head">
        <div><p class="kicker">The first check</p><h2>Homes we can offer without going to market</h2></div>
        <span class="panel-count">${items.length} homes</span>
      </div>
      <div class="inventory-toolbar">
        <div class="filter-tabs" role="tablist">
          <button class="filter-tab is-active" type="button" data-system-filter="all">All <span>${items.length}</span></button>
          <button class="filter-tab" type="button" data-system-filter="Algarve Senior Living">Algarve Senior Living <span>${items.filter((item) => item.system === 'Algarve Senior Living').length}</span></button>
          <button class="filter-tab" type="button" data-system-filter="Portugal Long Lets">Portugal Long Lets <span>${items.filter((item) => item.system === 'Portugal Long Lets').length}</span></button>
        </div>
        <label class="search-field">${icon('search', 15)}<input type="search" id="inventory-search" placeholder="Search ref, city or home" /></label>
      </div>
      <div class="inventory-grid" id="inventory-grid">
        ${items.map(inventoryCard).join('')}
      </div>
      <div class="empty-state" id="inventory-empty" hidden>
        <span class="empty-icon">${icon('search', 22)}</span>
        <h3>No inventory homes match</h3>
        <p>Try another system or clear the search.</p>
      </div>
    </section>

    <footer class="page-foot">
      <span>Inventory is a read/write demo table. In production it syncs from the two inventory systems.</span>
      <span>${summary.available} available · updated just now</span>
    </footer>
  </div>`;

  main.querySelector('#inventory-add')?.addEventListener('click', addInventoryModal);

  let systemFilter = 'all';
  let search = '';
  const cards = [...main.querySelectorAll('.inventory-card')];
  const empty = main.querySelector('#inventory-empty');

  function applyFilters() {
    let visible = 0;
    cards.forEach((card) => {
      const matchesSystem = systemFilter === 'all' || card.dataset.system === systemFilter;
      const matchesSearch = !search || card.dataset.search.includes(search);
      const show = matchesSystem && matchesSearch;
      card.hidden = !show;
      if (show) visible += 1;
    });
    empty.hidden = visible !== 0;
  }

  main.querySelectorAll('[data-system-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      systemFilter = button.dataset.systemFilter;
      main.querySelectorAll('[data-system-filter]').forEach((tab) => tab.classList.toggle('is-active', tab === button));
      applyFilters();
    });
  });

  main.querySelector('#inventory-search')?.addEventListener('input', (event) => {
    search = event.target.value.trim().toLowerCase();
    applyFilters();
  });

  main.querySelectorAll('[data-toggle-status]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.toggleStatus;
      const nextStatus = button.dataset.nextStatus;
      button.disabled = true;
      try {
        await api.updateInventory(id, { status: nextStatus });
        toast(nextStatus === 'available' ? 'Home marked available.' : 'Home marked as let.', { tone: 'success' });
        window.dispatchEvent(new Event('farol:refresh'));
      } catch (error) {
        toast(error.message, { tone: 'error' });
        button.disabled = false;
      }
    });
  });

  return () => {};
}
