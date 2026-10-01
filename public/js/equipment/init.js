// init.js - Internal equipment module; use ../equipment.js externally.

import { state, saveState } from '../state.js';
import { getPlayBtnRow } from '../charsheet.js';
import { shortcutLabel, registerPanelShortcut, ALL_PANEL_OVERLAY_IDS } from '../util.js';
import { t } from '../i18n.js';
import { equipmentRuntime } from './runtime.js';
import { _isReadOnly, _eq, _eqVisible, _eqItemId, _eqMeta, _eqQty } from './model.js';
import { _closeEqCtx } from './context-menu.js';
import { _closeEqRename, _closeEqEdit } from './dialogs.js';
import { _openPanel, _closePanel } from './panel.js';
import { _closePicker, _renderPicker } from './picker.js';

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
    if (equipmentRuntime._eqCtxMenu && !equipmentRuntime._eqCtxMenu.contains(e.target)) _closeEqCtx();
    if (equipmentRuntime._eqEditKey && !document.getElementById('eq-edit-dialog').contains(e.target)) _closeEqEdit();
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (equipmentRuntime._eqCtxMenu) { _closeEqCtx(); return; }
    if (document.getElementById('eq-rename-dialog')?.classList.contains('active')) { _closeEqRename(false); return; }
    if (equipmentRuntime._eqEditKey) { _closeEqEdit(); return; }
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
