import { readRosterDocument } from '../../helpers/roster-db.cjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {startCrossroadsFight,crossroadsRound} from '../../../public/js/battlesim/engines/crossroads/core.js';
import {createCrossroadsState} from '../../../public/js/battlesim/engines/crossroads/state.js';
import {definition} from '../../../public/js/battlesim/books/1300/definition.js';

const roster=readRosterDocument(1300);
const entries=[...new Map(roster.enemies.map(row=>[row.stats.entry.section,row.stats.entry])).values()];
function preset(section,hero={}){
  const entry=entries.find(entry=>entry.section===String(section));
  return startCrossroadsFight({...definition.defaultHero,...hero},entry.enemies,entry.rules);
}
function step(fight,values,options={}){
  let i=0;
  const result=crossroadsRound(fight,{...options,roll(){assert.ok(i<values.length,'unexpected die');return values[i++];}});
  assert.equal(i,values.length,'unused dice');return result;
}
const attacks=fight=>fight.events.filter(event=>event.kind==='attack'&&event.side==='enemy');

test('only the two numerical encounters are presets, using Geordie’s printed record',()=>{
  assert.deepEqual(entries.map(e=>e.section),['14','26']);assert.equal(roster.enemies.length,3);
  assert.equal(definition.defaultHero.hp,19);assert.equal(definition.defaultHero.wisdom,11);
  assert.equal(definition.defaultHero.dexterity,13);assert.equal(definition.defaultHero.strength,13);
  for(const entry of entries){assert.ok(entry.printedRules.length);assert.ok(entry.sourcePages.length);}
});

test('defeating either giant immediately makes the survivor flee without a free attack or kill',()=>{
  for(const target of [0,1]){
    const original=preset(14),fight=step(original,[6,6,6,4],{target});
    assert.equal(fight.status,'win');assert.equal(fight.destination,'20');assert.equal(fight.hero.hp,19);
    assert.equal(fight.enemies[target].hp,0);assert.equal(fight.enemies[1-target].hp,4);
    assert.equal(fight.enemies[1-target].fled,true);assert.equal(attacks(fight).length,0);
    assert.equal(fight.damageDealt,4);assert.ok(fight.events.some(e=>e.kind==='fled'));
    assert.equal(original.enemies[target].hp,4);
  }
});

test('both surviving giants attack, and fist damage cannot become negative',()=>{
  const fight=step(preset(14),[1,1,1,6,6,6,1,6,6,6,1]);
  assert.equal(attacks(fight).length,2);assert.deepEqual(attacks(fight).map(e=>e.damage),[0,0]);
  assert.equal(fight.status,'active');assert.equal(fight.hero.hp,19);
  const loss=step(preset(14,{hp:1}),[1,1,1,6,6,6,2]);
  assert.equal(loss.status,'loss');assert.equal(loss.destination,'11');
});

test('Jarmuth’s opening dagger wound is applied exactly once across a saved fight',()=>{
  let fight=step(preset(26),[1,1,1,1,1,1]);
  assert.equal(fight.hero.hp,17);assert.equal(fight.damageTaken,2);
  assert.ok(fight.events.some(e=>e.kind==='openingDamage'&&e.amount===2));
  fight=step(JSON.parse(JSON.stringify(fight)),[1,1,1,1,1,1]);
  assert.equal(fight.hero.hp,17);assert.equal(fight.damageTaken,2);
  assert.equal(fight.events.some(e=>e.kind==='openingDamage'),false);
  const dead=step(preset(26,{hp:2}),[]);assert.equal(dead.status,'loss');assert.equal(dead.destination,'27');
});

test('Jarmuth’s victory and defeat routes preserve real damage without automatic healing',()=>{
  let fight=step(preset(26),[6,6,6,6,1,1,1]);
  fight=step(fight,[6,6,6,1]);assert.equal(fight.status,'win');assert.equal(fight.destination,'45');
  assert.equal(fight.hero.hp,17);assert.equal(fight.enemies[0].hp,0);
  const loss=step(preset(26,{hp:3}),[1,1,1,6,6,6,1]);
  assert.equal(loss.status,'loss');assert.equal(loss.destination,'27');assert.equal(loss.hero.hp,0);
});

test('custom combat and state updates preserve universal items and other simulators',()=>{
  const entry=entries[1],custom=startCrossroadsFight(definition.defaultHero,entry.enemies,entry.customRules,{dice:0,add:7});
  assert.equal(step(custom,[6,6,6]).hero.hp,19);
  const run={inventory:[{name:'shared'}],equipment:{weapon:'shared'},sim1299:{sentinel:true},sim1300:{character:{...definition.defaultHero},setup:{},fight:null,history:[],log:[]}};
  let saves=0;
  const state=createCrossroadsState(definition,()=>({getBookId:()=>1300,getRun:()=>run,saveState:()=>saves++}));
  state.change(data=>{data.fight=step(preset(26),[1,1,1,1,1,1]);});
  assert.equal(saves,1);assert.equal(run.sim1300.character.hp,17);
  assert.deepEqual(run.inventory,[{name:'shared'}]);assert.deepEqual(run.equipment,{weapon:'shared'});
  assert.deepEqual(run.sim1299,{sentinel:true});
  const invalid=structuredClone(entries[0].rules);invalid.mechanics.enemyMorale.outcome='kill';
  assert.throws(()=>startCrossroadsFight(definition.defaultHero,entries[0].enemies,invalid));
});
