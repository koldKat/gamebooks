import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {startCrossroadsFight,crossroadsRound} from '../../../public/js/battlesim/engines/crossroads/core.js';
import {createCrossroadsState} from '../../../public/js/battlesim/engines/crossroads/state.js';
const roster=JSON.parse(fs.readFileSync('data/simulator-rosters/1293.json','utf8'));
const entries=[...new Map(roster.enemies.map(row=>[row.stats.entry.section,row.stats.entry])).values()];
const hero={hp:18,maxHp:18,constitution:13,dexterity:14,wisdom:11};
function preset(section,player=hero) {
  const entry=entries.find(entry=>entry.section===String(section));
  return startCrossroadsFight(player,entry.enemies,entry.rules);
}
function advance(fight,values,target=0,options={}) {
  let i=0;const next=crossroadsRound(fight,{target,...options,roll(){assert.ok(i<values.length,'unexpected die');return values[i++];}});
  assert.equal(i,values.length,'unused dice');return next;
}
const attacks=(fight,side)=>fight.events.filter(event=>event.kind==='attack'&&event.side===side);

test('eight source tables and four explicit preparation variants load all sixteen NPC rows',()=>{
  assert.equal(entries.length,12);assert.equal(roster.enemies.length,16);
  for(const entry of entries) {
    assert.equal(preset(entry.section).rulesVersion,2);assert.ok(entry.printedRules.length);assert.ok(entry.sourcePages.length);
    assert.equal(roster.enemies.filter(row=>row.stats.entry.section===entry.section).length,entry.enemies.length);
  }
  assert.equal(preset(37).enemies[0].attacks[0].damage,undefined);
});

test('the thieves grant two attacks strictly below Dexterity, then leave after one full round',()=>{
  const passed=advance(preset(11),[4,4,5,...Array(12).fill(1)]);
  assert.equal(attacks(passed,'hero').length,2);assert.equal(attacks(passed,'enemy').length,2);
  assert.equal(passed.status,'win');assert.equal(passed.destination,'6');assert.equal(passed.round,1);
  const equal=advance(preset(11),[4,5,5,...Array(9).fill(1)]);
  assert.equal(attacks(equal,'hero').length,1);assert.equal(equal.status,'win');
  assert.deepEqual(equal.enemies.map(enemy=>enemy.hp),[28,28]);
});

test('approaches from 10 or 13 add one attack-roll point without permanently modifying the hero',()=>{
  const base=advance(preset(11),[4,5,5,3,4,4,...Array(6).fill(1)]);
  const improved=advance(preset('11-advantage'),[4,5,5,3,4,4,1,...Array(6).fill(1)]);
  assert.equal(attacks(base,'hero')[0].hit,false);assert.equal(attacks(improved,'hero')[0].hit,true);
  assert.equal(attacks(improved,'hero')[0].total,12);assert.equal(improved.hero.attackBonus,0);
  assert.equal(preset('21-advantage').rules.mechanics.heroAttackBonus,1);
});

test('the Hjort fight ends after one round and does not invent an unspecified death destination',()=>{
  const survived=advance(preset(21),[1,1,1,1,1,1]);assert.equal(survived.destination,'24');
  const died=advance(preset(21,{...hero,hp:1}),[1,1,1,6,6,6,1]);
  assert.equal(died.status,'loss');assert.equal(died.destination,null);
});

test('ship hits persist, human armour does not protect the vessel, and a hero hit makes the dragon back off',()=>{
  const original=preset(37,{...hero,defenceBonus:100});
  let fight=advance(original,[1,1,1,3,3,4]);assert.equal(fight.encounter.vesselHits,1);
  assert.equal(fight.hero.hp,18);assert.equal(fight.destination,'44');
  assert.equal(attacks(fight,'enemy').length,0);assert.equal(fight.events.find(event=>event.kind==='vesselAttack').hit,true);
  fight=advance(fight,[6,6,6,2]);assert.equal(fight.enemies[0].hp,12);assert.equal(fight.encounter.vesselHits,1);
  assert.equal(fight.destination,'39');assert.equal(fight.events.some(event=>event.kind==='vesselAttack'),false);
  fight=advance(fight,[1,1,1,1,1,1]);assert.equal(fight.destination,'42');assert.equal(fight.encounter.vesselHits,1);
  const saved=structuredClone(fight);
  fight=advance(fight,[1,1,1,6,6,6]);fight=advance(fight,[1,1,1,6,6,6]);
  assert.equal(fight.encounter.vesselHits,3);assert.equal(fight.status,'loss');assert.equal(fight.destination,'43');
  assert.equal(fight.hero.hp,18);assert.equal(saved.encounter.vesselHits,1);assert.equal(original.encounter,undefined);
});

test('retrieving the sword starts with one ship hit, while killing the dragon leads directly to 45',()=>{
  let fight=advance(preset(35),[1,1,1,6,6,6]);assert.equal(fight.encounter.vesselHits,2);
  fight=advance(fight,[1,1,1,6,6,6]);assert.equal(fight.destination,'43');
  const weak=preset(37);weak.enemies[0].hp=2;
  const won=advance(weak,[6,6,6,2]);assert.equal(won.destination,'45');assert.equal(won.status,'win');
});

test('healing replaces the sword attack and lets the dragon try to hit the ship without damaging the hero',()=>{
  const fight=advance(preset(37,{...hero,hp:10}),[6,6,6],0,{healing:5});
  assert.equal(fight.hero.hp,15);assert.equal(fight.encounter.vesselHits,1);assert.equal(fight.destination,'44');
  assert.equal(attacks(fight,'hero').length,0);
});

test('the hunters stop at round four, but earlier victory or player death keeps its printed destination',()=>{
  let fight=preset(50);
  for(let round=1;round<=4;round++) {fight=advance(fight,Array(9).fill(1));assert.equal(fight.status,round<4?'active':'win');}
  assert.equal(fight.destination,'46');assert.deepEqual(fight.enemies.map(enemy=>enemy.hp),[6,6]);
  fight=advance(preset(50),[6,6,6,6,1,1,1]);assert.deepEqual(fight.enemies.map(enemy=>enemy.hp),[0,6]);
  fight=advance(fight,[6,6,6,6],1);assert.equal(fight.destination,'46');assert.equal(fight.round,2);
  const lost=advance(preset(50,{...hero,hp:1}),[1,1,1,6,6,6,2]);assert.equal(lost.destination,'29');
});

test('the Vroon opening injury is applied once and its two attacks roll damage independently',()=>{
  let fight=advance(preset(62),[1,1,1,6,6,6,3,6,6,6,3]);
  assert.equal(fight.hero.hp,14);assert.equal(attacks(fight,'enemy').length,2);
  assert.equal(fight.events.filter(event=>event.kind==='openingDamage').length,1);
  fight=advance(fight,Array(9).fill(1));assert.equal(fight.hero.hp,14);
  assert.equal(fight.events.some(event=>event.kind==='openingDamage'),false);
  const deducted=advance(preset('62-injury-applied',{...hero,hp:16}),[1,1,1,6,6,6,3,6,6,6,3]);
  assert.equal(deducted.hero.hp,14);
  const tooHurt=advance(preset(62,{...hero,hp:1}),[]);assert.equal(tooHurt.destination,'29');assert.equal(tooHurt.hero.hp,0);
});

test('the cook is disarmed immediately when Parras lands the first hit',()=>{
  const before=preset(84),fight=advance(before,[4,4,5,1]);assert.equal(fight.destination,'92');
  assert.equal(fight.status,'win');assert.equal(fight.enemies[0].hp,6);assert.equal(fight.hero.hp,18);
  assert.equal(fight.events.filter(event=>event.kind==='outcome').length,1);assert.equal(before.enemies[0].hp,7);
});

test('a zero-damage cook hit still wins the first-hit race, so a later kill leads to 97',()=>{
  let fight=advance(preset(84),[1,1,1,4,4,4,1]);assert.equal(fight.hero.hp,18);assert.equal(fight.encounter.firstHitter,'enemy');
  fight=advance(fight,[4,4,5,6,1,1,1]);assert.equal(fight.status,'active');assert.equal(fight.enemies[0].hp,1);
  fight=advance(fight,[4,4,5,1]);assert.equal(fight.destination,'97');assert.equal(fight.status,'win');
});

test('guards interrupt the cook fight after the third round without erasing HP; lethal defeat remains 29',()=>{
  let fight=advance(preset(84),[1,1,1,4,4,4,1]);
  fight=advance(fight,Array(6).fill(1));fight=advance(fight,Array(6).fill(1));
  assert.equal(fight.status,'loss');assert.equal(fight.destination,'85');assert.equal(fight.hero.hp,18);
  const killed=advance(preset(84,{...hero,hp:1}),[1,1,1,6,6,6,3]);assert.equal(killed.destination,'29');
});

test('Parras faces exactly his own two guards or one guard, with no invented companion fights',()=>{
  const two=advance(preset(99),[1,1,1,4,4,5,1,4,4,5,1]);
  const one=advance(preset(106),[1,1,1,4,4,5,1]);
  assert.equal(attacks(two,'enemy').length,2);assert.equal(two.hero.hp,16);
  assert.equal(attacks(one,'enemy').length,1);assert.equal(one.hero.hp,17);
});

test('saved ship damage and outcome history preserve shared items, while invalid or stale actions leave data intact',()=>{
  let book=1293,run={inventory:{shared:['one']},equipment:{shared:'two'},other:{keep:true}},saves=0;
  const state=createCrossroadsState({id:1293,stateKey:'sim1293'},()=>({getRun:()=>run,getBookId:()=>book,saveState:()=>saves++}));
  state.change(data=>{data.character={...hero};data.encounterName='Sea-dragon';data.fight=preset(35);});
  state.change(data=>{data.fight=advance(data.fight,[1,1,1,6,6,6]);});
  assert.equal(state.read().fight.encounter.vesselHits,2);assert.equal(state.read().history.length,0);
  const original=structuredClone(run),count=saves;assert.throws(()=>state.change(data=>{data.fight=crossroadsRound(data.fight,{roll:()=>7});}));
  assert.deepEqual(run,original);assert.equal(saves,count);
  state.change(data=>{data.fight=advance(data.fight,[1,1,1,6,6,6]);});state.change(data=>data.log.push('keep'));
  assert.equal(state.read().history.length,1);assert.equal(state.read().character.hp,18);
  assert.deepEqual(run.inventory,{shared:['one']});assert.deepEqual(run.equipment,{shared:'two'});
  const before=structuredClone(run);assert.equal(state.change(data=>{data.character.hp=1;book=1292;}),false);assert.deepEqual(run,before);
});
