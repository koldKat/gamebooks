import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {startCrossroadsFight,crossroadsRound} from '../../../public/js/battlesim/engines/crossroads/core.js';
import {createCrossroadsState} from '../../../public/js/battlesim/engines/crossroads/state.js';
import {healingSpell} from '../../../public/js/battlesim/engines/crossroads/resources.js';
const roster=JSON.parse(fs.readFileSync('data/simulator-rosters/1297.json','utf8'));
const entries=[...new Map(roster.enemies.map(row=>[row.stats.entry.section,row.stats.entry])).values()];
const hero={strength:15,intelligence:13,wisdom:17,constitution:14,dexterity:17,charisma:10,hp:30,maxHp:30,armourBonus:2,healingSpells:2,misdirectionSpells:3,shortSwordBonus:0,gauntletRounds:0,repulsionPotion:0};
function preset(section,changes={}){const e=structuredClone(entries.find(e=>e.section===String(section)));return startCrossroadsFight({...hero,...changes},e.enemies,e.rules);}
function step(f,values,options={}){let i=0;const next=crossroadsRound(f,{...options,roll(){assert.ok(i<values.length,'unexpected die');return values[i++];}});assert.equal(i,values.length,'unused dice');return next;}
const enemyAttacks=f=>f.events.filter(e=>e.kind==='attack'&&e.side==='enemy');
test('all seventeen source tables load with forty-four NPCs and their printed weapon damage',()=>{
 assert.equal(entries.length,17);assert.equal(roster.enemies.length,44);
 for(const e of entries){const f=preset(Number(e.section));assert.equal(f.rulesVersion,2);assert.ok(e.printedRules.length);assert.deepEqual(f.weaponDamage,e.rules.heroDamage);}
 assert.equal(preset(37).enemies.length,6);assert.equal(preset(43).enemies.length,10);assert.equal(preset(76).enemies.length,4);
});
test('chainmail protects physical attacks, but neither chainmail nor repulsion blocks fireballs',()=>{
 let f=preset(1);f.weaponDamage={dice:0,add:0};f=step(f,[1,1,1,5,5,5]);assert.equal(f.hero.hp,30);
 f=preset(51,{armourBonus:100,repulsionPotion:1});f=step(f,[],{action:'repulsion'});assert.equal(f.round,0);
 f.weaponDamage={dice:0,add:0};f=step(f,[1,1,1,4,4,4,1]);assert.equal(f.hero.hp,27);
});
test('a healing spell rolls D3, uses one daily charge and replaces the attack during combat',()=>{
 let f=preset(10,{hp:20});f=step(f,[5,1,1,1],{action:'healingSpell'});assert.equal(f.hero.hp,23);assert.equal(f.hero.healingSpells,1);assert.equal(f.events.some(e=>e.side==='hero'),false);assert.equal(enemyAttacks(f).length,1);
 f=step(f,[2,1,1,1],{action:'healingSpell'});assert.equal(f.hero.hp,24);assert.equal(f.hero.healingSpells,0);assert.throws(()=>step(f,[],{action:'healingSpell'}));
 const h={...hero,hp:29};assert.equal(healingSpell(h,entries[0].rules.mechanics.resources,()=>6).amount,1);assert.equal(h.healingSpells,1);
 assert.throws(()=>step(preset(10),[],{action:'healingSpell'}));
});
test('Misdirection uses the hero attack and protects only its chosen opponent for that round',()=>{
 let f=preset(54,{armourBonus:0});f=step(f,[4,4,5,4,4,5,1],{action:'misdirection',target:0});assert.equal(f.hero.hp,27);assert.equal(f.hero.misdirectionSpells,2);assert.equal(f.events.some(e=>e.side==='hero'),false);assert.deepEqual(enemyAttacks(f).map(e=>e.hit),[false,true]);
 f.weaponDamage={dice:0,add:0};f=step(f,[1,1,1,4,4,5,1,4,4,5,1]);assert.equal(f.hero.hp,23);
});
test('Donal negates both spells without spending their resources or changing the original fight',()=>{
 const f=preset(66,{hp:20}),before=structuredClone(f);for(const action of ['healingSpell','misdirection'])assert.throws(()=>step(f,[],{action}));assert.deepEqual(f,before);
});
test('gauntlet charges are optional, last across fights and are spent even on a miss, never on healing',()=>{
 let f=preset(61,{gauntletRounds:2,hp:20});f=step(f,[1,1,1,1,1,1],{useGauntlet:true});assert.equal(f.hero.gauntletRounds,1);
 f=step(f,[1,1,1,1],{action:'healingSpell',useGauntlet:true});assert.equal(f.hero.gauntletRounds,1);
 f=step(f,[6,6,6,1,1,1,1,1],{useGauntlet:true});assert.equal(f.hero.gauntletRounds,0);assert.equal(f.enemies[0].hp,25);
 assert.throws(()=>step(f,[],{useGauntlet:true}));
});
test('river gauntlet bonus replaces the ordinary bonus and the brother sword adds only on even rounds',()=>{
 let f=preset(69,{gauntletRounds:8,shortSwordBonus:1});f=step(f,[6,6,6,1,1,1,1,1],{useGauntlet:true});assert.equal(f.enemies[0].hp,13);
 f=step(f,[6,6,6,1,1,1,1,1],{useGauntlet:true});assert.equal(f.enemies[0].hp,5);assert.equal(f.hero.gauntletRounds,6);
});
test('repulsion is consumed once, protects only metal weapons and does not advance combat',()=>{
 let f=preset(1,{repulsionPotion:1});f=step(f,[],{action:'repulsion'});assert.equal(f.hero.repulsionPotion,0);assert.equal(f.round,0);assert.throws(()=>step(f,[],{action:'repulsion'}));
 f.weaponDamage={dice:0,add:0};f=step(f,[1,1,1,5,6,6]);assert.equal(f.hero.hp,30);
 let troll=step(preset(10,{repulsionPotion:1,armourBonus:0}),[],{action:'repulsion'});troll.weaponDamage={dice:0,add:0};troll=step(troll,[1,1,1,3,3,4,1]);assert.equal(troll.hero.hp,29);
});
test('spider opening injury happens once before normal combat and does not spend an unused gauntlet charge',()=>{
 let f=preset(36,{gauntletRounds:8});f.weaponDamage={dice:0,add:0};f=step(f,[6,1,1,1,1,1,1]);assert.equal(f.enemies[0].hp,9);f=step(f,Array(6).fill(1));assert.equal(f.enemies[0].hp,9);
 f=preset(36,{gauntletRounds:8});f.enemies[0].hp=1;f=step(f,[1],{useGauntlet:true});assert.equal(f.status,'win');assert.equal(f.hero.gauntletRounds,8);
});
test('group lightning has one roll while four survive, ignores chainmail and stops below four',()=>{
 let f=preset(16,{armourBonus:100});f.weaponDamage={dice:0,add:0};f=step(f,[1,1,1,...Array(24).fill(1),4,4,4,1]);assert.equal(f.hero.hp,29);assert.equal(enemyAttacks(f).length,9);
 f=preset(16);f.enemies.slice(3).forEach(e=>e.hp=0);f.weaponDamage={dice:0,add:0};f=step(f,Array(12).fill(1));assert.equal(enemyAttacks(f).length,3);
});
test('captors remove chainmail, add their printed attack bonus and halve hero damage for exactly two rounds',()=>{
 let f=preset(76);assert.equal(f.hero.armourBonus,0);f.weaponDamage={dice:0,add:3};
 for(let i=0;i<2;i++){f=step(f,[6,6,6,...Array(12).fill(1)]);assert.equal(f.enemies[0].hp,4-i);}
 f=step(f,[6,6,6,...Array(9).fill(1)]);assert.equal(f.enemies[0].hp,0);
 f=preset(76);f.weaponDamage={dice:0,add:0};f.enemies.slice(1).forEach(e=>e.hp=0);f=step(f,[1,1,1,4,4,5,1]);assert.equal(f.hero.hp,30); // 14 succeeds; D6-1 is zero.
});
test('resource counters persist through saves without touching shared items or other simulator state',()=>{
 const run={inventory:[{name:'sentinel'}],equipment:{helmet:'sentinel'},sim1296:{sentinel:true},sim1297:{character:{...hero,hp:20},fight:null,setup:{},history:[],log:[]}};let saves=0;const state=createCrossroadsState({id:1297,stateKey:'sim1297'},()=>({getBookId:()=>1297,getRun:()=>run,saveState:()=>saves++}));
 state.change(data=>{data.fight=step(preset(10,{hp:20}),[1,1,1,1],{action:'healingSpell'});});assert.equal(run.sim1297.character.healingSpells,1);assert.equal(saves,1);assert.deepEqual(run.inventory,[{name:'sentinel'}]);assert.deepEqual(run.equipment,{helmet:'sentinel'});assert.deepEqual(run.sim1296,{sentinel:true});
});
