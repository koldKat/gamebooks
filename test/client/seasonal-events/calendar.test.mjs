import test from 'node:test';
import assert from 'node:assert/strict';
import { activeSeasonalEvent, activeSeasonalEvents, seasonalEvents, seasonWindow, nextSeasonalRefreshDelay } from '../../../public/js/seasonal-events/calendar.js';

test('Halloween runs from October 28 through November 3, inclusive, every year', () => {
  for (const year of [2026, 2027, 2028]) {
    assert.equal(activeSeasonalEvents(new Date(`${year}-10-27T20:59:00Z`)).some(event => event.id === 'halloween'), false);
    for (const [month, day] of [[9,28],[9,29],[9,30],[9,31],[10,1],[10,2],[10,3]]) {
      assert.ok(activeSeasonalEvents(new Date(Date.UTC(year, month, day, 12))).some(event => event.id === 'halloween'));
    }
    assert.equal(activeSeasonalEvent(new Date(`${year}-11-03T21:59:00Z`))?.id, 'halloween');
    assert.equal(activeSeasonalEvent(new Date(`${year}-11-03T22:00:00Z`)), null);
    assert.equal(activeSeasonalEvent(new Date(`${year}-01-01T12:00:00Z`)), null);
  }
});

test('Diwali has an inclusive seven-day window around each year’s moving date', () => {
  const diwali = seasonalEvents.find(event => event.id === 'diwali');
  assert.deepEqual(seasonWindow(diwali,2026), {start:'2026-11-05',end:'2026-11-11',center:'2026-11-08'});
  assert.deepEqual(seasonWindow(diwali,2027), {start:'2027-10-26',end:'2027-11-01',center:'2027-10-29'});
  for (const center of Object.values(diwali.dates)) {
    const day = Date.parse(center + 'T10:00:00Z');
    for (let offset = -4; offset <= 4; offset++) {
      assert.equal(activeSeasonalEvents(new Date(day + offset * 86400000)).some(event => event.id === 'diwali'), Math.abs(offset)<=3);
    }
  }
  assert.equal(activeSeasonalEvent(new Date('2026-11-04T21:59:59Z')),null);
  assert.equal(activeSeasonalEvent(new Date('2026-11-04T22:00:00Z'))?.id,'diwali');
  assert.equal(activeSeasonalEvent(new Date('2026-11-11T21:59:59Z'))?.id,'diwali');
  assert.equal(activeSeasonalEvent(new Date('2026-11-11T22:00:00Z')),null);
  assert.equal(seasonWindow(diwali,2040),null); // Never pretend the moving date is fixed.
});

test('overlapping events keep both notices and choose the nearest festival for artwork', () => {
  assert.equal(activeSeasonalEvent(new Date('2027-10-29T12:00:00Z'))?.id,'diwali');
  assert.equal(activeSeasonalEvent(new Date('2027-10-31T12:00:00Z'))?.id,'halloween');
  assert.deepEqual(activeSeasonalEvents(new Date('2027-10-31T12:00:00Z')).map(event=>event.id),['halloween','diwali']);
});

test('open-tab checks schedule both event boundaries on Sofia time', () => {
  for (const [before, after] of [
    ['2026-10-27T21:59:59Z', '2026-10-27T22:00:00Z'],
    ['2026-11-03T21:59:59Z', '2026-11-03T22:00:00Z'],
  ]) {
    assert.equal(nextSeasonalRefreshDelay(new Date(before)), 1100);
    assert.notEqual(activeSeasonalEvent(new Date(before))?.id, activeSeasonalEvent(new Date(after))?.id);
  }
});

test('midnight scheduling follows Sofia daylight-saving changes', () => {
  assert.equal(nextSeasonalRefreshDelay(new Date('2026-03-28T22:00:00Z')), 23 * 3600000 + 100);
  assert.equal(nextSeasonalRefreshDelay(new Date('2026-10-24T21:00:00Z')), 25 * 3600000 + 100);
});
