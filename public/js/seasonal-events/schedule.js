// Resolve fixed and year-specific festival windows on Europe/Sofia calendar days.
const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Sofia', year: 'numeric', month: 'numeric', day: 'numeric',
});
const DAY = 86400000;
export function seasonalDay(date = new Date()) {
  const parts = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day);
}
const iso = stamp => new Date(stamp).toISOString().slice(0, 10);
export function seasonWindow(season, year) {
  if (season.dates) {
    const date = season.dates[year];
    if (!date) return null;
    const center = Date.parse(date + 'T00:00:00Z');
    const radius = season.daysAround ?? 3;
    return { start: iso(center - radius * DAY), end: iso(center + radius * DAY), center: date };
  }
  const stamp = (value, y) => Date.UTC(y, Math.floor(value / 100) - 1, value % 100);
  const start = stamp(season.start, year);
  const end = stamp(season.end, year + (season.end < season.start ? 1 : 0));
  const centerYear = year + (season.end < season.start && season.day < season.start ? 1 : 0);
  return { start: iso(start), end: iso(end), center: iso(season.day ? stamp(season.day, centerYear) : (start + end) / 2) };
}
export function activeSeasons(events, date = new Date()) {
  const today = seasonalDay(date), key = iso(today), year = new Date(today).getUTCFullYear();
  return events.flatMap(event => {
    const window = [year - 1, year, year + 1].map(y => seasonWindow(event, y))
      .find(window => window && window.start <= key && key <= window.end);
    return window ? [{ ...event, window }] : [];
  }).sort((a, b) => Math.abs(Date.parse(a.window.center) - today) - Math.abs(Date.parse(b.window.center) - today));
}
