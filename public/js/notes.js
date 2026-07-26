// ── Notebook + notes display overlay ──────────────────────────────────────────
// Self-contained module. Imports from state.js and play.js.
// To remove: delete this file, remove its import line and initNotes()/loadNotesForBook()/
// hideNotesUI() calls from boot.js, and remove the notebook/notes-display CSS from style.css.

import { state, saveState, apiFetch, currentBookId } from './state.js?v=11';
import { showAlert } from './play.js?v=36';

let _notesText  = '';
let _nbFraction = 0;   // 0–1 scroll position, shared by both notebook views
let _nbSelStart = 0;
let _nbSelEnd   = 0;

let _onXpAwarded = null;
export function setOnXpAwarded(fn) { _onXpAwarded = fn || null; }

// DOM refs, populated by initNotes()
let notebookOverlay, notebookInput, notebookPinCb, notesDisplay, notesDisplayInput, notesDisplayBody;

function _nbApply(el) {
  const max = el.scrollHeight - el.clientHeight;
  if (max <= 0) return;
  const target = Math.round(_nbFraction * max);
  if (Math.abs(el.scrollTop - target) > 1) el.scrollTop = target;
}

function _nbSave(el) {
  const max = el.scrollHeight - el.clientHeight;
  if (max > 0) _nbFraction = el.scrollTop / max;
  // if max === 0 the element isn't scrollable - preserve existing fraction
}

function _nbPersist(bookId) {
  if (!bookId) return;
  localStorage.setItem(`nb_scroll_${bookId}`, _nbFraction);
  localStorage.setItem(`nb_sel_s_${bookId}`,  _nbSelStart);
  localStorage.setItem(`nb_sel_e_${bookId}`,  _nbSelEnd);
}

function _nbLoad(bookId) {
  _nbFraction = +(localStorage.getItem(`nb_scroll_${bookId}`) || 0);
  _nbSelStart = +(localStorage.getItem(`nb_sel_s_${bookId}`)  || 0);
  _nbSelEnd   = +(localStorage.getItem(`nb_sel_e_${bookId}`)  || 0);
}

export function setNotesDisplayText(text) {
  _notesText = text;
  const el   = document.getElementById('notes-display-text');
  const ta   = document.getElementById('notes-display-input');
  const body = document.getElementById('notes-display-body');
  const nd   = document.getElementById('notes-display');
  if (el) el.textContent = text;
  if (ta) ta.value = text;
  requestAnimationFrame(() => {
    if (nd && nd.classList.contains('hovering')) {
      if (ta)   _nbApply(ta);
    } else {
      if (body) _nbApply(body);
    }
  });
}

export function setNotesPinned(pinned) {
  const cb  = document.getElementById('notebook-pin-cb');
  const el  = document.getElementById('notes-display');
  if (cb) cb.checked = pinned;
  if (el) {
    el.classList.toggle('visible', pinned);
    if (!pinned) el.classList.remove('hovering');
  }
}

// Called when the play view is hidden (setGuideVisible(false) in main.js)
export function hideNotesUI() {
  document.getElementById('notebook-modal-overlay').classList.remove('active');
  document.getElementById('notes-display').classList.remove('visible');
  const pinCb = document.getElementById('notebook-pin-cb');
  if (pinCb) pinCb.checked = false;
}

// Called on book load when state.notesPinned is true
export async function loadNotesForBook(bookId) {
  _nbLoad(bookId);
  setNotesPinned(true);
  try {
    const res = await apiFetch(`/api/books/${bookId}/notebook`);
    if (!res.ok) return; // leave whatever's currently shown rather than blanking real notes
    const data = await res.json();
    setNotesDisplayText(data.text ?? '');
    notebookInput.value = _notesText;
  } catch (_) {}
}

export function initNotes() {
  const notebookBtn        = document.getElementById('notebook-btn');
  const notebookClose      = document.getElementById('notebook-modal-close');
  const notebookSave       = document.getElementById('notebook-modal-save');
  const notebookCancel     = document.getElementById('notebook-modal-cancel');
  const notesDisplaySave   = document.getElementById('notes-display-save');
  const notesDisplayCancel = document.getElementById('notes-display-cancel');

  notebookOverlay   = document.getElementById('notebook-modal-overlay');
  notebookInput     = document.getElementById('notebook-modal-input');
  notebookPinCb     = document.getElementById('notebook-pin-cb');
  notesDisplay      = document.getElementById('notes-display');
  notesDisplayInput = document.getElementById('notes-display-input');
  notesDisplayBody  = document.getElementById('notes-display-body');

  async function openNotebook() {
    const bookId = currentBookId;
    if (!bookId) return;
    _nbLoad(bookId);
    const prevValue = notebookInput.value;
    notebookInput.value = '';
    notebookOverlay.classList.add('active');
    try {
      const res = await apiFetch(`/api/books/${bookId}/notebook`);
      if (!res.ok) { notebookInput.value = prevValue; return; } // don't leave/save over real notes with a blank fetch failure
      const data = await res.json();
      const text = data.text ?? '';
      const selS = Math.min(_nbSelStart, text.length);
      const selE = Math.min(_nbSelEnd,   text.length);
      notebookInput.value = text;
      setNotesDisplayText(text);
      requestAnimationFrame(() => {
        notebookInput.setSelectionRange(selS, selE);
        _nbApply(notebookInput);
        notebookInput.focus({ preventScroll: true });
      });
    } catch (_) { notebookInput.value = prevValue; }
  }

  function _saveNotebookPos() {
    _nbSave(notebookInput);
    _nbSelStart = notebookInput.selectionStart;
    _nbSelEnd   = notebookInput.selectionEnd;
    _nbPersist(currentBookId);
  }

  function closeNotebook() {
    _saveNotebookPos();
    notebookOverlay.classList.remove('active');
  }

  async function saveNotebook() {
    const bookId = currentBookId;
    if (!bookId) return;
    const text  = notebookInput.value;
    const ptIdx = state.activePtIndex;
    try {
      const res = await apiFetch(`/api/books/${bookId}/notebook`, {
        method: 'PUT',
        body: JSON.stringify({ text, ptIdx: typeof ptIdx === 'number' ? ptIdx : -1 }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        showAlert(j.error || 'Could not save notebook.');
        return; // leave the modal open with the unsaved text still in it
      }
      const d = await res.json();
      if (d.xpAwarded) _onXpAwarded?.();
      setNotesDisplayText(text);
    } catch (_) { showAlert('Could not save notebook.'); return; }
    _saveNotebookPos();
    notebookOverlay.classList.remove('active');
  }

  async function saveNotesDisplay() {
    const bookId = currentBookId;
    if (!bookId) return;
    const text  = notesDisplayInput.value;
    const ptIdx = state.activePtIndex;
    try {
      const res = await apiFetch(`/api/books/${bookId}/notebook`, {
        method: 'PUT',
        body: JSON.stringify({ text, ptIdx: typeof ptIdx === 'number' ? ptIdx : -1 }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        showAlert(j.error || 'Could not save notebook.');
        return; // stay in edit mode with the unsaved text still in it
      }
      const d = await res.json();
      if (d.xpAwarded) _onXpAwarded?.();
      setNotesDisplayText(text);
      notebookInput.value = text;
    } catch (_) { showAlert('Could not save notebook.'); return; }
    notesDisplay.classList.remove('hovering');
  }

  notebookInput.addEventListener('scroll', () => {
    _nbSave(notebookInput);
    _nbPersist(currentBookId);
    if (notesDisplay.classList.contains('visible')) {
      if (notesDisplay.classList.contains('hovering')) _nbApply(notesDisplayInput);
      else _nbApply(notesDisplayBody);
    }
  });
  notesDisplayBody.addEventListener('scroll', () => {
    _nbSave(notesDisplayBody);
    _nbPersist(currentBookId);
    if (notebookOverlay.classList.contains('active')) _nbApply(notebookInput);
  });
  notesDisplayInput.addEventListener('scroll', () => {
    _nbSave(notesDisplayInput);
    _nbPersist(currentBookId);
    if (notebookOverlay.classList.contains('active')) _nbApply(notebookInput);
  });

  notebookInput.addEventListener('input', () => {
    _notesText = notebookInput.value;
    const dispText = document.getElementById('notes-display-text');
    const dispInput = document.getElementById('notes-display-input');
    if (dispText)  dispText.textContent = notebookInput.value;
    if (dispInput) dispInput.value      = notebookInput.value;
  });

  notesDisplayInput.addEventListener('input', () => {
    _notesText = notesDisplayInput.value;
    const dispText = document.getElementById('notes-display-text');
    if (dispText) dispText.textContent = notesDisplayInput.value;
    notebookInput.value = notesDisplayInput.value;
  });

  notebookBtn.addEventListener('click', openNotebook);
  notebookSave.addEventListener('click', saveNotebook);
  notebookCancel.addEventListener('click', closeNotebook);
  notebookClose.addEventListener('click',  closeNotebook);
  let _mdOnNotebookOverlay = false;
  notebookOverlay.addEventListener('mousedown', e => { _mdOnNotebookOverlay = e.target === notebookOverlay; });
  notebookOverlay.addEventListener('click', e => { if (e.target === notebookOverlay && _mdOnNotebookOverlay) closeNotebook(); });

  notebookPinCb.addEventListener('change', async () => {
    const willPin = notebookPinCb.checked;
    setNotesPinned(willPin);
    state.notesPinned = willPin;
    saveState();
    if (willPin) {
      const bookId = currentBookId;
      if (bookId) {
        if (notebookOverlay.classList.contains('active')) {
          setNotesDisplayText(notebookInput.value);
        } else {
          try {
            const res = await apiFetch(`/api/books/${bookId}/notebook`);
            if (!res.ok) return; // leave whatever's currently shown rather than blanking real notes
            const data = await res.json();
            setNotesDisplayText(data.text ?? '');
            notebookInput.value = _notesText;
          } catch (_) {}
        }
      }
    }
  });

  notesDisplay.addEventListener('mouseenter', () => {
    notesDisplay.classList.add('hovering');
    _nbApply(notesDisplayInput);
  });
  notesDisplay.addEventListener('mouseleave', () => {
    // Don't discard an in-progress edit just because the mouse drifted off the panel -
    // only the explicit Cancel button (below) should throw away unsaved text. Hovering
    // back in later will show the same draft; saving or loading a different book's
    // notes will properly overwrite it via setNotesDisplayText().
    notesDisplay.classList.remove('hovering');
    _nbApply(notesDisplayBody);
  });
  notesDisplaySave.addEventListener('click',   e => { e.stopPropagation(); saveNotesDisplay(); });
  notesDisplayCancel.addEventListener('click', e => {
    e.stopPropagation();
    notesDisplayInput.value = _notesText;
    notesDisplay.classList.remove('hovering');
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    // showAlert() (a failed save, see saveNotebook/saveNotesDisplay) has no Escape handling
    // of its own - if its dialog is open on top of the notebook, let it own Escape first,
    // otherwise dismissing it would also close the notebook underneath and, on next open,
    // openNotebook() would blank + re-fetch, discarding the unsaved text the alert was about.
    if (document.getElementById('confirm-overlay')?.classList.contains('active')) return;
    if (notebookOverlay.classList.contains('active')) closeNotebook();
  });
}
