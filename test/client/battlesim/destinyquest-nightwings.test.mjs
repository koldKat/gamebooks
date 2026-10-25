import test from 'node:test';
import assert from 'node:assert/strict';
import {createWinterFight} from './destinyquest-fixtures.mjs';
import {startDestinyRound, rollDestinySpeed, resolveDestinySpeed, rollDestinyDamage, resolveDestinyDamage, endDestinyRound}
  from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {useDestinyAbility as use} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
const rolls=(...v)=>()=>{assert.ok(v.length,'Unexpected dice');return v.shift();};
const make=(abilities={})=>createWinterFight({speed:0,brawn:100,magic:90,armour:0,health:100},767,{abilities});
const lose=f=>resolveDestinySpeed(rollDestinySpeed(startDestinyRound(f,0,rolls()),rolls(1,1,6,6)));
const end=f=>endDestinyRound(f,[],rolls());
const five=f=>{for(let i=0;i<5;i++)f=end(lose(f));return f;};

test('opening and active abilities are unavailable throughout the five ranged rounds',()=>{
  let fight=make({'first-blood':1,radiance:1,cunning:1,charm:1});
  assert.throws(()=>use(fight,'first-blood',{target:0},rolls()),/before combat/);
  for(let i=0;i<5;i++){
    fight=startDestinyRound(fight,0,rolls());assert.equal(fight.encounter.disableHeroAbilities,true);
    assert.throws(()=>use(fight,'radiance',{},rolls()),/unavailable/);assert.throws(()=>use(fight,'cunning',{},rolls()),/unavailable/);
    fight=resolveDestinySpeed(rollDestinySpeed(fight,rolls(1,1,6,6)));assert.equal(fight.phase,'end');fight=end(fight);
  }
  assert.equal(fight.hero.health,100);
});

test('a successful crossbow shot deals only four dice, ignoring armour and hero power',()=>{
  let fight=make({});fight.hero.speed=30;fight=startDestinyRound(fight,0,rolls());
  fight=resolveDestinySpeed(rollDestinySpeed(fight,rolls(6,6,1,1)));assert.equal(fight.turn.rangedShot,true);
  fight=resolveDestinyDamage(rollDestinyDamage(fight,rolls(1,2,3,4)),rolls());
  assert.equal(fight.turn.damageScore,10);assert.equal(fight.turn.healthDamage,10);assert.equal(fight.opponents[0].health,30);
  assert.equal(fight.turn.damageDice.length,4);
});

test('ranged misses and ties end the round without enemy damage or outnumbered damage',()=>{
  let fight=lose(make({}));assert.equal(fight.phase,'end');fight=end(fight);assert.equal(fight.hero.health,100);
  fight=make({});fight.hero.speed=10;fight=startDestinyRound(fight,0,rolls());
  fight=resolveDestinySpeed(rollDestinySpeed(fight,rolls(2,2,2,2)));assert.equal(fight.turn.winner,'standoff');
  assert.equal(end(fight).hero.health,100);
});

test('ranged kills offer no unusable death moves and saved health carries into round six',()=>{
  let fight=make({});fight.hero.speed=30;fight.opponents[0].health=5;
  fight=resolveDestinyDamage(rollDestinyDamage(resolveDestinySpeed(rollDestinySpeed(startDestinyRound(fight,0,rolls()),rolls(6,6,1,1))),rolls(2,2,2,2)),rolls());
  assert.equal(fight.phase,'end');fight=end(fight);assert.equal(fight.phase,'start');
  fight=JSON.parse(JSON.stringify(fight));fight.hero.speed=0;
  for(let i=0;i<4;i++){fight=resolveDestinySpeed(rollDestinySpeed(startDestinyRound(fight,1,rolls()),rolls(1,1,6,6)));fight=end(fight);}
  fight=startDestinyRound(fight,1,rolls());assert.equal(fight.round,6);assert.equal(fight.opponents[0].health,0);
  assert.equal(fight.encounter.disableHeroAbilities,false);
});

test('normal abilities, attacks and outnumbered damage begin exactly on round six',()=>{
  let fight=five(make({radiance:1}));fight=startDestinyRound(JSON.parse(JSON.stringify(fight)),0,rolls());
  assert.equal(fight.round,6);fight=use(fight,'radiance',{target:0},rolls());assert.equal(fight.used.radiance,1);
  fight=resolveDestinySpeed(rollDestinySpeed(fight,rolls(1,1,6,6)));assert.equal(fight.phase,'damage');
  fight=resolveDestinyDamage(rollDestinyDamage(fight,rolls(3)),rolls());assert.equal(fight.hero.health,92);
  fight=end(fight);assert.equal(fight.hero.health,88);
});

test('one surviving opponent causes no outnumbered damage in ordinary combat',()=>{
  let fight=five(make({}));fight.opponents.slice(1).forEach(o=>o.health=0);fight=startDestinyRound(fight,0,rolls());
  fight.phase='end';fight=end(fight);assert.equal(fight.hero.health,100);
});

test('passive abilities do not apply in the ranged phase but return in normal combat',()=>{
  let fight=five(make({barbs:1}));assert.deepEqual(fight.opponents.map(o=>o.health),[40,40,40,40]);
  fight=startDestinyRound(fight,0,rolls());fight.phase='end';fight=end(fight);
  assert.deepEqual(fight.opponents.map(o=>o.health),[39,39,39,39]);
});

test('ranged timing and number of damage dice use editable metadata',()=>{
  let fight=make({});Object.assign(fight.encounter.rangedCombat,{throughRound:1,damageDice:2});fight.hero.speed=30;
  fight=resolveDestinyDamage(rollDestinyDamage(resolveDestinySpeed(rollDestinySpeed(startDestinyRound(fight,0,rolls()),rolls(6,6,1,1))),rolls(2,3)),rolls());
  assert.equal(fight.opponents[0].health,35);fight=end(fight);fight=startDestinyRound(fight,0,rolls());
  assert.equal(fight.encounter.disableHeroAbilities,false);assert.equal(fight.encounter.outnumbered,true);
});
