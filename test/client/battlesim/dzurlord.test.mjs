import { readRosterDocument } from '../../helpers/roster-db.cjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {startCrossroadsFight,crossroadsRound,encounterTargets} from '../../../public/js/battlesim/engines/crossroads/core.js';
const roster=readRosterDocument(1296);
const entries=[...new Map(roster.enemies.map(row=>[row.stats.entry.section,row.stats.entry])).values()];
const hero={strength:14,intelligence:10,wisdom:8,constitution:15,dexterity:15,charisma:13,hp:18,maxHp:18};
function preset(section,changes={}){const e=structuredClone(entries.find(e=>e.section===String(section)));if(section===16)e.enemies[0].attacks[0].toHit=8;return startCrossroadsFight({...hero,...changes},e.enemies,e.rules,{dice:0,add:0});}
function step(f,values,options={}){let i=0;const next=crossroadsRound(f,{...options,roll(){assert.ok(i<values.length,'unexpected die');return values[i++];}});assert.equal(i,values.length,'unused dice');return next;}
const attacks=(f,side)=>f.events.filter(e=>e.kind==='attack'&&e.side===side);
test('all thirteen source tables and fifty-four NPC/template rows load without filling the printed omissions',()=>{
 assert.equal(entries.length,13);assert.equal(roster.enemies.length,54);
 for(const e of entries){assert.equal(preset(Number(e.section)).rulesVersion,2);assert.ok(e.printedRules.length);assert.equal(e.weapons.length,0);}
 const missing=entries.find(e=>e.section==='16');assert.equal(missing.enemies[0].attacks[0].toHit,null);assert.throws(()=>startCrossroadsFight(hero,missing.enemies,missing.rules,{dice:1,add:0}));
 assert.equal(entries.find(e=>e.section==='102').repeatFirstEnemy,true);
});
test('the sentry surprise is a free hero round without an invented die roll, then a three-round cutoff',()=>{
 let f=step(preset(7),[1,1,1]);assert.equal(attacks(f,'enemy').length,0);
 f=step(f,Array(6).fill(1));assert.equal(attacks(f,'enemy').length,1);
 f=step(f,Array(6).fill(1));assert.equal(f.status,'draw');assert.equal(f.destination,'44');
 let win=step(preset(7),[1,1,1]);win=step(win,Array(6).fill(1));win.weaponDamage={dice:0,add:9};win=step(win,[6,6,6]);assert.equal(win.status,'win');assert.equal(win.destination,'63');
});
test('the guardsman also cannot retaliate in the surprise round',()=>{
 let f=step(preset(84),[1,1,1]);assert.equal(attacks(f,'enemy').length,0);f=step(f,Array(6).fill(1));assert.equal(attacks(f,'enemy').length,1);
});
test('Tollifer must be fought first and both surviving men attack; unengaged Saan escapes after round four',()=>{
 let f=preset(12);assert.throws(()=>step(f,[],{target:1}));
 for(let i=0;i<4;i++)f=step(f,Array(9).fill(1));assert.equal(attacks(f,'enemy').length,2);assert.equal(f.status,'draw');assert.equal(f.destination,'41');
});
test('directly engaging Saan prevents teleportation, even if the attack misses',()=>{
 let f=preset(12);f.weaponDamage={dice:0,add:10};f=step(f,[6,6,6,1,1,1]);assert.equal(f.enemies[0].hp,0);
 for(let i=0;i<3;i++)f=step(f,Array(6).fill(1),{target:1});assert.equal(f.status,'active');assert.ok(f.encounter.engagedTargets.includes(1));
});
test('twelve hounds fight in three lanes and replacements cannot attack in the killing round',()=>{
 let f=preset(15);assert.deepEqual(encounterTargets(f),[0,1,2]);f.weaponDamage={dice:0,add:6};f=step(f,[6,6,6,...Array(6).fill(1)]);
 assert.equal(attacks(f,'enemy').length,2);assert.deepEqual(encounterTargets(f),[1,2,3]);assert.equal(f.enemies[3].hp,6);
});
test('the crossbow alternates rounds while the axman attacks every round',()=>{
 let f=step(preset(16),Array(9).fill(1));assert.equal(attacks(f,'enemy').length,2);
 f=step(f,Array(6).fill(1));assert.equal(attacks(f,'enemy').length,1);
 f=step(f,Array(9).fill(1));assert.equal(attacks(f,'enemy').length,2);
});
test('a claw hit permits a separately rolled bite even when claw damage is zero, without invented poison',()=>{
 const f=step(preset(78),[1,1,1,4,4,4,1,4,4,4,1]);assert.equal(attacks(f,'enemy').length,2);assert.equal(attacks(f,'enemy')[0].damage,0);assert.equal(f.hero.hp,16);assert.equal(f.events.some(e=>e.kind==='poison'),false);
 assert.equal(attacks(step(preset(78),Array(6).fill(1)),'enemy').length,1);
});
test('the second jhereg enters only in the round after the first falls',()=>{
 const f=preset(78);f.weaponDamage={dice:0,add:8};const next=step(f,[6,6,6]);assert.equal(next.status,'active');assert.equal(attacks(next,'enemy').length,0);assert.deepEqual(encounterTargets(next),[1]);
});
test('consecutive duels offer exactly one grace round with optional actual healing and no assumed recovery',()=>{
 let f=preset(79,{hp:10});f.weaponDamage={dice:0,add:9};f=step(f,[6,6,6]);assert.deepEqual(encounterTargets(f),[]);assert.equal(f.hero.hp,10);
 const skipped=step(f,[]);assert.equal(skipped.hero.hp,10);assert.deepEqual(encounterTargets(skipped),[1]);
 const healed=step(f,[],{healing:4});assert.equal(healed.hero.hp,14);assert.deepEqual(encounterTargets(healed),[1]);assert.equal(attacks(healed,'enemy').length,0);
 assert.equal(f.enemies.length,17);assert.equal(f.enemies.at(-1).name,'Emperor Talasar');assert.equal(f.enemies.at(-1).maxHp,14);
});
test('the bracelet can save exactly zero raw HP but cannot rescue a hit that takes HP below zero',()=>{
 const values=[1,1,1,4,4,4,2];
 const saved=step(preset(82,{hp:4,damageReduction:1}),values);assert.equal(saved.hero.hp,1);assert.equal(saved.status,'active');
 const lethal=step(preset(82,{hp:3,damageReduction:1}),values);assert.equal(lethal.status,'loss');assert.equal(lethal.destination,'29');
});
test('three consecutive damaging rounds trigger chewing, which continues automatically after a tentacle miss',()=>{
 let f=preset(100,{hp:100,maxHp:100});const hit=[1,1,1,4,4,4,2];f=step(f,hit);f=step(f,hit);assert.equal(f.encounter.engulfed,undefined);
 f=step(f,[...hit,3]);assert.equal(f.encounter.engulfed,true);assert.equal(f.hero.hp,91);
 f=step(f,[...Array(6).fill(1),1]);assert.equal(f.hero.hp,90);assert.equal(attacks(f,'enemy').at(-1).automatic,true);
});
test('an intervening miss or fully blocked damage resets the octopus streak',()=>{
 let f=preset(100);const hit=[1,1,1,4,4,4,2];f=step(f,hit);f=step(f,hit);f=step(f,Array(6).fill(1));assert.equal(f.encounter.engulfStreak,0);assert.equal(f.encounter.engulfed,undefined);
 const blocked=step(preset(100,{damageReduction:1}),[1,1,1,4,4,4,1]);assert.equal(blocked.encounter.engulfStreak,0);assert.equal(blocked.hero.hp,18);
});
test('the ambush starts with exactly three free attacks ignoring defence, then uses normal defence for all ten',()=>{
 let f=preset(110,{defenceBonus:100});assert.throws(()=>step(f,[],{healing:1}));
 f=step(f,[4,4,4,1,4,4,4,1,4,4,4,1]);assert.equal(attacks(f,'hero').length,0);assert.equal(attacks(f,'enemy').length,3);assert.equal(f.hero.hp,15);
 f=step(f,Array(33).fill(1));assert.equal(attacks(f,'hero').length,1);assert.equal(attacks(f,'enemy').length,10);assert.equal(f.hero.hp,15);
});
test('talisman choices route to printed outcomes without extra combat or a fabricated victory',()=>{
 for(const [section,destination]of [[78,'111'],[79,'38'],[82,'95']]){const f=step(preset(section),[],{action:'sourceExit'});assert.equal(f.status,'escaped');assert.equal(f.destination,destination);assert.equal(f.round,0);assert.equal(f.hero.hp,18);assert.throws(()=>step(f,[],{action:'sourceExit'}));}
});
test('invalid actions and dice cannot mutate the saved original fight',()=>{
 const f=preset(78),before=structuredClone(f);assert.throws(()=>step(f,[9]));assert.deepEqual(f,before);assert.throws(()=>step(preset(14),[],{action:'sourceExit'}));
});
