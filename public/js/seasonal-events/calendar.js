// Annual calendar for seasonal decorations, using the player's local date.
import events from './calendar.json' with { type: 'json' };
export const seasonalEvents = events;

export function activeSeasonalEvent(date = new Date()) {
  const day = (date.getMonth() + 1) * 100 + date.getDate();
  return seasonalEvents.find(event => event.start <= event.end
    ? day >= event.start && day <= event.end
    : day >= event.start || day <= event.end) || null;
}
