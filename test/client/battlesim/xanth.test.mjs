import { readRosterDocument } from '../../helpers/roster-db.cjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {startCrossroadsFight,crossroadsRound,encounterTargets} from '../../../public/js/battlesim/engines/crossroads/core.js';
import {createCrossroadsState} from '../../../public/js/battlesim/engines/crossroads/state.js';
const document=readRosterDocument(1290);
const entries=[...new Map(document.enemies.map(row=>[row.stats.entry.section,row.stats.entry])).values()];
const hero={hp:21,maxHp:21,constitution:16,dexterity:11,wisdom:13};
function preset(section,weapon={dice:1,add:0}) {
  const entry=entries.find(e=>e.section===String(section));return startCrossroadsFight(hero,entry.enemies,entry.rules,weapon);
}
function advance(fight,values,target=0) {
  let i=0;const next=crossroadsRound(fight,{target,roll(){assert.ok(i<values.length,'unexpected die');return values[i++];}});
  assert.equal(i,values.length,'unused dice');return next;
}
const attacks=(fight,side)=>fight.events.filter(event=>event.kind==='attack'&&event.side===side);
test('all nine printed encounters and the explicit alternate load their original forms and stats',()=>{
  assert.equal(entries.length,10);assert.equal(document.enemies.length,22);
  for(const entry of entries)assert.equal(preset(entry.section).rulesVersion,2);
  const forms=document.enemies.filter(row=>row.stats.entry.section==='1');
  assert.equal(forms.length,5);assert.equal(forms.at(-1).attack,0);assert.ok(forms.every(row=>row.stats.sharedFormHp));
  assert.equal(document.enemies.find(row=>row.name==='Basilisk').attack,18);
});
test('the monster changes every two rounds, retaining shared wounds, and stops as a sea-cow',()=>{
  let fight=advance(preset(1),[6,6,6,2,1,1,1]);assert.equal(fight.enemies[0].hp,10);
  const shapes=['Hippocampus','Fire-breathing crocodile','Manshark','Sea-cow'];
  for(let round=2;round<=8;round++) {
    fight=advance(fight,[1,1,1,1,1,1]);assert.equal(fight.enemies[0].hp,10);
    if(round%2===0)assert.equal(fight.enemies[0].name,shapes[round/2-1]);
  }
  assert.equal(fight.status,'win');assert.equal(fight.destination,'2');assert.equal(fight.hero.hp,21);
  const early=preset(1);early.enemies[0].hp=1;
  assert.equal(advance(early,[3,3,4,1]).destination,'3');
});
test('Henrietta flees strictly below half HP, without a final counterattack',()=>{
  const before=preset(33);before.enemies[0].hp=8;
  let fight=advance(before,[6,6,6,1,1,1,1]);assert.equal(fight.enemies[0].hp,7);assert.equal(fight.status,'active');
  fight=advance(fight,[6,6,6,1]);assert.equal(fight.enemies[0].hp,6);assert.equal(fight.enemies[0].fled,true);
  assert.equal(fight.destination,'79');assert.equal(attacks(fight,'enemy').length,0);
});
test('every surviving nickelpede attacks and lethal hero damage does not spill to others',()=>{
  const fight=advance(preset(20),[3,3,4,6,...Array(12).fill(6)]);
  assert.equal(fight.enemies[0].hp,0);assert.deepEqual(fight.enemies.slice(1).map(enemy=>enemy.hp),[3,3,3,3]);
  assert.equal(attacks(fight,'enemy').length,4);assert.equal(fight.hero.hp,17);
});
test('all three ant lions attack, with half-die damage rounded up for each bite',()=>{
  const fight=advance(preset(39),[1,1,1,6,6,6,1,6,6,6,3,6,6,6,6]);
  assert.deepEqual(attacks(fight,'enemy').map(event=>event.damage),[1,2,3]);assert.equal(fight.hero.hp,15);
});
test('Cerberus locks hero targets to the first live head while every surviving head attacks',()=>{
  const first=preset(77);assert.deepEqual(encounterTargets(first),[0]);assert.throws(()=>advance(first,[],1));
  let fight=advance(first,[6,6,6,6,...Array(9).fill(1)]);assert.equal(attacks(fight,'enemy').length,3);
  fight=advance(fight,[6,6,6,1,...Array(6).fill(1)]);assert.equal(attacks(fight,'enemy').length,2);
  assert.deepEqual(encounterTargets(fight),[1]);assert.deepEqual(fight.enemies.map(enemy=>enemy.hp),[0,7,7]);
});
test('the basilisk follows its explicit Constitution branches without invented weapon or HP damage',()=>{
  const entry=entries.find(e=>e.section==='60'),fight=startCrossroadsFight(hero,entry.enemies,entry.rules);
  const pass=advance(fight,[5,5,6]),fail=advance(fight,[6,6,5]);
  assert.equal(pass.destination,'44');assert.equal(fail.destination,'52');
  assert.equal(pass.hero.hp,21);assert.equal(fail.hero.hp,21);assert.equal(pass.events.some(event=>event.kind==='attack'),false);
});
test('disarming replaces attacks, needs consecutive strict Dexterity successes, and preserves the streak across saves',()=>{
  let fight=advance(preset(82),[1,1,1,1,1,1]);assert.equal(fight.encounter.disarmStreak,1);
  fight=advance(fight,[3,4,4,1,1,1]);assert.equal(fight.encounter.disarmStreak,0);
  fight=advance(fight,[1,1,1,1,1,1]);const saved=structuredClone(fight);
  fight=advance(fight,[1,1,1,1,1,1,1,1,1]);assert.equal(fight.encounter.disarmed,true);
  assert.equal(attacks(fight,'hero').length,0);assert.equal(attacks(fight,'enemy').length,2);
  fight=advance(fight,[6,6,6,1,1,1,1,1,1,1]);assert.equal(attacks(fight,'hero').length,1);assert.equal(fight.enemies[0].hp,14);
  assert.equal(saved.encounter.disarmed,undefined);assert.equal(saved.encounter.disarmStreak,1);
});
test('the alternate lion-tamer preset explicitly uses the other printed attack wording',()=>{
  const fight=advance(preset('82-alternate'),[6,6,6,6,6,6,1,6,6,6,1,1,1]);
  assert.equal(attacks(fight,'hero').length,0);assert.deepEqual(attacks(fight,'enemy').map(event=>event.damage),[1,3]);
  assert.equal(fight.hero.hp,17);
});
test('new Xanth fights preserve shared items, existing data and stale-run guards',()=>{
  let book=1290,run={inventory:{keep:['staff']},equipment:{keep:'dagger'},other:{keep:true}},saves=0;
  const state=createCrossroadsState({id:1290,stateKey:'sim1290'},()=>({getRun:()=>run,getBookId:()=>book,saveState:()=>saves++}));
  state.change(data=>{data.character={...hero};data.encounterName='Tree';data.fight=preset(17);data.fight.enemies[0].hp=1;});
  state.change(data=>{data.fight=advance(data.fight,[6,6,6,1]);});
  assert.equal(state.read().history.length,1);assert.deepEqual(run.inventory,{keep:['staff']});assert.deepEqual(run.equipment,{keep:'dagger'});
  const before=structuredClone(run),count=saves;
  assert.equal(state.change(data=>{data.character.hp=1;book=1291;}),false);assert.deepEqual(run,before);assert.equal(saves,count);
});
