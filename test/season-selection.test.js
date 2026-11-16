'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const events = require('../public/js/seasonal-events/calendar.json');
const { activeSeasons, selectActiveSeasons, seasonOverlapKey } = require('../public/js/seasonal-events/schedule');
const { setSeasonChoiceReader, liveSeasons } = require('../server/season-selection');
const { seasonalXpMultiplier } = require('../server/seasonal-events');

test('one occurrence-scoped choice controls the live festival and its XP bonuses', t => {
  const date = new Date('2027-10-31T12:00:00Z');
  const candidates = activeSeasons(events, date);
  assert.ok(candidates.some(event => event.id === 'diwali'));
  assert.ok(candidates.some(event => event.id === 'halloween'));
  const key = seasonOverlapKey(candidates);
  setSeasonChoiceReader(() => ({ [key]: 'diwali' }));
  t.after(() => setSeasonChoiceReader(() => ({})));
  assert.deepEqual(liveSeasons(date).map(event => event.id), ['diwali']);
  assert.equal(seasonalXpMultiplier('win_run', date), 2);
  assert.equal(seasonalXpMultiplier('death_run', date), 1);
  setSeasonChoiceReader(() => ({ [key]: 'halloween' }));
  assert.equal(seasonalXpMultiplier('win_run', date), 1);
  assert.equal(seasonalXpMultiplier('death_run', date), 2);
  assert.equal(liveSeasons(new Date('2026-11-08T12:00:00Z'))[0].id, 'diwali', 'choices do not apply to other occurrences');
});

test('Friday the 13th cannot displace any overlapping regular festival', () => {
  const date = new Date('2026-11-13T12:00:00Z');
  const extra = { id: 'future', title: 'Future', start: 1113, end: 1113 };
  const calendar = [...events, extra];
  const candidates = activeSeasons(calendar, date);
  assert.equal(candidates.some(event => event.id === 'friday-13'), false);
  assert.deepEqual(selectActiveSeasons(calendar, date, { [seasonOverlapKey(candidates)]: 'friday-13' }).map(event => event.id), ['future']);
});
