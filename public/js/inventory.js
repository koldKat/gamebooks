// ── Inventory ──────────────────────────────────────────────────────────────────
// Stores: pt.inventory = [{itemId, note, qty, visible}, ...] (max 40, duplicates allowed)
// Legacy format [itemId, ...] is auto-migrated on read.
// Visible to all logged-in users.

import { state, currentPlaythrough, saveState, apiFetch, viewingPt } from './state.js?v=11';
import { showConfirm } from './play.js?v=76';
import { getPlayBtnRow } from './charsheet.js?v=59';
import { escapeHtml, shortcutLabel, registerPanelShortcut, ALL_PANEL_OVERLAY_IDS } from './util.js?v=42';
import { t } from './i18n.js?v=35';

const MAX_SLOTS = 40;

const _itemCache = new Map(); // id → full item (with svg_data), populated on demand
let _editIdx         = -1;
let _dragSrcIdx       = -1;

// kind: 'equipped' | 'item' | null - drives which badge/tint renders, so the combined
// stats-hud display (#charsheet-display directly above #inv-display, same plain-text
// styling) reads as three distinct kinds of line: charsheet fields (no badge, existing
// grey label), plain inventory items ("ITEM" badge, blue), and equipped items (slot
// name badge, amber) - previously inventory and charsheet lines were only told apart by
// a small 16px icon, easy to miss at a glance.
function _invLineHtml(item, displayName, note, qty, badgeText = null, kind = null) {
  const noteHtml = note?.trim() ? ` <span class="inv-line-note">${escapeHtml(note.trim())}</span>` : '';
  const qtyHtml  = (qty > 1)   ? ` <span class="inv-line-qty">×${qty}</span>`                      : '';
  const badgeHtml = badgeText ? ` <span class="inv-line-slot">${escapeHtml(badgeText)}</span>` : '';
  const cls = kind ? `inv-line inv-line--${kind}` : 'inv-line';
  return `<span class="${cls}"><span class="inv-line-icon">${item.svg_data}</span><span class="inv-line-name">${escapeHtml(displayName)}</span>${qtyHtml}${badgeHtml}${noteHtml}</span>`;
}


function _slot(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') return { itemId: raw, note: '', qty: 1, visible: false };
  return { itemId: raw.itemId, note: raw.note ?? '', qty: raw.qty ?? 1, visible: raw.visible ?? false, label: raw.label ?? '' };
}

function _isReadOnly() { return !currentPlaythrough(); }

function _inv() {
  const raw = (currentPlaythrough() || viewingPt)?.inventory ?? [];
  return raw.map(_slot).filter(Boolean);
}

function _setInv(arr) {
  const pt = currentPlaythrough();
  if (!pt || _isReadOnly()) return;
  pt.inventory = arr.slice(0, MAX_SLOTS);
  saveState();
}

// ── Equipment integration ────────────────────────────────────────────────────

export function getInventorySlots() { return _inv(); }

export function refreshInventoryUI() { _renderGrid(); }

// Add one unit of itemId back to inventory (e.g. on unequip). Merges into an
// existing stack with the same label/note (and matching visible) if one
// exists, otherwise creates a new slot carrying the given label/note.
export function addItemToInventory(itemId, opts = {}) {
  if (_isReadOnly()) return false;
  const visible = !!opts.visible;
  const label = opts.label ?? '';
  const note = opts.note ?? '';
  const qty = Math.max(1, opts.qty ?? 1);
  const arr = _inv();
  const idx = arr.findIndex(s => s.itemId === itemId && (s.note || '') === note && (s.label || '') === label && !!s.visible === visible);
  if (idx >= 0) {
    arr[idx] = { ...arr[idx], qty: (arr[idx].qty || 1) + qty };
  } else {
    if (arr.length >= MAX_SLOTS) return false;
    arr.push({ itemId, note, qty, visible, label });
  }
  _setInv(arr);
  return true;
}


// Remove the entire stack from the inventory slot at `idx` (e.g. equipping a
// whole stack of items into one equipment slot at once).
// Returns { itemId, visible, label, note, qty } describing the removed stack,
// or null if `idx` is out of range.
export function removeAllFromInventoryAt(idx) {
  if (_isReadOnly()) return null;
  const arr = _inv();
  if (idx < 0 || idx >= arr.length) return null;
  const { itemId, visible, label, note, qty } = arr[idx];
  arr.splice(idx, 1);
  _setInv(arr);
  return { itemId, visible: !!visible, label: label || '', note: note || '', qty: qty || 1 };
}

async function _fetchItem(id) {
  if (_itemCache.has(id)) return _itemCache.get(id);
  try {
    const res = await apiFetch(`/api/items/${id}`);
    if (res.ok) { const it = await res.json(); _itemCache.set(id, it); return it; }
  } catch {}
  return null;
}

async function _ensureInvItems() {
  const ids = [...new Set(_inv().map(s => s.itemId))].filter(id => !_itemCache.has(id));
  if (ids.length) await Promise.all(ids.map(_fetchItem));
}

function _byId(id) {
  return _itemCache.get(id) ?? null;
}

// ── On-screen display ─────────────────────────────────────────────────────────

// extraItems: [{ itemId, item }, ...] - e.g. equipped items marked "show on screen",
// supplied by equipment.js (which owns its own item cache).
export async function renderInventoryDisplay(extraItems = []) {
  const el = document.getElementById('inv-display');
  if (!el) return;
  await _ensureInvItems();
  const inv = _inv().filter(s => s.visible);
  const lines = inv.map(({ itemId, note, qty, label }) => {
    const item = _byId(itemId);
    if (!item) return '';
    return _invLineHtml(item, label?.trim() || item.name, note, qty, t('inv.badge.item'), 'item');
  }).filter(Boolean);
  const extraLines = extraItems.map(({ item, label, note, qty, slotLabel }) => {
    if (!item) return '';
    return _invLineHtml(item, label?.trim() || item.name, note, qty, slotLabel || t('inv.badge.equipped'), 'equipped');
  }).filter(Boolean);
  el.innerHTML = [...lines, ...extraLines].join('');
}

// Ensure inventory item data is cached. Does not render - callers render
// via renderInventoryDisplay() afterward (possibly merging in extra items).
export async function preloadItems() {
  await _ensureInvItems();
}

// Set by main.js so _renderGrid()'s own #inv-display refresh can merge in
// equipped "show on screen" items (from equipment.js) without inventory.js
// having to import equipment.js (which itself imports inventory.js).
let _extraDisplayItemsProvider = null;
export function setExtraDisplayItemsProvider(fn) { _extraDisplayItemsProvider = fn; }

// ── Edit dialog ───────────────────────────────────────────────────────────────

function _closeEdit() {
  if (_editIdx < 0) return;
  // read values and save
  const qty  = Math.max(1, parseInt(document.getElementById('inv-edit-qty').value, 10) || 1);
  const note = document.getElementById('inv-edit-note').value.trim();
  const visible = document.getElementById('inv-edit-visible').checked;

  const arr = _inv();
  if (arr[_editIdx]) {
    arr[_editIdx] = { ...arr[_editIdx], qty, note, visible };
    _setInv(arr);
    _renderGrid();
  }
  _editIdx = -1;
  document.getElementById('inv-edit-dialog').classList.remove('active');
}

// ── Context menu ─────────────────────────────────────────────────────────────

let _ctxMenu = null;

function _closeCtx() {
  if (_ctxMenu) { _ctxMenu.remove(); _ctxMenu = null; }
}

function _showCtx(idx, x, y) {
  _closeCtx();
  const arr = _inv();
  const slot = arr[idx];
  if (!slot) return;
  const item = _byId(slot.itemId);
  if (!item) return;

  const menu = document.createElement('div');
  menu.className = 'inv-ctx-menu';
  menu.innerHTML = `
    <div class="inv-ctx-item" data-action="toggle-visible">◉ ${slot.visible ? t('inv.ctx.hide') : t('inv.ctx.show')}</div>
    <div class="inv-ctx-item" data-action="rename">✎ ${t('inv.ctx.rename')}</div>
    <div class="inv-ctx-item" data-action="edit">⚙ ${t('inv.ctx.edit')}</div>
    <div class="inv-ctx-item inv-ctx-remove" data-action="remove">✕ ${t('inv.ctx.remove')}</div>
  `;

  menu.style.left = x + 'px';
  menu.style.top  = y + 'px';
  document.body.appendChild(menu);
  _ctxMenu = menu;

  // Clamp to viewport
  const r = menu.getBoundingClientRect();
  if (r.right  > window.innerWidth  - 4) menu.style.left = (x - r.width)  + 'px';
  if (r.bottom > window.innerHeight - 4) menu.style.top  = (y - r.height) + 'px';

  menu.addEventListener('click', e => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    _closeCtx();
    if (!action) return;
    const a = _inv();
    if (!a[idx]) return;
    if (action === 'toggle-visible') {
      a[idx] = { ...a[idx], visible: !a[idx].visible };
      _setInv(a); _renderGrid();
    } else if (action === 'rename') {
      _openRename(idx);
    } else if (action === 'edit') {
      _closeEdit();
      _openEditAt(idx, x, y);
    } else if (action === 'remove') {
      const label = a[idx].label?.trim() || item.name;
      showConfirm(t('inv.confirm.remove', { name: label }), () => {
        const b = _inv();
        if (_editIdx === idx) { _editIdx = -1; document.getElementById('inv-edit-dialog').classList.remove('active'); }
        b.splice(idx, 1);
        _setInv(b); _renderGrid();
      }, { confirmLabel: t('inv.ctx.remove'), danger: true });
    }
  });
}

// ── Rename dialog ────────────────────────────────────────────────────────────

function _openRename(idx) {
  const inv  = _inv();
  const slot = inv[idx];
  if (!slot) return;
  const item = _byId(slot.itemId);
  const dlg  = document.getElementById('inv-rename-dialog');
  const inp  = document.getElementById('inv-rename-input');
  inp.value  = slot.label?.trim() || item?.name || '';
  dlg.dataset.idx = idx;
  dlg.classList.add('active');
  inp.focus();
  inp.select();
}

function _closeRename(save) {
  const dlg = document.getElementById('inv-rename-dialog');
  if (!dlg.classList.contains('active')) return;
  if (save) {
    const idx = +dlg.dataset.idx;
    const val = document.getElementById('inv-rename-input').value.trim();
    const arr = _inv();
    if (arr[idx]) { arr[idx] = { ...arr[idx], label: val }; _setInv(arr); _renderGrid(); }
  }
  dlg.classList.remove('active');
}

// ── Grid render ───────────────────────────────────────────────────────────────

function _openEditAt(idx, x, y) {
  _editIdx = idx;
  const inv  = _inv();
  const slot = inv[idx];
  if (!slot) return;
  const item = _byId(slot.itemId);
  const dlg = document.getElementById('inv-edit-dialog');
  document.getElementById('inv-edit-title').textContent = slot.label?.trim() || item?.name || '';
  document.getElementById('inv-edit-qty').value     = slot.qty ?? 1;
  document.getElementById('inv-edit-note').value    = slot.note ?? '';
  document.getElementById('inv-edit-visible').checked = !!slot.visible;
  dlg.style.left = x + 'px';
  dlg.style.top  = y + 'px';
  dlg.classList.add('active');
  // Clamp to viewport now that the dialog is visible/measurable (same pattern as
  // _showCtx) - previously only clamped horizontally against a hardcoded guessed
  // width, with no vertical check at all, so opening it from a slot near the
  // bottom of the viewport could push it partly or fully off-screen.
  const r = dlg.getBoundingClientRect();
  if (r.right  > window.innerWidth  - 8) dlg.style.left = Math.max(8, window.innerWidth  - r.width  - 8) + 'px';
  if (r.bottom > window.innerHeight - 8) dlg.style.top  = Math.max(8, window.innerHeight - r.height - 8) + 'px';
  document.getElementById('inv-edit-qty').focus();
}

async function _renderGrid() {
  await _ensureInvItems();
  const grid = document.getElementById('inv-grid');
  const countEl = document.getElementById('inv-count-label');
  const addBtn  = document.getElementById('inv-add-btn');
  if (!grid) return;
  const inv = _inv();
  if (countEl) countEl.textContent = `${inv.length} / ${MAX_SLOTS}`;
  const ro = _isReadOnly();
  if (addBtn) {
    addBtn.style.display = ro ? 'none' : '';
    addBtn.disabled = inv.length >= MAX_SLOTS;
  }
  const tmplBtn = document.getElementById('inv-save-template-btn');
  if (tmplBtn) tmplBtn.style.display = ro ? 'none' : '';

  const visibleSlots = Math.min(MAX_SLOTS, Math.ceil((inv.length + 1) / 5) * 5);
  let html = '';
  for (let i = 0; i < visibleSlots; i++) {
    const slot = inv[i];
    const item = slot ? _byId(slot.itemId) : null;
    if (item) {
      const displayName = slot.label?.trim() || item.name;
      const qtyBadge  = (slot.qty > 1) ? `<span class="inv-slot-qty">×${slot.qty}</span>` : '';
      const noteBadge = slot.note?.trim() ? `<div class="inv-slot-note-label">${escapeHtml(slot.note.trim())}</div>` : '';
      const eyeClass  = slot.visible ? ' inv-slot--visible' : '';
      html += `<div class="inv-slot inv-slot--filled${eyeClass}" data-idx="${i}"${_isReadOnly() ? '' : ' draggable="true"'}>
        ${qtyBadge}
        <div class="inv-slot-svg">${item.svg_data}</div>
        <div class="inv-slot-name">${escapeHtml(displayName)}</div>
        ${noteBadge}
      </div>`;
    } else {
      html += `<div class="inv-slot"></div>`;
    }
  }
  grid.innerHTML = html;

  _dragSrcIdx = -1;
  const readOnly = _isReadOnly();
  grid.querySelectorAll('.inv-slot--filled').forEach(slotEl => {
    slotEl.addEventListener('contextmenu', e => {
      e.preventDefault();
      if (readOnly) return;
      _closeEdit();
      _showCtx(+slotEl.dataset.idx, e.clientX, e.clientY);
    });

    if (readOnly) return;
    slotEl.addEventListener('dragstart', e => {
      _dragSrcIdx = +slotEl.dataset.idx;
      e.dataTransfer.effectAllowed = 'move';
      slotEl.classList.add('inv-slot--dragging');
    });

    slotEl.addEventListener('dragend', () => {
      grid.querySelectorAll('.inv-slot--drag-over').forEach(el => el.classList.remove('inv-slot--drag-over'));
      slotEl.classList.remove('inv-slot--dragging');
      _dragSrcIdx = -1;
    });

    slotEl.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (+slotEl.dataset.idx !== _dragSrcIdx) {
        grid.querySelectorAll('.inv-slot--drag-over').forEach(el => el.classList.remove('inv-slot--drag-over'));
        slotEl.classList.add('inv-slot--drag-over');
      }
    });

    slotEl.addEventListener('drop', e => {
      e.preventDefault();
      const destIdx = +slotEl.dataset.idx;
      if (_dragSrcIdx < 0 || _dragSrcIdx === destIdx) return;
      const arr = _inv();
      const [moved] = arr.splice(_dragSrcIdx, 1);
      arr.splice(destIdx, 0, moved);
      _setInv(arr);
      _renderGrid();
    });
  });

  renderInventoryDisplay(_extraDisplayItemsProvider ? await _extraDisplayItemsProvider() : []);
}

// ── Panel ─────────────────────────────────────────────────────────────────────

function _openPanel() {
  document.getElementById('inv-overlay').classList.add('active');
  _renderGrid();
}

function _closePanel() {
  _closeEdit();
  document.getElementById('inv-overlay').classList.remove('active');
}

// ── Picker ────────────────────────────────────────────────────────────────────

let _pickerItems = []; // fresh meta list, no svg_data
let _pickerObserver = null;

function _observePickerSvgs(grid) {
  if (_pickerObserver) _pickerObserver.disconnect();
  _pickerObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const el = entry.target;
      _pickerObserver.unobserve(el);
      const id = +el.dataset.id;
      const svgEl = el.querySelector('.inv-pick-svg');
      if (!svgEl) continue;
      _fetchItem(id).then(item => {
        if (item?.svg_data) svgEl.innerHTML = item.svg_data;
      });
    }
  }, { root: grid, rootMargin: '60px' });
  grid.querySelectorAll('.inv-pick-item').forEach(el => _pickerObserver.observe(el));
}

async function _openPicker() {
  const overlay = document.getElementById('inv-picker-overlay');
  const search  = document.getElementById('inv-search');
  const grid    = document.getElementById('inv-picker-grid');
  if (search) search.value = '';
  if (grid) grid.innerHTML = `<div class="inv-picker-empty">${t('inv.picker_loading')}</div>`;
  overlay.classList.add('active');
  search?.focus();
  try {
    const res = await apiFetch('/api/items?meta=1');
    _pickerItems = res.ok ? await res.json() : [];
  } catch { _pickerItems = []; }
  _renderPicker(search?.value ?? '');
}

function _closePicker() {
  if (_pickerObserver) { _pickerObserver.disconnect(); _pickerObserver = null; }
  document.getElementById('inv-picker-overlay').classList.remove('active');
  // Drop everything the picker pulled in for browsing - keep only items actually in the inventory
  const ownedIds = new Set(_inv().map(s => s.itemId));
  for (const id of _itemCache.keys()) if (!ownedIds.has(id)) _itemCache.delete(id);
  _pickerItems = [];
}

function _renderPicker(query) {
  const q     = query.trim().toLowerCase();
  const items = _pickerItems.filter(it => !q || it.name.toLowerCase().includes(q));
  const grid  = document.getElementById('inv-picker-grid');
  if (!grid) return;
  if (!items.length) {
    grid.innerHTML = `<div class="inv-picker-empty">${t('inv.picker_empty')}</div>`;
    return;
  }
  grid.innerHTML = items.map(it =>
    `<div class="inv-pick-item" data-id="${it.id}">
       <div class="inv-pick-svg"></div>
       <div class="inv-pick-name">${escapeHtml(it.name)}</div>
     </div>`
  ).join('');
  grid.querySelectorAll('.inv-pick-item').forEach(el => {
    el.addEventListener('click', () => {
      const inv = _inv();
      if (inv.length >= MAX_SLOTS) return;
      _setInv([...inv, { itemId: +el.dataset.id, note: '', qty: 1, visible: false }]);
      _closePicker();
      _renderGrid();
    });
  });
  _observePickerSvgs(grid);
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initInventory() {
  // Main panel overlay
  const overlay = document.createElement('div');
  overlay.id        = 'inv-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('inv.title')}</span>
        <span id="inv-count-label" class="inv-count">0 / ${MAX_SLOTS}</span>
        <button id="inv-close-btn" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div id="inv-grid" class="inv-grid"></div>
      <div class="inv-modal-ftr">
        <button id="inv-add-btn" class="inv-add-btn">${t('inv.add_btn')}</button>
        <button id="inv-save-template-btn" class="inv-save-template-btn">${t('inv.save_template')}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  // Edit dialog (floats inside .inv-modal, above the grid)
  const editDlg = document.createElement('div');
  editDlg.id        = 'inv-edit-dialog';
  editDlg.className = 'inv-edit-dialog';
  editDlg.innerHTML = `
    <div class="inv-edit-title" id="inv-edit-title"></div>
    <div class="inv-edit-row">
      <label class="inv-edit-label">${t('inv.qty_label')}</label>
      <div class="inv-qty-wrap">
        <button class="inv-qty-btn" id="inv-edit-qty-dec">−</button>
        <input id="inv-edit-qty" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric" maxlength="4">
        <button class="inv-qty-btn" id="inv-edit-qty-inc">+</button>
      </div>
    </div>
    <div class="inv-edit-row">
      <label class="inv-edit-label">${t('inv.note_label')}</label>
      <input id="inv-edit-note" class="inv-edit-input" type="text" placeholder="${t('inv.note_placeholder')}">
    </div>
    <div class="inv-edit-row">
      <label class="inv-edit-label">${t('inv.show_label')}</label>
      <input id="inv-edit-visible" class="inv-edit-check" type="checkbox">
      <span class="inv-edit-check-label">${t('inv.on_screen')}</span>
    </div>
    <button id="inv-edit-done" class="inv-edit-done">${t('inv.done')}</button>`;
  document.body.appendChild(editDlg);

  // Rename dialog
  const renameDlg = document.createElement('div');
  renameDlg.id        = 'inv-rename-dialog';
  renameDlg.className = 'inv-rename-dialog';
  renameDlg.innerHTML = `
    <div class="inv-rename-label">${t('inv.rename.label')}</div>
    <input id="inv-rename-input" class="inv-edit-input" type="text" autocomplete="off">
    <div class="inv-rename-btns">
      <button id="inv-rename-cancel" class="inv-edit-done" style="background:#374151">${t('btn.cancel')}</button>
      <button id="inv-rename-ok"     class="inv-edit-done">${t('btn.ok')}</button>
    </div>`;
  document.body.appendChild(renameDlg);

  // Picker overlay
  const pickerOverlay = document.createElement('div');
  pickerOverlay.id        = 'inv-picker-overlay';
  pickerOverlay.className = 'inv-overlay inv-picker-overlay';
  pickerOverlay.innerHTML = `
    <div class="inv-picker-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('inv.add_title')}</span>
        <input id="inv-search" class="inv-search" type="text" placeholder="${t('inv.search_placeholder')}" autocomplete="off">
        <button id="inv-picker-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div id="inv-picker-grid" class="inv-picker-grid"></div>
    </div>`;
  document.body.appendChild(pickerOverlay);

  // Button - joins the shared bottom-right action row
  const btnEl = document.createElement('button');
  btnEl.id            = 'inventory-btn';
  btnEl.innerHTML     = shortcutLabel(t('inv.title'));
  btnEl.style.display = 'none';
  getPlayBtnRow().appendChild(btnEl);

  // Wrap #charsheet-display in #stats-hud and add #inv-display below it
  const csDisplay = document.getElementById('charsheet-display');
  const hud = document.createElement('div');
  hud.id = 'stats-hud';
  csDisplay.parentNode.insertBefore(hud, csDisplay);
  hud.appendChild(csDisplay);
  const invDisplay = document.createElement('div');
  invDisplay.id = 'inv-display';
  hud.appendChild(invDisplay);

  // Wire events
  btnEl.addEventListener('click', _openPanel);
  document.getElementById('inv-close-btn').addEventListener('click', _closePanel);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) _closePanel(); });
  document.getElementById('inv-add-btn').addEventListener('click', _openPicker);
  document.getElementById('inv-save-template-btn').addEventListener('click', () => {
    if (_isReadOnly()) return;
    state.inventoryTemplate = _inv().map(s => ({ ...s }));
    saveState();
  });
  document.getElementById('inv-picker-close').addEventListener('click', _closePicker);
  let _mdOnPickerOverlay = false;
  pickerOverlay.addEventListener('mousedown', e => { _mdOnPickerOverlay = e.target === pickerOverlay; });
  pickerOverlay.addEventListener('click', e => { if (e.target === pickerOverlay && _mdOnPickerOverlay) _closePicker(); });
  document.getElementById('inv-search').addEventListener('input', e => _renderPicker(e.target.value));
  document.getElementById('inv-edit-done').addEventListener('click', _closeEdit);
  document.getElementById('inv-rename-ok').addEventListener('click',     () => _closeRename(true));
  document.getElementById('inv-rename-cancel').addEventListener('click', () => _closeRename(false));
  document.getElementById('inv-rename-input').addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); _closeRename(true); }
    if (e.key === 'Escape') { e.preventDefault(); _closeRename(false); }
  });
  document.getElementById('inv-edit-qty-dec').addEventListener('click', () => {
    const el = document.getElementById('inv-edit-qty');
    el.value = Math.max(1, (parseInt(el.value, 10) || 1) - 1);
  });
  document.getElementById('inv-edit-qty-inc').addEventListener('click', () => {
    const el = document.getElementById('inv-edit-qty');
    el.value = (parseInt(el.value, 10) || 1) + 1;
  });

  // Close context menu and edit dialog on outside click
  document.addEventListener('mousedown', e => {
    if (_ctxMenu && !_ctxMenu.contains(e.target)) _closeCtx();
    if (_editIdx < 0) return;
    const dlg = document.getElementById('inv-edit-dialog');
    if (!dlg.contains(e.target)) _closeEdit();
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (_ctxMenu) { _closeCtx(); return; }
    if (document.getElementById('inv-rename-dialog')?.classList.contains('active')) { _closeRename(false); return; }
    if (_editIdx >= 0) { _closeEdit(); return; }
    if (pickerOverlay.classList.contains('active')) { _closePicker(); return; }
    if (overlay.classList.contains('active')) _closePanel();
  }, true);
  registerPanelShortcut('KeyI', {
    getButton:  () => document.getElementById('inventory-btn'),
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'inv-overlay'),
    open:  _openPanel,
    close: _closePanel,
    extraGuard: () => !pickerOverlay.classList.contains('active') && !!currentPlaythrough(),
    capture: true,
  });
}

export function setInventoryVisible(visible) {
  const btn = document.getElementById('inventory-btn');
  if (btn) {
    btn.style.display = visible ? '' : 'none';
  }
  if (!visible) {
    _closePanel();
    _closePicker();
    _itemCache.clear();
    _pickerItems = [];
  }
}
