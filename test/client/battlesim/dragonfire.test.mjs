import { readRosterDocument } from '../../helpers/roster-db.cjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {startCrossroadsFight,crossroadsRound} from '../../../public/js/battlesim/engines/crossroads/core.js';
import {createCrossroadsState} from '../../../public/js/battlesim/engines/crossroads/state.js';
import {definition} from '../../../public/js/battlesim/books/1301/definition.js';

const roster=readRosterDocument(1301);
const entries=roster.enemies.map(row=>row.stats.entry);
const preset=(section,hero={})=>{
  const entry=entries.find(entry=>entry.section===String(section));
  return startCrossroadsFight({...definition.defaultHero,...hero},entry.enemies,entry.rules);
};
function step(fight,values){
  let i=0;
  const result=crossroadsRound(fight,{roll(){assert.ok(i<values.length,'unexpected die');return values[i++];}});
  assert.equal(i,values.length,'unused dice');return result;
}
const misses=fight=>step(fight,Array(fight.enemies[0].attacks.length*3+3).fill(1));

test('Dragonfire uses Mirrim’s printed record and exactly four numerical fights',()=>{
  assert.deepEqual(entries.map(entry=>entry.section),['60','66','70','109']);
  assert.deepEqual(Object.fromEntries(['strength','intelligence','wisdom','constitution','dexterity','charisma','hp','maxHp'].map(k=>[k,definition.defaultHero[k]])),
    {strength:14,intelligence:13,wisdom:13,constitution:15,dexterity:14,charisma:11,hp:21,maxHp:21});
  assert.equal(entries[3].enemies[0].hp,10);
  for(const entry of entries){assert.ok(entry.printedRules.length);assert.ok(entry.sourcePages.length);}
});

test('the wherry makes independent claw and beak attacks, each for one die',()=>{
  const original=preset(60),fight=step(original,[1,1,1,6,6,6,2,6,6,6,4]);
  const attacks=fight.events.filter(event=>event.kind==='attack'&&event.side==='enemy');
  assert.deepEqual(attacks.map(event=>event.damage),[2,4]);
  assert.equal(fight.hero.hp,15);assert.equal(fight.enemies[0].hp,8);assert.equal(original.hero.hp,21);
});

test('a surviving wherry leaves after four complete rounds without being killed',()=>{
  let fight=preset(60);
  for(let i=0;i<3;i++){fight=misses(fight);assert.equal(fight.status,'active');}
  const saved=structuredClone(fight);fight=misses(JSON.parse(JSON.stringify(fight)));
  assert.equal(fight.status,'draw');assert.equal(fight.destination,'36');assert.equal(fight.round,4);
  assert.equal(fight.hero.hp,21);assert.equal(fight.enemies[0].hp,8);assert.equal(saved.status,'active');
});

test('wherry defeat or rider injury resolves before the four-round deadline',()=>{
  for(const completed of [0,3]){
    let fight=preset(60);
    for(let i=0;i<completed;i++)fight=misses(fight);
    fight.enemies[0].hp=1;
    const win=step(fight,[6,6,6,1]);assert.equal(win.status,'win');assert.equal(win.destination,'40');
    fight.hero.hp=1;
    const loss=step(fight,[1,1,1,6,6,6,1]);assert.equal(loss.status,'loss');assert.equal(loss.destination,'29');
  }
});

test('the hall fight stops after three rounds only if both fighters remain standing',()=>{
  let fight=preset(70);fight=misses(fight);fight=misses(fight);
  const draw=misses(JSON.parse(JSON.stringify(fight)));
  assert.equal(draw.status,'draw');assert.equal(draw.destination,'68');assert.equal(draw.enemies[0].hp,8);
  fight.enemies[0].hp=1;const win=step(fight,[6,6,6,1]);
  assert.equal(win.status,'win');assert.equal(win.destination,'71');
  fight.hero.hp=1;const loss=step(fight,[1,1,1,6,6,6,1]);
  assert.equal(loss.status,'loss');assert.equal(loss.destination,'64');assert.equal(loss.hero.hp,0);
});

test('unlimited apprentice and Holdless fights preserve injuries and their printed routes',()=>{
  for(const [section,winSection,lossSection]of [[66,'65','69'],[109,'115','113']]){
    let fight=preset(section);for(let i=0;i<5;i++)fight=misses(fight);
    assert.equal(fight.status,'active');fight.enemies[0].hp=1;fight.hero.hp=7;
    const win=step(fight,[6,6,6,1]);assert.equal(win.destination,winSection);assert.equal(win.hero.hp,7);
    fight.hero.hp=1;const loss=step(fight,[1,1,1,6,6,6,1]);
    assert.equal(loss.destination,lossSection);assert.equal(loss.hero.hp,0);
  }
});

test('custom fights and saved simulator state do not customize universal items',()=>{
  const custom=startCrossroadsFight(definition.defaultHero,entries[0].enemies,entries[0].customRules,{dice:0,add:8});
  assert.equal(step(custom,[6,6,6]).status,'win');
  const run={inventory:{shared:['item']},equipment:{shared:'slot'},sim1300:{sentinel:true},sim1301:{character:{...definition.defaultHero},setup:{},fight:null,history:[],log:[]}};
  const before=structuredClone([run.inventory,run.equipment,run.sim1300]);let saves=0;
  const state=createCrossroadsState(definition,()=>({getBookId:()=>1301,getRun:()=>run,saveState:()=>saves++}));
  state.change(data=>{data.fight=step(preset(60),[1,1,1,6,6,6,2,6,6,6,4]);});
  assert.equal(saves,1);assert.equal(run.sim1301.character.hp,15);
  assert.deepEqual([run.inventory,run.equipment,run.sim1300],before);
});
