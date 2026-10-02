// completion.js - Internal play-screen module; use ../play.js externally.

import { state, setViewingPt, saveState, isValidSecId, currentPlaythrough, currentSection } from '../core/state.js';
import { _scheduleRewardProfileRefresh } from '../progression/rewards.js';
import { render } from './render.js';

export function endPlaythrough(result) {
  const pt = currentPlaythrough();
  if (!pt) return;
  const sec = currentSection();
  pt.completed        = true;
  pt.result           = result;
  pt.completedAt      = Date.now();
  state.activePtIndex = null;
  setViewingPt(pt);
  // A battle loss ends this run, not the section; do not mark it as a graph-wide dead end.
  if (result !== 'battle' && sec !== null && isValidSecId(sec)) {
    if (!state.graph[sec]) state.graph[sec] = { choices: [] };
    const sentinel = (result === 'success') ? 0 : -1;
    if (!state.graph[sec].choices.includes(sentinel))
      state.graph[sec].choices.push(sentinel);
  }
  // Refresh rewards after completion to update bars and floaters.
  saveState();
  _scheduleRewardProfileRefresh();
  render();
}
