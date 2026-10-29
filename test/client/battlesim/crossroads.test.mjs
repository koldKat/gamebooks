import { readRosterDocument } from '../../helpers/roster-db.cjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {startCrossroadsFight, crossroadsRound, crossroadsAbilityCheck} from '../../../public/js/battlesim/engines/crossroads/core.js';
import {createCrossroadsState} from '../../../public/js/battlesim/engines/crossroads/state.js';

const roster = readRosterDocument(1291);
const entries = [...new Map(roster.enemies.map(row => [row.stats.entry.section,row.stats.entry])).values()];
const hero = {hp:21,maxHp:21,constitution:15};
const weapon = {dice:1,add:0};
const preset = (section, player = hero) => {
  const entry = entries.find(entry => entry.section === String(section));
  return startCrossroadsFight(player,entry.enemies,entry.rules,weapon);
};
const sequence = (...values) => {
  let used = 0;
  const roll = () => { assert.ok(used < values.length, 'unexpected extra die'); return values[used++]; };
  roll.used = () => used;
  return roll;
};

test('all 13 source encounters and 18 NPC rows load without embedding stats in the engine',()=>{
  assert.equal(entries.length,13);assert.equal(roster.enemies.length,18);
  for (const entry of entries) {
    assert.equal(preset(entry.section).enemies.length,entry.enemies.length);
    const rows=roster.enemies.filter(row=>row.stats.entry.section===entry.section);
    assert.deepEqual(rows.map(row=>row.stats.slot),entry.enemies.map((_,i)=>i));
    assert.ok(entry.printedRules.length);
  }
});

test('an exact attack threshold hits and lethal damage never spills to the next opponent',()=>{
  const fight=preset(158),before=structuredClone(fight);
  fight.weaponDamage={dice:0,add:20};
  const roll=sequence(3,3,3,1,1,1);
  const next=crossroadsRound(fight,{target:0,roll});
  assert.equal(next.enemies[0].hp,0);assert.equal(next.enemies[1].hp,4);assert.equal(next.enemies[2].hp,4);
  assert.equal(next.events[0].damage,6);assert.equal(roll.used(),6);
  assert.equal(fight.hero.hp,before.hero.hp);assert.equal(fight.round,0);
});

test('the canine ambush grants exactly two enemy attacks and no hero turn',()=>{
  const roll=sequence(1,1,1,1,1,1),next=crossroadsRound(preset(152),{roll});
  assert.equal(roll.used(),6);assert.equal(next.status,'win');assert.equal(next.destination,'158');
  assert.equal(next.events.filter(event=>event.side==='enemy').length,2);
  assert.equal(next.events.filter(event=>event.side==='hero').length,0);
});

test('teeth and claws roll independently; a miss does not cause damage',()=>{
  const roll=sequence(1,1,1,4,4,3,1,1,1),next=crossroadsRound(preset(121),{roll});
  assert.equal(next.hero.hp,19);assert.equal(next.events[1].hit,true);assert.equal(next.events[2].hit,false);
  assert.equal(roll.used(),9);
});

test('venom uses Constitution <= checks and the source-specific damage',()=>{
  const passed=crossroadsRound(preset(52),{roll:sequence(1,1,1,6,6,6,5,5,5)});
  assert.equal(passed.hero.hp,20);assert.equal(passed.events.at(-1).passed,true);
  const failed=crossroadsRound(preset(52),{roll:sequence(1,1,1,6,6,6,6,6,6,4)});
  assert.equal(failed.hero.hp,16);assert.equal(failed.events.at(-1).passed,false);
  const snake=crossroadsRound(preset(162),{roll:sequence(1,1,1,6,6,6,6,6,6)});
  assert.equal(snake.hero.hp,16);
});

test('nonfatal brawls restore real HP and apply only an explicit source loss penalty',()=>{
  const win=crossroadsRound(preset(94,{...hero,hp:8}),{roll:sequence(6,6,6,6)});
  assert.equal(win.status,'win');assert.equal(win.hero.hp,8);assert.equal(win.destination,'91');
  let fight=preset(31,{...hero,hp:10});
  for(let i=0;i<10;i++)fight=crossroadsRound(fight,{roll:sequence(1,1,1,6,6,6)});
  assert.equal(fight.status,'loss');assert.equal(fight.hero.hp,7);assert.equal(fight.destination,'40');
});

test('Gurner stops after three rounds and leaves an unspecified tie unresolved',()=>{
  let fight=preset(34);
  for(let i=0;i<3;i++)fight=crossroadsRound(fight,{roll:sequence(6,6,6,1,1,1)});
  assert.equal(fight.status,'win');assert.equal(fight.destination,'51');assert.equal(fight.round,3);
  fight=preset(34);
  for(let i=0;i<3;i++)fight=crossroadsRound(fight,{roll:sequence(1,1,1,1,1,1)});
  assert.equal(fight.status,'draw');assert.equal(fight.destination,null);
});

test('Twitch has three attacks with no player attacks; the thief stops after two rounds',()=>{
  let fight=preset(65);
  for(let i=0;i<3;i++)fight=crossroadsRound(fight,{roll:sequence(6,6,6,1)});
  assert.equal(fight.hero.hp,18);assert.equal(fight.destination,'79');
  fight=preset(135);
  for(let i=0;i<2;i++)fight=crossroadsRound(fight,{roll:sequence(1,1,1,6,6,6)});
  assert.equal(fight.hero.hp,17);assert.equal(fight.destination,'141');
});

test('healing replaces the attack, is capped, and enemies still retaliate',()=>{
  const fight=preset(132,{...hero,hp:15}),next=crossroadsRound(fight,{healing:20,roll:sequence(6,6,6)});
  assert.equal(next.events[0].kind,'healing');assert.equal(next.events[0].amount,6);assert.equal(next.hero.hp,19);
  assert.equal(next.damageDealt,0);
});

test('invalid actions and rolls do not mutate saved fights or invent unspecified weapon damage',()=>{
  const fight=preset(132),before=structuredClone(fight);
  assert.throws(()=>crossroadsRound(fight,{target:9}));
  assert.throws(()=>crossroadsRound(fight,{roll:()=>7}));
  assert.deepEqual(fight,before);
  const entry=entries.find(e=>e.section==='132');
  assert.throws(()=>startCrossroadsFight(hero,entry.enemies,entry.rules));
  assert.equal(crossroadsAbilityCheck(15,sequence(5,5,5)).passed,true);
  assert.equal(crossroadsAbilityCheck(15,sequence(6,6,6)).passed,false);
});

test('state saves victories once, preserves shared items, and rejects a changed run or book',()=>{
  let book=1291,run={inventory:[{id:'shared'}],equipment:{hand:'shared'},other:{keep:true}},saves=0;
  const store=createCrossroadsState({id:1291,stateKey:'sim1291'},()=>({getRun:()=>run,getBookId:()=>book,saveState:()=>saves++}));
  assert.equal(store.read(),null);assert.ok(!Object.hasOwn(run,'sim1291'));
  store.change(data=>{data.character={...hero,hp:8};data.encounterName='Daro';data.fight=preset(94,data.character);});
  store.change(data=>{data.fight=crossroadsRound(data.fight,{roll:sequence(6,6,6,6)});});
  assert.equal(store.read().character.hp,8);assert.equal(store.read().history.length,1);
  store.change(data=>{data.log.push('keep');});assert.equal(store.read().history.length,1);
  assert.deepEqual(run.inventory,[{id:'shared'}]);assert.deepEqual(run.equipment,{hand:'shared'});assert.deepEqual(run.other,{keep:true});
  const original=run,before=structuredClone(run),count=saves;
  assert.equal(store.change(data=>{data.character.hp=1;book=999;}),false);assert.deepEqual(original,before);assert.equal(saves,count);
  book=1291;
  assert.equal(store.change(data=>{data.character.hp=1;run={};}),false);assert.deepEqual(original,before);assert.equal(saves,count);
});
