// context-menu.js - Internal inventory module; use ../inventory.js externally.

import { inventoryRuntime } from './runtime.js';
import { _inv, _setInv, _isReadOnly, _captureContext, _isContextCurrent, _releaseContext } from './model.js';
import { _byId } from './cache.js';
import { t } from '../i18n.js';
import { showConfirm } from '../play.js';
import { _openRename, _closeEdit, _openEditAt } from './dialogs.js';

export function _closeCtx() {
  if (inventoryRuntime._ctxMenu) { inventoryRuntime._ctxMenu.remove(); inventoryRuntime._ctxMenu = null; }
  _releaseContext(inventoryRuntime._menuContext);
  inventoryRuntime._menuContext = null;
}

export function _showCtx(idx, x, y) {
  _closeCtx();
  if (_isReadOnly()) return;
  const arr = _inv();
  const slot = arr[idx];
  if (!slot) return;
  const item = _byId(slot.itemId);
  if (!item) return;
  const context = _captureContext(idx);
  inventoryRuntime._menuContext = context;

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
  inventoryRuntime._ctxMenu = menu;

  // Clamp to viewport
  const r = menu.getBoundingClientRect();
  if (r.right  > window.innerWidth  - 4) menu.style.left = (x - r.width)  + 'px';
  if (r.bottom > window.innerHeight - 4) menu.style.top  = (y - r.height) + 'px';

  menu.addEventListener('click', e => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    const valid = !_isReadOnly() && _isContextCurrent(context);
    _closeCtx();
    if (!action || !valid) return;
    const a = _inv();
    if (!a[idx]) return;
    if (action === 'toggle-visible') {
      a[idx] = { ...a[idx], visible: !a[idx].visible };
      _setInv(a); inventoryRuntime.renderGrid();
    } else if (action === 'rename') {
      _openRename(idx);
    } else if (action === 'edit') {
      _closeEdit();
      _openEditAt(idx, x, y);
    } else if (action === 'remove') {
      const label = a[idx].label?.trim() || item.name;
      _releaseContext(inventoryRuntime._confirmContext);
      const removal = _captureContext(idx);
      inventoryRuntime._confirmContext = removal;
      showConfirm(t('inv.confirm.remove', { name: label }), () => {
        const valid = !_isReadOnly() && _isContextCurrent(removal);
        _releaseContext(removal);
        if (inventoryRuntime._confirmContext === removal) inventoryRuntime._confirmContext = null;
        if (!valid) return;
        const b = _inv();
        if (inventoryRuntime._editIdx === idx) {
          inventoryRuntime._editIdx = -1;
          _releaseContext(inventoryRuntime._editContext);
          inventoryRuntime._editContext = null;
          document.getElementById('inv-edit-dialog').classList.remove('active');
        }
        b.splice(idx, 1);
        _setInv(b); inventoryRuntime.renderGrid();
      }, { confirmLabel: t('inv.ctx.remove'), danger: true });
    }
  });
}
