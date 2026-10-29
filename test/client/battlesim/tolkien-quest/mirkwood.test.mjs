import { readRosterDocument } from '../../../helpers/roster-db.cjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {character,beginFight,round,modifiers,missileRound,resolveOutcome} from '../../../../public/js/battlesim/engines/tolkien-quest/core.js';
import {loadRoster,getRoster} from '../../../../public/js/battlesim/books/1438/definition.js';

const catalog=readRosterDocument(1438);
await loadRoster(async url=>{assert.equal(url,'/api/books/1438/enemies');return {ok:true,json:async()=>structuredClone(catalog.enemies)};});
const entry=section=>getRoster().find(e=>e.section===section);
const hero=extra=>character({endurance:100,...extra});
const foe=extra=>({name:'Custom opponent',ob:0,db:0,endurance:100,...extra});
const numbers=(...values)=>()=>{assert.ok(values.length,'unexpected picked number');return values.shift();};
const start=(section,h={},options={},roll=()=>7)=>{const e=entry(section),enemies=e.repeatFirstEnemy?Array.from({length:e.repeatFirstEnemy.default},()=>structuredClone(e.enemies[0])):e.enemies;return beginFight(hero(h),enemies,{rules:e.rules,...options},roll);};

test('Mirkwood database catalog contains all original blocks and separately verified contexts',()=>{
  assert.equal(getRoster().length,55);assert.equal(catalog.enemies.length,106);
  assert.equal(new Set(catalog.enemies.map(e=>e.key)).size,106);
  for(const section of ['102','109','169','183','185','210','217','226','228','267','293','298','304','310','320','333','350','364','378','381','390','393','403','404','410','419','424','428','442','443','451','453','462','467','472','446'])assert.ok(entry(section),section);
  assert.equal(entry('404').enemies.length,10);assert.equal(entry('404').enemies.at(-1).name,'Spider Queen');
  assert.deepEqual(entry('404').enemies.at(-1),{key:'404-10',name:'Spider Queen',displayName:'Spider Queen (§404)',ob:4,db:3,endurance:50,kind:'animal',armour:'none'});
  assert.equal(entry('217').enemies.length,1);assert.equal(entry('217').enemies[0].combinedCount,12);
  assert.equal(entry('428').enemies[0].combinedCount,3);assert.equal(entry('410').enemies[0].kind,'monster');
  assert.equal(entry('185').rules.supportAttacks,undefined);assert.equal(entry('310').rules.supportAttacks,undefined);
  assert.equal(entry('333').rules.cannotEscape,true);assert.equal(entry('350').rules.cannotEscape,undefined);
});

test('each opponent rolls its own printed Endurance exactly once without changing the roster',()=>{
  const before=JSON.stringify(entry('109')),seen=[];
  let f=start('109',{}, {},role=>{seen.push(role);return seen.length===1?2:12;});
  assert.deepEqual(seen,['endurance','endurance']);assert.deepEqual(f.enemies.map(e=>e.endurance),[20,30]);
  f=round(f,'attack',numbers(2,2));assert.deepEqual(f.enemies.map(e=>e.endurance),[20,30]);
  assert.equal(JSON.stringify(entry('109')),before);
  const spider=start('472',{}, {},numbers(2,12,3,11,4,10,5,9,6,8,7,7));
  assert.deepEqual(spider.enemies.map(e=>e.endurance),[22,22,22,22,22,22]);
});

test('both archers retain their own cadence and fixed OB independent of hero gear',()=>{
  let f=beginFight(hero({ob:0,weapon:'greatsword'}),[foe()],{equipmentModifiers:true,useSupport:true,rules:entry('102').rules});
  f=round(f,'attack',numbers(2,7,2));
  assert.deepEqual(f.events.filter(e=>e.who==='support').map(e=>[e.supportName,e.damage]),[['Prince',5]]);
  f.effects.strength=true;f=round(f,'attack',numbers(2,7,7,2));
  assert.deepEqual(f.events.filter(e=>e.who==='support').map(e=>[e.supportName,e.damage]),[['Princess',4],['Prince',5]]);
});

test('night entry gives the Princess her printed first attack OB and keeps later attacks ordinary',()=>{
  let f=beginFight(hero(),[foe()],{useSupport:true,rules:entry('169-via385').rules});
  f=round(f,'attack',numbers(2,7,2));assert.equal(f.events.find(e=>e.who==='support').damage,8);
  f=round(f,'attack',numbers(2,7,2));assert.equal(f.events.find(e=>e.who==='support').damage,4);
});

test('sleeping trial adds Trickery to every attack and stops on the first non-U/K',()=>{
  let f=start('381',{trickery:1});
  f=round(f,'attack',numbers(10));assert.equal(f.index,1);assert.equal(f.status,'active');
  f=round(f,'attack',numbers(10));assert.equal(f.index,2);
  f=round(f,'attack',numbers(2));assert.equal(f.status,'avoided');assert.equal(f.destination,'324');assert.equal(f.index,2);
  assert.equal(f.hero.damage,0);assert.equal(f.events.some(e=>e.who==='enemy'),false);
  const second=round(start('446'),'attack',numbers(2));assert.equal(second.destination,'358');
});

test('all nine sleeping opponents must receive U/K, including with advanced equipment',()=>{
  let f=start('381',{weapon:'sword'}, {mode:'advanced'});assert.equal(f.stage,'melee');
  for(let i=0;i<9;i++)f=round(f,'attack',numbers(12));
  assert.equal(f.status,'win');assert.equal(f.index,9);assert.equal(resolveOutcome(f).destination,'383');
  assert.throws(()=>start('381',{charmedAnimal:foe()},{useAlly:true}),/own attacks/);
  const numeric=round(beginFight(hero({weapon:'greatsword'}),[foe({db:-5,endurance:1})],{equipmentModifiers:true,rules:entry('381').rules}),'attack',numbers(7));
  assert.equal(numeric.status,'avoided');assert.equal(numeric.index,0);
});

test('guard deadline resolves the final supporting shot before raising the alarm without loss XP',()=>{
  let f=start('467',{}, {useSupport:true});f=round(f,'attack',numbers(2,2));f=round(f,'attack',numbers(2,2));
  assert.equal(f.status,'avoided');assert.equal(f.destination,'477');assert.equal(f.hero.damage,0);assert.equal(f.heroAttacks,2);
  assert.equal(f.events.filter(e=>e.who==='support').length,1);
  f=start('467',{}, {useSupport:true});f=round(f,'attack',numbers(2,2));f=round(f,'attack',numbers(2,12));
  assert.equal(f.status,'win');assert.equal(resolveOutcome(f).destination,'474');
});

test('source sword and stripped equipment are fight-local and do not rewrite the character',()=>{
  const h=hero({weapon:'axe',armour:'plate',shield:true,orcSlayer:true,itemBonuses:{ob:5,db:4},missile:'bow'}),before=JSON.stringify(h);
  let f=beginFight(h,[foe()],{mode:'advanced',rules:entry('102-via248').rules});
  assert.equal(modifiers(f).ob,2);assert.equal(modifiers(f).db,0);assert.equal(f.missileAvailable,false);
  f=missileRound(f,'skip');f.stage='melee';f=round(f,'attack',numbers(7,2));assert.equal(f.enemies[0].damage,6);
  assert.equal(JSON.stringify(h),before);assert.equal(f.hero.weapon,'axe');assert.equal(f.hero.armour,'plate');
});

test('owl bonus is not doubled at the six-spider encounter and also distracts the wolves',()=>{
  assert.equal(entry('472').rules.heroObBonus,undefined);
  let f=start('428',{sourceItems:['owl'],itemBonuses:{ob:1}});assert.equal(modifiers(f).ob,1);
  f=round(f,'attack',numbers(2,7));assert.equal(f.hero.damage,4);
  f=round(start('428'),'attack',numbers(2,7));assert.equal(f.hero.damage,5);
});

test('source items respect entrance/corridor routes and may only be consumed once per run',()=>{
  let f=start('169-via358',{}, {sourceAction:'horn'},numbers(12));assert.equal(f.status,'avoided');assert.equal(f.destination,'471');
  assert.deepEqual(f.hero.usedSourceItems,['horn']);assert.throws(()=>start('169-via358',f.hero,{sourceAction:'horn'}),/unavailable/);
  f=start('169-via399',{}, {sourceAction:'horn'},numbers());assert.equal(f.destination,'292');
  f=start('169-via477',{}, {sourceAction:'powder'},numbers());assert.equal(f.destination,'408');
  f=start('102',{}, {sourceAction:'powder'},numbers(12));assert.equal(f.destination,'184');
  f=start('169-via358',{}, {sourceAction:'powder'},numbers(7,2,3,4,5,6,7));assert.equal(f.status,'active');assert.equal(f.enemies.length,6);assert.deepEqual(f.enemies.map(e=>e.endurance),[17,18,19,20,21,22]);
});

test('unprinted source actions are not invented and Red Ring routes preserve source destinations',()=>{
  for(const n of ['267','333','350','404','453','462'])assert.equal(entry(n).rules.sourceActions,undefined,n);
  const f=start('472',{}, {sourceAction:'ring-powder'},numbers());assert.equal(f.destination,'414');assert.equal(f.status,'avoided');
  assert.equal(entry('169').rules.sourceActions.find(a=>a.key==='horn').destination,'258');
});

test('night penalty rounds negative bonuses down and leaves saved base values intact',()=>{
  const h=hero({ob:5,db:-1,magic:3,missileOb:7,missile:'bow',nightPenalty:true});const f=beginFight(h,[foe()]);
  assert.deepEqual([modifiers(f).ob,modifiers(f).db,modifiers(f).magic,modifiers(f).missileOb],[2,-1,1,3]);assert.equal(h.ob,5);
});

test('source defeat branches, nonlethal Dwarf and fixed companion attacks preserve outcomes',()=>{
  const f=round(start('442',{ob:20}),'attack',numbers(12));assert.equal(f.enemies[0].condition,'unconscious');
  const lost={...start('462'),status:'loss'};assert.equal(resolveOutcome(lost,numbers(7)).destination,'300');assert.equal(resolveOutcome(lost,numbers(8)).destination,'253');
  assert.equal(entry('467-via315').rules.firstAttackAddTrickery,true);
  assert.equal(entry('169-via324').optionalTailEnemy.carryKey,'cave-guard');
  assert.equal(entry('169-via358').rules.cannotEscape,true);assert.equal(entry('169-via399').rules.cannotEscape,false);
});
