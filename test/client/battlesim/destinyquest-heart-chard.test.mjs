import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeDestinyRoster} from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
import {createHeartFight} from '../../../public/js/battlesim/engines/destinyquest/heart.js';
import {startDestinyRound,rollDestinySpeed,resolveDestinySpeed,retargetDestinyRound,rollDestinyDamage,resolveDestinyDamage,endDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {useDestinyAbility} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {destinyStat,destinyDamageScore,destinyStrike} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
const roster=decodeDestinyRoster(JSON.parse(readFileSync(new URL('../../fixtures/battlesim/heart-roster.json',import.meta.url))).enemies);
const hero={speed:30,brawn:0,magic:0,armour:5,health:40,maxHealth:40};
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
const clone=f=>JSON.parse(JSON.stringify(f));
const fight=(options={})=>createHeartFight({...hero,...options.hero},792,{...options,encounterOptions:{spriteRounds:0,...options.encounterOptions},roster});
const win=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(6,5,2,3)),rolls());
const score=(f,...values)=>resolveDestinyDamage(rollDestinyDamage(f,rolls(...values)));

test('Chard requires the previous sprite round count, adds two Health per round and keeps null Brawn/Magic',()=>{
  assert.throws(()=>createHeartFight(hero,792,{roster}),/round count/);
  for(const bad of [-1,1.5,1000000])assert.throws(()=>fight({encounterOptions:{spriteRounds:bad}}),/round count/);
  const f=fight({encounterOptions:{spriteRounds:3}});assert.equal(f.opponents[0].health,66);assert.equal(f.opponents[0].maxHealth,66);
  assert.deepEqual([f.opponents[0].brawn,f.opponents[0].magic],[null,null]);assert.equal(f.encounter.sourceCounters.spriteRounds,3);
});

test('Chard rolls three damage dice without an invented Brawn or Magic bonus and Armour still absorbs damage',()=>{
  let f=startDestinyRound(fight({hero:{speed:0}}),0);
  f=resolveDestinySpeed(rollDestinySpeed(f,rolls(2,3,6,5)),rolls());f=rollDestinyDamage(f,rolls(2,3,4));
  assert.equal(destinyDamageScore(f),9);f=resolveDestinyDamage(f);assert.equal(f.hero.health,36);
});

test('ordinary damage destroys the anvil and lowers Chard Armour to eight; Chard death preserves an intact anvil',()=>{
  let f=score(retargetDestinyRound(win(startDestinyRound(fight({hero:{brawn:35}}),0)),1),1);
  assert.equal(f.opponents[1].health,0);assert.equal(destinyStat(f,0,'armour'),8);assert.equal(f.status,'active');
  f=endDestinyRound(f);f.hero.brawn=200;f=score(win(startDestinyRound(f,0)),1);
  assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'887');
  f=score(win(startDestinyRound(fight({hero:{brawn:200}}),0)),1);assert.equal(f.opponents[1].health,20);
});

test('the anvil ignores all passive damage and on-hit statuses while normal scores retain base attributes',()=>{
  let f=score(retargetDestinyRound(win(startDestinyRound(fight({hero:{brawn:30},abilities:{barbs:1,thorns:1,bleed:1,venom:1,'monkey-mob':1}}),0)),1),1);
  assert.equal(f.opponents[1].health,5,'passive per-die bonus is excluded');
  assert.equal(f.effects.some(e=>e.target===1&&['bleed','venom'].includes(e.kind)),false);
  assert.equal(destinyStrike(f,1,100,'test','dice'),0);f=endDestinyRound(f);assert.equal(f.opponents[1].health,5);
});

test('Speed and modifier abilities remain usable but direct combat attacks against the anvil are rejected',()=>{
  let f=startDestinyRound(fight({hero:{brawn:14},abilities:{quicksilver:1,cunning:1,piercing:1,slick:1}}),1);
  f=useDestinyAbility(f,'quicksilver');f=win(f);f=useDestinyAbility(f,'cunning');
  assert.throws(()=>useDestinyAbility(f,'piercing'),/immune/);
  assert.throws(()=>useDestinyAbility(f,'slick'),/immune/);
  f=score(f,1);assert.equal(f.opponents[1].health,18);
});

test('the anvil is immune to the explicitly named Snake Strike opening',()=>{
  let f=fight({abilities:{'snake-strike':1},equipment:{leftHand:{type:'snake'}}});
  f=useDestinyAbility(f,'snake-strike',{target:1},()=>2);assert.equal(f.opponents[1].health,20);
});

test('activating Piercing or Fatal Blow against Chard then retargeting cannot bypass anvil Armour',()=>{
  for(const ability of ['piercing','fatal-blow']){
    let f=win(startDestinyRound(fight({hero:{brawn:10},abilities:{[ability]:1}}),0));
    f=useDestinyAbility(f,ability);f=retargetDestinyRound(clone(f),1);f=score(f,1);
    assert.equal(f.opponents[1].health,20);assert.equal(f.used[ability],1);
  }
});

test('combat score bonuses are excluded after retargeting while modifier score bonuses remain',()=>{
  let f=win(startDestinyRound(fight({hero:{brawn:14},abilities:{impale:1,'faithful-friend':1}}),0));
  f=useDestinyAbility(f,'impale');f=retargetDestinyRound(f,1);f=useDestinyAbility(f,'faithful-friend');
  f=score(f,1);assert.equal(f.opponents[1].health,19);
});

test('extra combat damage dice are excluded after a saved retarget without changing the original stored dice',()=>{
  let f=win(startDestinyRound(fight({hero:{brawn:14},abilities:{'deep-wound':1}}),0));
  f=useDestinyAbility(f,'deep-wound');f=retargetDestinyRound(clone(f),1);f=rollDestinyDamage(f,rolls(1,6));
  const saved=JSON.stringify(f);assert.equal(destinyDamageScore(f),15);assert.equal(JSON.stringify(f),saved);
  f=resolveDestinyDamage(f);assert.equal(f.opponents[1].health,20);assert.deepEqual(f.turn.damageDice,[1,6]);
});

test('combat stat changes are excluded against the anvil while later modifier stat changes still apply',()=>{
  let f=win(startDestinyRound(fight({hero:{magic:15},abilities:{surge:1,wisdom:1}}),0));
  f=useDestinyAbility(f,'surge');f=retargetDestinyRound(f,1);f=useDestinyAbility(f,'wisdom');
  f=score(f,1);assert.equal(f.opponents[1].health,18);
});

test('multi-target combat damage strikes Chard while leaving the anvil and its attributes intact',()=>{
  let f=win(startDestinyRound(fight({abilities:{cleave:1}}),0));
  f=useDestinyAbility(f,'cleave',{targets:[0,1]},()=>2);
  assert.ok(f.opponents[0].health<60);assert.equal(f.opponents[1].health,20);assert.equal(destinyStat(f,1,'armour'),16);
});

test('copied Speed dice retain modifier benefits while extra combat dice remain excluded',()=>{
  let f=win(startDestinyRound(fight({abilities:{'deep-wound':1,'roll-with-it':1}}),0));
  f=useDestinyAbility(f,'deep-wound');f=retargetDestinyRound(f,1);f=useDestinyAbility(f,'roll-with-it',{die:0},rolls(6));
  assert.deepEqual(f.turn.damageDice,[6,6]);assert.equal(destinyDamageScore(f),6);
  f=resolveDestinyDamage(f);assert.equal(f.opponents[1].health,20);
});
