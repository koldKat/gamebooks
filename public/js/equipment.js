// ── Equipment ──────────────────────────────────────────────────────────────────
// Stores: pt.equipment = { slotKey: { itemId, label, note } | itemId(legacy), ... }.
// Visual only - no stat effects. Admin-only feature for now. Read-only when
// there's no active playthrough.

import { state, currentPlaythrough, saveState, apiFetch, viewingPt } from './state.js?v=13';
import { getInventorySlots, addItemToInventory, removeAllFromInventoryAt, refreshInventoryUI, renderInventoryDisplay } from './inventory.js?v=139';
import { getPlayBtnRow } from './charsheet.js?v=62';
import { escapeHtml, shortcutLabel, registerPanelShortcut, ALL_PANEL_OVERLAY_IDS } from './util.js?v=45';
import { t } from './i18n.js?v=36';

// x/y are percentages, positioned over the dummy silhouette (eq-body box, 380x600px).
// Center column = body slots (no horizontal overlap with side columns);
// vertical gaps between same-column slots are kept > slot height (~74px) to avoid stacking.
const SLOTS = [
  { key: 'head',      label: () => t('eq.slot.head'),   x: 50, y: 14 },
  { key: 'neck',      label: () => t('eq.slot.neck'),   x: 50, y: 29 },
  { key: 'chest',     label: () => t('eq.slot.chest'),  x: 50, y: 44 },
  { key: 'belt',      label: () => t('eq.slot.belt'),   x: 50, y: 59 },
  { key: 'legs',      label: () => t('eq.slot.legs'),   x: 50, y: 74 },
  { key: 'feet',      label: () => t('eq.slot.feet'),   x: 50, y: 89 },
  { key: 'cloak',     label: () => t('eq.slot.cloak'),    x: 10, y: 18 },
  { key: 'ring1',     label: () => t('eq.slot.ring'),     x: 10, y: 36 },
  { key: 'ring3',     label: () => t('eq.slot.ring'),     x: 10, y: 54 },
  { key: 'primary',   label: () => t('eq.slot.weapon'),   x: 10, y: 72 },
  { key: 'hands',     label: () => t('eq.slot.hands'),    x: 90, y: 18 },
  { key: 'ring2',     label: () => t('eq.slot.ring'),     x: 90, y: 36 },
  { key: 'ring4',     label: () => t('eq.slot.ring'),     x: 90, y: 54 },
  { key: 'secondary', label: () => t('eq.slot.offhand'), x: 90, y: 72 },
  { key: 'back',      label: () => t('eq.slot.back'),     x: 90, y: 90 },
];

// Consumable item slots - rendered in their own row below the dummy, at the
// same size as inventory slots (matches .inv-slot: 80x98px).
const ITEM_SLOTS = [
  { key: 'item1', label: () => t('eq.slot.item', { n: 1 }) },
  { key: 'item2', label: () => t('eq.slot.item', { n: 2 }) },
  { key: 'item3', label: () => t('eq.slot.item', { n: 3 }) },
  { key: 'item4', label: () => t('eq.slot.item', { n: 4 }) },
  { key: 'item5', label: () => t('eq.slot.item', { n: 5 }) },
];

const ALL_SLOTS = [...SLOTS, ...ITEM_SLOTS];

const DUMMY_SVG = `
<svg class="eq-dummy" viewBox="0 0 280 560" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
  <defs>
    <radialGradient id="eqGlowGrad" cx="50%" cy="42%" r="58%">
      <stop offset="0%"   stop-color="#64748b" stop-opacity="0.18" />
      <stop offset="100%" stop-color="#64748b" stop-opacity="0" />
    </radialGradient>
  </defs>
  <ellipse class="eq-dummy-glow" cx="140" cy="292" rx="116" ry="236" />

  <g class="eq-dummy-figure">
    <circle class="eq-dummy-head" cx="140" cy="82" r="28" />
    <path class="eq-dummy-neck" d="M128,116 H152 V138 H128 Z" />

    <path class="eq-dummy-shoulder-line" d="M87,157 C105,146 124,141 140,141 C156,141 175,146 193,157" />
    <path class="eq-dummy-arm" d="M89,162 L68,254 L58,328" />
    <path class="eq-dummy-arm" d="M191,162 L212,254 L222,328" />

    <path class="eq-dummy-torso" d="M100,154 H180 L170,283 H110 Z" />
    <path class="eq-dummy-centerline" d="M140,150 V283" />
    <path class="eq-dummy-beltline" d="M110,283 H170" />

    <path class="eq-dummy-leg" d="M122,304 L112,407 L104,504" />
    <path class="eq-dummy-leg" d="M158,304 L168,407 L176,504" />
    <path class="eq-dummy-base" d="M92,510 H120" />
    <path class="eq-dummy-base" d="M160,510 H188" />
  </g>
</svg>`;

const _itemCache = new Map(); // id → full item (with svg_data), populated on demand

let _dragSourceKey = null; // slot key currently being dragged, shared across both slot containers

function _isReadOnly() { return !currentPlaythrough(); }

function _eq() {
  return (currentPlaythrough() || viewingPt)?.equipment ?? {};
}

// { slotKey: true } - equipped items the player has marked "show on screen"
// (carried over from the inventory slot's `visible` flag at equip time).
function _eqVisible() {
  return (currentPlaythrough() || viewingPt)?.equipmentVisible ?? {};
}

// `pt.equipment[key]` and `equipmentTemplate[key]` entries are normally
// `{ itemId, label, note, qty }`, but older saves may still hold a raw itemId
// number - these helpers accept both.
function _eqItemId(entry) {
  return (entry && typeof entry === 'object') ? entry.itemId : entry;
}
function _eqMeta(entry) {
  return (entry && typeof entry === 'object') ? { label: entry.label || '', note: entry.note || '' } : { label: '', note: '' };
}
function _eqQty(entry) {
  return (entry && typeof entry === 'object') ? (entry.qty || 1) : 1;
}

function _setEq(key, itemId, visible, label, note, qty) {
  const pt = currentPlaythrough();
  if (!pt || _isReadOnly()) return;
  pt.equipment = { ...(pt.equipment ?? {}), [key]: { itemId, label: label || '', note: note || '', qty: Math.max(1, qty || 1) } };
  pt.equipmentVisible = { ...(pt.equipmentVisible ?? {}), [key]: !!visible };
  saveState();
}

function _unsetEq(key) {
  const pt = currentPlaythrough();
  if (!pt || _isReadOnly()) return;
  const eq = { ...(pt.equipment ?? {}) };
  delete eq[key];
  pt.equipment = eq;
  const eqVis = { ...(pt.equipmentVisible ?? {}) };
  delete eqVis[key];
  pt.equipmentVisible = eqVis;
  saveState();
}

// Move (or swap) an equipped item between two slots via drag-and-drop. No slot-type
// restriction here, same as the picker - this system is visual-only, any item can
// go in any slot. If the target slot is filled, the two entries trade places
// (including their visible/show-on-screen flag each); if empty, the source just
// moves over and its old slot becomes empty.
function _swapEq(fromKey, toKey) {
  if (fromKey === toKey) return;
  const pt = currentPlaythrough();
  if (!pt || _isReadOnly()) return;
  const eq    = { ...(pt.equipment ?? {}) };
  const eqVis = { ...(pt.equipmentVisible ?? {}) };
  const fromEntry = eq[fromKey];
  const toEntry   = eq[toKey];
  if (!fromEntry) return; // nothing to move
  const fromVis = !!eqVis[fromKey];
  const toVis   = !!eqVis[toKey];

  eq[toKey] = fromEntry;
  eqVis[toKey] = fromVis;
  if (toEntry !== undefined) {
    eq[fromKey] = toEntry;
    eqVis[fromKey] = toVis;
  } else {
    delete eq[fromKey];
    delete eqVis[fromKey];
  }

  pt.equipment = eq;
  pt.equipmentVisible = eqVis;
  saveState();
}

// Fetch multiple items in a single request and populate _itemCache.
async function _fetchItems(ids) {
  if (!ids.length) return;
  try {
    const res = await apiFetch(`/api/items?ids=${ids.join(',')}`);
    if (res.ok) { for (const it of await res.json()) _itemCache.set(it.id, it); }
  } catch {}
}

async function _ensureEquippedItems() {
  const ids = [...new Set(Object.values(_eq()).map(_eqItemId).filter(Boolean))].filter(id => !_itemCache.has(id));
  if (ids.length) await _fetchItems(ids);
}

function _byId(id) {
  return _itemCache.get(id) ?? null;
}

// ── Body render ───────────────────────────────────────────────────────────────

function _slotHtml(slot, eq, ro, positioned) {
  const entry = eq[slot.key];
  const itemId = _eqItemId(entry);
  const meta = _eqMeta(entry);
  const qty = _eqQty(entry);
  const item = itemId ? _byId(itemId) : null;
  const filledClass = item ? ' eq-slot--filled' : '';
  const svg  = item ? `<div class="eq-slot-svg">${item.svg_data}</div>` : `<div class="eq-slot-svg eq-slot-svg--empty"></div>`;
  const name = item ? escapeHtml(meta.label.trim() || item.name) : slot.label();
  const noteHtml = item && meta.note ? `<div class="eq-slot-note-label" data-tooltip="${escapeHtml(meta.note)}">${escapeHtml(meta.note)}</div>` : '';
  const qtyHtml = item && qty > 1 ? `<span class="eq-slot-qty">×${qty}</span>` : '';
  const removeBtn = item && !ro ? `<button class="eq-slot-remove" data-key="${slot.key}" draggable="false" aria-label="${t('eq.unequip')}">✕</button>` : '';
  const roClass = !ro ? ' eq-slot--editable' : '';
  const style = positioned ? ` style="left:${slot.x}%;top:${slot.y}%"` : '';
  return `<div class="eq-slot${filledClass}${roClass}" data-key="${slot.key}"${style}>
    ${removeBtn}
    ${svg}
    <div class="eq-slot-name">${name}</div>
    ${noteHtml}
    ${qtyHtml}
  </div>`;
}

function _wireSlotEvents(container, ro) {
  if (ro) return;
  container.querySelectorAll('.eq-slot').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.eq-slot-remove')) return;
      _openPicker(el.dataset.key);
    });

    // Drag-and-drop move/swap between slots - works across body slots and the
    // item row alike, since _dragSourceKey/_swapEq aren't container-scoped.
    if (el.classList.contains('eq-slot--filled')) {
      el.draggable = true;
      el.addEventListener('dragstart', e => {
        _dragSourceKey = el.dataset.key;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', el.dataset.key);
        el.classList.add('eq-slot--dragging');
      });
      el.addEventListener('dragend', () => {
        _dragSourceKey = null;
        el.classList.remove('eq-slot--dragging');
        document.querySelectorAll('.eq-slot--drag-over').forEach(n => n.classList.remove('eq-slot--drag-over'));
      });
    }

    el.addEventListener('dragover', e => {
      if (!_dragSourceKey || _dragSourceKey === el.dataset.key) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      el.classList.add('eq-slot--drag-over');
    });
    el.addEventListener('dragleave', () => el.classList.remove('eq-slot--drag-over'));
    el.addEventListener('drop', e => {
      e.preventDefault();
      el.classList.remove('eq-slot--drag-over');
      const src = _dragSourceKey || e.dataTransfer.getData('text/plain');
      _dragSourceKey = null;
      if (!src || src === el.dataset.key) return;
      _swapEq(src, el.dataset.key);
      _renderGrid();
      _refreshOnScreenDisplay();
    });
  });

  container.querySelectorAll('.eq-slot-remove').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const key = btn.dataset.key;
      const entry = _eq()[key];
      const itemId = _eqItemId(entry);
      const meta = _eqMeta(entry);
      const qty = _eqQty(entry);
      const wasVisible = !!_eqVisible()[key];
      _unsetEq(key);
      if (itemId) addItemToInventory(itemId, { visible: wasVisible, label: meta.label, note: meta.note, qty });
      refreshInventoryUI();
      _refreshOnScreenDisplay();
      _renderGrid();
    });
  });

  container.querySelectorAll('.eq-slot--filled').forEach(el => {
    el.addEventListener('contextmenu', e => {
      e.preventDefault();
      _closeEqEdit();
      _showEqCtx(el.dataset.key, e.clientX, e.clientY);
    });
  });
}

async function _renderGrid() {
  await _ensureEquippedItems();
  const body = document.getElementById('eq-body');
  const itemsRow = document.getElementById('eq-items');
  if (!body) return;
  const eq = _eq();
  const ro = _isReadOnly();

  const slotsHtml = SLOTS.map(slot => _slotHtml(slot, eq, ro, true)).join('');
  body.innerHTML = DUMMY_SVG + slotsHtml;
  body.classList.toggle('eq-body--readonly', ro);

  if (itemsRow) {
    itemsRow.innerHTML = ITEM_SLOTS.map(slot => _slotHtml(slot, eq, ro, false)).join('');
    itemsRow.classList.toggle('eq-body--readonly', ro);
  }

  const tmplBtn = document.getElementById('eq-save-template-btn');
  if (tmplBtn) tmplBtn.style.display = ro ? 'none' : '';

  _wireSlotEvents(body, ro);
  if (itemsRow) _wireSlotEvents(itemsRow, ro);
}

// Equip the inventory slot at `invIdx` into `slotKey`, taking the whole stack
// from inventory and returning whatever was previously equipped in that slot
// back to inventory. Carries the inventory slot's "show on screen" flag,
// custom label, note and quantity over to the equipped item, and restores the
// previously-equipped item's own label/note/visibility/quantity when it goes back.
function _equipItem(slotKey, invIdx) {
  if (_isReadOnly()) return;
  const prevEntry = _eq()[slotKey];
  const prevItemId = _eqItemId(prevEntry);
  const prevMeta = _eqMeta(prevEntry);
  const prevQty = _eqQty(prevEntry);
  const prevVisible = !!_eqVisible()[slotKey];
  const removed = removeAllFromInventoryAt(invIdx);
  if (!removed) return;
  if (prevItemId) addItemToInventory(prevItemId, { visible: prevVisible, label: prevMeta.label, note: prevMeta.note, qty: prevQty });
  _setEq(slotKey, removed.itemId, removed.visible, removed.label, removed.note, removed.qty);
  refreshInventoryUI();
  _refreshOnScreenDisplay();
}

// Re-render the on-screen "visible items" display (#inv-display), merging
// regular visible inventory slots with equipped items marked "show on screen".
async function _refreshOnScreenDisplay() {
  renderInventoryDisplay(await getVisibleEquippedItems());
}

// ── Context menu (mirrors inventory's: toggle-visible / rename / edit) ────────

let _eqCtxMenu = null;

function _closeEqCtx() {
  if (_eqCtxMenu) { _eqCtxMenu.remove(); _eqCtxMenu = null; }
}

function _showEqCtx(key, x, y) {
  _closeEqCtx();
  const entry = _eq()[key];
  const itemId = _eqItemId(entry);
  if (!itemId) return;
  const visible = !!_eqVisible()[key];

  const menu = document.createElement('div');
  menu.className = 'inv-ctx-menu';
  menu.innerHTML = `
    <div class="inv-ctx-item" data-action="toggle-visible">◉ ${visible ? t('inv.ctx.hide') : t('inv.ctx.show')}</div>
    <div class="inv-ctx-item" data-action="rename">✎ ${t('inv.ctx.rename')}</div>
    <div class="inv-ctx-item" data-action="edit">⚙ ${t('inv.ctx.edit')}</div>
  `;

  menu.style.left = x + 'px';
  menu.style.top  = y + 'px';
  document.body.appendChild(menu);
  _eqCtxMenu = menu;

  // Clamp to viewport
  const r = menu.getBoundingClientRect();
  if (r.right  > window.innerWidth  - 4) menu.style.left = (x - r.width)  + 'px';
  if (r.bottom > window.innerHeight - 4) menu.style.top  = (y - r.height) + 'px';

  menu.addEventListener('click', e => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    _closeEqCtx();
    if (!action) return;
    if (action === 'toggle-visible') {
      const pt = currentPlaythrough();
      if (!pt || _isReadOnly()) return;
      pt.equipmentVisible = { ...(pt.equipmentVisible ?? {}), [key]: !visible };
      saveState();
      _renderGrid();
      _refreshOnScreenDisplay();
    } else if (action === 'rename') {
      _openEqRename(key);
    } else if (action === 'edit') {
      _closeEqEdit();
      _openEqEditAt(key, x, y);
    }
  });
}

// ── Rename dialog ────────────────────────────────────────────────────────────

function _openEqRename(key) {
  const entry = _eq()[key];
  const itemId = _eqItemId(entry);
  if (!itemId) return;
  const item = _byId(itemId);
  const meta = _eqMeta(entry);
  const dlg = document.getElementById('eq-rename-dialog');
  const inp = document.getElementById('eq-rename-input');
  inp.value = meta.label.trim() || item?.name || '';
  dlg.dataset.key = key;
  dlg.classList.add('active');
  inp.focus();
  inp.select();
}

function _closeEqRename(save) {
  const dlg = document.getElementById('eq-rename-dialog');
  if (!dlg.classList.contains('active')) return;
  if (save) {
    const key = dlg.dataset.key;
    const val = document.getElementById('eq-rename-input').value.trim();
    const pt = currentPlaythrough();
    const entry = pt?.equipment?.[key];
    const itemId = _eqItemId(entry);
    if (pt && itemId) {
      const meta = _eqMeta(entry);
      pt.equipment = { ...pt.equipment, [key]: { itemId, label: val, note: meta.note, qty: _eqQty(entry) } };
      saveState();
      _renderGrid();
      _refreshOnScreenDisplay();
    }
  }
  dlg.classList.remove('active');
}

// ── Edit dialog (qty / note / show-on-screen) ──────────────────────────────────

let _eqEditKey = null;

function _openEqEditAt(key, x, y) {
  const entry = _eq()[key];
  const itemId = _eqItemId(entry);
  if (!itemId) return;
  _eqEditKey = key;
  const item = _byId(itemId);
  const meta = _eqMeta(entry);
  const dlg = document.getElementById('eq-edit-dialog');
  document.getElementById('eq-edit-title').textContent = meta.label.trim() || item?.name || '';
  document.getElementById('eq-edit-qty').value = _eqQty(entry);
  document.getElementById('eq-edit-note').value = meta.note;
  document.getElementById('eq-edit-visible').checked = !!_eqVisible()[key];
  const dlgW = 196;
  let left = x, top = y;
  if (left + dlgW > window.innerWidth - 8) left = window.innerWidth - dlgW - 8;
  if (left < 8) left = 8;
  dlg.style.left = left + 'px';
  dlg.style.top  = top + 'px';
  dlg.classList.add('active');
  document.getElementById('eq-edit-qty').focus();
}

function _closeEqEdit() {
  if (!_eqEditKey) return;
  const key = _eqEditKey;
  _eqEditKey = null;
  const qty = Math.max(1, parseInt(document.getElementById('eq-edit-qty').value, 10) || 1);
  const note = document.getElementById('eq-edit-note').value.trim();
  const visible = document.getElementById('eq-edit-visible').checked;
  const pt = currentPlaythrough();
  const entry = pt?.equipment?.[key];
  const itemId = _eqItemId(entry);
  if (pt && itemId) {
    const meta = _eqMeta(entry);
    pt.equipment = { ...pt.equipment, [key]: { itemId, label: meta.label, note, qty } };
    pt.equipmentVisible = { ...(pt.equipmentVisible ?? {}), [key]: visible };
    saveState();
    _renderGrid();
    _refreshOnScreenDisplay();
  }
  document.getElementById('eq-edit-dialog').classList.remove('active');
}

// Equipped items the player has marked "show on screen", with their full
// item data (svg_data, name) resolved for display.
export async function getVisibleEquippedItems() {
  await _ensureEquippedItems();
  const eq = _eq();
  const eqVis = _eqVisible();
  const slotLabel = key => ALL_SLOTS.find(s => s.key === key)?.label?.() || key;
  return Object.entries(eq)
    .map(([key, entry]) => ({ key, itemId: _eqItemId(entry), meta: _eqMeta(entry), qty: _eqQty(entry) }))
    .filter(({ key, itemId }) => itemId && eqVis[key])
    .map(({ key, itemId, meta, qty }) => ({ itemId, item: _byId(itemId), label: meta.label, note: meta.note, qty, equipped: true, slotLabel: slotLabel(key) }))
    .filter(e => e.item);
}

// Build a fresh { inventory, equipment, equipmentVisible } set for a new playthrough
// from the book's saved templates. equipmentTemplate entries carry their own
// label/note/qty (captured at "Save as Template" time), so a re-equipped item
// keeps the name the player gave it - no cross-referencing inventoryTemplate
// needed (equipped items are never present there, since they've been moved out
// of inventory). _eqItemId/_eqMeta/_eqQty also accept legacy itemId-only
// template entries from saves made before this. The "show on screen" flag for
// equipped slots comes from equipmentVisibleTemplate.
export function instantiateLoadout() {
  const inventory = state.inventoryTemplate ? state.inventoryTemplate.map(s => ({ ...s })) : [];
  const eqTemplate = state.equipmentTemplate ?? {};
  const eqVisTemplate = state.equipmentVisibleTemplate ?? {};
  const equipment = {};
  const equipmentVisible = {};
  for (const [key, entry] of Object.entries(eqTemplate)) {
    const itemId = _eqItemId(entry);
    if (!itemId) continue;
    const meta = _eqMeta(entry);
    equipment[key] = { itemId, label: meta.label, note: meta.note, qty: _eqQty(entry) };
    if (eqVisTemplate[key]) equipmentVisible[key] = true;
    const idx = inventory.findIndex(s => s.itemId === itemId);
    if (idx >= 0) inventory.splice(idx, 1);
  }
  return { inventory, equipment, equipmentVisible };
}

// ── Panel ─────────────────────────────────────────────────────────────────────

function _openPanel() {
  document.getElementById('eq-overlay').classList.add('active');
  _renderGrid();
}

function _closePanel() {
  document.getElementById('eq-overlay').classList.remove('active');
}

// ── Picker ────────────────────────────────────────────────────────────────────

let _pickerSlotKey = null;
let _pickerItems = []; // [{ itemId, qty, label, item }] - sourced from inventory

async function _openPicker(slotKey) {
  _pickerSlotKey = slotKey;
  const slot = ALL_SLOTS.find(s => s.key === slotKey);
  if (!slot) return;
  const overlay = document.getElementById('eq-picker-overlay');
  const search  = document.getElementById('eq-search');
  const grid    = document.getElementById('eq-picker-grid');
  document.getElementById('eq-picker-title').textContent = t('eq.picker_title', { slot: slot.label() });
  if (search) search.value = '';
  if (grid) grid.innerHTML = `<div class="inv-picker-empty">${t('inv.picker_loading')}</div>`;
  overlay.classList.add('active');
  search?.focus();

  const invSlots = getInventorySlots();
  const ids = [...new Set(invSlots.map(s => s.itemId))].filter(id => !_itemCache.has(id));
  if (ids.length) await _fetchItems(ids);

  _pickerItems = invSlots
    .map((s, idx) => ({ idx, itemId: s.itemId, qty: s.qty, label: s.label, note: s.note, item: _byId(s.itemId) }))
    .filter(s => s.item);

  _renderPicker(search?.value ?? '');
}

function _closePicker() {
  document.getElementById('eq-picker-overlay').classList.remove('active');
  // Drop everything the picker pulled in for browsing - keep only equipped items
  const equippedIds = new Set(Object.values(_eq()).map(_eqItemId).filter(Boolean));
  for (const id of _itemCache.keys()) if (!equippedIds.has(id)) _itemCache.delete(id);
  _pickerItems = [];
  _pickerSlotKey = null;
}

function _renderPicker(query) {
  const q     = query.trim().toLowerCase();
  const items = _pickerItems.filter(it => !q || (it.label?.trim() || it.item.name).toLowerCase().includes(q));
  const grid  = document.getElementById('eq-picker-grid');
  if (!grid) return;
  if (!items.length) {
    grid.innerHTML = `<div class="inv-picker-empty">${t('eq.picker_empty')}</div>`;
    return;
  }
  grid.innerHTML = items.map(it => {
    const displayName = it.label?.trim() || it.item.name;
    const qtyHtml = it.qty > 1 ? ` <span class="inv-line-qty">×${it.qty}</span>` : '';
    return `<div class="inv-pick-item" data-idx="${it.idx}">
       <div class="inv-pick-svg">${it.item.svg_data}</div>
       <div class="inv-pick-name">${escapeHtml(displayName)}${qtyHtml}</div>
     </div>`;
  }).join('');
  grid.querySelectorAll('.inv-pick-item').forEach(el => {
    el.addEventListener('click', () => {
      _equipItem(_pickerSlotKey, +el.dataset.idx);
      _closePicker();
      _renderGrid();
    });
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initEquipment() {
  // Main panel overlay
  const overlay = document.createElement('div');
  overlay.id        = 'eq-overlay';
  overlay.className = 'inv-overlay';
  overlay.innerHTML = `
    <div class="inv-modal">
      <div class="inv-modal-hdr">
        <span class="inv-modal-title">${t('eq.title')}</span>
        <button id="eq-close-btn" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div id="eq-body" class="eq-body"></div>
      <div id="eq-items" class="eq-items-row"></div>
      <div class="inv-modal-ftr">
        <button id="eq-save-template-btn" class="inv-save-template-btn">${t('inv.save_template')}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  // Rename dialog (reuses inventory's rename dialog styling)
  const renameDlg = document.createElement('div');
  renameDlg.id        = 'eq-rename-dialog';
  renameDlg.className = 'inv-rename-dialog';
  renameDlg.innerHTML = `
    <div class="inv-rename-label">${t('inv.rename.label')}</div>
    <input id="eq-rename-input" class="inv-edit-input" type="text" maxlength="40" autocomplete="off">
    <div class="inv-rename-btns">
      <button id="eq-rename-cancel" class="inv-edit-done" style="background:#374151">${t('btn.cancel')}</button>
      <button id="eq-rename-ok"     class="inv-edit-done">${t('btn.ok')}</button>
    </div>`;
  document.body.appendChild(renameDlg);

  // Edit dialog (qty / note / show-on-screen) - reuses inventory's edit dialog styling
  const editDlg = document.createElement('div');
  editDlg.id        = 'eq-edit-dialog';
  editDlg.className = 'inv-edit-dialog';
  editDlg.innerHTML = `
    <div class="inv-edit-title" id="eq-edit-title"></div>
    <div class="inv-edit-row">
      <label class="inv-edit-label">${t('inv.qty_label')}</label>
      <div class="inv-qty-wrap">
        <button class="inv-qty-btn" id="eq-edit-qty-dec">−</button>
        <input id="eq-edit-qty" class="inv-edit-input inv-qty-input" type="text" inputmode="numeric" maxlength="4">
        <button class="inv-qty-btn" id="eq-edit-qty-inc">+</button>
      </div>
    </div>
    <div class="inv-edit-row">
      <label class="inv-edit-label">${t('inv.note_label')}</label>
      <input id="eq-edit-note" class="inv-edit-input" type="text" maxlength="30" placeholder="${t('inv.note_placeholder')}">
    </div>
    <div class="inv-edit-row">
      <label class="inv-edit-label">${t('inv.show_label')}</label>
      <input id="eq-edit-visible" class="inv-edit-check" type="checkbox">
      <span class="inv-edit-check-label">${t('inv.on_screen')}</span>
    </div>
    <button id="eq-edit-done" class="inv-edit-done">${t('inv.done')}</button>`;
  document.body.appendChild(editDlg);

  // Picker overlay
  const pickerOverlay = document.createElement('div');
  pickerOverlay.id        = 'eq-picker-overlay';
  pickerOverlay.className = 'inv-overlay inv-picker-overlay';
  pickerOverlay.innerHTML = `
    <div class="inv-picker-modal">
      <div class="inv-modal-hdr">
        <span id="eq-picker-title" class="inv-modal-title">${t('eq.picker_title_default')}</span>
        <input id="eq-search" class="inv-search" type="text" placeholder="${t('inv.search_placeholder')}" autocomplete="off">
        <button id="eq-picker-close" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
      </div>
      <div id="eq-picker-grid" class="inv-picker-grid"></div>
    </div>`;
  document.body.appendChild(pickerOverlay);

  // Button - joins the shared bottom-right action row
  const btnEl = document.createElement('button');
  btnEl.id            = 'equipment-btn';
  btnEl.innerHTML     = shortcutLabel(t('eq.title'));
  btnEl.style.display = 'none';
  getPlayBtnRow().appendChild(btnEl);

  // Wire events
  btnEl.addEventListener('click', _openPanel);
  document.getElementById('eq-close-btn').addEventListener('click', _closePanel);
  let _mdOnOverlay = false;
  overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) _closePanel(); });
  document.getElementById('eq-save-template-btn').addEventListener('click', () => {
    if (_isReadOnly()) return;
    // Capture each equipped slot's itemId AND its current label/note/qty, so a
    // new playthrough's instantiateLoadout() can restore the player's custom
    // names - not just the pool defaults. equipmentVisibleTemplate separately
    // remembers which slots were marked "show on screen".
    state.equipmentTemplate = Object.fromEntries(
      Object.entries(_eq())
        .map(([k, v]) => [k, { itemId: _eqItemId(v), label: _eqMeta(v).label, note: _eqMeta(v).note, qty: _eqQty(v) }])
        .filter(([, e]) => e.itemId)
    );
    const eqVis = _eqVisible();
    state.equipmentVisibleTemplate = Object.fromEntries(
      Object.keys(state.equipmentTemplate).filter(k => eqVis[k]).map(k => [k, true])
    );
    saveState();
  });
  document.getElementById('eq-picker-close').addEventListener('click', _closePicker);
  let _mdOnPickerOverlay = false;
  pickerOverlay.addEventListener('mousedown', e => { _mdOnPickerOverlay = e.target === pickerOverlay; });
  pickerOverlay.addEventListener('click', e => { if (e.target === pickerOverlay && _mdOnPickerOverlay) _closePicker(); });
  document.getElementById('eq-search').addEventListener('input', e => _renderPicker(e.target.value));

  // Rename dialog
  document.getElementById('eq-rename-ok').addEventListener('click',     () => _closeEqRename(true));
  document.getElementById('eq-rename-cancel').addEventListener('click', () => _closeEqRename(false));
  document.getElementById('eq-rename-input').addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); _closeEqRename(true); }
    if (e.key === 'Escape') { e.preventDefault(); _closeEqRename(false); }
  });

  // Edit dialog
  document.getElementById('eq-edit-done').addEventListener('click', _closeEqEdit);
  document.getElementById('eq-edit-qty-dec').addEventListener('click', () => {
    const el = document.getElementById('eq-edit-qty');
    el.value = Math.max(1, (parseInt(el.value, 10) || 1) - 1);
  });
  document.getElementById('eq-edit-qty-inc').addEventListener('click', () => {
    const el = document.getElementById('eq-edit-qty');
    el.value = (parseInt(el.value, 10) || 1) + 1;
  });

  // Close context menu / edit dialog on outside click
  document.addEventListener('mousedown', e => {
    if (_eqCtxMenu && !_eqCtxMenu.contains(e.target)) _closeEqCtx();
    if (_eqEditKey && !document.getElementById('eq-edit-dialog').contains(e.target)) _closeEqEdit();
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (_eqCtxMenu) { _closeEqCtx(); return; }
    if (document.getElementById('eq-rename-dialog')?.classList.contains('active')) { _closeEqRename(false); return; }
    if (_eqEditKey) { _closeEqEdit(); return; }
    if (pickerOverlay.classList.contains('active')) { _closePicker(); return; }
    if (overlay.classList.contains('active')) _closePanel();
  }, true);
  registerPanelShortcut('KeyE', {
    getButton:  () => document.getElementById('equipment-btn'),
    getOverlay: () => overlay,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'eq-overlay'),
    open:  _openPanel,
    close: _closePanel,
    extraGuard: () => !pickerOverlay.classList.contains('active'),
    capture: true,
  });
}

export function setEquipmentVisible(visible) {
  const btn = document.getElementById('equipment-btn');
  if (btn) {
    btn.style.display = visible ? '' : 'none';
  }
  if (!visible) {
    _closePanel();
    _closePicker();
    _closeEqCtx();
    _closeEqRename(false);
    _closeEqEdit();
    _itemCache.clear();
    _pickerItems = [];
  }
}
