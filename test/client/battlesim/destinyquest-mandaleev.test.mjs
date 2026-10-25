import test from 'node:test';
import assert from 'node:assert/strict';
import {createWinterFight} from './destinyquest-fixtures.mjs';
import {startDestinyRound, rollDestinySpeed, endDestinyRound, skipDestinyDeathMove, settleDestinyFight}
  from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {destinyStrike} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
import {useDestinyAbility as use, resolveDestinyDefeatChoice as choose}
  from '../../../public/js/battlesim/engines/destinyquest/abilities.js';

const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected dice');return values.shift();};
const make=(abilities={})=>createWinterFight({speed:20,brawn:10,armour:99,health:100,maxHealth:100},741,{abilities});
const start=abilities=>startDestinyRound(make(abilities),0,rolls());
const save=f=>JSON.parse(JSON.stringify(f));
const finish=f=>{f.phase='end';let result=endDestinyRound(f,[],rolls());if(result.phase==='death-move')result=skipDestinyDeathMove(result);return result;};

test('one independent tentacle grows each round after the first and adds end damage',()=>{
  let fight=start();assert.equal(fight.opponents.length,4);fight=finish(fight);assert.equal(fight.hero.health,97);
  fight=startDestinyRound(save(fight),4,rolls());assert.equal(fight.opponents.length,5);assert.equal(fight.opponents[4].health,10);
  assert.deepEqual(fight.encounter.opponentGroups.tentacles,[1,2,3,4]);fight=finish(fight);assert.equal(fight.hero.health,93);
});

test('doubles create a saved mandatory tentacle choice without rolling extra dice',()=>{
  const fight=rollDestinySpeed(start(),rolls(3,3,1,2));assert.equal(fight.phase,'ability-choice');
  assert.equal(fight.turn.pendingAbility.type,'defeat-choice');assert.throws(()=>rollDestinySpeed(fight,rolls()),/unavailable/);
  const result=choose(save(fight),2,rolls());assert.equal(result.opponents[2].health,0);assert.equal(result.phase,'speed-rolled');
  assert.deepEqual(result.turn.heroSpeedDice,[3,3]);assert.deepEqual(result.turn.opponentSpeedDice,[1,2]);
  assert.throws(()=>choose(result,1,rolls()),/No opponent/);
});

test('the chosen target must be a living tentacle, including newly grown ones',()=>{
  let fight=finish(start());fight=startDestinyRound(fight,0,rolls());fight=rollDestinySpeed(fight,rolls(2,2,1,2));
  const before=structuredClone(fight);assert.throws(()=>choose(fight,0,rolls()),/living member/);assert.deepEqual(fight,before);
  fight=choose(fight,4,rolls());assert.equal(fight.opponents[4].health,0);assert.equal(fight.opponents[1].health,10);
});

test('cutting the selected combat target ends its attack roll instead of attacking a dead tentacle',()=>{
  let fight=startDestinyRound(make(),1,rolls());fight=rollDestinySpeed(fight,rolls(6,6,1,2));
  fight=choose(save(fight),1,rolls());assert.equal(fight.opponents[1].health,0);
  assert.equal(fight.phase,'death-move');assert.equal(fight.turn.afterDeathMove,'end');
});

test('a fresh reroll can produce another double after the earlier choice is resolved',()=>{
  let fight=start({feint:1});fight=rollDestinySpeed(fight,rolls(2,2,1,3));fight=choose(fight,1,rolls());
  fight=use(fight,'feint',{dice:[0,1]},rolls(4,4));assert.equal(fight.phase,'ability-choice');
  fight=choose(fight,2,rolls());assert.deepEqual(fight.opponents.slice(1).map(o=>o.health),[0,0,10]);
});

test('changing a die with Agility does not count as rolling another double',()=>{
  let fight=rollDestinySpeed(start({agility:1}),rolls(1,6,1,3));
  fight=use(fight,'agility',{die:0},rolls());assert.deepEqual(fight.turn.heroSpeedDice,[6,6]);
  assert.equal(fight.phase,'speed-rolled');assert.equal(fight.opponents[1].health,10);
});

test('two pairs queue two separate choices without losing the original speed roll',()=>{
  let fight=start();fight.turn.heroSpeedCount=4;fight=rollDestinySpeed(fight,rolls(2,2,4,4,1,3));
  fight=choose(save(fight),1,rolls());assert.equal(fight.phase,'ability-choice');
  fight=choose(save(fight),2,rolls());assert.equal(fight.phase,'speed-rolled');assert.deepEqual(fight.turn.heroSpeedDice,[2,2,4,4]);
});

test('multiple pairs never queue more choices than surviving tentacles',()=>{
  let fight=start();destinyStrike(fight,1,10,'test');destinyStrike(fight,2,10,'test');fight.turn.heroSpeedCount=4;
  fight=rollDestinySpeed(fight,rolls(1,1,2,2,1,3));fight=choose(fight,3,rolls());
  assert.equal(fight.phase,'speed-rolled');assert.equal(fight.turn.afterAbilityEvents?.length||0,0);
});

test('no live tentacles means doubles do not create an impossible choice',()=>{
  let fight=start();for(const target of [1,2,3])destinyStrike(fight,target,10,'test');
  fight=rollDestinySpeed(fight,rolls(5,5,1,2));assert.equal(fight.phase,'speed-rolled');
});

test('defeating Mandaleev also defeats all original and grown tentacles exactly once',()=>{
  let fight=startDestinyRound(finish(start()),0,rolls());destinyStrike(fight,0,70,'test');settleDestinyFight(fight,rolls());
  assert.equal(fight.status,'win');assert.deepEqual(fight.opponents.map(o=>o.health),[0,0,0,0,0]);
  assert.deepEqual(fight.defeated,[0,1,2,3,4]);assert.equal(fight.history.filter(e=>e.type==='outcome').length,1);
  assert.throws(()=>startDestinyRound(fight,0,rolls()),/unavailable/);
});

test('cut tentacles stop end damage while the remaining tentacles still strike',()=>{
  let fight=rollDestinySpeed(start(),rolls(3,3,1,2));fight=choose(fight,2,rolls());fight=finish(fight);
  assert.equal(fight.hero.health,98);
});
