import { readRosterDocument } from '../../helpers/roster-db.cjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {startCrossroadsFight,crossroadsRound,encounterTargets} from '../../../public/js/battlesim/engines/crossroads/core.js';
const roster=readRosterDocument(1294);
const entries=[...new Map(roster.enemies.map(row=>[row.stats.entry.section,row.stats.entry])).values()];
const hero={strength:14,intelligence:12,wisdom:8,constitution:13,dexterity:15,charisma:7,hp:24,maxHp:24};
function preset(section,player=hero){const e=entries.find(e=>e.section===String(section));return startCrossroadsFight(player,e.enemies,e.rules,e.weapons[0]?.damage);}
function advance(fight,values,options={}){let i=0;const result=crossroadsRound(fight,{...options,roll(){assert.ok(i<values.length,'unexpected die');return values[i++];}});assert.equal(i,values.length,'unused dice');return result;}
const attacks=(fight,side)=>fight.events.filter(e=>e.kind==='attack'&&e.side===side);
test('all sixteen source tables and five explicit preparation presets start from database metadata',()=>{
  assert.equal(entries.length,21);assert.equal(roster.enemies.length,46);
  for(const e of entries){const f=preset(e.section);assert.equal(f.rulesVersion,2);assert.equal(f.enemies.length,e.enemies.length);assert.ok(e.printedRules.length);}
  assert.deepEqual(preset(42).enemies.map(e=>e.attacks.length),[1,1,0,0]);
});
test('surprise has a rolled +3 opening attack with double damage, then ordinary hero-first combat',()=>{
  let f=advance(preset(11),[1,2,2,1,1,1,1,1,1,1,1]);
  assert.equal(attacks(f,'hero').length,2);assert.equal(attacks(f,'hero')[0].total,8);assert.equal(f.enemies[0].hp,4);assert.equal(f.hero.hp,24);
  f=advance(f,[1,2,2,1,1,1]);assert.equal(attacks(f,'hero').length,1);assert.equal(attacks(f,'hero')[0].hit,false);
});
test('the opening wolf injury happens once, and its already-deducted variant does not charge it again',()=>{
  let f=advance(preset(8),Array(6).fill(1));assert.equal(f.hero.hp,20);
  f=advance(f,Array(6).fill(1));assert.equal(f.hero.hp,20);
  assert.equal(advance(preset('8-injury-applied'),Array(6).fill(1)).hero.hp,24);
});
test('Taomen sword retrieval is strictly below Dexterity and spends the hero attack',()=>{
  let f=advance(preset(46),[5,5,5,1,1,1],{action:'retrieve'});assert.equal(f.encounter.weaponRetrieved,undefined);assert.equal(attacks(f,'hero').length,0);
  f=advance(f,[4,5,5,1,1,1],{action:'retrieve'});assert.equal(f.encounter.weaponRetrieved,true);assert.deepEqual(f.weaponDamage,{dice:2,add:0});
  assert.throws(()=>advance(f,[],{action:'retrieve'}));
});
test('the unarmed Chya preset steals a club on equal Dexterity and preserves printed armour thresholds',()=>{
  const f=advance(preset('51-unarmed-unarmoured'),[5,5,5,...Array(9).fill(1)],{action:'retrieve'});
  assert.deepEqual(f.weaponDamage,{dice:1,add:1});assert.equal(attacks(f,'hero').length,0);assert.ok(f.enemies.every(e=>e.attacks[0].toHit===14));
});
test('Taomen captures at zero through five HP, while damage below zero is lethal',()=>{
  const rolls=[1,1,1,6,6,6,1,1];
  assert.equal(advance(preset(46,{...hero,hp:6}),rolls).destination,'31');
  assert.equal(advance(preset(46,{...hero,hp:2}),rolls).destination,'31');
  assert.equal(advance(preset(46,{...hero,hp:1}),rolls).destination,'29');
});
test('bowmen capture after eight damage, including exactly zero HP, but not negative HP',()=>{
  const rolls=[1,1,1,6,6,6,6];
  for(const hp of [24,8]){const f=advance(preset(40,{...hero,hp}),rolls);assert.equal(f.destination,'37');assert.equal(attacks(f,'enemy').length,1);}
  assert.equal(advance(preset(40,{...hero,hp:7}),rolls).destination,'29');
});
test('bandits subdue after eleven damage, preserving lethal defeat priority',()=>{
  const rolls=[1,1,1,6,6,6,6,6,6,6,5];
  assert.equal(advance(preset(26),rolls).destination,'21');
  assert.equal(advance(preset(26,{...hero,hp:10}),rolls).destination,'29');
});
test('the five-round bandit fight permits one optional parting shot without repeating its outcome',()=>{
  let f=preset(26);for(let i=0;i<5;i++)f=advance(f,Array(12).fill(1));
  assert.equal(f.status,'win');assert.equal(f.destination,'30');
  f=advance(f,[6,6,6,1,1],{action:'partingShot'});assert.equal(f.round,5);assert.equal(f.encounter.partingShotUsed,true);assert.equal(f.events.some(e=>e.kind==='outcome'),false);
  assert.throws(()=>advance(f,[],{action:'partingShot'}));
});
test('two clubmen attack and one shared net is cast; failing next-turn escape leads to capture',()=>{
  let f=advance(preset(42),[...Array(9).fill(1),3,3,3]);assert.equal(f.encounter.netTurns,1);assert.equal(attacks(f,'enemy').length,2);
  assert.throws(()=>advance(f,[],{healing:1}));
  f=advance(f,[5,5,5,...Array(6).fill(1)]);assert.equal(f.status,'loss');assert.equal(f.destination,'77');assert.equal(attacks(f,'hero').length,0);
});
test('killing both net carriers prevents further casts, and fleeing/surrendering retain their source routes',()=>{
  let f=preset(42);f.enemies[2].hp=f.enemies[3].hp=0;f=advance(f,Array(9).fill(1));assert.equal(f.events.some(e=>e.kind==='netThrown'),false);
  assert.equal(advance(preset(42),[],{action:'surrender'}).destination,'77');
  assert.equal(advance(preset(42),[],{action:'flee'}).destination,'58');
});
test('the prone monster grip blocks flight and a successful Strength check restores the ordinary thresholds',()=>{
  const before=preset(106);assert.throws(()=>advance(before,[],{action:'flee'}));
  const f=advance(before,[4,5,5,1,1,1],{action:'escapeGrip'});assert.equal(f.encounter.gripped,false);assert.equal(attacks(f,'hero').length,0);
  const next=advance(f,[4,4,4,1,1,1,1,1]);assert.equal(attacks(next,'hero')[0].hit,true);assert.equal(next.enemies[0].hp,18);
});
test('first monster hits establish a grip once and breaking it uses Strength without a player attack',()=>{
  let f=advance(preset(110),[1,1,1,4,4,4,1,1]);assert.equal(f.encounter.gripped,true);assert.equal(f.hero.hp,20);
  f=advance(f,[4,5,5,1,1,1],{action:'escapeGrip'});assert.equal(f.encounter.gripped,false);
  f=advance(f,[1,1,1,4,4,4,1,1]);assert.equal(f.encounter.gripped,false);
});
test('flight takes its printed final attack, except before an attack against the awakened monster',()=>{
  assert.equal(advance(preset(104),[],{action:'flee'}).destination,'103');
  const wolf=advance(preset(6),[1,1,1],{action:'flee'});assert.equal(wolf.status,'escaped');assert.equal(wolf.destination,'13');assert.equal(attacks(wolf,'hero').length,0);
  assert.equal(advance(preset(15),[],{action:'flee'}).destination,'13');
  const taomen=advance(preset(53),[1,1,1]);assert.equal(taomen.destination,'64');assert.equal(attacks(taomen,'hero').length,0);
});
test('reinforcements follow the explicit fourth-round schedule and early victory uses only the original two',()=>{
  let f=preset(96);f.weaponDamage={dice:0,add:5};f=advance(f,[6,6,6,6,6,6]);assert.equal(f.status,'win');assert.equal(f.destination,'107');
  f=preset(96);for(let i=0;i<3;i++)f=advance(f,Array(i===0?12:9).fill(1));
  assert.deepEqual(encounterTargets(f),[0,1,2]);assert.equal(f.rules.winSection,null);
});
test('invalid actions and dice leave existing saved fights untouched',()=>{
  const f=preset(97),saved=structuredClone(f);assert.throws(()=>advance(f,[9],{action:'escapeGrip'}));assert.deepEqual(f,saved);
  assert.throws(()=>advance(preset(6),[],{action:'retrieve'}));assert.throws(()=>advance(preset(6),[],{action:'surrender'}));
});
