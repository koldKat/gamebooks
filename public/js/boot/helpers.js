import { bootState } from './state.js';
import { renderInventoryDisplay, preloadItems } from '../inventory.js';
import { getVisibleEquippedItems } from '../equipment.js';
import { hideNotesUI } from '../notes.js';

export function _loadingGraphSvg() {
  return `<svg class="feed-loading-graph" viewBox="0 0 32 32">
    <line x1="16" y1="16" x2="6"  y2="7"  stroke="#4b5563" stroke-width="1.8" stroke-linecap="round"/>
    <line x1="16" y1="16" x2="26" y2="7"  stroke="#4b5563" stroke-width="1.8" stroke-linecap="round"/>
    <line x1="16" y1="16" x2="6"  y2="26" stroke="#4b5563" stroke-width="1.8" stroke-linecap="round"/>
    <line x1="16" y1="16" x2="26" y2="26" stroke="#4b5563" stroke-width="1.8" stroke-linecap="round"/>
    <circle class="flg-node flg-n1" cx="6"  cy="7"  r="4" fill="#8e44ad" stroke="#6c3483" stroke-width="1.2"/>
    <circle class="flg-node flg-n2" cx="26" cy="7"  r="4" fill="#e74c3c" stroke="#c0392b" stroke-width="1.2"/>
    <circle class="flg-node flg-n3" cx="6"  cy="26" r="4" fill="#3498db" stroke="#2980b9" stroke-width="1.2"/>
    <circle class="flg-node flg-n4" cx="26" cy="26" r="4" fill="#27ae60" stroke="#1e8449" stroke-width="1.2"/>
    <circle class="flg-center" cx="16" cy="16" r="6" fill="#f5a623" stroke="#c47d00" stroke-width="1.5"/>
  </svg>`;
}

export async function _refreshInvDisplay() {
  await preloadItems();
  const extra = await getVisibleEquippedItems();
  renderInventoryDisplay(extra);
}

export function _cancelForumReveal() {
  if (!bootState._forumRevealPending) return;
  document.getElementById('forum-modal-frame')?.removeEventListener('load', bootState._forumRevealPending);
  bootState._forumRevealPending = null;
}

export function setDiceRollerVisible(v) {
  document.getElementById('dice-roller').classList.toggle('visible', v);
}

export function setGuideVisible(v) {
  document.getElementById('play-bottom-stack').style.display = v ? 'flex' : 'none';
  if (!v) {
    document.getElementById('guide-modal-overlay').classList.remove('active');
    hideNotesUI();
  }
}

export function _toggleShortcutsModal(open) {
  const overlay = document.getElementById('shortcuts-modal-overlay');
  if (!overlay) return;
  const shouldOpen = open ?? !overlay.classList.contains('active');
  overlay.classList.toggle('active', shouldOpen);
}

export function _isMobile() { return window.innerWidth <= 768; }

export function _revealLanding() {
  ['landing-wrapper','landing-bg-a','landing-bg-b','landing-bg-dim'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.visibility = '';
  });
}
