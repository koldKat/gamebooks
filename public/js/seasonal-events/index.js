// Activate seasonal decorations on their annual dates and honor player settings.
import { activeSeasonalEvent } from './calendar.js';
import { seasonalEventsEnabled, syncSeasonalEventSetting } from './preferences.js';
import { createPumpkin } from './pumpkin.js';
import { createHalloweenBackground } from './background.js';

let stopCurrent;
export function initSeasonalEvents({ now = () => new Date(), random = Math.random } = {}) {
  if (stopCurrent) return stopCurrent;
  const pointer = matchMedia('(any-pointer: fine)');
  let decoration, background, midnight;
  function refresh() {
    clearTimeout(midnight);
    const date = now();
    const active = !document.hidden && seasonalEventsEnabled() && activeSeasonalEvent(date)?.id === 'halloween';
    if (active && pointer.matches && !decoration) decoration = createPumpkin({ random });
    if ((!active || !pointer.matches) && decoration) { decoration(); decoration = null; }
    if (active && !background) background = createHalloweenBackground();
    if (!active && background) { background(); background = null; }
    syncSeasonalEventSetting();
    const tomorrow = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    midnight = setTimeout(refresh, Math.max(1000, tomorrow - date + 100));
  }
  function storage(event) {
    if (event.key === 'seasonal-events' || event.key === null) refresh();
  }
  window.addEventListener('seasonal-events-change', refresh);
  window.addEventListener('storage', storage);
  document.addEventListener('visibilitychange', refresh);
  pointer.addEventListener('change', refresh);
  stopCurrent = () => {
    clearTimeout(midnight); decoration?.(); background?.();
    window.removeEventListener('seasonal-events-change', refresh);
    window.removeEventListener('storage', storage);
    document.removeEventListener('visibilitychange', refresh);
    pointer.removeEventListener('change', refresh);
    stopCurrent = null;
  };
  refresh();
  return stopCurrent;
}

initSeasonalEvents();
