'use strict';

// Mandatory seasonal XP bonuses, determined by the server's Sofia calendar.
const events = require('../public/js/seasonal-events/calendar.json');
const { activeSeasons } = require('../public/js/seasonal-events/schedule.js');

function seasonalXpMultiplier(event, date = new Date()) {
  // Preview preferences never reach this path. Overlapping bonuses do not multiply.
  return Math.max(1, ...activeSeasons(events, date)
    .filter(season => season.xpEvents.includes('*') || season.xpEvents.includes(event)).map(season => season.xpMultiplier));
}

module.exports = { seasonalXpMultiplier };
