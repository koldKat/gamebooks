import test from 'node:test';
import assert from 'node:assert/strict';
import {createWinterFight,WINTER_ENCOUNTERS} from './destinyquest-fixtures.mjs';
import {createWinterFight as create} from '../../../public/js/battlesim/engines/destinyquest/winters-fury.js';
import * as core from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {advanceDestinyAspectCycle} from '../../../public/js/battlesim/engines/destinyquest/round-events.js';
import {destinyStrike,isDestinyOpponentActive,destinyDamageAllowed} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
const hero={speed:30,brawn:0,magic:0,armour:99,health:100};
const setup=()=>createWinterFight(hero,372,{abilities:{bleed:1,barbs:1,venom:1,disease:1}});
const save=f=>JSON.parse(JSON.stringify(f));
const active=f=>f.opponents.flatMap((_,i)=>isDestinyOpponentActive(f,i)?[i]:[]);
const round=f=>{
  const preview=save(f);advanceDestinyAspectCycle(preview,f.round+1);
  f=core.startDestinyRound(save(f),active(preview)[0]);
  let dice=[6,6,1,1];f=core.resolveDestinySpeed(core.rollDestinySpeed(f,()=>dice.shift()));
  f=core.resolveDestinyDamage(core.rollDestinyDamage(f,()=>1));return core.endDestinyRound(f);
};

test('only the warrior is initially exposed and reserved aspects do not imply victory',()=>{
  const f=setup();assert.deepEqual(active(f),[0]);assert.equal(f.status,'active');
  assert.equal(destinyDamageAllowed(f,1),false);assert.throws(()=>destinyStrike(f,1,10,'test'),/living/);
});
test('red aspect appears before selecting the third-round target and preserves warrior health',()=>{
  let f=round(round(setup())),before=save(f);
  assert.throws(()=>core.startDestinyRound(f,0),/living/);assert.deepEqual(f,before);
  f=core.startDestinyRound(f,1);assert.deepEqual(active(f),[1]);assert.equal(f.opponents[0].health,50);
  assert.equal(f.encounter.aspectCycle.mainRounds,0);assert.equal(destinyDamageAllowed(f,0),false);
  assert.equal(core.settleDestinyFight(f),false);assert.equal(f.status,'active');
});
test('aspect fights pause the warrior timer across saved rounds',()=>{
  let f=round(round(setup()));for(let i=0;i<5;i++)f=round(f);
  assert.deepEqual(active(f),[1]);assert.equal(f.encounter.aspectCycle.nextAspect,1);
  assert.equal(f.encounter.aspectCycle.mainRounds,0);assert.equal(f.opponents[2].health,20);
});
test('defeating each aspect exposes the warrior for two further full rounds',()=>{
  let f=round(round(setup()));
  for(const target of [1,2,3]){
    f=core.startDestinyRound(save(f),target);destinyStrike(f,target,100,'test');
    assert.deepEqual(active(f),[0]);assert.equal(f.status,'active');
    f.phase='end';f.turn.used.dm=true;f=core.endDestinyRound(f);
    f=round(round(f));assert.deepEqual(active(f),[0]);
  }
  for(let i=0;i<4;i++)f=round(f);assert.deepEqual(active(f),[0]);assert.equal(f.encounter.aspectCycle.nextAspect,3);
  assert.equal(f.history.filter(e=>e.type==='aspect-enter').length,3);
});
test('the warrior can be defeated before any transformation without killing reserved aspects',()=>{
  const f=setup();f.turn=core.createDestinyTurn();destinyStrike(f,0,50,'test');core.settleDestinyFight(f);
  assert.equal(f.status,'win');assert.deepEqual(f.opponents.slice(1).map(e=>e.health),[20,20,15]);
  assert.deepEqual(f.defeated,[0]);
});
test('all forms reject passive damage and on-hit passive afflictions',()=>{
  let f=setup();f.turn=core.createDestinyTurn();assert.equal(destinyStrike(f,0,5,'barbs','passive'),0);
  destinyStrike(f,0,1,'normal','score');assert.equal(f.effects.length,0);
  f=round(round(f));f=core.startDestinyRound(f,1);assert.equal(destinyStrike(f,1,5,'barbs','passive'),0);
  destinyStrike(f,1,1,'normal','score');assert.equal(f.effects.length,0);
});
test('timing and aspect order follow editable roster metadata',()=>{
  const roster=structuredClone(WINTER_ENCOUNTERS),entry=roster.find(e=>e.section==='372');
  entry.adapter.rules.aspectCycle.roundsBetween=1;entry.adapter.rules.aspectCycle.aspects=[3,2,1];
  let f=create(hero,372,{roster});f=round(f);f=core.startDestinyRound(f,3);assert.deepEqual(active(f),[3]);
});
