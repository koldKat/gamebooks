import test from 'node:test';
import assert from 'node:assert/strict';
import {readRosterDocument,getRosterRows} from '../../helpers/roster-db.cjs';
import {loadRoster,getRoster,getSettings} from '../../../public/js/battlesim/books/262/definition.js';
import * as combat from '../../../public/js/battlesim/engines/fighting-fantasy/core.js';
const catalog=readRosterDocument(262),entries=[...new Map(catalog.enemies.map(e=>[e.stats.entry.section,e.stats.entry])).values()];
const support=entries[0].support,entry=n=>entries.find(e=>e.section===String(n));
const hero=(items={})=>({skill:12,skillInitial:12,stamina:24,staminaInitial:24,luck:12,luckInitial:12,gold:0,provisions:0,potion:'skill',potionUses:0,attackModifier:0,nextFightPenalty:0,poisonBattlesLeft:2,deathstoneUses:3,items});
const start=(n,weapon,changes={})=>combat.startFight({...hero(weapon?{[weapon]:true}:{}),...changes},entry(n),{items:support.items,combatRules:support.combatRules});
const dice=values=>{let i=0;return()=>{assert.ok(i<values.length,'unexpected die');return values[i++];};};
const round=(f,values=[1,1,6,6])=>combat.roundFight(f,support.items,dice(values));
const hit=f=>combat.resolveWound(f);

test('database loader owns all25 combat encounters and49 opponents',async()=>{
 await loadRoster(async url=>{assert.equal(url,'/api/books/262/enemies');return {ok:true,json:async()=>getRosterRows(262)};});
 assert.equal(getRoster().length,25);assert.equal(catalog.enemies.length,49);assert.equal(getSettings().items.length,13);
 assert.ok(!entry(218)&&!entry(457)&&!entry(25));
 for(const e of entries){assert.ok(e.printedRules.length&&e.sourcePages.length);}
 const c=combat.newCharacter(support.defaults,()=>1);assert.equal(c.provisions,0);assert.equal(c.potionUses,0);assert.equal(c.poisonBattlesLeft,2);
});
test('unarmed and every weapon use their printed damage and attack bonuses',()=>{
 for(const [weapon,damage,bonus]of [[null,1,-2],['rustyBreadknife',1,0],['fireIron',2,-1],['pitchfork',2,-1],['cudgel',1,0],['cleaver',2,0],['harpoon',2,0],['sneakySword',2,0],['stiletto',2,0],['woodmansAxe',3,0],['templeAxe',3,1],['warhammer',2,0],['khopesh',2,1]]){
  const f=round(start(169,weapon));assert.equal(f.pending.damage,damage,weapon);assert.equal(f.events.find(e=>e.kind==='attack').playerAttack,24+bonus,weapon);
 }
 assert.equal(round(start(169,'cudgel'),[1,1,6,5]).pending.damage,2);
 assert.equal(round(start(169,'woodmansAxe'),[1,1,6,5]).pending.damage,2);
});
test('warhammer and khopesh distinguish demons and stone; spirits require magic',()=>{
 assert.equal(round(start(53,'warhammer')).pending.damage,3);assert.equal(round(start(210,'warhammer')).pending.damage,4);
 let f=round(start(53,'khopesh'));assert.equal(f.pending.damage,3);assert.equal(f.events[0].playerAttack,26);
 f=round(start(426,'cleaver'));assert.deepEqual(combat.pendingWoundValues(f),{damage:0,lucky:0,unlucky:0});assert.equal(combat.resolveWound(f,true,()=>1).enemies[0].stamina,6);
 assert.equal(hit(round(start(426,'warhammer'))).enemies[0].stamina,3);
});
test('stiletto poison begins after a wound, ticks once per full round, lasts only two fights',()=>{
 let f=start(169,'stiletto');assert.equal(f.character.poisonBattlesLeft,1);
 f=hit(round(f));assert.equal(f.enemies[0].stamina,6);
 f=round(f,[6,6,1,1]);assert.equal(f.pending.direction,'incoming');f=hit(f);assert.equal(f.enemies[0].stamina,5);
 f=start(169,'stiletto',{poisonBattlesLeft:0});assert.equal(hit(round(f)).enemies[0].stamina,7);
 assert.throws(()=>start(169,'stiletto',{poisonBattlesLeft:3}));
});
test('two-at-a-time groups replace defeated foes next round and never attack the whole group',()=>{
 let f=start(72,'khopesh');f.enemies[0].stamina=2;
 f=hit(round(f,[6,6,1,1]));assert.equal(f.target,1);assert.deepEqual(f.roundSequence,[1]);
 f=round(f,[1,1]);assert.equal(f.pending,null);assert.equal(f.round,1);
 f=round(f,[6,6,1,1]);assert.equal(f.round,2);assert.deepEqual(f.roundSequence,[2]);
 const dogs=round(start(419,'khopesh'),[6,6,1,1]);assert.deepEqual(dogs.roundSequence,[1,2]);
});
test('Troll stops at five Stamina or seven rounds, including ties',()=>{
 let f=start(199,'khopesh');for(let i=0;i<3;i++)f=hit(round(f));assert.equal(f.status,'win');assert.equal(f.destination,'229');assert.equal(f.enemies[0].stamina,5);
 f=start(199,'sneakySword',{skill:9});for(let i=0;i<7;i++)f=round(f,[3,3,3,3]);assert.equal(f.status,'win');assert.equal(f.round,7);assert.equal(f.enemies[0].stamina,11);
});
test('Deathstone has exactly three charges and defeat routes do not revive the player',()=>{
 let f=start(169,'cleaver',{items:{cleaver:true,deathstone:true}});f.enemies[0].stamina=100;
 const stone=support.items.find(i=>i.key==='deathstone');for(let n=0;n<3;n++)f=combat.useProjectile(f,stone);
 assert.equal(f.enemies[0].stamina,85);assert.equal(f.character.deathstoneUses,0);assert.throws(()=>combat.useProjectile(f,stone));
 f=start(210,'cleaver',{skill:0,stamina:1});f=hit(round(f,[6,6,1,1]));assert.equal(f.status,'loss');assert.equal(f.destination,'366');assert.equal(f.character.stamina,0);
});
test('all presets resolve without changing the caller or story inventory',()=>{
 for(const e of entries){
  const h={...hero({khopesh:true}),skill:100,skillInitial:100};const before=structuredClone(h);
  let f=combat.startFight(h,e,{items:support.items,combatRules:support.combatRules}),steps=0;
  while(f.status==='active'){
   assert.ok(++steps<500,e.section);
   if(f.pending)f=hit(f);else f=round(f,e.simultaneous?(f.roundSequence?.length?[1,1]:[6,6,1,1]):[1,1,6,6]);
  }
  assert.equal(f.status,'win',e.section);assert.deepEqual(h,before);
 }
});
