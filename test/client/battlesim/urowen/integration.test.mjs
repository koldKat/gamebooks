import {UROWEN_SOURCE} from '../../../../public/js/battlesim/engines/urowen/roster.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createUrowenCharacter} from '../../../../public/js/battlesim/engines/urowen/core.js';
import {compileUrowenEncounters,createUrowenSimState,prepareUrowenEncounter} from '../../../../public/js/battlesim/engines/urowen/state.js';
import {resolveUrowenOpening} from '../../../../public/js/battlesim/engines/urowen/openings.js';
import {startUrowenEncounter,resolveUrowenEncounterRound} from '../../../../public/js/battlesim/engines/urowen/rounds.js';
const encounters=compileUrowenEncounters(UROWEN_SOURCE);
const sourceSnapshot=structuredClone(encounters);
function seeded(seed) {
  return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%6+1;};
}
for(const spec of encounters) {
  test(`source encounter ${spec.section} completes a bounded, immutable full-fight simulation`,()=>{
    const roll=seeded(spec.section+42);
    let state=prepareUrowenEncounter(createUrowenSimState(createUrowenCharacter()),spec);
    state.fight.player.life=200;state.fight.player.maxLife=200;
    state.fight.player.attributes={STR:9,SK:9,MAG:9,PER:9};
    state.fight.player.weapon.bonus=5;
    state=resolveUrowenOpening(state,roll).state;
    if(state.fight.status==='prepared')state=startUrowenEncounter(state);
    let rounds=0;
    while(state.fight.status==='fighting'&&rounds++<400) {
      const before=JSON.stringify(state);
      const next=resolveUrowenEncounterRound(state,roll).state;
      assert.equal(JSON.stringify(state),before);
      state=next;
      assert.ok(Number.isSafeInteger(state.fight.player.life));
      assert.ok(state.fight.enemies.every(enemy=>Number.isSafeInteger(enemy.life)));
      assert.ok(state.log.length<=150);
    }
    assert.ok(rounds<400,'Full-fight simulation did not terminate');
    assert.ok(['win','loss','retreated','escaped','stopped'].includes(state.fight.status));
    assert.equal(state.history.length,1);
    assert.deepEqual(spec,sourceSnapshot.find(row=>row.section===spec.section));
  });
}
function potionFight(section=27,career='alchemist') {
  const character=createUrowenCharacter({career});
  character.potions=[{dice:1,bonus:4,quantity:1}];
  let state=prepareUrowenEncounter(createUrowenSimState(character),encounters.find(row=>row.section===section));
  state.fight.player.attributes.SK=20;state.fight.player.life=1;
  return startUrowenEncounter(state);
}
function sequence(values) {
  let i=0;return ()=>{assert.ok(i<values.length,'Unexpected potion roll');return values[i++];};
}
test('a potion replaces a won attack, adds the alchemist die and consumes one dose',()=>{
  const input=potionFight(),before=structuredClone(input);
  const out=resolveUrowenEncounterRound(input,sequence([6,1,2,3]),{potionIndex:0});
  assert.equal(out.result.healed,9);assert.equal(out.state.fight.player.life,10);
  assert.equal(out.state.character.potions[0].quantity,0);
  assert.equal(out.state.fight.enemies[0].life,input.fight.enemies[0].life);
  assert.deepEqual(input,before);
  assert.throws(()=>resolveUrowenEncounterRound(out.state,sequence([6,1]),{potionIndex:0}),/Potion unavailable/);
});
test('a potion cannot be consumed during a lost attack and cannot bypass item restrictions',()=>{
  const input=potionFight();input.fight.player.attributes.SK=0;
  const out=resolveUrowenEncounterRound(input,sequence([1,6,2,2]),{potionIndex:0});
  assert.equal(out.state.character.potions[0].quantity,1);
  const bare=potionFight(79);
  assert.throws(()=>resolveUrowenEncounterRound(bare,sequence([6,1]),{potionIndex:0}),/Potion unavailable/);
});
test('first-round scene penalty expires after one opposed attack, including a tie',()=>{
  let state=prepareUrowenEncounter(createUrowenSimState(),encounters.find(row=>row.section===135),{firstAttackPenalty:3});
  state.fight.player.attributes.SK=state.fight.enemies[0].attributeValue+3;
  state=startUrowenEncounter(state);
  const first=resolveUrowenEncounterRound(state,sequence([3,3]));
  assert.equal(first.result.playerAttack,first.result.enemyAttack);
  assert.equal(first.state.fight.effects.length,0);
  const second=resolveUrowenEncounterRound(first.state,sequence([3,3,2,2]));
  assert.equal(second.result.playerAttack,second.result.enemyAttack+3);
});
test('negative-life ties continue under the explicit printed exception, without forced defeat',()=>{
  let state=prepareUrowenEncounter(createUrowenSimState(),encounters.find(row=>row.section===27));
  state.fight.player.attributes.SK=state.fight.enemies[0].attributeValue;
  state=startUrowenEncounter(state);state.fight.player.life=-1;state.fight.enemies[0].life=-1;
  const out=resolveUrowenEncounterRound(state,sequence([3,3]));
  assert.equal(out.state.fight.status,'fighting');assert.equal(out.state.fight.player.life,-1);
  assert.equal(out.state.history.length,0);
});
test('the printed magical-greaves example takes three damage and reflects two ignoring armor',()=>{
  let state=prepareUrowenEncounter(createUrowenSimState(),encounters.find(row=>row.section===27));
  state.fight.player.attributes.SK=0;state.fight.player.career=null;
  state.fight.player.magicGreaves=true;state.fight.player.armor[0]=2;
  state.fight.enemies[0].damageBonus=2;
  state.fight.enemies[0].armorByLocation=[99,99,99,99,99,99];
  state=startUrowenEncounter(state);
  const out=resolveUrowenEncounterRound(state,sequence([1,6,1,4]));
  assert.equal(out.result.playerDamage,3);assert.equal(out.result.greavesReflection,2);
  assert.equal(out.state.fight.enemies[0].life,state.fight.enemies[0].life-2);
});
test('greaves do not reflect blows to other locations or attacks that ignore player armor',()=>{
  for(const section of [27,105]) {
    let state=prepareUrowenEncounter(createUrowenSimState(),encounters.find(row=>row.section===section));
    state.fight.player.attributes.SK=0;state.fight.player.career=null;
    state.fight.player.magicGreaves=true;state.fight.player.armor[0]=2;
    state=startUrowenEncounter(state);
    const out=resolveUrowenEncounterRound(state,sequence([1,6,section===105?1:2,4]));
    assert.equal(out.result.greavesReflection,undefined);
  }
});
test('mission armour corrosion persists on the real hero exactly once per hit',()=>{
  const original=createUrowenSimState();original.character.armor=[3,4,4,4,3,3];
  let state=prepareUrowenEncounter(original,encounters.find(row=>row.section===289));
  state.fight.player.attributes.SK=0;state.fight.player.career=null;
  state=startUrowenEncounter(state);
  let out=resolveUrowenEncounterRound(state,sequence([2,6,2,6]));
  assert.deepEqual(out.state.character.armor,[3,3,3,3,3,3]);
  assert.deepEqual(out.state.temporary.player.armor,[3,3,3,3,3,3]);
  out.state.fight.player.attributes.SK=out.state.fight.enemies[0].attributeValue;
  out=resolveUrowenEncounterRound(out.state,sequence([3,3]));
  assert.deepEqual(out.state.character.armor,[3,3,3,3,3,3]);
  assert.deepEqual(original.character.armor,[3,4,4,4,3,3]);
});
test('a possession does not strip the real hero armour merely because the possessed body is unarmoured',()=>{
  const original=createUrowenSimState();original.character.armor=[3,4,4,4,3,3];
  let state=prepareUrowenEncounter(original,encounters.find(row=>row.section===82));
  state.fight.player.attributes.STR=state.fight.enemies[0].attributeValue;
  state=startUrowenEncounter(state);
  const out=resolveUrowenEncounterRound(state,sequence([3,3]));
  assert.deepEqual(out.state.character.armor,original.character.armor);
});
