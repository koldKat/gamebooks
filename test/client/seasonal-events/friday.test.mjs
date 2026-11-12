import test from 'node:test';
import assert from 'node:assert/strict';
import {activeSeasons, availableSeasonWindows, seasonWindows, nextSeason} from '../../../public/js/seasonal-events/schedule.js';
import {seasonalEvents} from '../../../public/js/seasonal-events/calendar.js';
const friday = seasonalEvents.find(event => event.id === 'friday-13');

test('every Friday the 13th has exactly the day before and after, at Sofia midnight', () => {
  assert.deepEqual(seasonWindows(friday, 2026).map(w => w.center), ['2026-02-13','2026-03-13','2026-11-13']);
  for (const [stamp, active] of [['2026-11-11T21:59:59Z',false],['2026-11-11T22:00:00Z',true],
    ['2026-11-14T21:59:59Z',true],['2026-11-14T22:00:00Z',false]]) {
    assert.equal(activeSeasons(seasonalEvents, new Date(stamp)).some(e => e.id === friday.id), active, stamp);
  }
  for (const year of [2027,2035,2100]) for (const window of seasonWindows(friday, year)) {
    assert.equal(new Date(window.center).getUTCDay(),5);
    assert.equal(new Date(window.center).getUTCDate(),13);
    assert.equal(Date.parse(window.end)-Date.parse(window.start),2*86400000);
  }
});

test('any overlap skips the entire occurrence, including newly plugged-in events', () => {
  for (const day of [12,13,14]) {
    const other = {id:'future-event',start:1100+day,end:1100+day};
    const events = [friday, other];
    assert.equal(availableSeasonWindows(events,friday,2026).some(w=>w.center==='2026-11-13'),false);
    for(const d of [12,13,14]) assert.equal(activeSeasons(events,new Date(`2026-11-${d}T12:00:00Z`)).some(e=>e.id===friday.id),false);
    assert.notEqual(nextSeason(events,new Date('2026-11-01T12:00:00Z'))?.id,friday.id);
  }
  assert.equal(availableSeasonWindows(seasonalEvents,friday,2026).some(w=>w.center==='2026-11-13'),true);
  assert.equal(availableSeasonWindows(seasonalEvents,friday,2030).some(w=>w.center==='2030-12-13'),false);
});
