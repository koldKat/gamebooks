// init.js - Internal inventory module; use ../inventory.js externally.

import { inventoryRuntime } from './runtime.js';
import { state, saveState, currentPlaythrough } from '../core/state.js';
import { getPlayBtnRow } from '../play/charsheet.js';
import { t } from '../i18n.js';
import { shortcutLabel, registerPanelShortcut, ALL_PANEL_OVERLAY_IDS } from '../core/util.js';
import { MAX_SLOTS } from './constants.js';
import { _inv, _isReadOnly } from './model.js';
import { _openPanel, _closePanel } from './panel.js';
import { _openPicker, _closePicker, _renderPicker } from './picker.js';
import { _closeEdit, _closeRename } from './dialogs.js';
import { _closeCtx } from './context-menu.js';

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
    if (inventoryRuntime._ctxMenu && !inventoryRuntime._ctxMenu.contains(e.target)) _closeCtx();
    if (inventoryRuntime._editIdx < 0) return;
    const dlg = document.getElementById('inv-edit-dialog');
    if (!dlg.contains(e.target)) _closeEdit();
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (inventoryRuntime._ctxMenu) { _closeCtx(); return; }
    if (document.getElementById('inv-rename-dialog')?.classList.contains('active')) { _closeRename(false); return; }
    if (inventoryRuntime._editIdx >= 0) { _closeEdit(); return; }
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
