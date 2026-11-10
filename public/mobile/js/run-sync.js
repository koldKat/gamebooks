// Keep the mobile reader's run current with saves from other tabs, devices and party members.
import { state, currentBookId, getToken, bookClientId, loadState } from '../../js/core/state.js';
import { connectEventStream } from '../../js/core/event-stream.js';

export function connectRunSync(bookId, { isCurrent, onState, onPositions }) {
  let stopped = false, timer = null, refreshing = false, again = false, keepPositions = true, failures = 0;
  const authToken = getToken();
  const active = () => !stopped && authToken === getToken() && isCurrent() && currentBookId === bookId;
  const refresh = async (preservePositions = true) => {
    if (!active()) return;
    clearTimeout(timer); timer = null;
    again = true; keepPositions &&= preservePositions;
    if (refreshing) return;
    refreshing = true;
    try {
      while (again && active()) {
        again = false;
        const preserve = keepPositions, previous = state;
        keepPositions = true;
        try {
          await loadState(bookId, { isCurrent: active, protectLocalChanges: true, preservePositions: preserve });
          if (!active()) return;
          await onState(previous);
          failures = 0;
        } catch (error) { keepPositions &&= preserve; throw error; }
      }
    } catch (_) {
      if (active()) timer = setTimeout(() => refresh(keepPositions), Math.min(1000 * 2 ** Math.min(failures++, 5), 30000));
    } finally { refreshing = false; }
  };
  const stream = connectEventStream(() => `/api/books/${bookId}/stream?token=${encodeURIComponent(getToken())}&client=${encodeURIComponent(bookClientId)}`, {
    enabled: active,
    onOpen: () => refresh(false),
    onMessage: event => {
      if (!active()) return;
      let data;
      try { data = JSON.parse(event.data); } catch (_) { return; }
      if (String(data.bookId) !== String(bookId) && data.type !== 'party_changed') return;
      if (data.type === 'positions_updated') onPositions(data.positions || {});
      else if (data.type === 'state_updated') refresh();
      else if (data.type === 'party_changed') stream.resume(true);
    },
  });
  const stop = () => {
    stopped = true; clearTimeout(timer); stream.close();
    window.removeEventListener('pageshow', resume);
  };
  const resume = event => { if (event.persisted) stream.resume(true); };
  window.addEventListener('pageshow', resume);
  return stop;
}
