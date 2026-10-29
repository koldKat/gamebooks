import { readRosterDocument } from '../../helpers/roster-db.cjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {startCrossroadsFight,crossroadsRound,encounterTargets} from '../../../public/js/battlesim/engines/crossroads/core.js';
const roster=readRosterDocument(1295);
const entries=[...new Map(roster.enemies.map(row=>[row.stats.entry.section,row.stats.entry])).values()];
const hero={strength:11,intelligence:14,wisdom:11,constitution:13,dexterity:15,charisma:3,hp:17,maxHp:17};
function preset(section,changes={}){const e=entries.find(e=>e.section===String(section));return startCrossroadsFight({...hero,...changes},e.enemies,e.rules,e.weapons[0]?.damage??{dice:1,add:0});}
function step(f,values,options={}){let i=0;const next=crossroadsRound(f,{...options,roll(){assert.ok(i<values.length,'unexpected die');return values[i++];}});assert.equal(i,values.length,'unused dice');return next;}
const attacks=(f,side)=>f.events.filter(e=>e.kind==='attack'&&e.side===side);
test('all seven source tables and nineteen database opponents start; custom hero damage is required where unprinted',()=>{
 assert.equal(entries.length,7);assert.equal(roster.enemies.length,19);
 for(const e of entries){assert.equal(preset(e.section).rulesVersion,2);assert.ok(e.printedRules.length);}
 const e=entries.find(e=>e.section==='19');assert.equal(e.weapons.length,0);assert.throws(()=>startCrossroadsFight(hero,e.enemies,e.rules));
});
test('duplicates grant three attacks in rounds one and two, then expire; fresh guards join only for the following round',()=>{
 let f=preset(10);
 f=step(f,Array(15).fill(1));assert.equal(attacks(f,'hero').length,3);assert.equal(attacks(f,'enemy').length,2);assert.equal(f.enemies.length,3);
 f=step(f,Array(18).fill(1));assert.equal(attacks(f,'hero').length,3);assert.equal(attacks(f,'enemy').length,3);assert.equal(f.enemies.length,4);
 f=step(f,Array(15).fill(1));assert.equal(attacks(f,'hero').length,1);assert.equal(attacks(f,'enemy').length,4);assert.equal(f.enemies.length,5);
 assert.equal(encounterTargets(f).length,5);
});
test('duplicate hits are absorbed without damage rolls; rolls one and two hit the real Shea',()=>{
 const f=step(preset(10),[...Array(9).fill(1),6,6,6,3,6,6,6,2,4]);
 assert.equal(f.hero.hp,13);assert.equal(f.events.filter(e=>e.kind==='absorbed').length,1);assert.equal(attacks(f,'enemy')[0].damage,0);
});
test('defeating both guards prevents a new guard and ends before further duplicate attacks',()=>{
 const f=preset(10);f.weaponDamage={dice:0,add:3};const next=step(f,Array(6).fill(6));assert.equal(next.status,'win');assert.equal(next.destination,'36');assert.equal(next.enemies.length,2);
});
test('reinforcements remain unbounded by a fabricated finite roster or turn limit',()=>{
 let f=preset(10,{hp:1000,maxHp:1000});for(let round=1;round<=12;round++)f=step(f,Array((round<=2?9:3)+3*(round+1)).fill(1));
 assert.equal(f.status,'active');assert.equal(f.enemies.length,14);assert.ok(f.enemies.every(e=>e.maxHp===3&&e.attacks[0].toHit===14));
});
test('Belphebe deals one automatic damage to the chosen engaged goblin and holds back the source number',()=>{
 let f=step(preset(18),Array(9).fill(1),{allyTarget:0});assert.equal(f.enemies[0].hp,2);assert.equal(attacks(f,'enemy').length,2);assert.equal(attacks(f,'ally')[0].target,0);
 f.enemies[1].hp=f.enemies[2].hp=0;f=step(f,Array(6).fill(1),{allyTarget:0});assert.equal(attacks(f,'enemy').length,1);
 f.enemies[0].hp=0;f=step(f,Array(6).fill(1),{target:3,allyTarget:3});assert.equal(attacks(f,'ally').length,0);assert.equal(attacks(f,'enemy').length,1);
});
test('three goblins and two wolves retain their different held-off attacker counts',()=>{
 let f=step(preset(25),Array(9).fill(1));assert.equal(attacks(f,'enemy').length,2);
 f.enemies[0].hp=0;f=step(f,Array(6).fill(1),{target:1});assert.equal(attacks(f,'enemy').length,1);
 assert.equal(attacks(step(preset(84),Array(6).fill(1)),'enemy').length,1);
});
test('escape is one optional check after a completed round, never another attack or reinforcement',()=>{
 const initial=preset(19);assert.throws(()=>step(initial,[],{action:'escapeCheck'}));
 const f=step(initial,Array(9).fill(1));const saved=structuredClone(f);
 const failed=step(f,[6,6,6],{action:'escapeCheck'});assert.equal(failed.round,1);assert.equal(attacks(failed,'enemy').length,0);assert.equal(failed.status,'active');assert.throws(()=>step(failed,[],{action:'escapeCheck'}));assert.deepEqual(f,saved);
 const next=step(failed,Array(9).fill(1));const escaped=step(next,[5,5,5],{action:'escapeCheck'});assert.equal(escaped.round,2);assert.equal(escaped.destination,'58');assert.equal(escaped.status,'escaped');
 for(const [section,dest]of [[34,'94'],[68,'92'],[84,'46']]){let g=preset(section);g=step(g,Array(section===34||section===68||section===84?6:9).fill(1));g=step(g,[5,5,5],{action:'escapeCheck'});assert.equal(g.destination,dest);}
});
test('five printed goblins arrive one per round and cannot be skipped by killing the first',()=>{
 let f=preset(68);f.weaponDamage={dice:0,add:3};f=step(f,[6,6,6]);assert.equal(f.status,'active');assert.deepEqual(encounterTargets(f),[1]);
 f=step(f,Array(6).fill(1),{target:1});assert.equal(attacks(f,'enemy').length,1);assert.deepEqual(encounterTargets(f),[1,2]);
});
test('the vest blocks one damage per hit, never produces healing, and works in custom fights',()=>{
 const f=step(preset(34,{damageReduction:1}),[1,1,1,6,6,6,3]);assert.equal(f.hero.hp,14);
 const g=step(preset(19,{damageReduction:1}),[1,1,1,6,6,6,1,1,1,1]);assert.equal(g.hero.hp,17);
 let custom=startCrossroadsFight({...hero,damageReduction:1},[{name:'Test',hp:9,toBeHit:18,attacks:[{toHit:3,damage:{dice:0,add:1}}]}],{},{dice:0,add:0});
 custom=step(custom,Array(6).fill(1));assert.equal(custom.hero.hp,17);
});
test('healing replaces every duplicate attack while enemies still act and reinforcements arrive',()=>{
 const f=step(preset(10,{hp:10}),Array(6).fill(1),{healing:10});assert.equal(f.hero.hp,17);assert.equal(attacks(f,'hero').length,0);assert.equal(f.enemies.length,3);
});
test('invalid ally targets, rolls and actions leave the original fight unchanged',()=>{
 const f=preset(18),before=structuredClone(f);assert.throws(()=>step(f,[],{allyTarget:12}));assert.throws(()=>step(f,[9]));assert.deepEqual(f,before);
 assert.throws(()=>step(preset(34),[],{action:'unknown'}));
});
