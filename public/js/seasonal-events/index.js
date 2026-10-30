// Activate seasonal decorations on their annual dates and honor player settings.
import { activeSeasonalEvents, seasonalEvents, nextSeasonalRefreshDelay, reloadSeasonalCalendar } from './calendar.js';
import { seasonalEventsEnabled, syncSeasonalEventSetting } from './preferences.js';
import { seasonalThemes } from './themes.js';
import { seasonPreview, isSeasonPreviewStorageKey } from './preview.js';
import { renderSeasonalNotice } from './notice.js';
import { recordSeenCompanion } from './collectibles.js';

let stopCurrent;
export function initSeasonalEvents({ now = () => new Date(), random = Math.random, getPreview = seasonPreview } = {}) {
  if (stopCurrent) return stopCurrent;
  const pointer = matchMedia('(any-pointer: fine)');
  let decoration, midnight, countdown, themeId;
  let stopped = false, calendarRequest;
  function reconcileCalendar() {
    if (calendarRequest) return;
    calendarRequest = reloadSeasonalCalendar()
      .then(() => { if (!stopped) refresh(); })
      .catch(() => {}) // Keep the last valid calendar when offline.
      .finally(() => { calendarRequest = null; });
  }
  function refresh() {
    clearTimeout(midnight);
    clearTimeout(countdown);
    const date = now();
    const override = getPreview();
    const preview = override === 'off' || (Object.hasOwn(seasonalThemes, override)
      && seasonalEvents.some(event => event.id === override)) ? override : null;
    const events = preview ? seasonalEvents.filter(event => event.id === preview) : activeSeasonalEvents(date);
    const event = events[0];
    renderSeasonalNotice(events, preview, date);
    if(!preview&&!document.hidden&&events.some(event=>event.window?.end))countdown=setTimeout(refresh,60000-date.getTime()%60000+50);
    // Keep the mouse companion and its action timers when returning to this tab.
    const landing = document.getElementById('landing-wrapper');
    const visible = !landing || (getComputedStyle(landing).display !== 'none' && getComputedStyle(landing).visibility !== 'hidden');
    const active = seasonalEventsEnabled() && visible && !!seasonalThemes[event?.id];
    const nextTheme = active ? event.id : null;
    if (themeId !== nextTheme) { decoration?.(); decoration = null; themeId = nextTheme; }
    if (active && pointer.matches && !decoration) decoration = seasonalThemes[event.id].cursor({ random, preview:!!preview, onSeen:recordSeenCompanion });
    if ((!active || !pointer.matches) && decoration) { decoration(); decoration = null; }
    syncSeasonalEventSetting();
    midnight = setTimeout(refresh, nextSeasonalRefreshDelay(date));
  }
  function storage(event) {
    if (event.key === 'seasonal-events' || isSeasonPreviewStorageKey(event.key)) refresh();
  }
  window.addEventListener('seasonal-events-change', refresh);
  window.addEventListener('seasonal-preview-change', refresh);
  window.addEventListener('app-config-changed', reconcileCalendar);
  window.addEventListener('storage', storage);
  document.addEventListener('visibilitychange', refresh);
  pointer.addEventListener('change', refresh);
  const landing = document.getElementById('landing-wrapper');
  const landingChanges = new MutationObserver(refresh);
  if (landing) landingChanges.observe(landing, { attributes:true, attributeFilter:['style','class'] });
  stopCurrent = () => {
    stopped = true;
    clearTimeout(midnight); clearTimeout(countdown); decoration?.();
    landingChanges.disconnect();
    const notice = document.getElementById('seasonal-event-notice');
    if (notice) notice.hidden = true;
    window.removeEventListener('seasonal-events-change', refresh);
    window.removeEventListener('seasonal-preview-change', refresh);
    window.removeEventListener('app-config-changed', reconcileCalendar);
    window.removeEventListener('storage', storage);
    document.removeEventListener('visibilitychange', refresh);
    pointer.removeEventListener('change', refresh);
    stopCurrent = null;
  };
  refresh();
  return stopCurrent;
}

initSeasonalEvents();
