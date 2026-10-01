// runs.js - Internal play-screen module; use ../play.js externally.

import { state, viewingPt, setViewingPt, saveState, isValidSecId, currentPlaythrough, currentSection, apiFetch } from '../state.js';
import { network, visNodes } from '../graph.js';
import { t } from '../i18n.js';
import { instantiateLoadout } from '../equipment.js';
import { showConfirm } from '../confirm.js';
import { playContext } from './context.js';
import { render } from './render.js';
import { wouldAutoNav } from './navigation.js';

export function startPlaythrough(entrySection = null) {
  const sheet = state.charSheetTemplate
    ? JSON.parse(JSON.stringify(state.charSheetTemplate))
    : { fields: [] };
  const startSec = isValidSecId(entrySection) ? entrySection : (isValidSecId(state.startSection) ? state.startSection : 1);
  const { inventory: invTmpl, equipment: eqTmpl, equipmentVisible: eqVisTmpl } = instantiateLoadout();
  state.playthroughs.push({ path: [startSec], completed: false, result: null, undosUsed: 0, fastTravelsUsed: 0, startedAt: Date.now(), charSheet: sheet, inventory: invTmpl, equipment: eqTmpl, equipmentVisible: eqVisTmpl, diceState: { count: state.dicePrefs?.count ?? 2, die: state.dicePrefs?.die ?? 6, lastResult: null } });
  state.activePtIndex = state.playthroughs.length - 1;
  // Fire AFTER the new playthrough is active, so the viewing-pt-change callback
  // (which refreshes #inv-display and the charsheet) reflects the new run's
  // inventory/equipment instead of the stale previous state.
  setViewingPt(null, true);
  saveState();
  render();
  const newPt     = state.playthroughs[state.activePtIndex];
  const focusSec  = newPt?.path.at(-1) ?? startSec;
  // See wouldAutoNav's own doc comment - this used to be unconditional,
  // which is what let it stack on top of the auto-nav chain's own focus()
  // calls (see the graph physics jitter investigation for the full story).
  if (network && !wouldAutoNav(focusSec, newPt)) {
    const bookState = state, focusNetwork = network;
    setTimeout(() => {
      if (state !== bookState || network !== focusNetwork || currentPlaythrough() !== newPt || currentSection() !== focusSec || wouldAutoNav(focusSec, newPt)) return;
      focusNetwork.focus(focusSec, { scale: Math.max(focusNetwork.getScale(), 1.2), animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
    }, 50);
  }
}

// runIndex: the series-level run index being resumed. charSheet: the shared charsheet to apply.
export function startPortalRun(entrySection, runIndex, charSheet = null) {
  const entrySec = isValidSecId(entrySection) ? entrySection : (isValidSecId(state.startSection) ? state.startSection : 1);

  // Activate the specific run index (guaranteed to exist after series sync)
  let pt = state.playthroughs[runIndex];
  if (pt) {
    // Un-pause a portal-paused run, or activate a placeholder (path may be empty)
    pt.completed = false;
    pt.result    = null;
    delete pt.portalTarget;
    if (!pt.startedAt) pt.startedAt = Date.now(); // stamp first activation in this book
    state.activePtIndex = runIndex;
    if (!state.graph[entrySec]) state.graph[entrySec] = { choices: [], discovered: true };
    const wasEmpty = pt.path.length === 0;
    if (wasEmpty || pt.path[pt.path.length - 1] !== entrySec) pt.path.push(entrySec);
    if (wasEmpty) pt.portalEntry = true;
    if (!pt.inventory || !pt.equipment) {
      const { inventory: invTmpl, equipment: eqTmpl, equipmentVisible: eqVisTmpl } = instantiateLoadout();
      if (!pt.inventory) pt.inventory = invTmpl;
      if (!pt.equipment) { pt.equipment = eqTmpl; pt.equipmentVisible = eqVisTmpl; }
    }
    if (charSheet) pt.charSheet = JSON.parse(JSON.stringify(charSheet));
    // Fire AFTER the run is active, so the viewing-pt-change callback refreshes
    // #inv-display/charsheet from the now-current playthrough, not the stale one.
    setViewingPt(null, true);
    saveState();
    render();
    if (network && !wouldAutoNav(entrySec, pt)) network.focus(entrySec, { animation: true, scale: 1.2 });
    return;
  }

  // Fallback: pad playthroughs to the required index and create a new run
  while (state.playthroughs.length <= runIndex) {
    const { inventory: invTmpl, equipment: eqTmpl, equipmentVisible: eqVisTmpl } = instantiateLoadout();
    state.playthroughs.push({ path: [], completed: false, result: null, undosUsed: 0, fastTravelsUsed: 0, startedAt: Date.now(), charSheet: { fields: [] }, inventory: invTmpl, equipment: eqTmpl, equipmentVisible: eqVisTmpl, diceState: { count: state.dicePrefs?.count ?? 2, die: state.dicePrefs?.die ?? 6, lastResult: null } });
  }
  pt = state.playthroughs[runIndex];
  pt.charSheet = JSON.parse(JSON.stringify(charSheet || state.charSheetTemplate || { fields: [] }));
  state.activePtIndex = runIndex;
  if (!state.graph[entrySec]) state.graph[entrySec] = { choices: [], discovered: true };
  pt.portalEntry = true;
  pt.path.push(entrySec);
  setViewingPt(null, true);
  saveState();
  render();
  if (network && !wouldAutoNav(entrySec, pt)) network.focus(entrySec, { animation: true, scale: 1.2 });
}

export function loadRun(index) {
  const pt = state.playthroughs[index];
  if (!pt) return;
  if (pt.completed && pt.result !== 'portal') {
    // Normally completed - view only
    setViewingPt(pt);
    state.activePtIndex = null;
    saveState();
    render();
  } else {
    // Placeholder or in-progress run
    state.activePtIndex = index;
    // Fire AFTER activation, so the viewing-pt-change callback refreshes
    // #inv-display/charsheet from this run, not the previously-active one.
    setViewingPt(null, true);
    saveState();
    render();
    const sec = pt.path.length > 0 ? pt.path[pt.path.length - 1] : null;
    if (sec && network && visNodes?.get(sec) && !wouldAutoNav(sec, pt)) network.focus(sec, { animation: true, scale: 1.2 });
    if (playContext._onRunActivated) playContext._onRunActivated(index);
  }
}

export function deleteRun(index) {
  const bookState = state;
  const pt = state.playthroughs[index];
  if (!pt) return;
  showConfirm(t('confirm.delete_run', { n: index + 1 }), async () => {
    // Confirmation must still refer to the same book and run slot.
    if (state !== bookState || state.playthroughs[index] !== pt) return;
    if (viewingPt === state.playthroughs[index]) setViewingPt(null);
    state.playthroughs.splice(index, 1);
    if (state.activePtIndex === index) {
      state.activePtIndex = null;
    } else if (state.activePtIndex > index) {
      state.activePtIndex -= 1;
    }
    saveState();
    if (playContext._owIsOpenWorld && playContext._owSeriesId !== null) {
      const seriesId = playContext._owSeriesId, onRunDeleted = playContext._onRunDeleted;
      await apiFetch(`/api/series/${seriesId}/runs/${index}`, { method: 'DELETE' }).catch(() => {});
      if (state !== bookState || playContext._owSeriesId !== seriesId || playContext._onRunDeleted !== onRunDeleted) return;
      if (onRunDeleted) onRunDeleted(index);
    }
    render();
  });
}
