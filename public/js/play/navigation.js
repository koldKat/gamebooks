// navigation.js - Internal play-screen module; use ../play.js externally.

import { state, saveState, isTerminal, currentPlaythrough, allDiscoveredSections } from '../state.js';
import { network } from '../graph.js';
import { t } from '../i18n.js';
import { showAlert } from '../ui-helpers/confirm.js';
import { playContext } from './context.js';
import { render } from './render.js';
import { endPlaythrough } from './completion.js';
import { maxUndos } from './limits.js';

// True if landing on `sec` (with `pt`'s current path) will make
// renderPlaythroughPanel() immediately auto-navigate away from it again
// (exactly the condition that function itself checks - see its own choices
// .length===1 branch). Any caller about to call network.focus() right after
// render() on an active playthrough needs this same guard: stacking a
// focus() animation for a section on top of the auto-nav chain's own
// focus() calls (each hop, as it fires) corrupts vis-network's internal
// camera state - it doesn't cleanly resolve on its own, only a full page
// refresh (recreating the Network instance) reliably clears it. Exported so
// every focus()-after-render() call site across boot.js/play.js/
// open-world.js can share one definition instead of each hand-rolling (or,
// as happened for several of them, simply omitting) the same check.
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
  // Skip animation if this section will be immediately auto-navigated away from -
  // stacking multiple 1s vis.js animations corrupts its internal camera state.
  if (network && !wouldAutoNav(sec, pt)) network.focus(sec, { animation: true, scale: 1.2 });
}
export function undoRun() {
  const pt = currentPlaythrough();
  if (!pt) return;
  const used = pt.undosUsed || 0;
  if (used >= maxUndos() || pt.path.length <= 1) return;
  // Pop the current node, then keep popping past any forced (single-choice) nodes
  // until we land on a real decision point or the start of the run. A node with only
  // one recorded choice isn't necessarily a forced passthrough though - it may be a
  // real decision the user just recorded (possibly a wrong one they're undoing right
  // now) - so in principle it's worth stopping at any node carrying metadata rather
  // than silently skipping past it. But stopping there is only actually meaningful if
  // the render pipeline won't immediately auto-navigate straight back through it: once
  // popped, that node's one recorded destination is no longer in pt.path, which is
  // exactly the condition auto-nav fires on (see `wouldAutoNavHere`/choices.length===1
  // check further down) - landing on a metadata node right before its own auto-nav
  // fires just re-plays the undo's own forward step, sending the user right back
  // where they started. So only stop at a metadata node when auto-nav wouldn't
  // immediately fire for it; otherwise keep walking back to a genuine decision point.
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
