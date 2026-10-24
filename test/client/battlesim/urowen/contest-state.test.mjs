import { loadFixtureRoster } from '../roster-fixtures.mjs';
await loadFixtureRoster(550);
import {UROWEN_SOURCE} from '../../../../public/js/battlesim/engines/urowen/roster.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createUrowenCharacter} from '../../../../public/js/battlesim/engines/urowen/core.js';
import {createUrowenSimState} from '../../../../public/js/battlesim/engines/urowen/state.js';
import * as bets from '../../../../public/js/battlesim/engines/urowen/bets.js';
const rows=UROWEN_SOURCE.animals.map(row=>({...row,role:'betting-creature'}));
const animals=section=>rows.filter(row=>row.section===section&&row.role==='betting-creature');
function character(career='warrior') {
  const state=createUrowenSimState(createUrowenCharacter({career}));state.character.coins=100;return state;
}
function sequence(...rolls) {let i=0;return ()=>{assert.ok(i<rolls.length);return rolls[i++];};}
test('stake is deducted once before an animal contest, leaving player life unchanged',()=>{
  const state=character(),out=bets.startUrowenAnimalBet(state,56,animals(56),{stake:20,selected:'Hurg'});
  assert.equal(out.character.coins,80);assert.equal(out.character.life,20);assert.equal(state.character.coins,100);
  assert.throws(()=>bets.startUrowenAnimalBet(out,56,animals(56)),/Finish or reset/);
});
test('a completed Hurg win returns stake plus equal profit exactly once',()=>{
  let state=bets.startUrowenAnimalBet(character(),56,animals(56),{stake:20,selected:'Hurg'});
  state.contest.animals[1].life=4;
  const out=bets.rollUrowenAnimalBet(state,sequence(6,1,6,6));
  assert.equal(out.state.character.coins,120);assert.equal(out.state.contest.paid,true);
  assert.equal(out.state.history.length,0);
  assert.throws(()=>bets.rollUrowenAnimalBet(out.state,()=>1),/No active/);
});
test('Grinkot pays half-stake profit and thief gets five extra even on a lost bet',()=>{
  let state=bets.startUrowenAnimalBet(character(),56,animals(56),{stake:20,selected:'Grinkot'});
  state.contest.animals[0].life=4;
  assert.equal(bets.rollUrowenAnimalBet(state,sequence(1,6,6,6)).state.character.coins,110);
  state=bets.startUrowenAnimalBet(character('thief'),56,animals(56),{stake:20,selected:'Grinkot'});
  state.contest.animals[1].life=4;
  assert.equal(bets.rollUrowenAnimalBet(state,sequence(6,1,6,6)).state.character.coins,85);
});
test('animal contest does not accept odd, excessive, unaffordable or invalid selections',()=>{
  for(const stake of [-1,1,21,22,200])assert.throws(()=>bets.startUrowenAnimalBet(character(),56,animals(56),{stake}));
  assert.throws(()=>bets.startUrowenAnimalBet(character(),129,animals(129),{selected:'Hurg'}),/Invalid animal/);
});
test('scorpion contest ends at zero rather than the dog contest three-life threshold',()=>{
  let state=bets.startUrowenAnimalBet(character(),129,animals(129),{stake:20,selected:'Scorpion'});
  state.contest.animals[1].life=3;
  let out=bets.rollUrowenAnimalBet(state,sequence(6,1,2,3));
  assert.equal(out.state.contest.status,'fighting');assert.equal(out.state.contest.animals[1].life,2);
  out=bets.rollUrowenAnimalBet(out.state,sequence(6,1,6,6));
  assert.equal(out.state.contest.status,'finished');assert.equal(out.state.character.coins,120);
});
test('drinking contest deducts exactly thirty, uses temporary resistance, and returns ninety on victory',()=>{
  const original=character();let state=bets.startUrowenDrinkingBet(original);
  assert.equal(state.character.coins,70);assert.equal(state.contest.playerResistance,40);
  assert.equal(state.contest.enemyResistance,54);
  state.contest.enemyResistance=1;
  const out=bets.rollUrowenDrinkingBet(state,sequence(1,6));
  assert.equal(out.state.character.coins,160);assert.equal(out.state.character.life,20);
  assert.equal(out.state.contest.paid,true);assert.equal(original.character.coins,100);
  assert.throws(()=>bets.rollUrowenDrinkingBet(out.state,()=>1),/No active/);
});
test('a lost drinking contest does not take the stake twice or reduce actual player life',()=>{
  let state=bets.startUrowenDrinkingBet(character());state.contest.playerResistance=1;
  const out=bets.rollUrowenDrinkingBet(state,sequence(6,1));
  assert.equal(out.state.contest.status,'loss');assert.equal(out.state.character.coins,70);
  assert.equal(out.state.character.life,20);assert.equal(out.state.history.length,0);
});
test('drinking cannot start with insufficient coins or while an actual fight is active',()=>{
  const state=character();state.character.coins=29;
  assert.throws(()=>bets.startUrowenDrinkingBet(state),/unaffordable/);
  state.character.coins=100;state.fight={status:'fighting'};
  assert.throws(()=>bets.startUrowenDrinkingBet(state),/Finish or reset/);
});
