// node-dialogs.js - Internal play-screen module; use ../play.js externally.

import { state, saveState } from '../core/state.js';
import { t } from '../i18n.js';
import { render } from './render.js';
import { handleRecordChoices } from './choices.js';

export function openEditModal(nodeId) {
  const existing = (state.graph[nodeId]?.choices || []).join(', ');
  document.getElementById('edit-modal-title').textContent = t('modal.edit.title', { n: nodeId });

  // Clone input + both buttons to wipe all stale listeners in one pass
  const oldInp    = document.getElementById('edit-choices-input');
  const save      = document.getElementById('edit-modal-save');
  const cancel    = document.getElementById('edit-modal-cancel');
  const newInp    = oldInp.cloneNode(true);
  const newSave   = save.cloneNode(true);
  const newCancel = cancel.cloneNode(true);
  oldInp.parentNode.replaceChild(newInp, oldInp);
  save.parentNode.replaceChild(newSave, save);
  cancel.parentNode.replaceChild(newCancel, cancel);

  newInp.value = existing;
  document.getElementById('edit-modal-overlay').classList.add('active');
  newInp.focus();
  newInp.select();

  newSave.addEventListener('click', () => {
    handleRecordChoices(nodeId, document.getElementById('edit-choices-input').value.trim(), true);
    closeEditModal();
  });
  newCancel.addEventListener('click', closeEditModal);
  newInp.addEventListener('keydown', e => {
    if (e.key === 'Enter')  newSave.click();
    if (e.key === 'Escape') closeEditModal();
  });
}

export function closeEditModal() {
  document.getElementById('edit-modal-overlay').classList.remove('active');
}

export function openNoteModal(nodeId) {
  document.getElementById('note-modal-title').textContent = t('modal.note.title', { n: nodeId });
  const pinCb = document.getElementById('note-pin-cb');

  const oldInp    = document.getElementById('note-modal-input');
  const save      = document.getElementById('note-modal-save');
  const cancel    = document.getElementById('note-modal-cancel');
  const newInp    = oldInp.cloneNode(true);
  const newSave   = save.cloneNode(true);
  const newCancel = cancel.cloneNode(true);
  oldInp.parentNode.replaceChild(newInp, oldInp);
  save.parentNode.replaceChild(newSave, save);
  cancel.parentNode.replaceChild(newCancel, cancel);

  newInp.value = state.graph[nodeId]?.note || '';
  pinCb.checked = !!(state.graph[nodeId]?.showNote);
  document.getElementById('note-modal-overlay').classList.add('active');
  newInp.focus();

  newSave.addEventListener('click', () => {
    const note     = document.getElementById('note-modal-input').value.trim();
    const showNote = document.getElementById('note-pin-cb').checked;
    if (note) {
      if (!state.graph[nodeId]) state.graph[nodeId] = { choices: [], discovered: true };
      state.graph[nodeId].note     = note;
      if (showNote) state.graph[nodeId].showNote = true;
      else          delete state.graph[nodeId].showNote;
    } else if (state.graph[nodeId]) {
      delete state.graph[nodeId].note;
      delete state.graph[nodeId].showNote;
      const n = state.graph[nodeId];
      // Retain nodes with portals or other metadata when clearing notes.
      if (n.discovered && !n.priority && !n.battle && !n.color && !n.portals && !n.manual) delete state.graph[nodeId];
    }
    saveState();
    render();
    closeNoteModal();
  });
  newCancel.addEventListener('click', closeNoteModal);
  newInp.addEventListener('keydown', e => { if (e.key === 'Escape') closeNoteModal(); });
}

export function closeNoteModal() {
  document.getElementById('note-modal-overlay').classList.remove('active');
}
