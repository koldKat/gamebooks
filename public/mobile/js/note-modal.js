// Mobile node note editor, independent of desktop-only dialog markup.

import { state, saveState, currentSection } from '../../js/core/state.js';
import { refreshGraph } from './graph-view.js';
import { t } from '../../js/i18n.js';
import { pruneDiscovered } from './context-menu.js';

// Pass reward checks in to avoid a reader/note-modal import cycle.
export function openNoteModal(id, hooks) {
  let overlay = document.getElementById('m-note-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'm-note-overlay';
    overlay.className = 'inv-overlay';
    overlay.innerHTML = `
      <div class="inv-modal m-note-modal">
        <div class="inv-modal-hdr">
          <span class="inv-modal-title" id="m-note-title"></span>
          <button id="m-note-close-btn" class="inv-close-btn" aria-label="${t('btn.close')}">✕</button>
        </div>
        <div class="ft-modal-body">
          <textarea id="m-note-input" class="m-note-input"></textarea>
          <div class="inv-modal-ftr">
            <button id="m-note-save-btn" class="inv-add-btn">${t('btn.save')}</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById('m-note-close-btn').addEventListener('click', () => overlay.classList.remove('active'));
    let _mdOnOverlay = false;
    overlay.addEventListener('mousedown', e => { _mdOnOverlay = e.target === overlay; });
    overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOverlay) overlay.classList.remove('active'); });
  }
  document.getElementById('m-note-title').textContent = t('modal.note.title', { n: id });
  const input = document.getElementById('m-note-input');
  input.value = state.graph[id]?.note || '';
  document.getElementById('m-note-save-btn').onclick = () => {
    const note = input.value.trim();
    if (note) {
      if (!state.graph[id]) state.graph[id] = { choices: [], discovered: true };
      state.graph[id].note = note;
    } else if (state.graph[id]) {
      delete state.graph[id].note;
      delete state.graph[id].showNote;
      pruneDiscovered(id);
    }
    saveState();
    hooks.checkXpReward();
    refreshGraph(currentSection());
    overlay.classList.remove('active');
  };
  overlay.classList.add('active');
}
