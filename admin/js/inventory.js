// Inventory tab: the shared item-icon catalog. Type/active/search filters,
// row-complete pagination (columns-per-row × 10, responsive to window width),
// inline edit, and the "Add New Item" form.
// To remove: delete this file and its <script type="module"> import in
// admin/index.html; remove #inv-type-filter/#inv-active-filter/#inv-search/
// #new-inv-save listener wiring (this file owns them) and the Inventory tab
// HTML/CSS.

import { api, el, mkBtn, _esc, showConfirm, matchesQuery, renderPaged, _pageState } from './core.js?v=1462';

let _allItems = [];

function _invOptions(values, selected) {
  return values.map(v => `<option value="${v}"${v === selected ? ' selected' : ''}>${v}</option>`).join('');
}

function _renderInventoryEdit(card, it) {
  card.innerHTML = `
    <div class="inv-edit-form">
      <input class="inv-edit-name" type="text" value="${_esc(it.name || '')}" placeholder="Name">
      <input class="inv-edit-description" type="text" value="${_esc(it.description || '')}" placeholder="Description">
      <select class="inv-edit-type">${_invOptions(['weapon', 'armor', 'consumable', 'tool', 'jewelry', 'miscellaneous'], it.type)}</select>
      <textarea class="inv-edit-svg" spellcheck="false" placeholder="SVG markup">${_esc(it.svg_data || '')}</textarea>
      <div class="inv-edit-error"></div>
      <div class="inv-card-actions">
        <button class="btn btn-info inv-edit-save" style="font-size:0.72rem;padding:0.15rem 0.5rem">Save</button>
        <button class="btn inv-edit-cancel" style="font-size:0.72rem;padding:0.15rem 0.5rem">Cancel</button>
      </div>
    </div>
  `;
  card.querySelector('.inv-edit-cancel').addEventListener('click', _renderInventory);
  card.querySelector('.inv-edit-save').addEventListener('click', async () => {
    const errEl = card.querySelector('.inv-edit-error');
    const payload = {
      name: card.querySelector('.inv-edit-name').value.trim(),
      description: card.querySelector('.inv-edit-description').value.trim(),
      type: card.querySelector('.inv-edit-type').value,
      svg_data: card.querySelector('.inv-edit-svg').value.trim(),
    };
    if (!payload.name) { errEl.textContent = 'Name is required.'; return; }
    if (!payload.svg_data) { errEl.textContent = 'SVG markup is required.'; return; }
    try {
      await api('PATCH', `/api/admin/items/${it.id}`, payload);
      Object.assign(it, payload, { description: payload.description || null });
      _renderInventory(false);
    } catch (e) {
      errEl.textContent = e.message || 'Failed to save.';
    }
  });
}

const INV_ROWS_PER_PAGE = 10;

// #inv-grid uses `repeat(auto-fill, minmax(130px, 1fr))`, so its actual column
// count depends on the viewport/window width - reading it back from the
// computed style (rather than recalculating from track/gap sizes ourselves)
// guarantees this always matches whatever the grid really rendered, even if
// its CSS changes later. Only meaningful while the tab is visible/laid out.
function _inventoryColumnsPerRow() {
  const grid = document.getElementById('inv-grid');
  const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length;
  return cols || 1;
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
  if (resetPage && _pageState['inventory']) _pageState['inventory'].page = 0;
  renderPaged('inventory', items, renderInventoryGrid, _inventoryColumnsPerRow() * INV_ROWS_PER_PAGE);
}

function renderInventoryGrid(items) {
  const grid = document.getElementById('inv-grid');
  if (!items.length) { grid.innerHTML = '<div style="color:#6b7280;font-size:0.85rem;grid-column:1/-1">No items match the current filter.</div>'; return; }
  grid.innerHTML = '';
  for (const it of items) {
    const card = el('div', `inv-card${it.active ? '' : ' inactive'}`);
    const svgBox = el('div', 'inv-card-svg');
    svgBox.innerHTML = it.svg_data;
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
      await api('PATCH', `/api/admin/items/${it.id}`, { active: cb.checked });
      it.active = cb.checked ? 1 : 0;
      card.classList.toggle('inactive', !cb.checked);
    });
    toggleLabel.appendChild(cb);
    toggleLabel.appendChild(document.createTextNode('Active'));
    const editBtn = mkBtn('Edit', 'btn-info', () => _renderInventoryEdit(card, it));
    editBtn.style.cssText = 'font-size:0.72rem;padding:0.15rem 0.5rem';
    const delBtn = mkBtn('Del', 'btn-danger', () => {
      showConfirm(`Delete "${it.name}"?`, async () => {
        await api('DELETE', `/api/admin/items/${it.id}`);
        loadInventory();
      });
    });
    delBtn.style.cssText = 'font-size:0.72rem;padding:0.15rem 0.5rem';
    actions.appendChild(toggleLabel);
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    card.appendChild(actions);
    grid.appendChild(card);
  }
}

export async function loadInventory() {
  const grid = document.getElementById('inv-grid');
  grid.innerHTML = '<div style="color:#6b7280;font-size:0.85rem;grid-column:1/-1">Loading…</div>';
  try {
    _allItems = await api('GET', '/api/admin/items');
    _renderInventory(false);
  } catch (e) {
    grid.innerHTML = `<div style="color:#f87171;grid-column:1/-1">${_esc(e.message)}</div>`;
  }
}

document.getElementById('inv-type-filter').addEventListener('change', () => _renderInventory());
document.getElementById('inv-active-filter').addEventListener('change', () => _renderInventory());
let _invResizeTimer = null;
window.addEventListener('resize', () => {
  if (!document.getElementById('tab-inventory').classList.contains('active')) return;
  clearTimeout(_invResizeTimer);
  _invResizeTimer = setTimeout(() => _renderInventory(false), 150);
});
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
