// Give simulator panels an isolated display copy when no editable run exists.
import {state, viewingPt, currentBookId, currentPlaythrough as activeRun,
  saveState as saveActiveState, apiFetch as fetchActive} from '../core/state.js';
export {currentBookId} from '../core/state.js';

let snapshot, source, book, owner;
export const isReadOnlySimulator = () => !activeRun();
export function currentPlaythrough() {
  const active = activeRun();
  if (active) {snapshot = source = book = owner = undefined; return active;}
  if (!snapshot || source !== viewingPt || book !== currentBookId || owner !== state) {
    source = viewingPt; book = currentBookId; owner = state;
    snapshot = structuredClone(viewingPt ?? {path:[], startedAt:0, completed:true});
  }
  return snapshot;
}
export function saveState(...args) {
  if (isReadOnlySimulator()) return Promise.resolve();
  return saveActiveState(...args);
}
export function apiFetch(url, options = {}) {
  if (isReadOnlySimulator() && (options.method ?? 'GET').toUpperCase() !== 'GET') {
    return Promise.resolve(new Response(null, {status:403}));
  }
  return fetchActive(url, options);
}
