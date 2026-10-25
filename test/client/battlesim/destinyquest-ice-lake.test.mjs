import test from 'node:test';
import assert from 'node:assert/strict';
import {createWinterFight,WINTER_ENCOUNTERS,resolveDestinyAbilityRoll} from './destinyquest-fixtures.mjs';
import {createWinterFight as create} from '../../../public/js/battlesim/engines/destinyquest/winters-fury.js';
import * as core from '../../../public/js/battlesim/engines/destinyquest/core.js';
const hero={speed:0,brawn:0,armour:0,health:1000};
const rolls=(...v)=>()=>{assert.ok(v.length,'Unexpected die');return v.shift();};
const setup=(extra={})=>createWinterFight({...hero,...extra},702);
const combat=f=>{
  f=core.startDestinyRound(f,0);f=core.resolveDestinySpeed(core.rollDestinySpeed(f,rolls(1,1,6,6)));
  if(f.phase==='damage')f=core.resolveDestinyDamage(core.rollDestinyDamage(f,()=>1));return f;
};
const finish=(f,options={})=>{
  f=core.endDestinyRound(f,[],()=>6,options);
  if(f.phase==='ability-rolled')f=resolveDestinyAbilityRoll(JSON.parse(JSON.stringify(f)));return f;
};
test('cracks advance once at round start and losing health forces one column back',()=>{
  const original=setup(),f=combat(original);assert.equal(original.encounter.iceLake.cracked,0);
  assert.equal(f.encounter.iceLake.cracked,1);assert.equal(f.encounter.iceLake.position,4);assert.equal(f.hero.health,994);
  const end=finish(f);assert.equal(end.phase,'start');assert.equal(end.encounter.iceLake.position,4);
});
test('armour preventing health damage also prevents retreat',()=>{
  const f=combat(setup({armour:99}));assert.equal(f.turn.winner,'opponent');assert.equal(f.turn.healthDamage,0);
  assert.equal(f.encounter.iceLake.position,5);
});
test('winning allows an optional advance and clamps movement at the starting column',()=>{
  const roster=structuredClone(WINTER_ENCOUNTERS);roster.find(e=>e.section==='702').adapter.rules.iceLake.position=4;
  const initial=create({...hero,speed:30},702,{roster}),f=combat(initial);
  assert.equal(f.turn.winner,'hero');assert.equal(finish(f).encounter.iceLake.position,5);
  assert.equal(finish(f,{advanceOnIce:false}).encounter.iceLake.position,4);
  assert.equal(finish(combat(setup({speed:30}))).encounter.iceLake.position,5);
});
test('a standoff does not advance or retreat the player',()=>{
  let f=core.startDestinyRound(setup({speed:6}),0);f=core.resolveDestinySpeed(core.rollDestinySpeed(f,rolls(1,1,1,1)));
  assert.equal(f.turn.winner,'standoff');assert.equal(finish(f).encounter.iceLake.position,5);
});
test('repeated pushes stop at column one and cracks stop at the last column',()=>{
  let f=setup();for(let i=0;i<8;i++)f=finish(combat(JSON.parse(JSON.stringify(f))));
  assert.equal(f.encounter.iceLake.position,1);assert.equal(f.encounter.iceLake.cracked,5);assert.equal(f.status,'active');
});
test('a footing roll is saved after end effects and succeeds on exactly four',()=>{
  let f=setup();for(let i=0;i<2;i++)f=finish(combat(f));f=combat(f);
  f=core.endDestinyRound(f,[{target:'hero',amount:3,ignoreArmour:true,source:'test'}],()=>4);
  assert.equal(f.phase,'ability-rolled');assert.deepEqual(f.turn.pendingAbility.dice,[4]);assert.equal(f.hero.health,979);
  assert.throws(()=>core.endDestinyRound(f),/stage/);
  f=resolveDestinyAbilityRoll(JSON.parse(JSON.stringify(f)));assert.equal(f.phase,'start');assert.equal(f.hero.health,979);
  assert.equal(f.history.filter(e=>e.type==='passive'&&e.source==='test').length,1);
});
test('a three on cracked ice loses the combat without dealing invented health damage',()=>{
  let f=setup();for(let i=0;i<2;i++)f=finish(combat(f));f=combat(f);
  const health=f.hero.health;f=core.endDestinyRound(f,[],()=>3);f=resolveDestinyAbilityRoll(f);
  assert.equal(f.status,'loss');assert.equal(f.hero.health,health);assert.equal(f.opponents[0].health,60);
});
test('defeating Desnar ends combat without an extra footing roll',()=>{
  const f=combat(setup({speed:30,brawn:100}));assert.equal(f.status,'win');assert.equal(f.opponents[0].health,0);
});
test('invalid footing dice do not mutate the original saved round',()=>{
  let f=setup();for(let i=0;i<2;i++)f=finish(combat(f));f=combat(f);const before=structuredClone(f);
  assert.throws(()=>core.endDestinyRound(f,[],()=>7),/1-6/);assert.deepEqual(f,before);
  assert.throws(()=>core.endDestinyRound(f,[],()=>6,{advanceOnIce:'yes'}),/Choose/);assert.deepEqual(f,before);
});
test('lake dimensions, steps and failure threshold come from roster metadata',()=>{
  const roster=structuredClone(WINTER_ENCOUNTERS),lake=roster.find(e=>e.section==='702').adapter.rules.iceLake;
  Object.assign(lake,{columns:8,position:8,crackStep:8,retreatStep:2});lake.endCheck.limit=5;
  let f=combat(create(hero,702,{roster}));assert.equal(f.encounter.iceLake.position,6);
  f=core.endDestinyRound(f,[],()=>5);assert.equal(resolveDestinyAbilityRoll(f).status,'loss');
});
