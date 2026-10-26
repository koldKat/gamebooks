import test from 'node:test';
import assert from 'node:assert/strict';
import {createDestinyFight,startDestinyRound,rollDestinySpeed,resolveDestinySpeed,rollDestinyDamage,resolveDestinyDamage,endDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {configureDestinyAbilities,useDestinyAbility} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {HEART_ABILITIES as catalog} from '../../../public/js/battlesim/engines/destinyquest/heart-abilities.js';
import {captureDestinyAbsorbedAbility,destinyEnemyAbilityCatalog,destinyAbsorbedCandidates,consumeDestinyAbsorbedAbility} from '../../../public/js/battlesim/engines/destinyquest/enemy-absorption.js';
import {onDestinyOpponentHealthHit,destinyPassiveEffects} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
const settings={target:0,categories:['sp','co'],delayRounds:1,ignoreWeaponCareerRequirements:true};
function setup(abilities={}){
  const f=configureDestinyAbilities(createDestinyFight({speed:30,brawn:0,magic:0,armour:20,health:60,maxHealth:60},[{speed:5,brawn:1,armour:10,health:100}]),abilities,{}, {catalog,bookRules:{deathMoves:false,deathPenalties:false}});
  f.encounter={enemyAbsorption:structuredClone(settings)};return f;
}
const capture=(f,name)=>captureDestinyAbsorbedAbility(f,name,catalog[name]);

test('successful Speed and Combat activations are captured once, while modifiers and rejected actions are not',()=>{
  let f=startDestinyRound(setup({fearless:1,cunning:1,piercing:1}),0);
  f=useDestinyAbility(f,'fearless');f=useDestinyAbility(f,'cunning');
  assert.equal(f.enemyAbilityState.queue.length,1);assert.equal(f.enemyAbilityState.queue[0].availableRound,2);
  assert.deepEqual(destinyAbsorbedCandidates(f),[]);
  const before=structuredClone(f);assert.throws(()=>useDestinyAbility(f,'fearless'),/category|uses/);assert.deepEqual(f,before);
  f=resolveDestinySpeed(rollDestinySpeed(f,rolls(6,5,1,2)));f=useDestinyAbility(f,'piercing');
  assert.deepEqual(f.enemyAbilityState.queue.map(e=>e.name),['fearless','piercing']);
});

test('repeat activations produce separate FIFO entries and save/resume preserves their eligibility rounds',()=>{
  let f=startDestinyRound(setup({reckless:1}),0);f=useDestinyAbility(f,'reckless');
  f=endDestinyRound(resolveDestinyDamage(rollDestinyDamage(resolveDestinySpeed(rollDestinySpeed(f,rolls(6,5,4,1,2))),rolls(1))));
  f=useDestinyAbility(startDestinyRound(f,0),'reckless');
  f=JSON.parse(JSON.stringify(f));assert.deepEqual(f.enemyAbilityState.queue.map(e=>[e.id,e.availableRound]),[[1,2],[2,3]]);
  assert.deepEqual(destinyAbsorbedCandidates(f).map(e=>e.id),[1]);f.round=3;assert.deepEqual(destinyAbsorbedCandidates(f).map(e=>e.id),[1,2]);
});

test('an unavailable earlier ability does not block the first later ability whose description permits use',()=>{
  const f=setup();f.round=1;capture(f,'charge');f.round=2;capture(f,'fearless');f.round=3;f.phase='speed';
  assert.deepEqual(destinyAbsorbedCandidates(f).map(e=>e.name),['fearless']);
  assert.throws(()=>consumeDestinyAbsorbedAbility(f,1),/not available/);
});

test('opponent winning/losing and post-hit conditions use the opponent perspective',()=>{
  const f=setup();f.round=1;for(const name of ['piercing','dodge','rust','retaliation'])capture(f,name);
  f.round=2;f.phase='damage';f.turn={winner:'hero',healthDamage:0};assert.deepEqual(destinyAbsorbedCandidates(f).map(e=>e.name),['dodge']);
  f.turn.winner='opponent';assert.deepEqual(destinyAbsorbedCandidates(f).map(e=>e.name),['piercing']);
  f.phase='end';f.turn.healthDamage=2;assert.deepEqual(destinyAbsorbedCandidates(f).map(e=>e.name),['rust']);
  f.turn.winner='hero';assert.deepEqual(destinyAbsorbedCandidates(f).map(e=>e.name),['retaliation']);
});

test('consuming one copied ability exhausts only that category for the current round',()=>{
  const f=setup();f.round=1;for(const name of ['fearless','quicksilver','piercing'])capture(f,name);
  f.round=2;f.phase='speed';consumeDestinyAbsorbedAbility(f,1);assert.deepEqual(destinyAbsorbedCandidates(f),[]);
  f.phase='damage';f.turn={winner:'opponent'};assert.deepEqual(destinyAbsorbedCandidates(f).map(e=>e.name),['piercing']);
  f.round=3;f.phase='speed';assert.deepEqual(destinyAbsorbedCandidates(f).map(e=>e.name),['quicksilver']);
});

test('weapon/career exemptions leave first-round, companion and control conditions intact and never alter the player catalog',()=>{
  const before=structuredClone(catalog),enemy=destinyEnemyAbilityCatalog(catalog,settings);
  assert.equal(enemy['focused-strike'].requiresWeaponHands,undefined);assert.equal(enemy['blood-hail'].requires,undefined);
  assert.equal(enemy.charge.firstRound,true);assert.equal(enemy['blessed-bullets'].requiresCompanion,'virgil');assert.equal(enemy.backstab.requiresControlTrigger,true);
  assert.deepEqual(catalog,before);
  const f=setup();f.round=1;capture(f,'blessed-bullets');f.round=2;f.phase='damage';f.turn={winner:'opponent'};
  assert.deepEqual(destinyAbsorbedCandidates(f),[]);
});

test('Boiling Blood begins only on actual enemy score/dice damage and grows to the printed cap without resetting',()=>{
  for(const kind of ['score','dice']){
    const f=startDestinyRound(setup(),0);f.encounter.growingStatusOnHit={target:0,kinds:['score','dice'],name:'Boiling blood',increment:1,maximum:4};
    onDestinyOpponentHealthHit(f,0,0,kind);onDestinyOpponentHealthHit(f,0,1,'passive');assert.equal(f.encounter.growingStatus,undefined);
    onDestinyOpponentHealthHit(f,0,1,kind);
    for(const [round,expected] of [[1,1],[2,2],[3,3],[4,4],[5,4],[8,4]]){
      f.round=round;onDestinyOpponentHealthHit(f,0,2,kind);
      assert.equal(destinyPassiveEffects(f,rolls()).find(e=>e.source==='Boiling blood').amount,expected);
    }
    assert.equal(f.encounter.growingStatus.from,1);
  }
});
