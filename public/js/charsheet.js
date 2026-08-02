// ── Character Sheet ───────────────────────────────────────────────────────────
// Self-contained module. Imports only from state.js, i18n.js and util.js.
// To remove: delete this file, remove its import lines from boot.js and every other
// importer (grep for './charsheet.js' - play.js, equipment.js, inventory.js, open-world.js,
// battlesim8.js and battlesim829.js all import from it too), and delete
// public/css/charsheet.css (and its <link> in index.html).

import { state, saveState, currentPlaythrough, viewingPt } from './state.js?v=11';
import { t } from './i18n.js?v=19';
import { escapeHtml, shortcutLabel, registerPanelShortcut, ALL_PANEL_OVERLAY_IDS } from './util.js?v=25';

// Working copy - populated when modal opens, discarded on cancel
let _draft = null;
let _readOnly = false;

// Optional hook called after charsheet is saved (main.js uses it to sync to series run)
let _onCharSheetSaved = null;
export function setOnCharSheetSaved(fn) { _onCharSheetSaved = fn || null; }

// Shared bottom-right action button row (charsheet/inventory/equipment/battlesim
// buttons). A flex container so buttons wrap naturally on narrow screens -
// no per-button JS anchoring needed. #stats-hud reads --play-btn-row-h (kept
// in sync via ResizeObserver) to sit above it regardless of how many rows wrap.
// --play-btn-row-w is tracked the same way, so #play-bottom-stack (dice.js) can
// center itself between this row and the dice roller instead of the plain
// viewport midpoint.
let _playBtnRow = null;
export function getPlayBtnRow() {
  if (_playBtnRow) return _playBtnRow;
  _playBtnRow = document.createElement('div');
  _playBtnRow.id = 'play-btn-row';
  document.getElementById('main-screen').appendChild(_playBtnRow);
  new ResizeObserver(() => {
    document.documentElement.style.setProperty('--play-btn-row-h', `${_playBtnRow.offsetHeight}px`);
    document.documentElement.style.setProperty('--play-btn-row-w', `${_playBtnRow.offsetWidth}px`);
  }).observe(_playBtnRow);
  return _playBtnRow;
}

// Drag-and-drop state
let _dragId          = null;
let _dragFromHandle  = false;


// ── Helpers ───────────────────────────────────────────────────────────────────

function genId() { return Math.random().toString(36).slice(2, 10); }


function deepCopy(obj) { return JSON.parse(JSON.stringify(obj)); }

function defaultValue(type) {
  return { number: 0, boolean: false, text: '', list: [], enum: '' }[type] ?? '';
}

function fmtNum(n) {
  const num = Number(n);
  return Number.isFinite(num) ? num.toLocaleString() : String(n ?? 0);
}

function fmtValue(f) {
  if (f.type === 'boolean') return f.value ? '✓' : '✗';
  if (f.type === 'list')    return Array.isArray(f.value) && f.value.length ? f.value.join(', ') : '-';
  if (f.type === 'number')  return fmtNum(f.value ?? 0);
  return (f.value !== undefined && f.value !== '' && f.value !== null) ? String(f.value) : '-';
}

// ── Display overlay ───────────────────────────────────────────────────────────

export function renderCharSheetDisplay() {
  const el  = document.getElementById('charsheet-display');
  const btn = document.getElementById('charsheet-btn');
  if (!el) return;

  const activePt = currentPlaythrough();
  const displayPt = activePt || viewingPt;

  // No run loaded - hide everything
  if (!displayPt) {
    el.innerHTML        = '';
    el.style.display    = 'none';
    if (btn) btn.style.display = 'none';
    return;
  }

  el.style.display = '';
  if (btn) {
    btn.style.display  = '';
    btn.disabled       = false;
    btn.style.opacity  = '';
    btn.style.cursor   = '';
  }

  const fields = (displayPt.charSheet?.fields || []).filter(f => f.visible && f.name.trim());
  el.innerHTML = fields.map(f =>
    `<span class="cs-line"><span class="cs-label">${escapeHtml(f.name)}:</span> ${escapeHtml(fmtValue(f))}</span>`
  ).join('');
}

// ── Modal rendering ───────────────────────────────────────────────────────────

function renderModal() {
  if (!_draft) return;
  const list = document.getElementById('cs-field-list');
  if (!list) return;

  // Read-only means visible-but-disabled, not hidden - Cancel/Close stays enabled
  // so the view can still be dismissed.
  const ftr = document.querySelector('.cs-modal-ftr');
  if (ftr) ftr.style.display = '';
  const addBtn          = document.getElementById('cs-add-field');
  const saveBtn         = document.getElementById('cs-save');
  const saveTemplateBtn = document.getElementById('cs-save-template');
  if (addBtn)          addBtn.disabled          = _readOnly;
  if (saveBtn)          saveBtn.disabled         = _readOnly;
  if (saveTemplateBtn) saveTemplateBtn.disabled  = _readOnly;

  list.innerHTML = '';
  const visibleFields = _readOnly ? _draft.fields.filter(f => f.visible && f.name.trim()) : _draft.fields;
  if (!visibleFields.length) {
    list.innerHTML = `<p class="cs-empty">${_readOnly ? t('cs.no_fields') : t('cs.empty')}</p>`;
    return;
  }
  visibleFields.forEach(field => {
    const row = document.createElement('div');
    row.className  = 'cs-field-row';
    row.dataset.id = field.id;
    row.draggable  = !_readOnly;
    row.innerHTML  = _readOnly ? buildRowHtmlReadOnly(field) : buildRowHtml(field);
    list.appendChild(row);
    if (!_readOnly) wireRow(row, field);
  });
}

const TYPE_OPTIONS = ['number', 'boolean', 'text', 'list', 'enum'];

function buildRowHtml(f) {
  const typeOpts = TYPE_OPTIONS.map(ty =>
    `<option value="${ty}"${f.type === ty ? ' selected' : ''}>${t('cs.type.' + ty)}</option>`
  ).join('');

  let valHtml;
  switch (f.type) {
    case 'number':
      valHtml = `<div class="cs-num-wrap">
        <button class="cs-num-btn" data-delta="-1">−</button>
        <input class="cs-val cs-val-num" type="text" inputmode="numeric" value="${escapeHtml(fmtNum(f.value ?? 0))}">
        <button class="cs-num-btn" data-delta="1">+</button>
      </div>`;
      break;
    case 'boolean':
      valHtml = `<label class="cs-bool-wrap">
        <input class="cs-val cs-val-bool" type="checkbox"${f.value ? ' checked' : ''}>
        <span class="cs-bool-label">${f.value ? t('cs.yes') : t('cs.no')}</span>
      </label>`;
      break;
    case 'text':
      valHtml = `<input class="cs-val cs-val-text" type="text" value="${escapeHtml(f.value ?? '')}" placeholder="${t('cs.value_placeholder')}">`;
      break;
    case 'list':
      valHtml = `<input class="cs-val cs-val-list" type="text" value="${escapeHtml((f.value ?? []).join(', '))}" placeholder="item1, item2 …">`;
      break;
    case 'enum': {
      const selOpts = (f.options || []).map(o =>
        `<option value="${escapeHtml(o)}"${f.value === o ? ' selected' : ''}>${escapeHtml(o)}</option>`
      ).join('');
      valHtml = `
        <input class="cs-enum-opts" type="text" value="${escapeHtml((f.options || []).join(', '))}" placeholder="${t('cs.enum_placeholder')}">
        <select class="cs-val cs-val-enum">${selOpts || `<option value="">${t('cs.no_options')}</option>`}</select>`;
      break;
    }
    default: valHtml = '';
  }

  return `
    <span class="cs-drag-handle" title="${t('cs.drag_reorder')}">⠿</span>
    <label class="cs-vis-toggle" title="${t('cs.toggle_visible')}">
      <input type="checkbox" class="cs-vis-cb"${f.visible ? ' checked' : ''}>
      <span class="cs-dot"></span>
    </label>
    <input class="cs-name-inp" type="text" value="${escapeHtml(f.name)}" placeholder="${t('cs.field_name')}">
    <select class="cs-type-sel">${typeOpts}</select>
    <div class="cs-val-wrap">${valHtml}</div>
    <button class="cs-del-btn" title="${t('cs.delete_field')}">✕</button>`;
}

function buildRowHtmlReadOnly(f) {
  let valDisplay;
  switch (f.type) {
    case 'boolean': valDisplay = f.value ? t('cs.yes') : t('cs.no'); break;
    case 'list':    valDisplay = (f.value ?? []).join(', ') || '-'; break;
    case 'enum':    valDisplay = f.value || '-'; break;
    case 'number':  valDisplay = f.value != null && f.value !== '' ? fmtNum(f.value) : '-'; break;
    default:        valDisplay = f.value != null && f.value !== '' ? String(f.value) : '-';
  }
  return `<span class="cs-ro-name">${escapeHtml(f.name)}</span><span class="cs-ro-val">${escapeHtml(valDisplay)}</span>`;
}

function wireRow(row, field) {
  // Visible toggle
  const visCb = row.querySelector('.cs-vis-cb');
  visCb.addEventListener('change', () => {
    field.visible = visCb.checked;
  });

  // Name
  row.querySelector('.cs-name-inp').addEventListener('input', e => {
    field.name = e.target.value;
  });

  // Type - re-render row on change
  row.querySelector('.cs-type-sel').addEventListener('change', e => {
    field.type  = e.target.value;
    field.value = defaultValue(field.type);
    if (field.type !== 'enum') delete field.options;
    renderModal();
  });

  // Enum options
  const enumOptsEl = row.querySelector('.cs-enum-opts');
  if (enumOptsEl) {
    enumOptsEl.addEventListener('change', e => {
      field.options = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
      if (!field.options.includes(field.value)) field.value = field.options[0] ?? '';
      renderModal();
    });
  }

  // Value
  const valEl = row.querySelector('.cs-val');
  if (valEl) {
    const readVal = () => {
      switch (field.type) {
        case 'number':  {
          // type="text" (needed for comma display) accepts any keystroke, unlike the
          // native number input this replaced - filter live so garbage can't be typed
          // or silently turn into a stored/displayed "NaN".
          const raw = String(valEl.value).replace(/[^0-9.\-]/g, '');
          if (raw !== valEl.value) valEl.value = raw;
          field.value = Number(raw) || 0;
          break;
        }
        case 'boolean': {
          field.value = valEl.checked;
          const lbl = valEl.closest('label')?.querySelector('.cs-bool-label');
          if (lbl) lbl.textContent = field.value ? t('cs.yes') : t('cs.no');
          break;
        }
        case 'list':    { field.value = valEl.value.split(',').map(s => s.trim()).filter(Boolean); break; }
        default:        { field.value = valEl.value; break; }
      }
    };
    valEl.addEventListener((valEl.type === 'checkbox' || valEl.tagName === 'SELECT') ? 'change' : 'input', readVal);

    // Number fields: show raw digits while editing, comma-formatted otherwise
    if (field.type === 'number') {
      valEl.addEventListener('focus', () => { valEl.value = String(field.value ?? 0); });
      valEl.addEventListener('blur',  () => { valEl.value = fmtNum(field.value ?? 0); });
    }
  }

  // Number ± buttons
  row.querySelectorAll('.cs-num-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const inp = row.querySelector('.cs-val-num');
      field.value = (Number(String(inp.value).replace(/,/g, '')) || 0) + Number(btn.dataset.delta);
      inp.value = document.activeElement === inp ? String(field.value) : fmtNum(field.value);
    });
  });

  // Delete
  row.querySelector('.cs-del-btn').addEventListener('click', () => {
    _draft.fields = _draft.fields.filter(f => f.id !== field.id);
    renderModal();
  });

  // Drag to reorder - only initiated from the handle
  const handle = row.querySelector('.cs-drag-handle');
  handle.addEventListener('mousedown', () => { _dragFromHandle = true; });
  handle.addEventListener('mouseup',   () => { _dragFromHandle = false; });

  row.addEventListener('dragstart', e => {
    if (!_dragFromHandle) { e.preventDefault(); return; }
    _dragId = field.id;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => row.classList.add('cs-dragging'), 0);
  });

  row.addEventListener('dragend', () => {
    _dragFromHandle = false;
    _dragId = null;
    row.classList.remove('cs-dragging');
    document.querySelectorAll('#cs-field-list .cs-field-row').forEach(r => r.classList.remove('cs-drag-over'));
  });

  row.addEventListener('dragover', e => {
    if (!_dragId || _dragId === field.id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('#cs-field-list .cs-field-row').forEach(r => r.classList.remove('cs-drag-over'));
    row.classList.add('cs-drag-over');
  });

  row.addEventListener('dragleave', () => row.classList.remove('cs-drag-over'));

  row.addEventListener('drop', e => {
    e.preventDefault();
    if (!_dragId || _dragId === field.id) return;
    const fromIdx = _draft.fields.findIndex(f => f.id === _dragId);
    const toIdx   = _draft.fields.findIndex(f => f.id === field.id);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = _draft.fields.splice(fromIdx, 1);
    _draft.fields.splice(toIdx, 0, moved);
    renderModal();
  });
}

// ── Modal open / close ────────────────────────────────────────────────────────

function openModal() {
  const pt = currentPlaythrough() || viewingPt;
  if (!pt) return;
  _readOnly = !currentPlaythrough();
  _draft = deepCopy(pt.charSheet || { fields: [] });
  renderModal();
  document.getElementById('charsheet-modal-overlay').classList.add('active');
}

function closeModal() {
  _draft = null;
  document.getElementById('charsheet-modal-overlay')?.classList.remove('active');
}

// ── Visibility (called by screen router in main.js) ───────────────────────────

export function setCharSheetVisible(visible) {
  const btn = document.getElementById('charsheet-btn');
  const dis = document.getElementById('charsheet-display');
  const d   = visible ? '' : 'none';
  if (btn) btn.style.display = d;
  if (dis) dis.style.display = d;
  if (!visible) closeModal();
}

// ── Init (call once from DOMContentLoaded in main.js) ─────────────────────────

export function initCharSheet() {
  // Modal - injected into body to overlay everything
  const modalOv = document.createElement('div');
  modalOv.id        = 'charsheet-modal-overlay';
  modalOv.className = 'cs-overlay';
  modalOv.innerHTML = `
    <div class="cs-modal">
      <div class="cs-modal-hdr">
        <span>${t('cs.title')}</span>
        <button id="cs-modal-close">✕</button>
      </div>
      <div id="cs-field-list" class="cs-field-list"></div>
      <div class="cs-modal-ftr">
        <button id="cs-add-field" class="cs-btn-add">+ ${t('cs.add')}</button>
        <div class="cs-ftr-actions">
          <button id="cs-save"          class="cs-btn-save">${t('cs.save')}</button>
          <button id="cs-save-template" class="cs-btn-template">${t('cs.save_template')}</button>
          <button id="cs-cancel"        class="cs-btn-cancel">${t('cs.cancel')}</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modalOv);

  // Display + open button - children of #main-screen so display:none hides them
  const mainEl = document.getElementById('main-screen');

  const displayEl = document.createElement('div');
  displayEl.id            = 'charsheet-display';
  displayEl.style.display = 'none';
  mainEl.appendChild(displayEl);

  const btnEl = document.createElement('button');
  btnEl.id            = 'charsheet-btn';
  btnEl.innerHTML     = shortcutLabel(t('cs.btn'));
  btnEl.style.display = 'none';
  getPlayBtnRow().appendChild(btnEl);

  // Wire events
  btnEl.addEventListener('click', openModal);
  document.getElementById('cs-modal-close').addEventListener('click', closeModal);
  modalOv.addEventListener('click', e => { if (e.target === modalOv) closeModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modalOv.classList.contains('active')) closeModal();
  }, true); // capture phase - fires before vis.js canvas can stopPropagation
  registerPanelShortcut('KeyC', {
    getButton:  () => document.getElementById('charsheet-btn'),
    getOverlay: () => modalOv,
    otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== 'charsheet-modal-overlay'),
    open:  openModal,
    close: closeModal,
    capture: true,
  });

  document.getElementById('cs-add-field').addEventListener('click', () => {
    if (!_draft || _readOnly) return;
    _draft.fields.push({ id: genId(), name: '', type: 'number', value: 0, visible: true });
    renderModal();
    document.querySelector('#cs-field-list .cs-field-row:last-child .cs-name-inp')?.focus();
  });

  document.getElementById('cs-cancel').addEventListener('click', closeModal);

  document.getElementById('cs-save').addEventListener('click', () => {
    const pt = currentPlaythrough();
    if (!pt || !_draft || _readOnly) return;
    pt.charSheet = deepCopy(_draft);
    pt.charSheetEdited = true;
    saveState();
    renderCharSheetDisplay();
    closeModal();
    if (_onCharSheetSaved) _onCharSheetSaved(pt.charSheet);
  });

  document.getElementById('cs-save-template').addEventListener('click', () => {
    if (!_draft || _readOnly) return;
    state.charSheetTemplate = deepCopy(_draft);
    saveState();
  });

}
