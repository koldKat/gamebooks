import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {startCrossroadsFight,crossroadsRound,encounterTargets} from '../../../public/js/battlesim/engines/crossroads/core.js';
import {createCrossroadsState} from '../../../public/js/battlesim/engines/crossroads/state.js';
import {definition} from '../../../public/js/battlesim/books/1302/definition.js';

const roster=JSON.parse(fs.readFileSync('data/simulator-rosters/1302.json','utf8'));
const entries=roster.enemies.filter(row=>row.stats.slot===0).map(row=>row.stats.entry);
const entry=section=>entries.find(row=>row.section===String(section));
const start=(section,hero={})=>startCrossroadsFight({...definition.defaultHero,...hero},entry(section).enemies,entry(section).rules);
function step(fight,values,options={}){
  let used=0;
  const result=crossroadsRound(fight,{...options,roll(){assert.ok(used<values.length,'unexpected die');return values[used++];}});
  assert.equal(used,values.length,'unused dice');return result;
}

test('Ghost of a Chance has the printed Max record, nine groups and sixteen database opponents',()=>{
  assert.deepEqual(entries.map(row=>row.section),['7','19','20','32','37','40','50','82','89']);
  assert.equal(roster.enemies.length,16);
  assert.deepEqual(definition.defaultHero,{strength:14,intelligence:13,wisdom:13,constitution:12,dexterity:11,charisma:14,hp:23,maxHp:23,age:25,attackBonus:0,defenceBonus:0});
  for(const row of entries){assert.ok(row.sourcePages.length);assert.ok(row.printedRules.length);}
  for(const section of [32,40,50])assert.ok(entry(section).enemies.every(enemy=>enemy.hp===null));
});

test('Time Being vanishes at fifteen, reuses its attack roll and rounds half damage upward',()=>{
  const original=start(19);
  const fight=step(original,[5,5,5,3]);
  assert.equal(fight.hero.hp,21);assert.equal(fight.enemies[0].hp,12);
  assert.equal(fight.events.filter(event=>event.kind==='vanished').length,1);
  assert.equal(fight.events.filter(event=>event.kind==='attack'&&event.side==='hero').length,0);
  assert.deepEqual(fight.events.find(event=>event.kind==='attack').dice,[5,5,5]);
  assert.equal(original.hero.hp,23);assert.equal(original.round,0);
  const repeat=step(JSON.parse(JSON.stringify(fight)),[6,6,6,5]);
  assert.equal(repeat.hero.hp,18);assert.equal(repeat.enemies[0].hp,12);
});

test('below fifteen Max can strike first, kill the Time Being, or surrender without further rolls',()=>{
  const fight=step(start(19),[5,5,4,6,6,6,4,3]);
  assert.equal(fight.enemies[0].hp,8);assert.equal(fight.hero.hp,21);
  assert.deepEqual(fight.events.filter(event=>event.kind==='attack').map(event=>event.side),['hero','enemy']);
  const dying=start(19);dying.enemies[0].hp=1;
  const win=step(dying,[4,4,4,6,6,6,1]);
  assert.equal(win.status,'win');assert.equal(win.destination,'12');assert.equal(win.hero.hp,23);
  const surrendered=step(fight,[],{action:'surrender'});
  assert.equal(surrendered.status,'surrendered');assert.equal(surrendered.destination,'17');assert.equal(surrendered.hero.hp,21);
});

test('an elder retires after two successful hits without rolling damage or subtracting HP',()=>{
  let fight=start(32);const original=structuredClone(fight);
  fight=step(fight,[6,6,6,...Array(9).fill(1)]);
  assert.equal(fight.enemies[0].hitsTaken,1);assert.equal(fight.enemies[0].retired,false);
  assert.equal(fight.hero.hp,23);assert.equal(fight.damageDealt,0);assert.equal(fight.damageTaken,0);
  fight=step(JSON.parse(JSON.stringify(fight)),[6,6,6,...Array(6).fill(1)]);
  assert.equal(fight.enemies[0].hitsTaken,2);assert.equal(fight.enemies[0].retired,true);
  assert.deepEqual(encounterTargets(fight),[1,2]);assert.equal(original.enemies[0].hitsTaken,0);
  while(fight.status==='active'){
    const target=encounterTargets(fight)[0],willRetire=fight.enemies[target].hitsTaken===1;
    const attackers=encounterTargets(fight).length-(willRetire?1:0);
    fight=step(fight,[6,6,6,...Array(attackers*3).fill(1)],{target});
  }
  assert.equal(fight.status,'win');assert.equal(fight.destination,'39');assert.equal(fight.hero.hp,23);
  assert.ok(fight.enemies.every(enemy=>enemy.retired&&enemy.hitsTaken===2));
});

test('three successful elder hits cumulatively age Max sixty years and end the fight without HP loss',()=>{
  for(const [section,destination]of [[32,'34'],[40,'42'],[50,'38']]){
    const fight=step(start(section),[1,1,1,...Array(9).fill(6)]);
    assert.equal(fight.status,'loss');assert.equal(fight.destination,destination);
    assert.equal(fight.hero.age,85);assert.equal(fight.encounter.agingHits,3);
    assert.equal(fight.hero.hp,23);assert.equal(fight.damageTaken,0);
  }
  let fight=step(start(40,{age:45}),[1,1,1,6,6,6,1,1,1,1,1,1]);
  assert.equal(fight.hero.age,65);assert.equal(fight.status,'active');
  fight=step(JSON.parse(JSON.stringify(fight)),[1,1,1,6,6,6,6,6,6]);
  assert.equal(fight.hero.age,105);assert.equal(fight.status,'loss');
});

test('entry recovery applies once to the second switchback and never to the replay zombie',()=>{
  assert.equal(start(20,{hp:0}).hero.hp,23);
  assert.throws(()=>start(89,{hp:0}));
  let fight=start(20,{hp:7});assert.equal(fight.hero.hp,23);assert.equal(fight.startingHp,23);
  fight=step(fight,[1,1,1,6,6,6,4]);assert.equal(fight.hero.hp,19);
  fight=step(JSON.parse(JSON.stringify(fight)),Array(6).fill(1));assert.equal(fight.hero.hp,19);
  assert.equal(start(89,{hp:7}).hero.hp,7);
});

test('both samphires attack independently and the zombie club rounds half a die up',()=>{
  const fight=step(start(37),[1,1,1,6,6,6,2,6,6,6,3]);
  assert.equal(fight.hero.hp,14);
  assert.deepEqual(fight.events.filter(event=>event.side==='enemy').map(event=>event.damage),[4,5]);
  for(const section of [82,89]){
    const zombie=step(start(section),[1,1,1,6,6,6,5]);assert.equal(zombie.hero.hp,20);
  }
});

test('printed items have distinct source destinations and cannot invent another option',()=>{
  assert.equal(step(start(50),[],{action:'sourceExit'}).destination,'36');
  for(const [sourceExitIndex,destination]of [[0,'87'],[1,'89']]){
    const result=step(start(82),[],{action:'sourceExit',sourceExitIndex});
    assert.equal(result.destination,destination);assert.equal(result.round,0);assert.equal(result.hero.hp,23);
  }
  assert.throws(()=>step(start(82),[],{action:'sourceExit',sourceExitIndex:2}));
  assert.throws(()=>step(start(89),[],{action:'sourceExit'}));
});

test('custom fights, age persistence and history leave universal inventory and other simulators untouched',()=>{
  const custom=startCrossroadsFight(definition.defaultHero,[{name:'Custom',hp:1,toBeHit:3,attacks:[{toHit:18,damage:{dice:0,add:0}}]}],{},{dice:0,add:1});
  assert.equal(step(custom,[1,1,1]).status,'win');
  const run={inventory:{shared:['item']},equipment:{shared:'slot'},sim1301:{sentinel:true},sim1302:{character:{...definition.defaultHero},setup:{},fight:null,history:[],log:[]}};
  const before=structuredClone([run.inventory,run.equipment,run.sim1301]);let saves=0;
  const state=createCrossroadsState(definition,()=>({getBookId:()=>1302,getRun:()=>run,saveState:()=>saves++}));
  state.change(data=>{data.fight=step(start(32),[1,1,1,...Array(9).fill(6)]);});
  assert.equal(saves,1);assert.equal(run.sim1302.character.hp,23);assert.equal(run.sim1302.character.age,85);
  assert.equal(run.sim1302.history.length,1);state.change(()=>{});assert.equal(run.sim1302.history.length,1);
  assert.deepEqual([run.inventory,run.equipment,run.sim1301],before);
});
