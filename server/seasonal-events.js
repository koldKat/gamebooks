'use strict';

// Mandatory seasonal XP bonuses, determined by the server's Sofia calendar.
const events = require('../public/js/seasonal-events/calendar.json');
const calendar = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Sofia', month: 'numeric', day: 'numeric',
});

function seasonalXpMultiplier(event, date = new Date()) {
  const parts = calendar.formatToParts(date);
  const day = Number(parts.find(part => part.type === 'month').value) * 100
    + Number(parts.find(part => part.type === 'day').value);
  const active = events.find(season => (season.start <= season.end
    ? day >= season.start && day <= season.end
    : day >= season.start || day <= season.end) && season.xpEvents.includes(event));
  return active?.xpMultiplier || 1;
}

module.exports = { seasonalXpMultiplier };
