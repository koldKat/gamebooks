'use strict';

// Mandatory seasonal XP bonuses, determined by the server's Sofia calendar.
const events = require('../public/js/seasonal-events/calendar.json');
const { activeSeasons } = require('../public/js/seasonal-events/schedule.js');

function seasonalXpSeasons(event, date = new Date()) {
  return activeSeasons(events, date)
    .filter(season => season.xpMultiplier > 1 && (season.xpEvents.includes('*') || season.xpEvents.includes(event)));
}

function seasonalXpMultiplier(event, date = new Date()) {
  // Preview preferences never reach this path. Overlapping bonuses do not multiply.
  return Math.max(1, ...seasonalXpSeasons(event, date).map(season => season.xpMultiplier));
}

module.exports = { seasonalXpMultiplier, seasonalXpSeasons };
