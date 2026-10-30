// Annual seasonal calendar and automatic day changes, using the server's Sofia date.
import events from './calendar.json' with { type: 'json' };
export const seasonalEvents = events;
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
  const { day } = calendarDay(date);
  return seasonalEvents.find(event => event.start <= event.end
    ? day >= event.start && day <= event.end
    : day >= event.start || day <= event.end) || null;
}
