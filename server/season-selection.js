'use strict';

// Share the live administrator-selected season across rewards and collectibles.
const events = require('../public/js/seasonal-events/calendar.json');
const { activeSeasons, selectActiveSeasons, seasonOverlapKey } = require('../public/js/seasonal-events/schedule');
let readChoices = () => ({});
function setSeasonChoiceReader(reader) { readChoices = reader; }
function getSeasonChoices() {
  try {
    const choices = readChoices();
    return choices && typeof choices === 'object' && !Array.isArray(choices) ? choices : {};
  } catch { return {}; }
}
function liveSeasons(date = new Date()) { return selectActiveSeasons(events, date, getSeasonChoices()); }
function seasonOverlapStatus(date = new Date()) {
  const candidates = activeSeasons(events, date), key = seasonOverlapKey(candidates);
  return { candidates, key, chosen: getSeasonChoices()[key] || null, active: liveSeasons(date)[0]?.id || null };
}
module.exports = { setSeasonChoiceReader, getSeasonChoices, liveSeasons, seasonOverlapStatus };
