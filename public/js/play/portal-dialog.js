// portal-dialog.js - Internal play-screen module; use ../play.js externally.

import { state, saveState } from '../state.js';
import { t } from '../i18n.js';
import { playContext } from './context.js';
import { render } from './render.js';

const escapeInputs = new WeakSet();

export function openPortalModal(sectionId, editIdx = null) {
  const overlay = document.getElementById('portal-modal-overlay');
  const title   = document.getElementById('portal-modal-title');
  const sel     = document.getElementById('portal-book-select');
  const secInp  = document.getElementById('portal-section-input');
  const lblInp  = document.getElementById('portal-label-input');

  title.textContent = editIdx !== null ? t('play.edit_portal') : t('play.add_portal');

  sel.innerHTML = playContext._owSeriesBooks.length === 0
    ? '<option value="">- No other books in series -</option>'
    : playContext._owSeriesBooks.map(b => `<option value="${b.id}">${b.name}</option>`).join('');

  const existing = editIdx !== null ? (state.graph[sectionId]?.portals?.[editIdx] || null) : null;
  if (existing) {
    sel.value    = String(existing.targetBookId);
    secInp.value = String(existing.targetSection);
    lblInp.value = existing.label || '';
  } else {
    secInp.value = '';
    lblInp.value = '';
  }

  overlay.classList.add('active');
  secInp.focus();

  const saveBtn   = document.getElementById('portal-modal-save');
  const cancelBtn = document.getElementById('portal-modal-cancel');
  const newSave   = saveBtn.cloneNode(true);
  const newCancel = cancelBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(newSave, saveBtn);
  cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

  const close = () => overlay.classList.remove('active');

  newSave.addEventListener('click', () => {
    const targetBookId = +sel.value;
    const targetSection = +secInp.value.trim();
    if (!targetBookId || !targetSection) return;
    const portal = { targetBookId, targetSection, label: lblInp.value.trim() || null };
    if (!state.graph[sectionId]) state.graph[sectionId] = { choices: [], discovered: true };
    if (!state.graph[sectionId].portals) state.graph[sectionId].portals = [];
    if (editIdx !== null) {
      state.graph[sectionId].portals[editIdx] = portal;
    } else {
      state.graph[sectionId].portals.push(portal);
    }
    saveState();
    render();
    close();
  });
  newCancel.addEventListener('click', close);
  if (!escapeInputs.has(secInp)) {
    escapeInputs.add(secInp);
    secInp.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  }
}
