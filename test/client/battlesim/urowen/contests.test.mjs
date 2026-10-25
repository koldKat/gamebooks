import { loadFixtureRoster } from '../roster-fixtures.mjs';
await loadFixtureRoster(550);
import test from 'node:test';
import assert from 'node:assert/strict';
import * as contests from '../../../../public/js/battlesim/engines/urowen/contests.js';
const rolls=values=>{let index=0;return()=>{assert.ok(index<values.length);return values[index++];};};
const animal=(name,life,damageBonus=0)=>({name,life,attributeValue:1,damageBonus,armorByLocation:[0,0,0,0,0,0]});
test('dog fight stops at three life, not death, and ties do no damage',()=>{
  const c=contests.createUrowenAnimalContest(56,[animal('Hurg',18,-1),animal('Grinkot',4)]);
  const tied=contests.resolveUrowenAnimalRound(c,rolls([3,3]));
  assert.equal(tied.contest.status,'fighting');assert.equal(tied.damage,0);assert.equal(tied.rolls.length,2);
  const won=contests.resolveUrowenAnimalRound(c,rolls([6,1,2,2]));
  assert.equal(won.contest.animals[1].life,3);assert.equal(won.contest.winner,'Hurg');
  assert.equal(won.contest.status,'finished');assert.equal(c.animals[1].life,4);
});
test('scorpion fight stops only at zero life',()=>{
  const c=contests.createUrowenAnimalContest(129,[animal('Scorpion',12,-2),animal('Tarantula',4,-2)]);
  const ongoing=contests.resolveUrowenAnimalRound(c,rolls([6,1,2,3]));
  assert.equal(ongoing.contest.animals[1].life,3);assert.equal(ongoing.contest.status,'fighting');
  const won=contests.resolveUrowenAnimalRound(ongoing.contest,rolls([6,1,2,5]));
  assert.equal(won.contest.animals[1].life,0);assert.equal(won.contest.winner,'Scorpion');
});
test('printed Hurg and Grinkot payouts plus thief bonus on either outcome',()=>{
  assert.deepEqual(contests.urowenBetPayout({section:56,stake:10,winner:'Hurg',selected:'Hurg'}),{returned:20,extra:0});
  assert.deepEqual(contests.urowenBetPayout({section:56,stake:10,winner:'Grinkot',selected:'Grinkot'}),{returned:15,extra:0});
  assert.deepEqual(contests.urowenBetPayout({section:56,stake:10,winner:'Hurg',selected:'Grinkot',thief:true}),{returned:0,extra:5});
  assert.deepEqual(contests.urowenBetPayout({section:56,stake:10,winner:'Hurg',selected:'Hurg',thief:true}),{returned:20,extra:5});
});
test('bets validate even stake and twenty limit only where printed',()=>{
  for(const section of [56,129])for(const stake of [1,3,22]) {
    assert.throws(()=>contests.urowenBetPayout({section,stake,winner:'Hurg',selected:'Hurg'}),RangeError);
  }
  assert.equal(contests.urowenBetPayout({section:262,stake:101,winner:'player',selected:'player'}).returned,202);
  assert.equal(contests.urowenBetPayout({section:129,stake:20,winner:'Scorpion',selected:'Scorpion'}).returned,40);
});
test('drinking payout preserves the printed thirty plus sixty example',()=>{
  assert.deepEqual(contests.urowenBetPayout({section:391,stake:30,winner:'player',selected:'player'}),{returned:90,extra:0});
});
test('drinking uses doubled base life, not current character life',()=>{
  const c=contests.createUrowenDrinkingContest(20);
  assert.equal(c.playerResistance,40);assert.equal(c.enemyResistance,54);
  const next=contests.resolveUrowenDrinkingRound(c,rolls([2,5]));
  assert.equal(next.contest.playerResistance,38);assert.equal(next.contest.enemyResistance,49);
  assert.equal(c.playerResistance,40);assert.equal(c.enemyResistance,54);
});
test('drinking simultaneous losses compare negatives and retain equal-negative ties',()=>{
  const c=contests.createUrowenDrinkingContest(20);c.playerResistance=1;c.enemyResistance=1;
  const tied=contests.resolveUrowenDrinkingRound(c,rolls([3,3]));
  assert.equal(tied.contest.playerResistance,-2);assert.equal(tied.contest.enemyResistance,-2);
  assert.equal(tied.contest.status,'fighting');
  const won=contests.resolveUrowenDrinkingRound(tied.contest,rolls([1,2]));
  assert.equal(won.contest.playerResistance,-3);assert.equal(won.contest.enemyResistance,-4);
  assert.equal(won.contest.status,'win');
});
test('finished contests cannot roll again or duplicate payouts through their round handler',()=>{
  const c=contests.createUrowenAnimalContest(56,[animal('Hurg',18),animal('Grinkot',4)]);
  const finished=contests.resolveUrowenAnimalRound(c,rolls([6,1,2,6])).contest;
  assert.throws(()=>contests.resolveUrowenAnimalRound(finished,rolls([])),RangeError);
});
