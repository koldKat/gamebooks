import test from 'node:test';
import assert from 'node:assert/strict';
import {loadFixtureRoster} from './roster-fixtures.mjs';
import {CHAMPION_RULES} from '../../../public/js/battlesim/books/773/definition.js';
import * as combat from '../../../public/js/battlesim/books/773/combat.js';

await loadFixtureRoster(773);
const player=changes=>({...combat.newCharacter(()=>6),...changes});
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die');return values.shift();};
const withRules=run=>{const original=structuredClone(CHAMPION_RULES);try{run();}finally{Object.assign(CHAMPION_RULES,original);}};

test('Champions fear and missing sword destinations use metadata',()=>withRules(()=>{
  CHAMPION_RULES.swordFailure=999;
  assert.equal(combat.startFight(311,player()).destination,999);
  CHAMPION_RULES.fear={maximum:3,destination:998};
  const result=combat.round(combat.startFight(29,player()),0,rolls(3));
  assert.equal(result.outcome,'loss');assert.equal(result.destination,998);
}));

test('Champions tug and drowning limits use metadata',()=>withRules(()=>{
  CHAMPION_RULES.tugWins=1;
  const tug=combat.round(combat.startFight(369,player()),0,rolls(6,6,1,1));
  assert.equal(tug.outcome,'win');assert.equal(tug.destination,352);
  CHAMPION_RULES.drowningRounds=1;
  assert.equal(combat.round(combat.startFight(356,player({skill:0})),0,()=>1).outcome,'loss');
}));

test('Champions hammer and companion damage use metadata without changing input fights',()=>withRules(()=>{
  CHAMPION_RULES.withoutHammerDamage=3;
  const hammer=combat.round(combat.startFight(329,player()),0,rolls(6,6,1,1));
  assert.equal(hammer.pending[0].damage,3);
  CHAMPION_RULES.companionDrain=4;
  const fight=combat.startFight(186,player()),saved=structuredClone(fight);
  const result=combat.round(fight,0,rolls(6,6,1,1));
  assert.equal(result.pending.at(-1).kind,'automatic');assert.equal(result.pending.at(-1).damage,4);
  assert.deepEqual(fight,saved);
}));

test('Champions fire tables read metadata and preserve saved rounds, wounds and extensions',()=>withRules(()=>{
  CHAMPION_RULES.fire.demon[2]=5;
  const fight=combat.startFight(127,player({stamina:17}));
  fight.rounds=4;fight.enemies[0].stamina=7;fight.extension={keep:true};
  const saved=JSON.parse(JSON.stringify(fight)),snapshot=structuredClone(saved);
  let result=combat.round(saved,0,rolls(6,6,1,1,3));
  assert.equal(result.pending.at(-1).damage,5);
  result=combat.resolveLuck(result,false);result=combat.resolveLuck(result,false);
  assert.equal(result.character.stamina,12);assert.equal(result.enemies[0].stamina,5);assert.equal(result.rounds,5);
  assert.deepEqual(result.extension,{keep:true});assert.deepEqual(saved,snapshot);
}));

test('Champions bleeding damage uses metadata independently of ordinary incoming hits',()=>withRules(()=>{
  CHAMPION_RULES.bleedingDamage=5;
  const result=combat.round(combat.startFight(325,player(),{applyEntry:false}),0,rolls(1,1,6,6));
  assert.equal(result.pending.length,1);assert.equal(result.pending[0].kind,'automatic');assert.equal(result.pending[0].damage,5);
}));
