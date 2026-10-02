// navigation.js - Internal play-screen module; use ../play.js externally.

import { state, saveState, isTerminal, currentPlaythrough, allDiscoveredSections } from '../core/state.js';
import { network } from '../graph.js';
import { t } from '../i18n.js';
import { showAlert } from '../ui-helpers/confirm.js';
import { playContext } from './context.js';
import { render } from './render.js';
import { endPlaythrough } from './completion.js';
import { maxUndos } from './limits.js';

// Skip focus when rendering will immediately auto-navigate, avoiding competing camera animations.
export function wouldAutoNav(sec, pt) {
  const secData = state.graph[sec];
  return !(playContext._suppressAutoNavDepth > 0) && secData?.choices.length === 1 && !isTerminal(secData.choices[0]) && !pt?.path.includes(secData.choices[0]) && !(playContext._owIsOpenWorld && secData.portals?.length);
}

export function navigate(sec) {
  const pt = currentPlaythrough();
  if (!pt) return;
  if (isTerminal(sec)) {
    endPlaythrough(sec === 0 ? 'success' : 'death');
    return;
  }
  if (state.alphanumericSections && state.totalSections > 0) {
    const discovered = allDiscoveredSections();
    if (!discovered.has(sec) && discovered.size >= state.totalSections) {
      showAlert(t('play.reached_section_limit', { limit: state.totalSections }));
      return;
    }
  }
  pt.path.push(sec);
  pt.lastActionAt = Date.now();
  saveState();
  render();
  // Skip camera animation when auto-navigation will immediately leave the section.
  if (network && !wouldAutoNav(sec, pt)) network.focus(sec, { animation: true, scale: 1.2 });
}
export function undoRun() {
  const pt = currentPlaythrough();
  if (!pt) return;
  const used = pt.undosUsed || 0;
  if (used >= maxUndos() || pt.path.length <= 1) return;
  // Undo past forced nodes; stop at metadata only when auto-navigation will not advance again.
  pt.path.pop();
  while (pt.path.length > 1) {
    const node = state.graph[pt.path[pt.path.length - 1]];
    if (!node || node.choices.length !== 1) break; // real decision point, dead end, or missing node
    const hasMetadata = node.note || node.priority || node.battle || node.color || node.portals || node.showNote || node.manual;
    const wouldAutoNavHere = !isTerminal(node.choices[0]) && !pt.path.includes(node.choices[0]) && !(playContext._owIsOpenWorld && node.portals?.length);
    if (hasMetadata && !wouldAutoNavHere) break;
    pt.path.pop();
  }
  pt.undosUsed = used + 1;
  pt.lastActionAt = Date.now();
  saveState();
  render();
  const sec = pt.path[pt.path.length - 1];
  if (network && !wouldAutoNav(sec, pt)) network.focus(sec, { animation: true, scale: 1.2 });
}
