'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const events = require('../public/js/seasonal-events/calendar.json');
const { activeSeasons, availableSeasonWindows, selectActiveSeasons, seasonOverlapKey } = require('../public/js/seasonal-events/schedule');
const { setSeasonChoiceReader, liveSeasons } = require('../server/season-selection');
const { seasonalXpMultiplier } = require('../server/seasonal-events');

test('Diwali hands over to Halloween on its main day, including XP', () => {
  const window = id => availableSeasonWindows(events, events.find(e => e.id === id), 2027)[0];
  assert.deepEqual(window('diwali'), {start:'2027-10-26',end:'2027-10-30',center:'2027-10-29'});
  assert.deepEqual(window('halloween'), {start:'2027-10-31',end:'2027-11-03',center:'2027-10-31'});
  for (const [stamp,id,win,death] of [
    ['2027-10-30T20:59:59Z','diwali',2,1],
    ['2027-10-30T21:00:00Z','halloween',1,2],
  ]) {
    const date = new Date(stamp);
    assert.deepEqual(liveSeasons(date).map(e=>e.id),[id]);
    assert.equal(seasonalXpMultiplier('win_run',date),win);
    assert.equal(seasonalXpMultiplier('death_run',date),death);
  }
});
test('Friday the 13th retains its main day before an event on the 14th', () => {
  const calendar=[...events,{id:'future',start:1111,end:1117,day:1114}];
  for(const [day,id] of [[12,'friday-13'],[13,'friday-13'],[14,'future'],[17,'future']])
    assert.deepEqual(activeSeasons(calendar,new Date(`2026-11-${day}T12:00:00Z`)).map(e=>e.id),[id]);
});
test('same main dates retain an occurrence-scoped administrator choice', t => {
  const calendar=events.map(e=>e.id==='diwali'?{...e,dates:{2027:'2027-10-31'}}:e);
  const date=new Date('2027-10-31T12:00:00Z');
  const candidates=activeSeasons(calendar,date),key=seasonOverlapKey(candidates);
  assert.equal(candidates.length,2);
  for(const id of ['diwali','halloween'])
    assert.deepEqual(selectActiveSeasons(calendar,date,{[key]:id}).map(e=>e.id),[id]);
  setSeasonChoiceReader(()=>({[key]:'diwali'}));
  t.after(()=>setSeasonChoiceReader(()=>({})));
  assert.equal(liveSeasons(date)[0].id,'halloween','old choices cannot override a different-date handoff');
});
test('handoffs preserve natural endings and chains across New Year', () => {
  const calendar=[{id:'a',start:1228,end:101,day:1230},{id:'b',start:1230,end:105,day:103},{id:'c',start:102,end:108,day:105}];
  assert.deepEqual(availableSeasonWindows(calendar,calendar[0],2026)[0],{start:'2026-12-28',end:'2027-01-01',center:'2026-12-30'});
  assert.deepEqual(availableSeasonWindows(calendar,calendar[1],2026)[0],{start:'2027-01-02',end:'2027-01-04',center:'2027-01-03'});
  assert.deepEqual(availableSeasonWindows(calendar,calendar[2],2027)[0],{start:'2027-01-05',end:'2027-01-08',center:'2027-01-05'});
});
