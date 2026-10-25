import test from 'node:test';
import assert from 'node:assert/strict';
import {createWinterFight, resolveDestinyAbilityRoll as resolve} from './destinyquest-fixtures.mjs';
import {rollDestinyOpeningTest, startDestinyRound, rollDestinySpeed, resolveDestinySpeed,
  rollDestinyDamage, resolveDestinyDamage, endDestinyRound}
  from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {destinyStat} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
import {useDestinyAbility as use} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';

const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected dice');return values.shift();};
const make=abilities=>createWinterFight({speed:20,brawn:0,armour:99,health:100,maxHealth:100},751,{abilities});
const save=f=>JSON.parse(JSON.stringify(f));
const ready=(face=4,abilities={})=>resolve(rollDestinyOpeningTest(make(abilities),rolls(face)),rolls());
const round=f=>endDestinyRound(resolveDestinyDamage(rollDestinyDamage(resolveDestinySpeed(rollDestinySpeed(
  startDestinyRound(f,0,rolls()),rolls(6,6,1,1))),rolls(1)),rolls()),[],rolls());
const enemyTurn=f=>{f.hero.speed=0;return resolveDestinySpeed(rollDestinySpeed(startDestinyRound(f,0,rolls()),rolls(1,1,6,6)),rolls(3));};

for(const face of [1,2,3,4,5,6])test('wolf timing die '+face+' resolves at the exact scheduled end round',()=>{
  const original=make({}),before=structuredClone(original),pending=rollDestinyOpeningTest(original,rolls(face));
  assert.deepEqual(original,before);assert.equal(pending.round,0);assert.deepEqual(pending.turn.pendingAbility.dice,[face]);
  let fight=resolve(save(pending),rolls());assert.equal(fight.phase,'start');
  assert.equal(fight.encounter.scheduledEndEffects[0].round,face+2);
  assert.throws(()=>rollDestinyOpeningTest(fight,rolls()),/unavailable/);
  for(let n=1;n<=face+2;n++){fight=round(save(fight));assert.equal(fight.opponents[0].health,n<face+2?100:90);}
  assert.equal(destinyStat(fight,0,'magic'),8);fight=round(fight);
  assert.equal(fight.opponents[0].health,90);assert.equal(fight.history.filter(e=>e.type==='scheduled-end-effect').length,1);
});

for(const face of [1,2,3,4,5,6])test('Might of chaos selects the printed branch for face '+face,()=>{
  let fight=ready();fight.opponents[0].health=50;fight=enemyTurn(fight);fight.turn.pendingAbility.dice=[face];
  fight=resolve(save(fight),face>=5?rolls(1,2,3):rolls());
  if(face<=2){assert.equal(fight.opponents[0].health,60);assert.equal(fight.phase,'end');assert.equal(fight.hero.health,100);}
  else if(face<=4){assert.equal(fight.phase,'damage');fight.hero.armour=0;
    fight=resolveDestinyDamage(rollDestinyDamage(fight,rolls(6)),rolls());assert.equal(fight.hero.health,84);}
  else{assert.equal(fight.phase,'ability-rolled');assert.deepEqual(fight.turn.pendingAbility.dice,[1,2,3]);
    fight=resolve(save(fight),rolls());assert.equal(fight.hero.health,94);assert.equal(fight.phase,'end');
    assert.deepEqual(fight.encounter.blockedRounds,{from:2,until:2,categories:['sp','co']});}
});

test('healing cannot exceed Sable original maximum',()=>{
  let fight=enemyTurn(ready());fight.opponents[0].health=97;fight.turn.pendingAbility.dice=[1];
  fight=resolve(fight,rolls());assert.equal(fight.opponents[0].health,100);
});

test('the curse blocks only next-round speed and combat abilities, leaving modifiers available',()=>{
  let fight=enemyTurn(ready(6,{radiance:1,gouge:1,cunning:1}));fight.turn.pendingAbility.dice=[6];
  fight=resolve(resolve(fight,rolls(1,1,1)),rolls());fight=endDestinyRound(fight,[],rolls());
  fight=startDestinyRound(fight,0,rolls());assert.throws(()=>use(fight,'radiance',{},rolls()),/blocked/);
  assert.throws(()=>use(fight,'gouge',{},rolls()),/blocked/);fight=use(fight,'cunning',{},rolls());assert.equal(fight.used.cunning,1);
  fight.phase='end';fight=endDestinyRound(fight,[],rolls());fight=startDestinyRound(fight,0,rolls());
  assert.equal(use(fight,'radiance',{},rolls()).used.radiance,1);
});

test('the initial saved timing die can be rerolled without starting combat or duplicating the schedule',()=>{
  let fight=rollDestinyOpeningTest(make({charm:1}),rolls(1));fight=use(fight,'charm',{die:0},rolls(6));
  fight=resolve(save(fight),rolls());assert.equal(fight.round,0);assert.equal(fight.encounter.scheduledEndEffects.length,1);
  assert.equal(fight.encounter.scheduledEndEffects[0].round,8);assert.equal(fight.used.charm,1);
});

test('wolf defeat can finish Sable and records one outcome',()=>{
  let fight=ready(1);fight=round(round(fight));fight.opponents[0].health=5;fight=round(fight);
  assert.equal(fight.status,'win');assert.equal(fight.opponents[0].health,0);
  assert.equal(fight.history.filter(e=>e.type==='outcome').length,1);
});

test('opening schedule delay and end effects use editable metadata',()=>{
  const fight=make({});fight.encounter.openingTest.delay=1;fight.encounter.openingTest.effect.healthLoss=7;
  fight.encounter.openingTest.effect.changes.magic=-3;
  let result=resolve(rollDestinyOpeningTest(fight,rolls(1)),rolls());result=round(round(result));
  assert.equal(result.opponents[0].health,93);assert.equal(destinyStat(result,0,'magic'),7);
});
