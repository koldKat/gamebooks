// dialogs.js - Internal play-screen module; use ../play.js externally.

import { state, saveState, parseSecId, isValidSecId } from '../state.js';
import { t } from '../i18n.js';
import { naturalCompare } from '../sort.js';
import { escapeHtml } from '../util.js';
import { showConfirm } from '../ui-helpers/confirm.js';
import { playContext } from './context.js';
import { startPlaythrough } from './runs.js';

const choiceBackdrops = new WeakMap();

// Shared by play.js's own choice-parsing and boot.js's start-node/alt-start
// dialogs - all three hit the same "typed an alphanumeric ID while the book
// is still in numeric mode" fork and used to carry their own copy of this
// confirm dialog (message, confirmLabel, and the alphanumericSections/
// saveState flip itself).
export function confirmAlphanumericSwitch(id, onConfirm) {
  showConfirm(
    t('play.alphanumeric_switch_confirm', { id }),
    () => { state.alphanumericSections = true; saveState(); onConfirm(); },
    { confirmLabel: t('play.yes_switch'), danger: false }
  );
}

// Two-choice dialog: message + two action buttons + cancel
export function showTwoChoice(message, labelA, onA, labelB, onB) {
  const overlay  = document.getElementById('choice-overlay');
  const msgEl    = document.getElementById('choice-message');
  const btnA     = document.getElementById('choice-a');
  const btnB     = document.getElementById('choice-b');
  const cancelEl = document.getElementById('choice-cancel');

  msgEl.textContent = message;

  const newA      = btnA.cloneNode(true);
  const newB      = btnB.cloneNode(true);
  const newCancel = cancelEl.cloneNode(true);
  btnA.parentNode.replaceChild(newA, btnA);
  btnB.parentNode.replaceChild(newB, btnB);
  cancelEl.parentNode.replaceChild(newCancel, cancelEl);

  newA.textContent = labelA;
  newB.textContent = labelB;

  overlay.classList.add('active');
  const close = () => overlay.classList.remove('active');
  newA.addEventListener('click',      () => { close(); onA(); });
  newB.addEventListener('click',      () => { close(); onB(); });
  newCancel.addEventListener('click', close);
  let backdrop = choiceBackdrops.get(overlay);
  if (!backdrop) {
    backdrop = { mouseDown: false };
    choiceBackdrops.set(overlay, backdrop);
    overlay.addEventListener('mousedown', e => { backdrop.mouseDown = e.target === overlay; });
    overlay.addEventListener('click', e => { if (e.target === overlay && backdrop.mouseDown) close(); });
  }
  backdrop.mouseDown = false;
}
export function showFastTravelDialog(onConfirm) {
  let overlay = document.getElementById('ft-dialog-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'ft-dialog-overlay';
    overlay.innerHTML = `
      <div id="ft-dialog">
        <div class="ft-dialog-title">${t('ctx.fasttravel')}</div>
        <div class="cs-num-wrap">
          <button class="cs-num-btn" id="ft-dec-btn">−</button>
          <input id="ft-dialog-input" class="ft-dialog-input" type="text" inputmode="numeric" pattern="[0-9]*" placeholder="${t('ft.section_placeholder')}">
          <button class="cs-num-btn" id="ft-inc-btn">+</button>
        </div>
        <div class="ft-dialog-modes">
          <button class="ft-dialog-mode-btn ft-mode-high" data-mode="high">${t('ctx.fasttravel.high')}</button>
          <button class="ft-dialog-mode-btn ft-mode-shortest" data-mode="shortest">${t('ctx.fasttravel.shortest')}</button>
          <button class="ft-dialog-mode-btn ft-mode-normal" data-mode="normal">${t('ctx.fasttravel.normal')}</button>
          <button class="ft-dialog-mode-btn ft-mode-low" data-mode="low">${t('ctx.fasttravel.low')}</button>
        </div>
        <div class="ft-dialog-footer">
          <button id="ft-dialog-cancel" class="ft-dialog-cancel">${t('btn.cancel')}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById('ft-dialog-cancel').addEventListener('click', () => overlay.classList.remove('active'));
    let _mdOnOvl = false;
    overlay.addEventListener('mousedown', e => { _mdOnOvl = e.target === overlay; });
    overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOvl) overlay.classList.remove('active'); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && overlay.classList.contains('active')) overlay.classList.remove('active');
    });
    document.getElementById('ft-dec-btn').addEventListener('click', () => {
      const inp = document.getElementById('ft-dialog-input');
      const v = parseInt(inp.value, 10);
      if (v > 1) inp.value = v - 1;
    });
    document.getElementById('ft-inc-btn').addEventListener('click', () => {
      const inp = document.getElementById('ft-dialog-input');
      const v = parseInt(inp.value, 10);
      inp.value = isNaN(v) ? 1 : v + 1;
    });
  }

  const input = document.getElementById('ft-dialog-input');
  input.value = '';

  // Re-wire mode buttons with new onConfirm each call
  overlay.querySelectorAll('.ft-dialog-mode-btn').forEach(btn => {
    const fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);
  });
  overlay.querySelectorAll('.ft-dialog-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const secId = parseInt(input.value, 10);
      if (!secId || secId < 1) { input.focus(); return; }
      overlay.classList.remove('active');
      onConfirm(secId, btn.dataset.mode);
    });
  });

  overlay.classList.add('active');
  setTimeout(() => input.focus(), 50);
}

// ── Start-run section picker ────────────────────────────────────────────────
// Known starts = the book's default start plus every distinct path[0] seen
// across existing playthroughs, filtered down to sections that still exist in
// state.graph - so a start used once by mistake and then deleted from the
// graph drops out of the list on its own, no separate cleanup needed.
export function knownStartSections() {
  const defaultSec = isValidSecId(state.startSection) ? state.startSection : 1;
  const known = new Set();
  if (state.graph[defaultSec] !== undefined) known.add(defaultSec);
  for (const pt of state.playthroughs) {
    const sec = pt.path?.[0];
    if (isValidSecId(sec) && state.graph[sec] !== undefined) known.add(sec);
  }
  return [...known].sort((a, b) => {
    if (a === defaultSec) return -1;
    if (b === defaultSec) return 1;
    return naturalCompare(String(a), String(b));
  });
}

export function showStartPicker(sections) {
  let overlay = document.getElementById('start-picker-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'start-picker-overlay';
    overlay.innerHTML = `
      <div id="start-picker-dialog">
        <div class="ft-dialog-title">${t('runs.pick_start')}</div>
        <div class="ft-dialog-modes" id="start-picker-options"></div>
        <div class="ft-dialog-footer">
          <button id="start-picker-alt" class="ft-dialog-cancel">⚑ ${t('runs.pick_start_custom')}</button>
          <button id="start-picker-cancel" class="ft-dialog-cancel">${t('btn.cancel')}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById('start-picker-cancel').addEventListener('click', () => overlay.classList.remove('active'));
    document.getElementById('start-picker-alt').addEventListener('click', () => {
      overlay.classList.remove('active');
      if (playContext._altStartHandler) playContext._altStartHandler();
    });
    let _mdOnOvl = false;
    overlay.addEventListener('mousedown', e => { _mdOnOvl = e.target === overlay; });
    overlay.addEventListener('click', e => { if (e.target === overlay && _mdOnOvl) overlay.classList.remove('active'); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && overlay.classList.contains('active')) overlay.classList.remove('active');
    });
  }

  const defaultSec = isValidSecId(state.startSection) ? state.startSection : 1;
  const optionsEl = document.getElementById('start-picker-options');
  optionsEl.innerHTML = sections.map(sec =>
    `<button class="ft-dialog-mode-btn" data-sec="${escapeHtml(String(sec))}">` +
      escapeHtml(t('runs.section', { n: sec })) +
      (sec === defaultSec ? ` <span class="start-picker-default-tag">(${escapeHtml(t('runs.pick_start_default'))})</span>` : '') +
    `</button>`
  ).join('');
  optionsEl.querySelectorAll('.ft-dialog-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      overlay.classList.remove('active');
      startPlaythrough(parseSecId(btn.dataset.sec));
    });
  });

  overlay.classList.add('active');
}
