import test from 'node:test';
import assert from 'node:assert/strict';
import { activeSeasonalEvent } from '../../../public/js/seasonal-events/calendar.js';

test('Halloween runs from October 28 through November 3, inclusive, every year', () => {
  for (const year of [2026, 2027, 2028]) {
    assert.equal(activeSeasonalEvent(new Date(year, 9, 27, 23, 59)), null);
    for (const [month, day] of [[9,28],[9,29],[9,30],[9,31],[10,1],[10,2],[10,3]]) {
      assert.equal(activeSeasonalEvent(new Date(year, month, day))?.id, 'halloween');
    }
    assert.equal(activeSeasonalEvent(new Date(year, 10, 3, 23, 59))?.id, 'halloween');
    assert.equal(activeSeasonalEvent(new Date(year, 10, 4)), null);
    assert.equal(activeSeasonalEvent(new Date(year, 0, 1)), null);
  }
});
