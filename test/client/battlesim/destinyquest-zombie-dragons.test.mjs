import test from 'node:test';
import assert from 'node:assert/strict';
import {createWinterFight} from './destinyquest-fixtures.mjs';
import {startDestinyRound, rollDestinySpeed, resolveDestinySpeed, rollDestinyDamage,
  resolveDestinyDamage, endDestinyRound, skipDestinyDeathMove}
  from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {destinyStrike} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
import {useDestinyAbility as use} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';

const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected dice');return values.shift();};
const make=(options={})=>createWinterFight({speed:20,brawn:0,armour:99,health:200,maxHealth:200},729,options);
const attack=(fight,target=0)=>resolveDestinyDamage(rollDestinyDamage(resolveDestinySpeed(rollDestinySpeed(
  startDestinyRound(fight,target,rolls()),rolls(6,6,1,1))),rolls(1)),rolls());
const finish=f=>endDestinyRound(f.phase==='death-move'?skipDestinyDeathMove(f):f,[],rolls());
const round=f=>finish(attack(f));
const save=f=>JSON.parse(JSON.stringify(f));

test('Tiamort blocks speed abilities while leaving modifiers available',()=>{
  const fight=startDestinyRound(make({abilities:{charge:1,cunning:1}}),0,rolls());
  assert.throws(()=>use(fight,'charge',{},rolls()),/blocking/);
  assert.equal(use(fight,'cunning',{},rolls()).used.cunning,1);
  destinyStrike(fight,0,60,'test');assert.equal(use(fight,'charge',{},rolls()).used.charge,1);
});

test('the cloud starts at two and grows once per round, capped at five despite armour',()=>{
  let fight=make(),previous=200;const losses=[];
  for(let i=0;i<7;i++){fight=round(save(fight));losses.push(previous-fight.hero.health);previous=fight.hero.health;}
  assert.deepEqual(losses,[2,3,4,5,5,5,5]);assert.equal(fight.encounter.roundRampingDamage[0].current,5);
});

test('killing Luicris retains this round cloud damage and decays on subsequent rounds',()=>{
  let fight=round(round(make()));fight.hero.brawn=100;fight=attack(fight,1);
  assert.equal(fight.encounter.roundRampingDamage[0].stoppedRound,3);
  fight=finish(fight);assert.equal(fight.hero.health,191);fight.hero.brawn=0;
  const losses=[];let previous=fight.hero.health;
  for(let i=0;i<5;i++){fight=round(save(fight));losses.push(previous-fight.hero.health);previous=fight.hero.health;}
  assert.deepEqual(losses,[3,2,1,0,0]);
});

test('killing Tiamort does not stop the cloud while Luicris lives',()=>{
  let fight=make();fight.hero.brawn=100;fight=finish(attack(fight,0));fight.hero.brawn=0;
  assert.equal(fight.hero.health,198);assert.equal(fight.encounter.roundRampingDamage[0].stoppedRound,undefined);
  fight=finish(attack(fight,1));assert.equal(fight.hero.health,195);
});

test('first-round source defeat still inflicts two, followed by one then zero',()=>{
  let fight=make();fight.hero.brawn=100;fight=finish(attack(fight,1));assert.equal(fight.hero.health,198);
  fight.hero.brawn=0;fight=round(fight);assert.equal(fight.hero.health,197);
  fight=round(fight);assert.equal(fight.hero.health,197);
});

for(const keyword of ['frazzled','rocked'])test('rough ride is optional and requires the '+keyword+' keyword',()=>{
  const character={keywords:[keyword],gold:12};const before=structuredClone(character);
  const regular=make({character}),reduced=make({character,roughRide:true});
  assert.deepEqual(regular.opponents.map(o=>o.health),[60,70]);
  assert.deepEqual(reduced.opponents.map(o=>o.health),[50,60]);assert.deepEqual(reduced.opponents.map(o=>o.maxHealth),[50,60]);
  assert.deepEqual(character,before);assert.deepEqual(reduced.character.keywords,[keyword]);assert.equal(reduced.character.gold,12);
});

test('rough ride cannot stack both keywords or apply without an eligible keyword',()=>{
  assert.deepEqual(make({character:{keywords:['frazzled','rocked']},roughRide:true}).opponents.map(o=>o.health),[50,60]);
  assert.deepEqual(make({roughRide:true}).opponents.map(o=>o.health),[60,70]);
  assert.deepEqual(make({character:{keywords:['unfrazzled']},roughRide:true}).opponents.map(o=>o.health),[60,70]);
  assert.throws(()=>make({roughRide:'yes'}),/rough ride/);
});

test('transport attacks are allowed but zero stability removes their associated ability',()=>{
  const setup=stability=>make({abilities:{'nail-gun':1},equipment:{transport:{stability,toughness:5,abilities:['nail-gun']}}});
  let fight=resolveDestinySpeed(rollDestinySpeed(startDestinyRound(setup(1),0,rolls()),rolls(6,6,1,1)));
  assert.equal(use(fight,'nail-gun',{target:0},rolls(3,3)).used['nail-gun'],1);
  fight=resolveDestinySpeed(rollDestinySpeed(startDestinyRound(setup(0),0,rolls()),rolls(6,6,1,1)));
  assert.throws(()=>use(fight,'nail-gun',{target:0},rolls()),/unavailable/);
});

test('cloud damage can kill the hero and records only one loss',()=>{
  let fight=make();fight.hero.health=2;fight=round(fight);assert.equal(fight.status,'loss');assert.equal(fight.hero.health,0);
  assert.equal(fight.history.filter(row=>row.type==='outcome').length,1);
  assert.throws(()=>endDestinyRound(fight,[],rolls()),/unavailable/);
});

test('growth cap and decay read editable encounter metadata',()=>{
  let fight=make();Object.assign(fight.encounter.roundRampingDamage[0],{initial:3,growth:2,maximum:7,decay:2});
  fight=round(round(round(fight)));assert.equal(fight.hero.health,185);
  fight.hero.brawn=100;fight=finish(attack(fight,1));assert.equal(fight.hero.health,178);
  fight.hero.brawn=0;fight=round(fight);assert.equal(fight.hero.health,173);
});
