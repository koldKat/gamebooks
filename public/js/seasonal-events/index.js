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
    const event = activeSeasonalEvent(date);
    const notice = document.getElementById('seasonal-event-notice');
    if (notice) {
      const text = event ? `${event.title}: ${event.description}` : '';
      if (notice.textContent !== text) {
        notice.replaceChildren();
        if (event) {
          const title = document.createElement('strong');
          title.textContent = event.title + ':';
          notice.append(title, ' ');
          for (const part of event.description.split(/(losses|battle deaths)/)) {
            if (part === 'losses' || part === 'battle deaths') {
              const emphasis = document.createElement('span');
              emphasis.className = part === 'losses' ? 'seasonal-event-loss' : 'seasonal-event-battle-death';
              emphasis.textContent = part; notice.append(emphasis);
            } else notice.append(part);
          }
        }
      }
      notice.hidden = !text;
    }
    const active = !document.hidden && seasonalEventsEnabled() && event?.id === 'halloween';
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
    const notice = document.getElementById('seasonal-event-notice');
    if (notice) notice.hidden = true;
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
