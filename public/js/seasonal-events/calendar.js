// Annual seasonal calendar and automatic day changes, using the server's Sofia date.
import events from './calendar.json' with { type: 'json' };
import { activeSeasons, nextSeason, seasonWindow } from './schedule.js';
export { seasonWindow, availableSeasonWindows } from './schedule.js';
export const seasonalEvents = events;
export async function reloadSeasonalCalendar() {
  const response = await fetch(new URL('./calendar.json', import.meta.url), { cache: 'no-cache' });
  if (!response.ok) throw new Error('Seasonal calendar unavailable');
  const next = await response.json();
  if (!Array.isArray(next) || next.some(event => !event || typeof event.id !== 'string'
    || typeof event.title !== 'string' || typeof event.description !== 'string'
    || (event.dates ? Object.entries(event.dates).some(([year, date]) =>
      !/^\d{4}$/.test(year) || !new RegExp(`^${year}-\\d{2}-\\d{2}$`).test(date)
      || !Number.isFinite(Date.parse(date + 'T00:00:00Z')))
      : event.rule ? !Number.isInteger(event.rule.weekday) || event.rule.weekday < 0 || event.rule.weekday > 6
        || (event.rule.day !== undefined ? !Number.isInteger(event.rule.day) || event.rule.day < 1 || event.rule.day > 28
          : !Number.isInteger(event.rule.month) || event.rule.month < 1 || event.rule.month > 12
            || !Number.isInteger(event.rule.occurrence) || event.rule.occurrence < 1 || event.rule.occurrence > 4)
      : !Number.isInteger(event.start) || !Number.isInteger(event.end)
        || event.start < 101 || event.start > 1231 || event.end < 101 || event.end > 1231))) {
    throw new Error('Invalid seasonal calendar');
  }
  seasonalEvents.splice(0, seasonalEvents.length, ...next);
}
const calendar = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Sofia', year: 'numeric', month: 'numeric', day: 'numeric',
});

function calendarDay(date) {
  const parts = Object.fromEntries(calendar.formatToParts(date).map(part => [part.type, part.value]));
  return { key: `${parts.year}-${parts.month}-${parts.day}`, day: Number(parts.month) * 100 + Number(parts.day) };
}

export function nextSeasonalRefreshDelay(date = new Date()) {
  // Find the next Sofia midnight, including the 23/25-hour daylight-saving days.
  const start = date.getTime(), today = calendarDay(date).key;
  let low = start, high = start + 26 * 60 * 60 * 1000;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (calendarDay(new Date(middle)).key === today) low = middle;
    else high = middle;
  }
  return high - start + 100;
}

export function activeSeasonalEvent(date = new Date()) {
  return activeSeasonalEvents(date)[0] || null;
}
export function activeSeasonalEvents(date = new Date()) { return activeSeasons(seasonalEvents, date); }
export function nextSeasonalEvent(date = new Date()) { return nextSeason(seasonalEvents, date); }
