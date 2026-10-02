// completion.js - Internal play-screen module; use ../play.js externally.

import { state, setViewingPt, saveState, isValidSecId, currentPlaythrough, currentSection } from '../state.js';
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
  // Add the outcome sentinel to this node's choices so edge/node colouring reflects it.
  // Skip for 'battle': a simulated combat loss ends THIS run, but the book section
  // itself may have real, not-yet-recorded branches - recording it as a graph-wide
  // dead end would wrongly auto-end every future run that lands on this node.
  if (result !== 'battle' && sec !== null && isValidSecId(sec)) {
    if (!state.graph[sec]) state.graph[sec] = { choices: [] };
    const sentinel = (result === 'success') ? 0 : -1;
    if (!state.graph[sec].choices.includes(sentinel))
      state.graph[sec].choices.push(sentinel);
  }
  // Ending a run never fed the reward-snapshot system at all (unlike adding
  // a book/note/favorite, which all call scheduleRewardProfileRefresh) - so
  // finishing a run never fired the XP/coin floater the way every other
  // reward-earning action does. Same fire-and-forget pattern those use.
  saveState();
  _scheduleRewardProfileRefresh();
  render();
}
