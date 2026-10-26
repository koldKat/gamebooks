import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {startCrossroadsFight,crossroadsRound,encounterTargets} from '../../../public/js/battlesim/engines/crossroads/core.js';
import {createCrossroadsState} from '../../../public/js/battlesim/engines/crossroads/state.js';
import {consumeHealing} from '../../../public/js/battlesim/engines/crossroads/resources.js';
import {definition} from '../../../public/js/battlesim/books/1298/definition.js';

const roster=JSON.parse(fs.readFileSync('data/simulator-rosters/1298.json','utf8'));
const entries=[...new Map(roster.enemies.map(row=>[row.stats.entry.section,row.stats.entry])).values()];
function preset(section,hero={}){
 const entry=structuredClone(entries.find(entry=>entry.section===String(section)));
 return startCrossroadsFight({...definition.defaultHero,...hero},entry.enemies,entry.rules,{dice:2,add:0});
}
function step(fight,values,options={}){
 let i=0;
 const result=crossroadsRound(fight,{...options,roll(){assert.ok(i<values.length,'unexpected die');return values[i++];}});
 assert.equal(i,values.length,'unused dice');return result;
}
const enemyAttacks=fight=>fight.events.filter(event=>event.kind==='attack'&&event.side==='enemy');

test('all fifteen original combat groups load with twenty-two database NPCs',()=>{
 assert.equal(entries.length,15);assert.equal(roster.enemies.length,22);
 assert.deepEqual(entries.map(entry=>Number(entry.section)),[13,22,23,38,43,51,52,54,56,58,71,79,93,100,119]);
 for(const entry of entries){assert.equal(preset(entry.section).rulesVersion,2);assert.ok(entry.printedRules.length);assert.ok(entry.sourcePages.length);}
 assert.equal(definition.defaultHero.hp,20);assert.equal(definition.defaultHero.healingSips,0);
});

test('unprinted hero damage stays a player choice and custom fights need no roster',()=>{
 for(const section of [13,22,23,43,79,119]){
  const entry=entries.find(entry=>entry.section===String(section));
  assert.equal(entry.rules.heroDamage,undefined);
  assert.throws(()=>startCrossroadsFight(definition.defaultHero,entry.enemies,entry.rules));
 }
 const entry=entries[0],fight=startCrossroadsFight(definition.defaultHero,entry.enemies,entry.customRules,{dice:1,add:2});
 assert.deepEqual(fight.weaponDamage,{dice:1,add:2});
});

test('the leader fight ends after one exchange if Scatha survives',()=>{
 const fight=step(preset(23),[1,1,1,1,1,1]);
 assert.equal(fight.round,1);assert.equal(fight.status,'win');assert.equal(fight.destination,'24');
 const loss=step(preset(23,{hp:1}),[1,1,1,6,6,6,1]);assert.equal(loss.status,'loss');assert.equal(loss.destination,'29');
});

test('each giant scorpion makes three attacks per round without invented poison damage',()=>{
 for(const section of [43,79]){
  const fight=step(preset(section),[1,1,1,4,4,4,1,4,4,4,1,4,4,4,1,1]);
  assert.equal(enemyAttacks(fight).length,3);assert.deepEqual(enemyAttacks(fight).map(event=>event.damage),[1,1,2]);
  assert.equal(fight.hero.hp,16);assert.equal(fight.events.some(event=>event.kind==='poison'),false);
 }
});

test('the Mountain Men and farm family fight one after another',()=>{
 for(const section of [54,56,58,71]){
  let fight=preset(section);
  for(let i=0;i<fight.enemies.length;i++){
   assert.deepEqual(encounterTargets(fight),[i]);
   assert.throws(()=>crossroadsRound(fight,{target:(i+1)%fight.enemies.length,roll:()=>6}));
   fight=step(fight,[6,6,6,6,6],{target:i});
   assert.equal(enemyAttacks(fight).length,0,'next foe waits until the next exchange');
  }
  assert.equal(fight.status,'win');assert.equal(fight.hero.hp,20);
 }
});

test('the mage demon remains empowered for exactly two complete exchanges',()=>{
 let fight=preset(100);
 for(let round=1;round<=2;round++){
  fight=step(fight,[1,1,1,2,2,2,1,1,1,2,2,2,1,1,1]);
  assert.deepEqual(enemyAttacks(fight).map(event=>event.damage),[3,3]);
  assert.equal(fight.hero.hp,20-round*6);
  assert.equal(fight.events.some(event=>event.kind==='phaseChanged'),round===2);
 }
 assert.equal(fight.enemies[0].maxHp,10);assert.equal(fight.enemies[0].hp,10);assert.equal(fight.enemies[0].toBeHit,10);
 fight=step(fight,[1,1,1,4,4,4,1,4,4,4,1]);
 assert.deepEqual(enemyAttacks(fight).map(event=>event.damage),[1,1]);assert.equal(fight.hero.hp,6);
});

test('the phase change carries actual wounds and waits for the next damaging blow',()=>{
 let fight=preset(100);
 fight=step(fight,[6,6,6,4,4,1,1,1,1,1,1]); // Eight damage, both enemy attacks miss.
 fight=step(fight,[6,6,6,1,1,1,1,1,1,1,1]); // Ten total damage before the change.
 assert.equal(fight.damageDealt,10);assert.equal(fight.enemies[0].hp,1);assert.equal(fight.status,'active');
 fight=step(fight,[1,1,1,1,1,1,1,1,1]);assert.equal(fight.enemies[0].hp,1);
 fight=step(fight,[6,6,6,1,1]);assert.equal(fight.status,'win');assert.equal(fight.destination,'99');
 let lightlyWounded=preset(100);
 lightlyWounded=step(lightlyWounded,[6,6,6,1,1,1,1,1,1,1,1]);
 lightlyWounded=step(lightlyWounded,[1,1,1,1,1,1,1,1,1]);
 assert.equal(lightlyWounded.enemies[0].hp,8,'new HP is ten minus two wounds');
});

test('an early kill or Scatha’s death prevents the demon’s phase transition',()=>{
 let fight=preset(100);
 fight=step(fight,[6,6,6,6,6,1,1,1,1,1,1]);
 fight=step(fight,[6,6,6,6,6]);assert.equal(fight.status,'win');assert.equal(fight.enemies[0].hp,0);
 assert.equal(fight.events.some(event=>event.kind==='phaseChanged'),false);
 const dead=step(preset(100,{hp:1}),[1,1,1,2,2,2,1,1,1]);
 assert.equal(dead.status,'loss');assert.equal(dead.enemies[0].maxHp,20);
});

test('the dragon alternates fire and claws, with the allies already included in fifteen HP',()=>{
 let fight=preset(119);
 for(const damage of [2,3,2]){
  fight=step(fight,[1,1,1,4,4,4,...Array(damage).fill(1)]);
  assert.equal(enemyAttacks(fight).length,1);assert.equal(enemyAttacks(fight)[0].damage,damage);
  assert.equal(fight.enemies[0].maxHp,15);assert.equal(fight.events.some(event=>event.side==='ally'),false);
 }
 const dead=step(preset(119,{hp:1}),[1,1,1,4,4,4,1,1]);assert.equal(dead.destination,'25');
});

test('all five potion sips can be consumed in one healing round and persist as a finite stock',()=>{
 let fight=preset(93,{hp:10,healingSips:5});
 fight=step(fight,[1,1,1],{healing:5});assert.equal(fight.hero.hp,15);assert.equal(fight.hero.healingSips,0);
 assert.equal(fight.events.some(event=>event.side==='hero'),false);assert.equal(enemyAttacks(fight).length,1);
 const before=structuredClone(fight);assert.throws(()=>step(fight,[],{healing:1}));assert.deepEqual(fight,before);
 const hero={...definition.defaultHero,hp:18,healingSips:2},rules=entries[0].rules.mechanics.resources;
 hero.hp+=consumeHealing(hero,rules,2);assert.equal(hero.hp,20);assert.equal(hero.healingSips,0);
 assert.throws(()=>consumeHealing(hero,rules,1));
 assert.throws(()=>preset(93,{healingSips:6}));assert.throws(()=>consumeHealing({...hero,hp:0,healingSips:5},rules,1));
});

test('saved counters and completed fights preserve shared items and other book state',()=>{
 const run={inventory:[{name:'sentinel'}],equipment:{shield:'sentinel'},sim1297:{sentinel:true},sim1298:{character:{...definition.defaultHero,hp:10,healingSips:5},setup:{},fight:null,history:[],log:[]}};
 let saves=0;
 const state=createCrossroadsState(definition,()=>({getBookId:()=>1298,getRun:()=>run,saveState:()=>saves++}));
 state.change(data=>{data.fight=step(preset(93,{hp:10,healingSips:5}),[1,1,1],{healing:5});});
 assert.equal(run.sim1298.character.healingSips,0);assert.equal(run.sim1298.character.hp,15);assert.equal(saves,1);
 assert.deepEqual(run.inventory,[{name:'sentinel'}]);assert.deepEqual(run.equipment,{shield:'sentinel'});assert.deepEqual(run.sim1297,{sentinel:true});
 const before=structuredClone(run);assert.throws(()=>state.change(data=>{data.fight=crossroadsRound(data.fight,{healing:1});}));assert.deepEqual(run,before);assert.equal(saves,1);
});
