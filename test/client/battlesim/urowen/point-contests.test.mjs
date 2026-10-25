import { loadFixtureRoster } from '../roster-fixtures.mjs';
await loadFixtureRoster(550);
import test from 'node:test';
import assert from 'node:assert/strict';
import {createUrowenPointContest,resolveUrowenPointRound} from '../../../../public/js/battlesim/engines/urowen/contests.js';
import {startUrowenPointBet,rollUrowenPointBet,startUrowenDrinkingBet,rollUrowenDrinkingBet} from '../../../../public/js/battlesim/engines/urowen/bets.js';
import {createUrowenSimState} from '../../../../public/js/battlesim/engines/urowen/state.js';
const dice=(...values)=>()=>{assert.ok(values.length,'Unexpected die');return values.shift();};
test('knife throwing favours low rolls, preserves ties and finishes at five points',()=>{
  let state=createUrowenPointContest(53);
  state=resolveUrowenPointRound(state,dice(2,2)).contest;
  assert.equal(state.playerPoints,0);assert.equal(state.enemyPoints,0);
  for(let i=0;i<5;i++)state=resolveUrowenPointRound(state,dice(1,6)).contest;
  assert.equal(state.status,'finished');assert.equal(state.winner,'player');
  assert.throws(()=>resolveUrowenPointRound(state,dice(1,6)),/finished/);
});
test('Nine favours the highest total not exceeding nine and both busts tie',()=>{
  let state=createUrowenPointContest(72);
  state=resolveUrowenPointRound(state,dice(6,4,6,6)).contest;
  assert.equal(state.playerPoints,0);assert.equal(state.enemyPoints,0);
  state=resolveUrowenPointRound(state,dice(4,5,4,4)).contest;
  assert.equal(state.playerPoints,1);
  state=resolveUrowenPointRound(state,dice(6,4,1,1)).contest;
  assert.equal(state.enemyPoints,1);
});
test('point wagers cap stakes at fifteen, pay once and respect printed opponent counts',()=>{
  for(const [section,limit] of [[53,3],[72,2]]) {
    let state=createUrowenSimState();state.character.coins=100;
    assert.throws(()=>startUrowenPointBet(state,section,16),/Invalid wager/);
    for(let game=0;game<limit;game++) {
      state=startUrowenPointBet(state,section,10);
      assert.throws(()=>startUrowenPointBet(state,section,10),/Finish/);
      for(let round=0;round<5;round++)state=rollUrowenPointBet(state,section===53?dice(1,6):dice(4,5,1,1)).state;
      assert.equal(state.contest.paid,true);
      assert.throws(()=>rollUrowenPointBet(state,dice(1,1)),/No active/);
    }
    assert.equal(state.character.coins,100+limit*10);
    assert.equal(state.history.length,0);
    assert.throws(()=>startUrowenPointBet(state,section,10),/No opponents/);
  }
});
test('drinking accepts arbitrary affordable wagers instead of treating the source example as a fixed price',()=>{
  let state=createUrowenSimState();state.character.coins=1000;
  state=startUrowenDrinkingBet(state,400);
  assert.equal(state.character.coins,600);assert.equal(state.contest.stake,400);
  state.contest.enemyResistance=1;
  state=rollUrowenDrinkingBet(state,dice(1,6)).state;
  assert.equal(state.character.coins,1800);
});
