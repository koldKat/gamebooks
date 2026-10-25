import { loadFixtureRoster } from '../roster-fixtures.mjs';
await loadFixtureRoster(550);
import test from 'node:test';
import assert from 'node:assert/strict';
import {createUrowenSimState} from '../../../../public/js/battlesim/engines/urowen/state.js';
import {createUrowenMission} from '../../../../public/js/battlesim/engines/urowen/forms.js';
import {recoverUrowenDefeat} from '../../../../public/js/battlesim/engines/urowen/recovery.js';
function lost(){const state=createUrowenSimState();state.character.life=0;state.character.experience=3;
  state.character.earnedExperience=8;state.fight={status:'loss'};return state;}
test('recovery applies the printed EP cost without erasing earned progress or history',()=>{
  const state=lost();state.history=[{status:'loss',outcome:'loss',ts:1}];
  const out=recoverUrowenDefeat(state);
  assert.equal(out.character.experience,2);assert.equal(out.character.earnedExperience,8);
  assert.equal(out.character.life,20);assert.equal(out.fight,null);assert.deepEqual(out.history,state.history);
  assert.equal(state.character.life,0);assert.equal(state.character.experience,3);
});
test('mission recovery retains spent power and the mission pool without granting the transformation again',()=>{
  const state=lost();state.temporary=createUrowenMission(state.character);
  state.temporary.player.life=-3;state.temporary.player.power=0;
  const out=recoverUrowenDefeat(state);
  assert.equal(out.temporary.stage,'mission');assert.equal(out.temporary.player.life,100);
  assert.equal(out.temporary.player.power,0);
});
test('armour penalty damages one whole chest piece and cannot select absent protection',()=>{
  const state=lost();state.character.armor=[2,4,4,4,2,2];
  const out=recoverUrowenDefeat(state,{penalty:'armor',armorLocation:3});
  assert.deepEqual(out.character.armor,[2,3,3,3,2,2]);
  assert.throws(()=>recoverUrowenDefeat(lost(),{penalty:'armor',armorLocation:6}),/No armour/);
});
test('discarding a tracked bag item or potion consumes it once, never a free fabricated item',()=>{
  const state=lost();state.character.net=true;state.character.potions=[{quantity:2,dice:1,bonus:4}];
  assert.equal(recoverUrowenDefeat(state,{penalty:'item',item:'net'}).character.net,false);
  assert.equal(recoverUrowenDefeat(state,{penalty:'item',item:'potion'}).character.potions[0].quantity,1);
  assert.equal(state.character.net,true);
  assert.throws(()=>recoverUrowenDefeat(state,{penalty:'item',item:'horse'}),/Unknown tracked/);
});
test('recovery cannot be repeated after a defeat is cleared or during an active fight',()=>{
  const recovered=recoverUrowenDefeat(lost());
  assert.throws(()=>recoverUrowenDefeat(recovered),/No defeated/);
  const active=lost();active.fight.status='fighting';assert.throws(()=>recoverUrowenDefeat(active),/No defeated/);
});
