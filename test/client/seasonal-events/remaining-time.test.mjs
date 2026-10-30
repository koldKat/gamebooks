import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seasonalEndTime,formatSeasonalRemaining} from '../../../public/js/seasonal-events/remaining-time.js';
test('ETE ends at the first Sofia midnight after the last inclusive day, including DST',()=>{
 for(const [day,stamp]of [['2026-11-03','2026-11-03T22:00:00Z'],['2027-01-04','2027-01-04T22:00:00Z'],['2026-03-29','2026-03-29T21:00:00Z'],['2026-10-25','2026-10-25T22:00:00Z']]){
  assert.equal(seasonalEndTime({window:{end:day}}),Date.parse(stamp));
 }
 assert.equal(seasonalEndTime({}),null);
});
test('remaining time is compact, advances by minutes and never becomes negative',()=>{
 const end=Date.parse('2026-11-03T22:00:00Z');
 assert.equal(formatSeasonalRemaining(end,end-(3*1440+5*60+17)*60000),'3d 5h 17m');
 assert.equal(formatSeasonalRemaining(end,end-61000),'2m');
 assert.equal(formatSeasonalRemaining(end,end-59000),'<1m');
 assert.equal(formatSeasonalRemaining(end,end),'0m');
 assert.equal(formatSeasonalRemaining(end,end+1),'0m');
});
