import { loadFixtureRoster } from '../roster-fixtures.mjs';
await loadFixtureRoster(550);
import test from 'node:test';
import assert from 'node:assert/strict';
import {applyUrowenWeaponHit} from '../../../../public/js/battlesim/engines/urowen/weapons.js';
import {createUrowenCharacter,changeUrowenExperience} from '../../../../public/js/battlesim/engines/urowen/core.js';
import {createUrowenMission} from '../../../../public/js/battlesim/engines/urowen/forms.js';
import {UROWEN_SOURCE} from '../../../../public/js/battlesim/engines/urowen/roster.js';
import {compileUrowenEncounters,createUrowenSimState,prepareUrowenEncounter} from '../../../../public/js/battlesim/engines/urowen/state.js';
import {startUrowenEncounter,resolveUrowenEncounterRound} from '../../../../public/js/battlesim/engines/urowen/rounds.js';

function hit(enemy,effect,rawDamage,location=2,damage=1) {
  return applyUrowenWeaponHit(enemy,{effect},{rawDamage,location,damage});
}
test('printed weapon effects trigger only on wounds and the matching die',()=>{
  for(const effect of ['critical','trident','bonebreaker','lockOn','scepter']) {
    assert.deepEqual(hit({},effect,6,6,0),{});
  }
  assert.deepEqual(hit({},'critical',5),{});
  assert.equal(hit({},'critical',6).weaponBleeding,1);
  assert.equal(hit({},'trident',6).weaponBleeding,2);
  assert.equal(hit(hit({},'bonebreaker',6),'bonebreaker',6).brokenBones,2);
  assert.equal(hit({},'lockOn',2,6).headLocked,true);
  assert.equal(hit({},'scepter',5).weaponBleeding,1);
  assert.equal(hit({},'scepter',6).brokenBones,1);
});
test('Sagrast mission equips all three printed weapon effects',()=>{
  const mission=createUrowenMission(createUrowenCharacter());
  assert.equal(mission.player.weapon.effect,'scepter');
  assert.deepEqual(mission.player.weapon.reroll,[1]);
});
test('dragon bone ring grants power every three earned EP without changing the life threshold',()=>{
  const input=createUrowenCharacter();input.dragonBoneRing=true;
  const state=changeUrowenExperience(input,3);
  assert.equal(state.power,input.power+1);assert.equal(state.maxLife,input.maxLife);
  assert.equal(input.power,0);assert.equal(input.earnedExperience,0);
  assert.equal(changeUrowenExperience(createUrowenCharacter(),3).power,0);
});
test('head lock skips later location dice and bone penalties accumulate per enemy',()=>{
  const spec=compileUrowenEncounters(UROWEN_SOURCE).find(row=>row.section===101);
  let state=prepareUrowenEncounter(createUrowenSimState(createUrowenCharacter()),spec);
  state.fight.player.career=null;
  state.fight.player.attributes.SK=20;
  state.fight.player.weapon={attribute:'SK',bonus:0,reroll:[],effect:'scepter'};
  state.fight.enemies[0].life=100;
  state=startUrowenEncounter(state);
  const roll=(values)=>()=>{assert.ok(values.length,'Unexpected die');return values.shift();};
  state=resolveUrowenEncounterRound(state,roll([6,1,6,6])).state;
  assert.equal(state.fight.enemies[0].headLocked,true);
  assert.equal(state.fight.enemies[0].brokenBones,1);
  const values=[6,1,6];
  const output=resolveUrowenEncounterRound(state,roll(values));
  assert.equal(values.length,0);
  assert.equal(output.result.location,6);
  assert.equal(output.state.fight.enemies[0].brokenBones,2);
  assert.equal(output.state.fight.enemies[1].headLocked,undefined);
  assert.equal(output.state.fight.enemies[1].brokenBones,undefined);
  assert.equal(state.fight.enemies[0].brokenBones,1);
});
test('weapon bleeding ends an enemy before rolling and never transfers to the next',()=>{
  const spec=compileUrowenEncounters(UROWEN_SOURCE).find(row=>row.section===101);
  let state=prepareUrowenEncounter(createUrowenSimState(createUrowenCharacter()),spec);
  state.fight.enemies[0].life=2;state.fight.enemies[0].weaponBleeding=2;
  state=startUrowenEncounter(state);
  const output=resolveUrowenEncounterRound(state,()=>assert.fail('No roll after bleeding death'));
  assert.equal(output.state.fight.target,1);
  assert.equal(output.state.fight.enemies[1].weaponBleeding,undefined);
});
