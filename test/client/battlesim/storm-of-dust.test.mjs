import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {startCrossroadsFight,crossroadsRound,encounterTargets} from '../../../public/js/battlesim/engines/crossroads/core.js';

const roster=JSON.parse(fs.readFileSync('data/simulator-rosters/1292.json','utf8'));
const entries=[...new Map(roster.enemies.map(row=>[row.stats.entry.section,row.stats.entry])).values()];
const hero={hp:100,maxHp:100,constitution:14,dexterity:14,wisdom:12};
function preset(section,weapon={dice:0,add:0}) {
  const entry=entries.find(entry=>entry.section===String(section));
  return startCrossroadsFight(hero,entry.enemies,entry.rules,weapon);
}
function advance(fight,values,target=0,options={}) {
  let index=0;
  const result=crossroadsRound(fight,{...options,target,roll(){assert.ok(index<values.length,'unexpected die');return values[index++];}});
  assert.equal(index,values.length,'unused dice');return result;
}
const attacks=(fight,side)=>fight.events.filter(event=>event.kind==='attack'&&event.side===side);

test('all 14 printed tables and both preparation variants have complete source-backed metadata',()=>{
  assert.equal(entries.length,16);assert.equal(roster.enemies.length,24);
  for (const entry of entries) {
    assert.equal(preset(entry.section).rulesVersion,2);
    assert.ok(entry.printedRules.length);assert.ok(entry.sourcePages.length);
    assert.equal(roster.enemies.filter(row=>row.stats.entry.section===entry.section).length,entry.enemies.length);
  }
  const entry=entries[0];assert.throws(()=>startCrossroadsFight(hero,entry.enemies,entry.rules));
});

test('Blackbeard arrives in round four even when Redbeard died in round one',()=>{
  const before=preset(3,{dice:0,add:100});assert.throws(()=>advance(before,[],1));
  let fight=advance(before,[6,6,6]);assert.equal(fight.status,'active');assert.equal(attacks(fight,'enemy').length,0);
  assert.deepEqual(encounterTargets(fight),[]);
  fight=advance(fight,[]);fight=advance(fight,[]);
  assert.deepEqual(encounterTargets(fight),[1]);
  fight=advance(fight,[6,6,6],1);assert.equal(fight.status,'win');assert.equal(fight.round,4);
  assert.equal(before.enemies[0].hp,12);
});

test('Darkbeard cannot attack on the killing blow that ends Lightbeard’s fight',()=>{
  let fight=preset(5,{dice:0,add:100});assert.deepEqual(encounterTargets(fight),[0]);
  fight=advance(fight,[6,6,6]);assert.deepEqual(encounterTargets(fight),[1]);assert.equal(attacks(fight,'enemy').length,0);
  fight=advance(fight,[6,6,6],1);assert.equal(fight.status,'win');assert.equal(fight.destination,'4');
});

test('fatigue is temporary, changes both thresholds, and never makes the horse attack early',()=>{
  const first=preset(25);
  const tired=advance(first,[6,6,6,1,2,2,4,4,4,1,1]);
  assert.equal(attacks(tired,'hero')[0].hit,false);assert.equal(attacks(tired,'enemy').length,1);
  assert.equal(attacks(tired,'enemy')[0].hit,true);assert.equal(tired.hero.hp,99);
  const rested=advance(tired,[1,1,1,1,2,2,4,4,4]);
  assert.equal(attacks(rested,'hero')[0].hit,true);assert.equal(attacks(rested,'enemy')[0].hit,false);
  assert.equal(rested.enemies[0].toBeHit,5);assert.equal(rested.enemies[0].attacks[0].toHit,15);
});

test('killing the horse applies the printed dismount modifiers once, including To Be Hit below three',()=>{
  let fight=preset(25,{dice:0,add:100});
  fight=advance(fight,[1,1,1,6,6,6,4,4,6,1,1],1);
  assert.equal(fight.enemies[1].hp,0);assert.equal(fight.hero.hp,99);
  fight=advance(fight,[1,1,1,1,1,1]);assert.equal(fight.status,'win');
  assert.equal(attacks(fight,'hero')[0].hit,true);
});

test('the charge doubles first-round damage on failed Dexterity; successful checks grant one next-round bonus attack',()=>{
  const failed=advance(preset(28),[6,6,6,1,1,1,6,6,6,3,3]);assert.equal(failed.hero.hp,90);
  let fight=advance(preset(28),[1,1,1,1,1,1,1,1,1,6,6,6,3,3]);
  assert.equal(fight.hero.hp,100);assert.equal(fight.encounter.bonusAttack,true);
  const saved=structuredClone(fight);
  fight=advance(fight,[2,2,2,2,2,2,1,1,1]);assert.equal(attacks(fight,'hero').length,2);
  fight=advance(fight,[2,2,2,1,1,1]);assert.equal(attacks(fight,'hero').length,1);
  assert.equal(saved.encounter.bonusAttack,true);
});

test('the body arrives two rounds after the first successful Wisdom check and absorbs attacks without HP',()=>{
  let fight=advance(preset(36),[1,1,1,1,1,1,1,1,1]);assert.equal(fight.encounter.allyRound,3);
  fight=advance(fight,[1,1,1,1,1,1]);assert.equal(attacks(fight,'ally').length,0);
  fight=advance(fight,[1,1,1,6,6,6,1]);assert.equal(attacks(fight,'ally')[0].damage,1);
  assert.equal(fight.enemies[0].hp,64);assert.equal(fight.hero.hp,100);
  assert.equal(fight.events.at(-1).kind,'absorbed');assert.equal(fight.events.some(event=>event.kind==='check'),false);
});

test('lightning grants exactly the rolled number of free rounds, not invented damage',()=>{
  for (const [die,free] of [[1,2],[4,3]]) {
    let fight=preset(34);
    fight=advance(fight,[die,6,6,6,1,1,1]);assert.equal(fight.encounter.freeRounds,free);
    for (let round=2;round<=free;round++) fight=advance(fight,[6,6,6,1,1,1]);
    assert.equal(attacks(fight,'enemy').length,0);assert.equal(fight.enemies[0].hp,65);
    fight=advance(fight,[6,6,6,1,1,1,1,1,1]);assert.equal(attacks(fight,'enemy').length,1);
  }
});

test('the §49 automatic sword damage happens once before the ordinary §50 fight',()=>{
  let fight=advance(preset(49,{dice:0,add:1}),[1,1,1,1,1,1]);
  assert.equal(fight.enemies[0].hp,47);assert.equal(attacks(fight,'hero').length,2);
  assert.equal(attacks(fight,'hero')[0].automatic,true);
  fight=advance(fight,[1,1,1]);assert.equal(fight.enemies[0].hp,47);assert.equal(attacks(fight,'hero').length,1);
});

test('the whip attacks on odd rounds; blindness checks Constitution only on subsequent rounds',()=>{
  let fight=advance(preset(42),[1,1,1,1,1,1]);
  fight=advance(fight,[1,1,1]);assert.equal(attacks(fight,'enemy').length,0);
  fight=advance(fight,[1,1,1,6,6,6,6,6,6,6]);
  assert.equal(fight.encounter.blinded,true);assert.equal(fight.hero.hp,90);
  assert.equal(fight.events.filter(event=>event.kind==='check').length,1);
  fight=advance(fight,[6,6,6]);assert.equal(fight.destination,'56');assert.equal(fight.status,'loss');assert.equal(fight.hero.hp,90);
});

test('failed first-round Dexterity at §53 gives exactly one extra whip attack',()=>{
  const fight=advance(preset(53),[6,6,6,1,1,1,6,6,6,1,6,6,6,1]);
  assert.equal(attacks(fight,'enemy').length,2);assert.equal(fight.hero.hp,90);
});

test('Morrigan skips round one and casts magic only after the hero misses',()=>{
  let fight=advance(preset(63),[1,1,1]);assert.equal(attacks(fight,'enemy').length,0);
  fight=advance(fight,[6,6,6,6,6,6,2]);assert.equal(fight.hero.hp,97);
  fight=advance(fight,[1,1,1,6,6,6,2,2]);assert.equal(fight.hero.hp,93);
  assert.equal(attacks(fight,'enemy').length,1);assert.equal(attacks(fight,'enemy')[0].damage,4);
});

test('Veleda joins the round after the first man dies and hits on a failed Constitution check',()=>{
  let fight=advance(preset(74,{dice:0,add:100}),[6,6,6,1,1,1]);
  assert.deepEqual(encounterTargets(fight),[1,2]);
  fight=advance(fight,[6,6,6,6,6,6,1,1],1);assert.equal(fight.hero.hp,98);
  assert.equal(attacks(fight,'enemy').length,1);assert.equal(attacks(fight,'enemy')[0].name,'Veleda');
  fight=advance(fight,[6,6,6],2);assert.equal(fight.destination,'73');assert.equal(fight.status,'win');
});

test('the sequential final fight keeps Veleda’s distinct 2D6+5 damage and hero-first transitions',()=>{
  let fight=advance(preset(76,{dice:0,add:100}),[6,6,6]);
  fight=advance(fight,[6,6,6],1);assert.equal(attacks(fight,'enemy').length,0);
  fight=advance(fight,[1,1,1,6,6,6,1,1],2);assert.equal(fight.hero.hp,93);
  assert.equal(fight.enemies[2].hp,17);
});

test('healing consumes the hero attack, preserves pending state, and invalid input leaves the original untouched',()=>{
  let fight=preset(42);fight.hero.hp=90;
  const before=structuredClone(fight);
  assert.throws(()=>advance(fight,[],8));assert.deepEqual(fight,before);
  fight=advance(fight,[1,1,1],0,{healing:5});assert.equal(fight.hero.hp,95);assert.equal(attacks(fight,'hero').length,0);
  assert.throws(()=>crossroadsRound(fight,{roll:()=>7}));assert.equal(fight.round,1);
});
