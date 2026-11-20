// Limited mobile inventory/equipment dialogs share the current run's saved data.
import { state, currentBookId, currentPlaythrough, viewingPt, saveState, apiFetch } from '../../../js/core/state.js';
import { t } from '../../../js/i18n.js';
import { escapeHtml } from '../../../js/core/util.js';
import { ALL_SLOTS, SLOTS, ITEM_SLOTS, DUMMY_SVG } from '../../../js/equipment/constants.js';
import { loadingHtml } from '../../../js/ui-helpers/loading.js';
import { mountLazyIconGrid } from '../../../js/ui-helpers/lazy-icon-grid.js';
import { showAlert, showConfirm } from '../../../js/ui-helpers/confirm.js';
import { initTooltip, dismissTooltip } from '../../../js/ui-helpers/tooltip.js';
import { inventorySlots, equipmentSlot, addMobileItem, moveMobileItem, MAX_ITEMS } from './model.js';
import { bindItemDrag } from './drag.js';

let context = null, overlay = null, picker = null, stopDrag = null, lazyPicker = null;
const icons = new Map();

function isCurrent() {
  return context && context.bookId === currentBookId && context.state === state &&
    context.run === (currentPlaythrough() || viewingPt);
}
function editable() { return isCurrent() && context.run === currentPlaythrough() && !context.run.completed; }

export function closeMobileItems() {
  if (overlay) dismissTooltip();
  closePicker();
  stopDrag?.(); stopDrag = null;
  overlay?.remove(); overlay = null;
  context = null;
  icons.clear();
}

export function refreshMobileItems() {
  if (!context) return;
  if (!isCurrent()) closeMobileItems();
  else render();
}

function itemCard(entry, destination, source = destination, label = '') {
  const card = document.createElement('div');
  card.className = 'm-item-slot' + (entry ? '' : ' m-item-empty');
  card.dataset.itemTarget = JSON.stringify(destination);
  if (entry) card.dataset.itemSource = JSON.stringify(source);
  const item = entry && icons.get(entry.itemId);
  const name = entry ? entry.label || item?.name || '' : '';
  if (name) {
    card.dataset.tooltip = name;
    card.dataset.tooltipWrap = 'true';
  }
  card.innerHTML = `${label ? `<span class="m-item-slot-label">${escapeHtml(label)}</span>` : ''}
    <span class="m-item-svg">${item?.svg_data || ''}</span>
    <span class="m-item-name">${escapeHtml(name)}</span>
    ${entry?.qty > 1 ? `<span class="m-item-qty">×${entry.qty}</span>` : ''}`;
  return card;
}

function render() {
  if (!isCurrent() || !overlay) return;
  stopDrag?.();
  const run = context.run, inventory = inventorySlots(run);
  const body = overlay.querySelector('.m-items-body');
  body.replaceChildren();
  if (context.mode === 'equipment') {
    const equipment = document.createElement('div');
    equipment.className = 'm-equipment-body';
    equipment.innerHTML = DUMMY_SVG;
    for (const slot of SLOTS) {
      const card = equipmentCard(slot);
      card.style.left = `${slot.x}%`;
      card.style.top = `${slot.y}%`;
      equipment.appendChild(card);
    }
    body.appendChild(equipment);
    const items = document.createElement('div');
    items.className = 'm-equipment-items';
    for (const slot of ITEM_SLOTS) items.appendChild(equipmentCard(slot));
    body.appendChild(items);
  } else {
    const grid = document.createElement('div');
    grid.className = 'm-items-slots';
    grid.dataset.itemScroll = '';
    for (let index = 0; index < MAX_ITEMS; index++) grid.appendChild(itemCard(inventory[index], { kind: 'inventory', index }));
    body.appendChild(grid);
    overlay.querySelector('[data-add-item]').disabled = !editable();
    overlay.querySelector('[data-item-count]').textContent = `${inventory.length} / ${MAX_ITEMS}`;
  }
  const bin = overlay.querySelector('[data-item-bin]');
  bin.disabled = !editable();
  bin.setAttribute('aria-disabled', String(!editable()));
  bin.dataset.itemTarget = JSON.stringify(context.mode === 'equipment' ? { kind: 'inventory', index: inventory.length } : { kind: 'trash' });
  stopDrag = bindItemDrag(overlay.querySelector('.m-items-modal'), {
    canDrag: editable,
    onDrop(from, to) {
      if (!editable()) return;
      if (to.kind === 'trash') {
        const session = context;
        const item = inventorySlots(session.run)[from.index];
        if (from.kind !== 'inventory' || !item) return;
        const snapshot = JSON.stringify(item);
        const label = item.label?.trim() || icons.get(item.itemId)?.name || t('inv.title');
        const name = item.qty > 1 ? `${label} ×${item.qty}` : label;
        dismissTooltip();
        showConfirm(t('inv.confirm.remove', { name }), () => {
          if (context !== session || !editable() || JSON.stringify(inventorySlots(session.run)[from.index]) !== snapshot) return;
          if (!moveMobileItem(session.run, from, to)) return;
          saveState(); render();
        }, { confirmLabel: t('inv.ctx.remove'), danger: true });
        return;
      }
      if (!moveMobileItem(context.run, from, to)) return;
      saveState();
      render();
    },
  });
}

function equipmentCard(slot) {
  const entry = equipmentSlot(context.run, slot.key);
  const card = itemCard(entry, { kind: 'equipment', key: slot.key }, undefined, slot.label());
  card.classList.add('m-equipment-slot');
  card.tabIndex = editable() ? 0 : -1;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', slot.label());
  card.setAttribute('aria-disabled', String(!editable()));
  card.onclick = () => { if (editable()) openPicker(slot.key); };
  card.onkeydown = event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); card.click(); }
  };
  if (entry && editable()) {
    const remove = document.createElement('button');
    remove.className = 'eq-slot-remove';
    remove.setAttribute('aria-label', t('eq.unequip'));
    remove.textContent = '✕';
    remove.onpointerdown = event => event.stopPropagation();
    remove.ontouchstart = event => event.stopPropagation();
    remove.onclick = event => {
      event.stopPropagation();
      if (!editable()) return;
      if (!moveMobileItem(context.run, { kind: 'equipment', key: slot.key }, { kind: 'inventory', index: inventorySlots(context.run).length })) {
        showAlert(t('inv.full')); return;
      }
      saveState(); render();
    };
    card.appendChild(remove);
  }
  return card;
}

async function loadOwned() {
  const session = context;
  const ids = [...new Set([...inventorySlots(session.run), ...ALL_SLOTS.map(slot => equipmentSlot(session.run, slot.key))]
    .filter(Boolean).map(item => item.itemId))];
  const missing = ids.filter(id => !icons.has(id));
  if (!missing.length) return;
  try {
    const response = await apiFetch(`/api/items?ids=${missing.join(',')}`);
    const items = response.ok ? await response.json() : [];
    if (context !== session || !isCurrent()) return;
    for (const item of items) icons.set(item.id, item);
    render();
  } catch { /* Saved item stacks remain available when icon loading fails. */ }
}

export function openMobileItems(mode = 'inventory') {
  initTooltip();
  closeMobileItems();
  const run = currentPlaythrough() || viewingPt;
  if (!run) return;
  context = { mode, bookId: currentBookId, state, run };
  overlay = document.createElement('div');
  overlay.id = 'm-items-overlay'; overlay.className = 'm-overlay active';
  overlay.innerHTML = `<div class="m-items-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(t(mode === 'equipment' ? 'eq.title' : 'inv.title'))}">
    <div class="m-items-header"><strong class="modal-title">${t(mode === 'equipment' ? 'eq.title' : 'inv.title')}</strong>
      ${mode === 'inventory' ? '<span class="m-items-count" data-item-count></span>' : ''}
      <button class="m-icon-btn" data-dialog-close aria-label="${t('btn.close')}">✕</button></div>
    <div class="m-items-body"></div>
    <div class="m-items-footer">
      ${mode === 'inventory' ? `<button class="m-btn-primary" data-add-item>${t('inv.add_btn')}</button>` : ''}
      <button type="button" class="m-items-bin" data-item-bin data-tooltip="${escapeHtml(t(mode === 'equipment' ? 'eq.return_drop_hint' : 'inv.remove_drop_hint'))}" data-tooltip-wrap="true" aria-label="${escapeHtml(t(mode === 'equipment' ? 'eq.unequip' : 'inv.ctx.remove'))}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg>
      </button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('[data-dialog-close]').onclick = closeMobileItems;
  const add = overlay.querySelector('[data-add-item]');
  if (add) add.onclick = () => openPicker();
  overlay.onclick = event => { if (event.target === overlay) closeMobileItems(); };
  render();
  loadOwned();
}

function closePicker() {
  if (picker) dismissTooltip();
  lazyPicker?.disconnect(); lazyPicker = null;
  picker?.remove(); picker = null;
}

async function openPicker(slotKey = null) {
  if (!editable()) return;
  closePicker();
  const session = context;
  const layer = document.createElement('div');
  layer.id = 'm-items-picker-overlay'; layer.className = 'm-overlay m-items-picker active';
  const slot = ALL_SLOTS.find(slot => slot.key === slotKey);
  const title = slot ? t('eq.picker_title', { slot: slot.label() }) : t('inv.add_title');
  layer.innerHTML = `<div class="m-items-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
    <div class="m-items-header"><strong class="modal-title">${escapeHtml(title)}</strong>
      <button class="m-icon-btn" data-dialog-close aria-label="${t('btn.close')}">✕</button></div>
    <div class="m-items-search"><input class="inv-search" autocomplete="off" type="search" placeholder="${escapeHtml(t('inv.search_placeholder'))}" aria-label="${escapeHtml(t('inv.search_placeholder'))}"></div>
    <div class="inv-picker-grid">${loadingHtml()}</div></div>`;
  picker = layer; document.body.appendChild(layer);
  layer.querySelector('[data-dialog-close]').onclick = closePicker;
  layer.onclick = event => { if (event.target === layer) closePicker(); };
  const search = layer.querySelector('input'), grid = layer.querySelector('.inv-picker-grid');
  const current = () => picker === layer && context === session && editable();
  let metadata = [];
  const draw = () => {
    if (!current()) return;
    lazyPicker?.disconnect();
    const query = search.value.trim().toLowerCase();
    const items = metadata.filter(item => !query || (item.label?.trim() || item.name).toLowerCase().includes(query));
    grid.scrollTop = 0;
    if (!items.length) { grid.innerHTML = `<div class="inv-picker-empty">${t(slot ? 'eq.picker_empty' : 'inv.picker_empty')}</div>`; return; }
    if (slot) {
      grid.replaceChildren();
      for (const item of items) {
        const card = document.createElement('div'); card.className = 'inv-pick-item'; card.dataset.inventoryIndex = item.index;
        card.dataset.tooltip = item.label?.trim() || item.name;
        card.dataset.tooltipWrap = 'true';
        card.innerHTML = `<div class="inv-pick-svg">${icons.get(item.itemId)?.svg_data || ''}</div><div class="inv-pick-name">${escapeHtml(item.label?.trim() || item.name)}${item.qty > 1 ? ` ×${item.qty}` : ''}</div>`;
        grid.appendChild(card);
      }
      return;
    }
    lazyPicker = mountLazyIconGrid({
      grid, items,
      renderItem(item) {
        const card = document.createElement('div'); card.className = 'inv-pick-item'; card.dataset.id = item.id;
        card.dataset.tooltip = item.name;
        card.dataset.tooltipWrap = 'true';
        card.innerHTML = `<div class="inv-pick-svg" data-lazy-icon=""></div><div class="inv-pick-name">${escapeHtml(item.name)}</div>`;
        return card;
      },
      async loadItems(ids) {
        if (!current()) return [];
        const response = await apiFetch(`/api/items?ids=${ids.join(',')}`);
        return response.ok && current() ? response.json() : [];
      },
    });
  };
  search.oninput = draw;
  grid.onclick = event => {
    const card = event.target.closest('.inv-pick-item');
    if (!current() || !card || !grid.contains(card)) return;
    if (slot) {
      const index = Number(card.dataset.inventoryIndex);
      const chosen = metadata.find(item => item.index === index);
      const actual = inventorySlots(session.run)[index];
      if (!chosen || !actual || JSON.stringify(actual) !== chosen.snapshot) { closePicker(); return; }
      if (!moveMobileItem(session.run, { kind: 'inventory', index }, { kind: 'equipment', key: slot.key })) return;
    } else if (!addMobileItem(session.run, Number(card.dataset.id))) { showAlert(t('inv.full')); return; }
    saveState(); closePicker(); render(); loadOwned();
  };
  try {
    if (slot) {
      await loadOwned();
      if (!current()) return;
      metadata = inventorySlots(session.run).map((item, index) => ({ ...item, index, name: icons.get(item.itemId)?.name || '', snapshot: JSON.stringify(item) }));
      draw();
      return;
    }
    const response = await apiFetch('/api/items?meta=1');
    metadata = response.ok ? await response.json() : [];
    draw();
  } catch { if (current()) grid.innerHTML = `<div class="inv-picker-empty">${t('auth.network_error')}</div>`; }
}
