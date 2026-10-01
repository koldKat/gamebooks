// render.js - Internal play-screen module; use ../play.js externally.

import { state, viewingPtIndex, currentPlaythrough, currentSection } from '../state.js';
import { syncGraph } from '../graph.js';
import { t } from '../i18n.js';
import { renderCharSheetDisplay } from '../charsheet.js';
import { playContext } from './context.js';
import { updateStats } from './stats.js';

// Registered once by init.js; actions can render without importing the panel.
let renderPanel;
export function setPanelRenderer(fn) { renderPanel = fn; }

export function render() {
  const savedChoices = document.getElementById('choices-input')?.value ?? null;
  syncGraph();
  updateStats();
  renderPanel();
  renderCharSheetDisplay();
  if (savedChoices) {
    const inp = document.getElementById('choices-input');
    if (inp) inp.value = savedChoices;
  }
  const centerBtn = document.getElementById('center-current-btn');
  if (centerBtn) {
    const hasCrossBook = playContext._owIsOpenWorld && !!(playContext._owCrossBookEnabled?.());
    centerBtn.disabled = (!currentPlaythrough() || viewingPtIndex >= 0) && !hasCrossBook;
    // When the active run lives in another book, relabel so it's clear clicking will switch books.
    const localSec = currentSection();
    if (hasCrossBook && !localSec) {
      const loc = playContext._owGetRunLocation?.(state.activePtIndex);
      if (loc?.bookName) {
        centerBtn.textContent = loc.section
          ? t('play.center_open_at', { book: loc.bookName, section: loc.section })
          : t('play.center_open', { book: loc.bookName });
      } else {
        centerBtn.textContent = t('play.center_default');
      }
    } else {
      centerBtn.textContent = t('play.center_default');
    }
  }
  playContext._afterRenderFns.forEach(fn => fn());
}
