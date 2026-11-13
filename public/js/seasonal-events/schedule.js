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
  if (season.rule?.day !== undefined) return seasonWindows(season, year)[0] ?? null;
  if (season.rule) {
    const {month, weekday, occurrence} = season.rule;
    const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const day = 1 + (weekday - first + 7) % 7 + (occurrence - 1) * 7;
    const center = Date.UTC(year, month - 1, day), radius = season.daysAround ?? 3;
    return {start: iso(center - radius * DAY), end: iso(center + radius * DAY), center: iso(center)};
  }
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
// Several occurrences in one year, such as every Friday the 13th.
export function seasonWindows(season, year) {
  if (season.rule?.day === undefined) return [seasonWindow(season, year)].filter(Boolean);
  const { day, weekday } = season.rule, radius = season.daysAround ?? 0;
  return Array.from({length:12}, (_, month) => Date.UTC(year, month, day))
    .filter(center => new Date(center).getUTCDay() === weekday)
    .map(center => ({start:iso(center-radius*DAY),end:iso(center+radius*DAY),center:iso(center)}));
}
export function availableSeasonWindows(events, event, year) {
  const windows = seasonWindows(event, year);
  if (!event.skipOverlaps) return windows;
  const others = events.filter(other => other.id !== event.id).flatMap(other =>
    [year-1,year,year+1].flatMap(y => seasonWindows(other,y)));
  return windows.filter(window => !others.some(other => window.start <= other.end && other.start <= window.end));
}
export function activeSeasons(events, date = new Date()) {
  const today = seasonalDay(date), key = iso(today), year = new Date(today).getUTCFullYear();
  return events.flatMap(event => {
    const window = [year - 1, year, year + 1].flatMap(y => availableSeasonWindows(events,event,y))
      .find(window => window && window.start <= key && key <= window.end);
    return window ? [{ ...event, window }] : [];
  }).sort((a, b) => Math.abs(Date.parse(a.window.center) - today) - Math.abs(Date.parse(b.window.center) - today));
}

// Find the next activation window from calendar data, without event-specific rules.
export function nextSeason(events, date = new Date()) {
  const today = seasonalDay(date), key = iso(today), year = new Date(today).getUTCFullYear();
  const upcoming = events.flatMap(event => {
    const years = event.dates ? Object.keys(event.dates).map(Number).filter(y => y >= year - 1) : [year, year + 1];
    return years.flatMap(y => availableSeasonWindows(events,event,y)).filter(window => window.start > key)
      .map(window => ({...event, window}));
  });
  upcoming.sort((a, b) => a.window.start.localeCompare(b.window.start));
  return upcoming[0] ?? null;
}

// One current or next occurrence per event, ordered for the admin calendar.
export function orderedSeasonOccurrences(events, date = new Date()) {
  const today = seasonalDay(date), key = iso(today), year = new Date(today).getUTCFullYear();
  return events.map(event => {
    const years = event.dates ? Object.keys(event.dates).map(Number).filter(y => y >= year - 1)
      : [year - 1, year, year + 1];
    const window = years.flatMap(y => availableSeasonWindows(events, event, y))
      .filter(window => window.end >= key).sort((a, b) => a.start.localeCompare(b.start))[0] ?? null;
    return { event, window };
  }).sort((a, b) => (a.window?.start ?? '9999-12-31').localeCompare(b.window?.start ?? '9999-12-31'));
}
