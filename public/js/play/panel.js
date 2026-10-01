import { currentPlaythrough, currentSection } from '../state.js';
import { renderPanelMarkup } from './markup.js';
import { bindPanelEvents } from './bindings.js';

export function renderPlaythroughPanel() {
  const panel = document.getElementById('playthrough-panel');
  const pt = currentPlaythrough();
  const sec = currentSection();
  panel.innerHTML = renderPanelMarkup(pt, sec);
  bindPanelEvents(panel, pt, sec);
}
