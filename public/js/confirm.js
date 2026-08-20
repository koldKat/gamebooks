// ── Custom confirm/alert dialog ─────────────────────────────────────────────
// Self-contained module. Imports only i18n.js. Extracted out of play.js so it
// can be imported without dragging in play.js's own heavy tree (graph.js,
// charsheet.js, equipment.js) - battlesim*.js files and the mobile reader
// both want just this, not all of play.js.
//
// Desktop's index.html already has static #confirm-overlay markup + matching
// CSS (confirm.css) - reused as-is there, so desktop's behavior is byte-for-
// byte identical to before this file existed. Any other page (mobile) that
// doesn't have that markup gets an equivalent overlay built on first use,
// with the same ids/classes, so confirm.css styles it the same way.

import { t } from './i18n.js?v=74';

let _els = null;

function _ensureDom() {
  if (_els) return _els;
  let overlay = document.getElementById('confirm-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'confirm-overlay';
    overlay.innerHTML = `
      <div id="confirm-dialog">
        <p id="confirm-message"></p>
        <div class="confirm-actions">
          <button id="confirm-ok">Confirm</button>
          <button id="confirm-cancel">${t('btn.cancel')}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }
  _els = {
    overlay,
    msgEl:    document.getElementById('confirm-message'),
    okEl:     document.getElementById('confirm-ok'),
    cancelEl: document.getElementById('confirm-cancel'),
  };
  return _els;
}

export function showConfirm(message, onConfirm, { confirmLabel = null, danger = true, showCancel = true, win = false } = {}) {
  const { overlay, msgEl, okEl, cancelEl } = _ensureDom();

  msgEl.textContent            = message;
  okEl.textContent             = confirmLabel ?? t('btn.delete');
  okEl.classList.toggle('warn', !danger && !win);
  okEl.classList.toggle('win', win);
  cancelEl.style.display       = showCancel ? '' : 'none';
  overlay.classList.add('active');

  const newOk     = okEl.cloneNode(true);
  const newCancel = cancelEl.cloneNode(true);
  okEl.parentNode.replaceChild(newOk, okEl);
  cancelEl.parentNode.replaceChild(newCancel, cancelEl);
  _els.okEl = newOk;
  _els.cancelEl = newCancel;

  const close = () => {
    overlay.classList.remove('active');
    newCancel.style.display = ''; // restore for next use
  };
  newOk.addEventListener('click',     () => { close(); onConfirm(); });
  newCancel.addEventListener('click', close);
}

export function showAlert(message) {
  showConfirm(message, () => {}, { confirmLabel: t('btn.ok'), danger: false, showCancel: false });
}
