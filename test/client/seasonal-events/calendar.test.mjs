import test from 'node:test';
import assert from 'node:assert/strict';
import { activeSeasonalEvent, nextSeasonalRefreshDelay } from '../../../public/js/seasonal-events/calendar.js';

test('Halloween runs from October 28 through November 3, inclusive, every year', () => {
  for (const year of [2026, 2027, 2028]) {
    assert.equal(activeSeasonalEvent(new Date(`${year}-10-27T20:59:00Z`)), null);
    for (const [month, day] of [[9,28],[9,29],[9,30],[9,31],[10,1],[10,2],[10,3]]) {
      assert.equal(activeSeasonalEvent(new Date(Date.UTC(year, month, day, 12)))?.id, 'halloween');
    }
    assert.equal(activeSeasonalEvent(new Date(`${year}-11-03T21:59:00Z`))?.id, 'halloween');
    assert.equal(activeSeasonalEvent(new Date(`${year}-11-03T22:00:00Z`)), null);
    assert.equal(activeSeasonalEvent(new Date(`${year}-01-01T12:00:00Z`)), null);
  }
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
