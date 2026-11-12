'use strict';

// Scope seasonal party bonuses to XP earned while processing that party's book.
const { AsyncLocalStorage } = require('node:async_hooks');
const events = require('../public/js/seasonal-events/calendar.json');
const { activeSeasons } = require('../public/js/seasonal-events/schedule');
const awards = new AsyncLocalStorage();

function withPartyXpContext(db, userId, bookId, award, date = new Date()) {
  if (!activeSeasons(events, date).some(season => season.partyXpEvents)) return award();
  const party = db.prepare(`SELECT 1 FROM user_books mine
    WHERE mine.user_id=? AND mine.book_id=? AND mine.party_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM user_books other WHERE other.party_id=mine.party_id
        AND other.book_id=mine.book_id AND other.user_id<>mine.user_id)`).get(userId, bookId);
  return awards.run(party ? { db, userId, bookId } : null, award);
}

function isPartyXpContext(context) {
  const party = awards.getStore();
  return !!party && (!context || (context.db === party.db && context.userId === party.userId));
}

module.exports = { withPartyXpContext, isPartyXpContext };
