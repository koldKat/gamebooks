import test from 'node:test';
import assert from 'node:assert/strict';
import {createWinterFight} from './destinyquest-fixtures.mjs';
import {startDestinyRound, rollDestinySpeed, resolveDestinySpeed, rollDestinyDamage,
  resolveDestinyDamage, endDestinyRound, skipDestinyDeathMove, settleDestinyFight}
  from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {destinyStrike, isDestinyOpponentActive, destinyDamageAllowed, recordDestinyDefeat}
  from '../../../public/js/battlesim/engines/destinyquest/effects.js';

const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected dice');return values.shift();};
const make=(abilities={},character=null)=>createWinterFight({speed:20,brawn:50,armour:99,health:200,maxHealth:200},703,{abilities,character});
const save=f=>JSON.parse(JSON.stringify(f));
const hit=(fight,target)=>resolveDestinyDamage(rollDestinyDamage(resolveDestinySpeed(rollDestinySpeed(
  startDestinyRound(fight,target,rolls()),rolls(6,6,1,1))),rolls(1)),rolls());
const finish=f=>{const result=endDestinyRound(f.phase==='death-move'?skipDestinyDeathMove(f):f,[],rolls());return result.phase==='death-move'?skipDestinyDeathMove(result):result;};
const split=()=>finish(hit(make(),0));

test('only Avalanche is initially exposed and hidden elementals cannot cause an early victory',()=>{
  const fight=startDestinyRound(make(),0,rolls());assert.equal(fight.status,'active');
  assert.deepEqual(fight.opponents.map((_,i)=>isDestinyOpponentActive(fight,i)),[true,false,false,false]);
  assert.equal(destinyDamageAllowed(fight,1,'dice'),false);
  assert.throws(()=>destinyStrike(fight,1,100,'test'),/living opponent/);
});

test('first defeat exposes all three elementals without finishing the fight',()=>{
  const fight=hit(make(),0);assert.equal(fight.status,'active');
  assert.equal(fight.opponents[0].health,0);assert.deepEqual(fight.encounter.inactiveTargets,[0]);
  assert.equal(fight.encounter.formCycle.reformRound,5);assert.equal(fight.phase,'death-move');
  assert.deepEqual(fight.opponents.slice(1).map(o=>o.health),[25,20,20]);
});

test('three complete elemental rounds are allowed before reforming at the fourth start',()=>{
  let fight=split();fight.hero.brawn=0;
  for(let i=0;i<3;i++){
    fight=finish(hit(save(fight),1));assert.equal(fight.opponents[0].health,0);assert.equal(fight.round,i+2);
  }
  const before=structuredClone(fight);assert.throws(()=>startDestinyRound(fight,1,rolls()),/living/);assert.deepEqual(fight,before);
  fight=startDestinyRound(save(fight),0,rolls());assert.equal(fight.round,5);assert.equal(fight.opponents[0].health,40);
  assert.deepEqual(fight.encounter.inactiveTargets,[1,2,3]);
});

test('elemental damage and deaths persist through repeated reformations',()=>{
  let fight=split();fight=startDestinyRound(fight,1,rolls());
  destinyStrike(fight,1,7,'test');destinyStrike(fight,2,20,'test');fight.phase='end';fight=finish(fight);
  fight.hero.brawn=0;
  for(let i=0;i<2;i++)fight=finish(hit(fight,1));
  fight.hero.brawn=50;fight=hit(fight,0);
  assert.deepEqual(fight.opponents.slice(1).map(o=>o.health),[18,0,20]);assert.equal(fight.status,'active');
  assert.equal(fight.encounter.formCycle.reformRound,9);assert.equal(isDestinyOpponentActive(fight,2),false);
});

test('all surviving parts must die and the shell cannot reform after final victory',()=>{
  let fight=split();fight=startDestinyRound(fight,1,rolls());
  for(const target of [1,2,3])destinyStrike(fight,target,100,'test');settleDestinyFight(fight,rolls());
  assert.equal(fight.status,'win');assert.equal(fight.history.filter(e=>e.type==='outcome').length,1);
  assert.throws(()=>startDestinyRound(fight,0,rolls()),/unavailable/);
});

test('repeat defeat bookkeeping cannot extend the elemental window',()=>{
  const fight=hit(make(),0),before=fight.encounter.formCycle.reformRound;
  recordDestinyDefeat(fight,0);assert.equal(fight.encounter.formCycle.reformRound,before);
  assert.equal(fight.history.filter(e=>e.type==='form-split').length,1);
});

test('passive hits and status riders cannot harm either form',()=>{
  let fight=startDestinyRound(make({barbs:1,bleed:1,venom:1,disease:1}),0,rolls());
  assert.equal(destinyStrike(fight,0,10,'passive-test','passive'),0);
  destinyStrike(fight,0,1,'test');assert.equal(fight.effects.some(e=>['bleed','disease','venom'].includes(e.kind)),false);
  fight.phase='end';fight=endDestinyRound(fight,[{target:0,amount:100,ignoreArmour:true,source:'frost-hound'}],rolls());
  assert.equal(fight.opponents[0].health,39);
  fight=split();fight=startDestinyRound(fight,1,rolls());fight.phase='end';
  fight.effects.push({kind:'ongoing-damage',target:1,amount:100,from:0,until:99,source:'vital-artery'});
  fight=endDestinyRound(fight,[],rolls());assert.equal(fight.opponents[1].health,25);
});

test('companions add the printed score bonus and Einherjar receives the larger one',()=>{
  assert.equal(make().encounter.heroScoreBonus,2);
  assert.equal(make({}, {career:'einherjar'}).encounter.heroScoreBonus,3);
  let fight=startDestinyRound(make(),0,rolls());fight.hero.brawn=5;
  fight=resolveDestinySpeed(rollDestinySpeed(fight,rolls(6,6,1,1)));
  fight=resolveDestinyDamage(rollDestinyDamage(fight,rolls(1)),rolls());assert.equal(fight.turn.damageScore,8);
});

test('reform health and elemental window use editable metadata',()=>{
  let fight=make();Object.assign(fight.encounter.formCycle,{partRounds:1,shellHealth:31});
  fight=finish(hit(fight,0));assert.equal(fight.encounter.formCycle.reformRound,3);
  fight.hero.brawn=0;fight=finish(hit(fight,1));fight=startDestinyRound(fight,0,rolls());
  assert.equal(fight.opponents[0].health,31);assert.equal(fight.round,3);
});
