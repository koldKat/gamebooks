'use strict';

// Mandatory seasonal XP bonuses, determined by the server's Sofia calendar.
const events = require('../public/js/seasonal-events/calendar.json');
const { activeSeasons } = require('../public/js/seasonal-events/schedule.js');
const { seasonalContributionEligible } = require('./db/seasonal-contributions');
const { isPartyXpContext } = require('./seasonal-party-context');

function seasonalXpSeasons(event, date = new Date(), context = null) {
  if (context && !seasonalContributionEligible(context.db, event, context.ref)) return [];
  return activeSeasons(events, date)
    .filter(season => season.xpMultiplier > 1 && (season.xpEvents.includes('*')
      || season.xpEvents.includes(event) || (season.partyXpEvents && isPartyXpContext(context))));
}

function seasonalXpMultiplier(event, date = new Date(), context = null) {
  // Preview preferences never reach this path. Overlapping bonuses do not multiply.
  return Math.max(1, ...seasonalXpSeasons(event, date, context).map(season => season.xpMultipliers?.[event] ?? season.xpMultiplier));
}

module.exports = { seasonalXpMultiplier, seasonalXpSeasons };
