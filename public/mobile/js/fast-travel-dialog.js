// Mobile fast-travel dialog with manual entry and four route preferences.

import { parseSecId } from '../../js/core/state.js';
import { t } from '../../js/i18n.js';

// Pass navigation in to avoid a reader/dialog import cycle.
export function openFastTravelDialog(doFastTravel) {
  let overlay = document.getElementById('ft-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'ft-overlay';
    overlay.className = 'inv-overlay';
    overlay.innerHTML = `
      <div class="inv-modal ft-modal">
        <div class="inv-modal-hdr">
          <span class="inv-modal-title">${t('ctx.fasttravel')}</span>
          <button id="ft-close-btn" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
        </div>
        <div class="ft-modal-body">
          <div class="ft-input-row">
            <span class="ft-input-row-label">${t('ft.section_placeholder')}</span>
            <div class="ft-qty-wrap">
              <button class="ft-qty-btn" id="ft-dec-btn">−</button>
              <input id="ft-input" class="ft-qty-input" type="text" inputmode="numeric">
              <button class="ft-qty-btn" id="ft-inc-btn">+</button>
            </div>
          </div>
          <div class="ft-dialog-modes">
            <button class="inv-add-btn" data-mode="high">${t('ctx.fasttravel.high')}</button>
            <button class="inv-add-btn" data-mode="shortest">${t('ctx.fasttravel.shortest')}</button>
            <button class="inv-add-btn" data-mode="normal">${t('ctx.fasttravel.normal')}</button>
            <button class="inv-add-btn" data-mode="low">${t('ctx.fasttravel.low')}</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById('ft-close-btn').addEventListener('click', () => overlay.classList.remove('active'));
    let _mdOnOverlay = false;
    overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
    overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) overlay.classList.remove('active'); });
    const input = document.getElementById('ft-input');
    input.addEventListener('input', () => { input.value = input.value.replace(/[^0-9]/g, ''); });
    document.getElementById('ft-dec-btn').addEventListener('click', () => {
      const v = parseInt(input.value, 10);
      if (v > 1) input.value = v - 1;
    });
    document.getElementById('ft-inc-btn').addEventListener('click', () => {
      const v = parseInt(input.value, 10);
      input.value = isNaN(v) ? 1 : v + 1;
    });
    overlay.querySelectorAll('.ft-dialog-modes button').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseSecId(input.value);
        if (id === null) return;
        doFastTravel(btn.dataset.mode, id);
      });
    });
  }
  document.getElementById('ft-input').value = '';
  overlay.classList.add('active');
}
