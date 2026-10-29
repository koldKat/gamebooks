import { readRosterDocument } from '../../helpers/roster-db.cjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {startCrossroadsFight,crossroadsRound} from '../../../public/js/battlesim/engines/crossroads/core.js';
import {createCrossroadsState} from '../../../public/js/battlesim/engines/crossroads/state.js';
import {definition} from '../../../public/js/battlesim/books/1299/definition.js';
const roster=readRosterDocument(1299);
const entries=[...new Map(roster.enemies.map(row=>[row.stats.entry.section,row.stats.entry])).values()];
function preset(section,hero={},weapon={dice:1,add:0}){
 const entry=structuredClone(entries.find(entry=>entry.section===String(section)));
 if(entry.rules.mechanics.struggle)entry.rules.mechanics.struggle.retrievedDamage={dice:2,add:0};
 return startCrossroadsFight({...definition.defaultHero,...hero},entry.enemies,entry.rules,weapon);
}
function step(fight,values,options={}){
 let i=0;
 const result=crossroadsRound(fight,{...options,roll(){assert.ok(i<values.length,'unexpected die');return values[i++];}});
 assert.equal(i,values.length,'unused dice');return result;
}
const enemyAttacks=f=>f.events.filter(event=>event.kind==='attack'&&event.side==='enemy');

test('six complete source groups use thirteen database NPCs and Random’s record',()=>{
 assert.equal(entries.length,6);assert.equal(roster.enemies.length,13);
 assert.deepEqual(entries.map(entry=>Number(entry.section)),[33,35,51,76,89,102]);
 for(const entry of entries){assert.ok(entry.printedRules.length);assert.ok(entry.sourcePages.length);}
 assert.equal(definition.defaultHero.hp,23);assert.equal(definition.defaultHero.strength,11);assert.equal(definition.defaultHero.dexterity,13);
 for(const section of [33,35,51,76,89])assert.equal(entries.find(e=>e.section===String(section)).rules.heroDamage,undefined);
 const brand=entries[0];assert.equal(brand.rules.mechanics.struggle.retrievedDamage,null);
 assert.throws(()=>startCrossroadsFight(definition.defaultHero,brand.enemies,brand.rules,{dice:1,add:0}));
});

test('Brand’s hold needs both a successful hit and damage above two, without wounding him',()=>{
 let fight=preset(33);
 fight=step(fight,[1,1,1,1,1,1]);assert.equal(fight.encounter.struggleStage,'held');
 fight=step(fight,[6,6,6,2,1,1,1]);assert.equal(fight.encounter.struggleStage,'held');
 fight=step(fight,[6,6,6,3,1,1,1]);assert.equal(fight.encounter.struggleStage,'unarmed');
 assert.equal(fight.enemies[0].hp,42);assert.equal(fight.damageDealt,0);assert.equal(fight.events[0].kind,'holdAttempt');
 assert.equal(fight.events[0].passed,true);assert.equal(enemyAttacks(fight).length,1);
});

test('the struggle wounds carry into fencing and each retrieval attempt takes its own round',()=>{
 let fight=step(preset(33),[6,6,6,3,1,1,1]);
 fight=step(fight,[6,6,6,3,1,1,1]);assert.equal(fight.enemies[0].hp,39);assert.equal(fight.encounter.struggleStage,'unarmed');
 fight=step(fight,[6,6,6,4,1,1,1]);assert.equal(fight.enemies[0].hp,35);assert.equal(fight.encounter.struggleStage,'retrieve');
 fight=step(fight,[6,6,6,1,1,1]);assert.equal(fight.encounter.struggleStage,'retrieve');assert.equal(fight.events.some(e=>e.side==='hero'),false);
 fight=step(fight,[1,1,1,1,1,1]);assert.equal(fight.encounter.struggleStage,'fencing');
 assert.equal(fight.enemies[0].hp,35);assert.equal(fight.enemies[0].maxHp,42);assert.equal(fight.enemies[0].toBeHit,6);
 assert.deepEqual(fight.enemies[0].attacks,[{toHit:6,damage:{dice:2,add:2}}]);assert.deepEqual(fight.weaponDamage,{dice:2,add:0});
 fight=step(fight,[6,6,6,1,1,1,1,1]);assert.equal(fight.enemies[0].hp,33);
});

test('healing cannot replace the sole hold-breaking or retrieval action',()=>{
 const held=preset(33,{hp:10}),before=structuredClone(held);
 assert.throws(()=>step(held,[],{healing:1}));assert.deepEqual(held,before);
 const retrieve=preset(33,{hp:10});retrieve.encounter={arrivals:{},struggleStage:'retrieve'};
 assert.throws(()=>step(retrieve,[],{healing:1}));
});

function fleeingBrand(){
 const fight=preset(33,{}, {dice:0,add:2});fight.encounter={arrivals:{},struggleStage:'fencing'};fight.enemies[0].hp=5;
 return step(fight,[6,6,6]);
}
test('a living Brand flees at three HP, with one pursuit roll and a real choice after capture',()=>{
 let fight=fleeingBrand();assert.equal(fight.encounter.retreatPending,true);assert.equal(fight.enemies[0].hp,3);assert.equal(enemyAttacks(fight).length,0);
 const original=structuredClone(fight);assert.throws(()=>step(fight,[]));assert.deepEqual(fight,original);
 fight=step(fight,[1,1,1],{action:'pursue'});assert.equal(fight.round,1);assert.equal(fight.encounter.retreatCaught,true);
 assert.throws(()=>step(fight,[],{action:'pursue'}));
 fight=step(fight,[1,1,1],{action:'subdue'});assert.equal(fight.status,'win');assert.equal(fight.destination,'31');assert.equal(fight.round,1);
 const escaped=step(fleeingBrand(),[6,6,6],{action:'pursue'});assert.equal(escaped.status,'loss');assert.equal(escaped.destination,'36');
});

test('continuing or failing subdual resumes combat without free repeated Strength checks',()=>{
 for(const subdue of [false,true]){
  let fight=step(fleeingBrand(),[1,1,1],{action:'pursue'});
  fight=step(fight,subdue?[6,6,6]:[],{action:subdue?'subdue':'continueFight'});
  assert.equal(fight.status,'active');assert.equal(fight.round,1);assert.equal(fight.encounter.retreatIgnored,true);
  assert.throws(()=>step(fight,[],{action:'subdue'}));
  fight=step(fight,[6,6,6,1,1,1]);assert.equal(fight.enemies[0].hp,1);assert.equal(fight.encounter.retreatPending,false);
 }
});

test('the first church death applies the literal minus one; the second ends with surrender',()=>{
 let fight=preset(35,{}, {dice:0,add:14});
 fight=step(fight,[6,6,6,...Array.from({length:6},()=>[1,2,2,1]).flat()]);
 assert.equal(fight.enemies[0].hp,0);assert.equal(enemyAttacks(fight).length,6);assert.ok(enemyAttacks(fight).every(e=>e.total===5&&e.hit&&e.damage===0));
 fight=step(fight,[6,6,6],{target:1});assert.equal(fight.status,'win');assert.equal(fight.destination,'23');
 assert.equal(fight.enemies.filter(e=>e.hp===0).length,2);assert.equal(enemyAttacks(fight).length,0);assert.ok(fight.events.some(e=>e.kind==='enemiesSurrender'));
});

test('the church cannot kill Random, and surrender keeps his real injuries',()=>{
 const fight=step(preset(35,{hp:4}),[1,1,1,6,6,6,6]);
 assert.equal(fight.status,'loss');assert.equal(fight.destination,'25');assert.equal(fight.hero.hp,1);assert.equal(fight.damageTaken,3);
 assert.equal(enemyAttacks(fight).length,1);assert.equal(fight.startingHp,4);
 const injured=step(preset(35,{hp:3}),[]);assert.equal(injured.status,'loss');assert.equal(injured.hero.hp,3);
});

test('the sentry’s threshold always resolves the capture or alarm check',()=>{
 for(const [values,status,destination]of [[[1,1,1],'win','48'],[[6,6,6],'draw','59']]){
  let fight=step(preset(51,{}, {dice:0,add:20}),[6,6,6]);
  assert.equal(fight.enemies[0].hp,1);assert.equal(fight.encounter.retreatPending,true);assert.equal(enemyAttacks(fight).length,0);
  fight=step(fight,values,{action:'pursue'});assert.equal(fight.status,status);assert.equal(fight.destination,destination);
 }
 const dead=step(preset(51,{hp:1}),[1,1,1,6,6,6,1]);assert.equal(dead.status,'loss');assert.equal(dead.destination,'54');
});

test('normal lethal fights keep both brothers’ attacks and their source destinations',()=>{
 let fight=step(preset(89),[1,1,1,2,2,2,1,1,2,2,2,1,1]);
 assert.deepEqual(enemyAttacks(fight).map(e=>e.damage),[3,2]);
 fight=step(preset(76,{}, {dice:0,add:20}),[6,6,6]);assert.equal(fight.status,'win');assert.equal(fight.destination,'79');
 const dead=step(preset(89,{hp:1}),[1,1,1,2,2,2,1,1]);assert.equal(dead.status,'loss');assert.equal(dead.destination,'28');
});

test('the monk’s genuinely missing stats stay blank and both printed damage rolls floor at zero',()=>{
 const monk=structuredClone(entries.find(entry=>entry.section==='102'));
 assert.equal(monk.enemies[0].hp,null);assert.equal(monk.enemies[0].toBeHit,null);assert.equal(monk.enemies[0].attacks[0].toHit,null);
 assert.throws(()=>startCrossroadsFight(definition.defaultHero,monk.enemies,monk.rules));
 Object.assign(monk.enemies[0],{hp:8,toBeHit:10});monk.enemies[0].attacks[0].toHit=12;
 const fight=step(startCrossroadsFight(definition.defaultHero,monk.enemies,monk.rules),[6,6,6,1,4,4,4,1]);
 assert.equal(fight.enemies[0].hp,8);assert.equal(fight.hero.hp,23);assert.deepEqual(fight.events.filter(e=>e.kind==='attack').map(e=>e.damage),[0,0]);
});

test('run-scoped saves keep player items, old simulator state and unresolved pursuit intact',()=>{
 const run={inventory:[{name:'sentinel'}],equipment:{weapon:'sentinel'},sim1298:{sentinel:true},sim1299:{character:{...definition.defaultHero},fight:null,setup:{},history:[],log:[]}};
 let saves=0,bookId=1299;const state=createCrossroadsState(definition,()=>({getBookId:()=>bookId,getRun:()=>run,saveState:()=>saves++}));
 state.change(data=>{data.fight=fleeingBrand();});assert.equal(run.sim1299.fight.encounter.retreatPending,true);assert.equal(saves,1);
 const before=structuredClone(run);assert.throws(()=>state.change(data=>{data.fight=crossroadsRound(data.fight);}));assert.deepEqual(run,before);assert.equal(saves,1);
 state.change(data=>{data.fight=step(data.fight,[1,1,1],{action:'pursue'});});state.change(data=>{data.fight=step(data.fight,[1,1,1],{action:'subdue'});});
 assert.equal(run.sim1299.history.length,1);state.change(()=>{});assert.equal(run.sim1299.history.length,1);
 bookId=9999;assert.equal(state.change(()=>{throw Error('stale update');}),false);
 assert.deepEqual(run.inventory,[{name:'sentinel'}]);assert.deepEqual(run.equipment,{weapon:'sentinel'});assert.deepEqual(run.sim1298,{sentinel:true});
});
