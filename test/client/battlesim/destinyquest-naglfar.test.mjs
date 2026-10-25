import test from 'node:test';
import assert from 'node:assert/strict';
import {createWinterFight} from './destinyquest-fixtures.mjs';
import {startDestinyRound, rollDestinySpeed, endDestinyRound, skipDestinyDeathMove, settleDestinyFight}
  from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {destinyStat, destinyStrike, recordDestinyDefeat, isDestinyOpponentActive}
  from '../../../public/js/battlesim/engines/destinyquest/effects.js';
import {useDestinyAbility as use} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';

const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected dice');return values.shift();};
const make=(abilities={})=>createWinterFight({speed:20,brawn:30,magic:0,armour:0,health:150,maxHealth:150},556,{abilities});
const start=()=>startDestinyRound(make(),0,rolls());
const save=fight=>JSON.parse(JSON.stringify(fight));
const nextRound=fight=>{fight.phase='end';let result=endDestinyRound(fight,[],rolls());
  if(result.phase==='death-move')result=skipDestinyDeathMove(result);
  return startDestinyRound(result,result.opponents.length,rolls());};

test('source roster and Captain aura preserve the printed armour values',()=>{
  const fight=make();assert.equal(fight.opponents.length,5);
  assert.deepEqual(fight.opponents.map(o=>o.health),[60,40,15,15,15]);
  assert.deepEqual(fight.opponents.map((_,i)=>destinyStat(fight,i,'armour')),[8,6,6,6,6]);
});

test('one independent selectable sailor joins every round after the first',()=>{
  const first=start(),before=structuredClone(first);const second=nextRound(first);
  assert.equal(first.opponents.length,5);assert.equal(second.opponents.length,6);assert.equal(second.target,5);
  assert.equal(second.round,2);assert.equal(second.opponents[5].health,15);assert.equal(second.opponents[5].magic,6);
  assert.equal(destinyStat(second,5,'armour'),6);assert.deepEqual(second.encounter.opponentGroups.sailors,[2,3,4,5]);
  assert.equal(before.opponents.length,5);const third=nextRound(save(second));assert.equal(third.opponents.length,7);
  assert.equal(third.opponents[6].health,15);assert.equal(third.opponents[5].health,15);
});

test('Captain death lowers existing and future sailor armour while Mako stays unchanged',()=>{
  let fight=start();destinyStrike(fight,0,100,'test');
  assert.equal(destinyStat(fight,1,'armour'),6);assert.equal(destinyStat(fight,2,'armour'),3);
  fight=nextRound(fight);assert.equal(destinyStat(fight,5,'armour'),3);
  assert.equal(fight.encounter.defeatCounter.remaining,10);
});

test('new sailors still arrive after both officers have died',()=>{
  let fight=start();destinyStrike(fight,0,100,'test');destinyStrike(fight,1,100,'test');fight=nextRound(fight);
  assert.equal(fight.opponents.length,6);assert.equal(fight.opponents[5].health,15);assert.equal(destinyStat(fight,5,'armour'),3);
});

test('invalid or repeated starts cannot save an extra sailor',()=>{
  const fight=start();fight.phase='end';const ready=endDestinyRound(fight,[],rolls()),before=structuredClone(ready);
  assert.throws(()=>startDestinyRound(ready,99,rolls()),/living/);assert.deepEqual(ready,before);
  const running=startDestinyRound(ready,5,rolls());assert.throws(()=>startDestinyRound(running,6,rolls()),/unavailable/);
  assert.equal(running.opponents.length,6);
});

test('Mako damages each freshly rolled one, including rerolls but not unchanged dice',()=>{
  let fight=rollDestinySpeed(startDestinyRound(make({feint:1}),0,rolls()),rolls(1,1,6,6));
  assert.equal(fight.hero.health,142);fight=use(fight,'feint',{dice:[0]},rolls(1));assert.equal(fight.hero.health,138);
  const stopped=startDestinyRound(make(),0,rolls());destinyStrike(stopped,1,100,'test');
  assert.equal(rollDestinySpeed(stopped,rolls(1,1,6,6)).hero.health,150);
});

test('officers and sailors reduce morale once, including spawned sailors',()=>{
  let fight=start();destinyStrike(fight,0,100,'test');destinyStrike(fight,1,100,'test');destinyStrike(fight,2,100,'test');
  assert.equal(fight.encounter.defeatCounter.remaining,6);recordDestinyDefeat(fight,2);assert.equal(fight.encounter.defeatCounter.remaining,6);
  fight=nextRound(fight);destinyStrike(fight,5,100,'test');assert.equal(fight.encounter.defeatCounter.remaining,5);
});

test('defeating the whole initial group cannot prematurely win before morale reaches zero',()=>{
  let fight=start();for(let i=0;i<5;i++)destinyStrike(fight,i,100,'test');
  settleDestinyFight(fight,rolls());assert.equal(fight.status,'active');assert.equal(fight.encounter.defeatCounter.remaining,4);
  fight=nextRound(fight);assert.equal(fight.target,5);assert.equal(fight.status,'active');
});

test('zero morale makes living crew surrender without awarding kill rewards for survivors',()=>{
  let fight=startDestinyRound(make({'malefic-runes':1}),0,rolls());fight.encounter.defeatCounter.remaining=1;
  const health=fight.opponents.map(o=>o.health);destinyStrike(fight,2,15,'test');settleDestinyFight(fight,rolls());
  assert.equal(fight.status,'win');assert.equal(fight.encounter.defeatCounter.remaining,0);
  assert.deepEqual(fight.encounter.surrenderedTargets,[0,1,3,4]);assert.deepEqual(fight.defeated,[2]);
  assert.equal(fight.effects.filter(e=>e.source==='malefic-runes').length,1);
  assert.equal(fight.opponents[0].health,health[0]);assert.equal(isDestinyOpponentActive(fight,0),false);
  assert.equal(fight.history.filter(e=>e.type==='outcome').length,1);
});

test('seven live sailors lose only after the round ends',()=>{
  let fight=start();for(let i=0;i<4;i++)fight=nextRound(fight);
  assert.equal(fight.encounter.opponentGroups.sailors.length,7);assert.equal(fight.status,'active');fight.phase='end';
  fight=endDestinyRound(fight,[],rolls());assert.equal(fight.status,'loss');
});

test('passive damage killing the seventh sailor prevents the overload loss',()=>{
  let fight=start();for(let i=0;i<4;i++)fight=nextRound(fight);fight.phase='end';
  fight=endDestinyRound(fight,[{target:8,amount:15,ignoreArmour:true,source:'test'}],rolls());
  assert.equal(fight.status,'active');assert.equal(fight.encounter.defeatCounter.remaining,14);
});

test('a morale-breaking passive kill wins immediately before a remaining-crowd loss',()=>{
  let fight=start();for(let i=0;i<5;i++){if(i===4)fight.encounter.lossAtGroupCount[0].minimum=8;fight=nextRound(fight);}
  fight.encounter.lossAtGroupCount[0].minimum=7;fight.encounter.defeatCounter.remaining=1;fight.phase='end';
  fight=endDestinyRound(fight,[{target:9,amount:15,ignoreArmour:true}],rolls());assert.equal(fight.status,'win');
});

test('saved morale, recruited sailors and live armour resume without duplication',()=>{
  let fight=nextRound(start());destinyStrike(fight,1,100,'test');const saved=save(fight);
  assert.equal(saved.encounter.defeatCounter.remaining,12);assert.equal(saved.opponents.length,6);
  assert.equal(destinyStat(saved,5,'armour'),6);fight=nextRound(saved);assert.equal(fight.opponents.length,7);
  assert.equal(fight.encounter.defeatCounter.remaining,12);
});
