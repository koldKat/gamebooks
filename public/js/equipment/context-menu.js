// context-menu.js - Internal equipment module; use ../equipment.js externally.

import { currentPlaythrough, saveState } from '../state.js';
import { t } from '../i18n.js';
import { equipmentRuntime } from './runtime.js';
import { _isReadOnly, _eq, _eqVisible, _eqItemId, _captureEqContext, _isEqContextCurrent } from './model.js';
import { _refreshOnScreenDisplay } from './display.js';
import { _openEqRename, _openEqEditAt, _closeEqEdit } from './dialogs.js';

// ── Context menu (mirrors inventory's: toggle-visible / rename / edit) ────────


export function _closeEqCtx() {
  if (equipmentRuntime._eqCtxMenu) { equipmentRuntime._eqCtxMenu.remove(); equipmentRuntime._eqCtxMenu = null; }
}

export function _showEqCtx(key, x, y) {
  _closeEqCtx();
  if (_isReadOnly()) return;
  const context = _captureEqContext(key);
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
  equipmentRuntime._eqCtxMenu = menu;

  // Clamp to viewport
  const r = menu.getBoundingClientRect();
  if (r.right  > window.innerWidth  - 4) menu.style.left = (x - r.width)  + 'px';
  if (r.bottom > window.innerHeight - 4) menu.style.top  = (y - r.height) + 'px';

  menu.addEventListener('click', e => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    _closeEqCtx();
    if (!action || _isReadOnly() || !_isEqContextCurrent(context)) return;
    if (action === 'toggle-visible') {
      const pt = currentPlaythrough();
      if (!pt || _isReadOnly()) return;
      pt.equipmentVisible = { ...(pt.equipmentVisible ?? {}), [key]: !_eqVisible()[key] };
      saveState();
      equipmentRuntime.renderGrid();
      _refreshOnScreenDisplay();
    } else if (action === 'rename') {
      _openEqRename(key);
    } else if (action === 'edit') {
      _closeEqEdit();
      _openEqEditAt(key, x, y);
    }
  });
}
