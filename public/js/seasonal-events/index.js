// Activate seasonal decorations on their annual dates and honor player settings.
import { activeSeasonalEvent, nextSeasonalRefreshDelay } from './calendar.js';
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
          for (const part of event.description.split(/(sim battle losses|battle deaths|losses)/)) {
            if (part === 'losses' || part === 'sim battle losses' || part === 'battle deaths') {
              const emphasis = document.createElement('span');
              emphasis.className = part === 'battle deaths' ? 'seasonal-event-battle-death' : 'seasonal-event-loss';
              emphasis.textContent = part; notice.append(emphasis);
            } else notice.append(part);
          }
        }
      }
      notice.hidden = !text;
    }
    // Keep the same artwork and scatter when a tab is backgrounded and restored.
    // The cursor handles visibility itself; recreating decorations would randomize them.
    const active = seasonalEventsEnabled() && event?.id === 'halloween';
    if (active && pointer.matches && !decoration) decoration = createPumpkin({ random });
    if ((!active || !pointer.matches) && decoration) { decoration(); decoration = null; }
    if (active && !background) background = createHalloweenBackground();
    if (!active && background) { background(); background = null; }
    syncSeasonalEventSetting();
    midnight = setTimeout(refresh, nextSeasonalRefreshDelay(date));
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
