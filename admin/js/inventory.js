import { loadingHtml } from '/js/ui-helpers/loading.js';
// Inventory catalog with lazy icon loading, immediate search and item editing.

import { api, el, mkBtn, mkEditBtn, _esc, showConfirm, showAlert, matchesQuery } from './core.js';
import { editFields } from './editor.js';
import { mountLazyIconGrid } from '/js/ui-helpers/lazy-icon-grid.js';

let _allItems = [];
let _lazyGrid = null;
let _loadRevision = 0;

async function _renderInventoryEdit(it) {
  let full;
  try {
    [full] = await api('GET', `/api/admin/items?ids=${it.id}`);
    if (!full) throw new Error('Item not found.');
  } catch (error) { showAlert(error.message); return; }
  editFields({
    title: `Edit Item: ${it.name}`,
    fields: [
      { key: 'name', label: 'Name', value: it.name, required: true },
      { key: 'description', label: 'Description', type: 'textarea', value: it.description },
      { key: 'type', label: 'Type', options: ['weapon', 'armor', 'consumable', 'tool', 'jewelry', 'miscellaneous'], value: it.type },
      { key: 'svg_data', label: 'SVG markup', type: 'textarea', code: true, value: full.svg_data, required: true, rows: 8 },
    ],
    save: async payload => {
      if (!payload.name || !payload.svg_data) throw new Error('Name and SVG markup are required.');
      await api('PATCH', `/api/admin/items/${it.id}`, payload);
      Object.assign(it, payload, { description: payload.description || null });
      delete it.svg_data;
    },
    afterSave: () => _renderInventory(false),
  });
}

function _renderInventory(resetPage = true) {
  const typeF   = document.getElementById('inv-type-filter').value;
  const activeF = document.getElementById('inv-active-filter').value;
  const query   = document.getElementById('inv-search').value;
  const items   = _allItems.filter(it =>
    (!typeF   || it.type   === typeF) &&
    (activeF === '' || String(it.active) === activeF) &&
    (!query   || matchesQuery(it.name, query) || matchesQuery(it.description, query))
  );
  document.getElementById('inv-count').textContent = `${items.length} item${items.length !== 1 ? 's' : ''}`;
  renderInventoryGrid(items);
}

function renderInventoryGrid(items) {
  const grid = document.getElementById('inv-grid');
  _lazyGrid?.disconnect();
  _lazyGrid = null;
  if (!items.length) { grid.innerHTML = '<div style="color:#6b7280;font-size:0.85rem;grid-column:1/-1">No items match the current filter.</div>'; return; }
  _lazyGrid = mountLazyIconGrid({
    grid, items, root: null,
    loadItems: ids => api('GET', `/api/admin/items?ids=${ids.join(',')}`),
    renderItem(it) {
    const card = el('div', `inv-card${it.active ? '' : ' inactive'}`);
    card.dataset.tooltip = it.name;
    card.dataset.tooltipWrap = 'true';
    const svgBox = el('div', 'inv-card-svg');
    svgBox.dataset.lazyIcon = '';
    card.appendChild(svgBox);
    const nameEl = el('div', 'inv-card-name');
    nameEl.textContent = it.name;
    card.appendChild(nameEl);
    if (it.description) {
      const descEl = el('div', 'inv-card-desc');
      descEl.textContent = it.description;
      card.appendChild(descEl);
    }
    const actions = el('div', 'inv-card-actions');
    const toggleLabel = el('label', 'inv-toggle-label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = it.active === 1;
    cb.dataset.id = it.id;
    cb.addEventListener('change', async () => {
      cb.disabled = true;
      try {
        await api('PATCH', `/api/admin/items/${it.id}`, { active: cb.checked });
        it.active = cb.checked ? 1 : 0;
        _renderInventory(false);
      } catch (error) { cb.checked = !cb.checked; showAlert('Could not update item.'); }
      finally { cb.disabled = false; }
    });
    toggleLabel.appendChild(cb);
    toggleLabel.appendChild(document.createTextNode('Active'));
    const editBtn = mkEditBtn(() => _renderInventoryEdit(it));
    const delBtn = mkBtn('Delete', 'btn-danger', () => {
      showConfirm(`Delete "${it.name}"?`, async () => {
        await api('DELETE', `/api/admin/items/${it.id}`);
        loadInventory();
      });
    });
    actions.appendChild(editBtn);
    actions.appendChild(toggleLabel);
    actions.appendChild(delBtn);
    card.appendChild(actions);
    return card;
    },
  });
}

export async function loadInventory() {
  const revision = ++_loadRevision;
  const grid = document.getElementById('inv-grid');
  _lazyGrid?.disconnect();
  _lazyGrid = null;
  grid.innerHTML = loadingHtml();
  try {
    const items = await api('GET', '/api/admin/items?meta=1');
    if (revision !== _loadRevision) return;
    _allItems = items;
    _renderInventory(false);
  } catch (e) {
    if (revision !== _loadRevision) return;
    grid.innerHTML = `<div style="color:#f87171;grid-column:1/-1">${_esc(e.message)}</div>`;
  }
}

document.getElementById('inv-type-filter').addEventListener('change', () => _renderInventory());
document.getElementById('inv-active-filter').addEventListener('change', () => _renderInventory());
{
  const invSearchInput = document.getElementById('inv-search');
  const invSearchClear = document.getElementById('inv-search-clear');
  invSearchInput.addEventListener('input', () => {
    invSearchClear.style.display = invSearchInput.value ? 'inline-block' : 'none';
    _renderInventory();
  });
  invSearchClear.addEventListener('click', () => {
    invSearchInput.value = '';
    invSearchClear.style.display = 'none';
    _renderInventory();
    invSearchInput.focus();
  });
}

document.getElementById('new-inv-save').addEventListener('click', async () => {
  const errEl = document.getElementById('new-inv-error');
  errEl.textContent = '';
  const name        = document.getElementById('new-inv-name').value.trim();
  const description = document.getElementById('new-inv-description').value.trim();
  const type        = document.getElementById('new-inv-type').value;
  const svg_data    = document.getElementById('new-inv-svg').value.trim();
  if (!name)     { errEl.textContent = 'Name is required.'; return; }
  if (!svg_data) { errEl.textContent = 'SVG markup is required.'; return; }
  try {
    await api('POST', '/api/admin/items', { name, type, svg_data, description: description || null });
    document.getElementById('new-inv-name').value = '';
    document.getElementById('new-inv-description').value = '';
    document.getElementById('new-inv-svg').value = '';
    loadInventory();
  } catch (e) { errEl.textContent = e.message || 'Failed.'; }
});
