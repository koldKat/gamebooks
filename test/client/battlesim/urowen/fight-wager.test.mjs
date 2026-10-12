import test from 'node:test';
import assert from 'node:assert/strict';
import {stakeUrowenFight,settleUrowenFight} from '../../../../public/js/battlesim/engines/urowen/bets.js';
import {UROWEN_SOURCE} from '../../../../public/js/battlesim/engines/urowen/roster.js';
import {compileUrowenEncounters,createUrowenSimState,prepareUrowenEncounter} from '../../../../public/js/battlesim/engines/urowen/state.js';
import {startUrowenEncounter,resolveUrowenEncounterRound} from '../../../../public/js/battlesim/engines/urowen/rounds.js';
function prepared(section=262) {
  const state=prepareUrowenEncounter(createUrowenSimState(),compileUrowenEncounters(UROWEN_SOURCE).find(row=>row.section===section));
  state.character.coins=1000;return state;
}
test('Ciishdor accepts unlimited affordable stakes once, without changing the input',()=>{
  const input=prepared(),state=stakeUrowenFight(input,500);
  assert.equal(input.character.coins,1000);assert.equal(state.character.coins,500);
  assert.throws(()=>stakeUrowenFight(state,500),/unavailable/);
  assert.throws(()=>stakeUrowenFight(input,1001),/unaffordable/);
  assert.throws(()=>stakeUrowenFight(input,1.5),/Invalid/);
  assert.throws(()=>stakeUrowenFight(prepared(27),1),/unavailable/);
});
test('victory returns twice the stake exactly once through the real round controller',()=>{
  let state=stakeUrowenFight(prepared(),500);
  state.fight.player.attributes.STR=20;state.fight.player.career=null;
  state.fight.enemies[0].life=1;
  state=startUrowenEncounter(state);
  const values=[6,1,6,6];
  state=resolveUrowenEncounterRound(state,()=>values.shift()).state;
  assert.equal(state.fight.status,'win');assert.equal(state.character.coins,1500);
  assert.equal(state.fight.wager.paid,true);
  settleUrowenFight(state);assert.equal(state.character.coins,1500);
});
test('loss forfeits the stake and an unfinished encounter cannot claim a payout',()=>{
  const state=stakeUrowenFight(prepared(),500);
  settleUrowenFight(state);assert.equal(state.fight.wager.paid,false);
  state.fight.status='loss';settleUrowenFight(state);
  assert.equal(state.character.coins,500);assert.equal(state.fight.wager.paid,true);
  assert.equal(state.fight.wager.returned,0);
});
