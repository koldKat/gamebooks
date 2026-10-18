import { currentBookId } from '../core/state.js';
import { ALL_PANEL_OVERLAY_IDS, registerPanelShortcut, shortcutLabel } from '../core/util.js';
import { t } from '../i18n.js';

export function initPlayShortcuts() {
  for (const [key, buttonId, overlayId, closeId, label] of [
    ['P', 'party-btn', 'party-modal-overlay', 'party-modal-close', 'party.btn'],
    ['G', 'guide-btn', 'guide-modal-overlay', 'guide-modal-close', 'ctrl.guide'],
    ['N', 'notebook-btn', 'notebook-modal-overlay', 'notebook-modal-cancel', 'notes.notebook_title'],
  ]) {
    const button = document.getElementById(buttonId);
    button.innerHTML = shortcutLabel(t(label));
    button.setAttribute('aria-keyshortcuts', key);
    registerPanelShortcut(`Key${key}`, {
      getButton: () => button,
      getOverlay: () => document.getElementById(overlayId),
      otherOverlayIds: ALL_PANEL_OVERLAY_IDS.filter(id => id !== overlayId),
      open: () => button.click(),
      close: () => document.getElementById(closeId).click(),
      extraGuard: () => !!currentBookId && document.getElementById('main-screen')?.style.display !== 'none',
      capture: true,
    });
  }
}
