import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeDestinyRoster} from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
import {createHeartFight} from '../../../public/js/battlesim/engines/destinyquest/heart.js';
import {startDestinyRound,rollDestinySpeed,resolveDestinySpeed,rollDestinyDamage,resolveDestinyDamage,endDestinyRound,continueDestinyCombat,settleDestinyFight,retargetDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {destinyStat,destinyStrike,addDestinyStatEffect} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
import {useLegionAction} from '../../../public/js/battlesim/engines/destinyquest/legion.js';
import {useDestinyAbility} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
const roster=decodeDestinyRoster(JSON.parse(readFileSync(new URL('../../fixtures/battlesim/heart-roster.json',import.meta.url))).enemies);
const hero={speed:30,brawn:0,magic:0,armour:20,health:60,maxHealth:60};
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
const fight=(section,options={})=>createHeartFight({...hero,...options.hero},section,{...options,roster});
const win=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(6,5,1,2)),rolls());
const score=f=>resolveDestinyDamage(rollDestinyDamage(f,rolls(1)));

test('Sitadell rock bluff grows each round and removing it replaces damage without removing Rust',()=>{
  let f=fight(584);addDestinyStatEffect(f,0,'armour',-2,null,'rust');
  for(let i=0;i<2;i++)f=endDestinyRound(score(win(startDestinyRound(f,0))));
  assert.equal(f.opponents[0].armour,12);assert.equal(destinyStat(f,0,'armour'),10);
  f=win(startDestinyRound(f,0));const health=f.opponents[0].health;
  f=useLegionAction(f,'remove-rock-bluff',{roster});
  assert.equal(f.phase,'end');assert.equal(f.opponents[0].health,health);
  assert.equal(f.opponents[0].armour,8);assert.equal(destinyStat(f,0,'armour'),6);
  f=endDestinyRound(f);assert.equal(f.opponents[0].armour,10);
});

test('Sitadell transformation carries Health and restores abilities without issuing a victory',()=>{
  let f=fight(584,{hero:{brawn:100},abilities:{cunning:1,hexed:1,'curse-of-weakness':1,'curse-of-frailty':1,pillage:1,cutpurse:1}});
  f=useDestinyAbility(startDestinyRound(f,0),'cunning');f.hero.health=23;
  f=score(win(f));assert.equal(f.phase,'between-combats');assert.equal(f.status,'active');
  assert.equal(f.hero.health,23);assert.equal(f.encounter.outcomeSection,undefined);
  assert.equal(f.opponents[1].health,40);
  f.savedHeroDie=6;f.savedOpponentDice=[6,6];f.phantomHealth=9;f.encounter.cancelledAbilities=['cunning'];
  f=continueDestinyCombat(JSON.parse(JSON.stringify(f)));
  assert.equal(f.round,0);assert.equal(f.encounter.sourceSection,'672');assert.equal(f.target,1);
  assert.equal(f.hero.health,23);assert.equal(f.hero.maxHealth,55);
  assert.equal(destinyStat(f,'hero','brawn'),95);assert.equal(f.used.cunning,undefined);
  assert.deepEqual(f.abilityQuota.used,[]);assert.equal(f.savedHeroDie,undefined);assert.equal(f.phantomHealth,undefined);
  assert.deepEqual(f.encounter.endArmourGrowth,[]);
  f=startDestinyRound(f,1);f=useDestinyAbility(f,'cunning');
  assert.equal(f.used.cunning,1);
  assert.throws(()=>useLegionAction(win(f),'remove-rock-bluff',{roster}),/Unknown encounter action/);
  f=score(win(f));assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'683');
});

test('worm deadline permits an eighth-round winning score and otherwise loses at the end of round eight',()=>{
  let f=fight(672);for(let i=0;i<7;i++)f=endDestinyRound(score(win(startDestinyRound(f,0))));
  assert.equal(f.status,'active');f=endDestinyRound(score(win(startDestinyRound(f,0))));
  assert.equal(f.status,'loss');assert.equal(f.encounter.outcomeSection,'584');
  f=fight(672,{hero:{brawn:100}});f.round=7;f=score(win(startDestinyRound(f,0)));
  assert.equal(f.round,8);assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'683');
});

test('linked worm starts its own eight rounds and end-of-eighth-round damage cannot evade the deadline',()=>{
  let f=fight(584,{hero:{brawn:100}});f.round=10;f=score(win(startDestinyRound(f,0)));
  f=continueDestinyCombat(f);assert.equal(f.encounter.consecutiveCombats.completedRounds,11);
  f.hero.brawn=0;f.round=6;f=endDestinyRound(score(win(startDestinyRound(f,1))));
  assert.equal(f.status,'active');assert.equal(f.opponents[1].armour,10);
  f=score(win(startDestinyRound(f,1)));
  f=endDestinyRound(f,[{target:1,amount:40,ignoreArmour:true,source:'test'}]);
  assert.equal(f.opponents[1].health,0);assert.equal(f.status,'loss');assert.equal(f.encounter.outcomeSection,'584');
});

test('both Sitadell bodies reject the printed damage abilities',()=>{
  for(const section of [584,672]){
    const f=startDestinyRound(fight(section),0);
    for(const ability of ['barbs','bleed','disease','fire-aura','piercing','thorns','thorn-cage','venom'])assert.equal(destinyStrike(f,0,3,ability,'dice'),0,ability);
    assert.equal(destinyStrike(f,0,3,'lightning','dice'),3);
  }
});

test('Tourmalus is an indestructible initiative source and damage targets the three crystal clusters',()=>{
  let f=fight(874);assert.deepEqual([f.opponents[0].armour,f.opponents[0].health],[null,null]);
  for(const cluster of f.opponents.slice(1))assert.deepEqual([cluster.speed,cluster.brawn,cluster.magic],[null,null,null]);
  assert.throws(()=>startDestinyRound(f,0),/exposed combat component/);
  f=win(startDestinyRound(f,1));assert.equal(f.turn.winner,'hero');
  f=retargetDestinyRound(f,2);f=score(f);assert.equal(f.opponents[2].health,50);
  f.hero.brawn=100;f=endDestinyRound(f);
  for(const target of [2,1,3]){
    f=score(win(startDestinyRound(f,target)));
    assert.equal(f.status,target===3?'win':'active');
    if(target!==3)f=endDestinyRound(f);
  }
  assert.equal(f.encounter.outcomeSection,'893');assert.equal(f.opponents[0].health,null);
});

test('blue agate heals living clusters up to starting Health and its destruction stops all healing',()=>{
  let f=fight(874);[f.opponents[1].health,f.opponents[2].health,f.opponents[3].health]=[28,40,0];
  f=endDestinyRound(score(win(startDestinyRound(f,1))));
  assert.deepEqual(f.opponents.slice(1).map(o=>o.health),[30,44,0]);
  f=startDestinyRound(f,2);destinyStrike(f,1,100,'test','dice');
  f=endDestinyRound(score(win(f)));
  assert.deepEqual(f.opponents.slice(1).map(o=>o.health),[0,44,0]);
});

test('calcite grants piercing only while alive and Second Skin protects against it',()=>{
  const lose=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(1,2,6,5)),rolls());
  for(const [abilities,redAlive,expected] of [[{},true,14],[{'second-skin':1},true,0],[{},false,0]]){
    let f=fight(874,{hero:{speed:0},abilities});if(!redAlive)f.opponents[2].health=0;
    f=lose(startDestinyRound(f,1));f=resolveDestinyDamage(rollDestinyDamage(f,rolls(5)));
    assert.equal(f.hero.health,60-expected);
  }
});

test('destroying citrine reduces Tourmalus Speed while crystal immunities leave Barbs effective',()=>{
  const f=startDestinyRound(fight(874),1);assert.equal(destinyStat(f,0,'speed'),14);
  for(const target of [1,2,3]){
    for(const ability of ['bleed','disease','lightning','venom'])assert.equal(destinyStrike(f,target,2,ability,'dice'),0);
    assert.equal(destinyStrike(f,target,1,'barbs','passive'),1);
  }
  addDestinyStatEffect(f,0,'speed',-1,null,'test');destinyStrike(f,3,100,'test','dice');settleDestinyFight(f);
  assert.equal(f.opponents[0].speed,12);assert.equal(destinyStat(f,0,'speed'),11);
});
