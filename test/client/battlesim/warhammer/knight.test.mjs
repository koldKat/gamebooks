import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { knightCharacter, knightRecovery, acquireKnightWeapon, startKnightFight, knightRound, knightInterrogation } from '../../../../public/js/battlesim/engines/warhammer/knight.js';
import { loadRosterDataset } from '../../../../public/js/battlesim/roster-data.js';

const catalog = JSON.parse(readFileSync('data/simulator-rosters/1455.json'));
const entries = [...new Map(catalog.enemies.map(row => [row.stats.entryIndex, row.stats.entry])).values()];
const defaults = entries[0].playerDefaults;
const source = section => structuredClone(entries.find(entry => entry.section === String(section)));
const hero = (values = {}) => knightCharacter({ ...defaults.character, ...values });
const foe = (values = {}) => ({ name:'Test opponent', ws:1, s:3, t:3, w:20, a:1, armour:0, weapon:{name:'Test weapon',damage:1}, ...values });
const custom = (values = {}) => ({ section:'custom',initiative:'you',taintLimit:6,taintSection:'26',enemies:[foe()], ...values });
function sequence(values) {
  let index=0;
  const roll=()=>{assert.ok(index<values.length,'unexpected extra die');return values[index++];};
  roll.used=()=>index;return roll;
}

test('database metadata reconstructs all 71 source contexts and 107 profiles', async () => {
  const rows=catalog.enemies.map(row=>({name:row.name,stats:row.stats}));
  const loaded=await loadRosterDataset(1455,'CATALOG',async()=>({ok:true,json:async()=>rows}));
  assert.equal(loaded.length,71);assert.equal(rows.length,107);
  assert.equal(loaded.reduce((n,e)=>n+e.variants.length,0),10);
  for(const entry of loaded){
    const fight=startKnightFight(hero(),entry);
    assert.equal(fight.opponents.length,entry.enemies.length);
    assert.equal(fight.status,'fighting');
  }
  assert.equal(source(96).enemies[0].w,null);
  assert.equal(source(258).enemies[0].w,null);
  assert.equal(source(388).loss,null);
  assert.equal(source(49).enemies[0].t,1);
  assert.equal(source(162).enemies[0].w,5);
  assert.equal(source(381).enemies[0].w,4);
  assert.equal(source(43).enemies[0].armour,6);
  assert.equal(source(54).enemies[0].armour,0);
});

test('fractional weapon multipliers round up after a successful wound',()=>{
  const fight=startKnightFight(hero({ws:6,weapon:{name:'Test',damage:0.5}}),custom());
  const rolls=sequence([1,6,1]);const next=knightRound(fight,{},rolls);
  assert.equal(next.opponents[0].w,18);assert.equal(next.damageInflicted,2);
  assert.equal(fight.opponents[0].w,20,'saved fight is immutable');
  assert.equal(rolls.used(),3);
});

test('automatic and impossible wound chart cells skip the wound die; equal saves succeed',()=>{
  const impossible=startKnightFight(hero({ws:6,s:1}),custom({enemies:[foe({t:6})]}));
  const miss=sequence([6,1]);const noDamage=knightRound(impossible,{},miss);
  assert.equal(noDamage.damageInflicted,0);assert.equal(miss.used(),2);
  assert.equal(noDamage.history[0].attacks[0].cannotWound,true);
  const automatic=startKnightFight(hero({ws:6,s:6}),custom({enemies:[foe({t:1,armour:4})]}));
  const save=sequence([6,4,1]);const saved=knightRound(automatic,{},save);
  assert.equal(saved.damageInflicted,0);assert.equal(save.used(),3);
  assert.equal(saved.history[0].attacks[0].saved,true);
});

test('explicitly allocated attacks do not jump from a defeated target to another enemy',()=>{
  const fight=startKnightFight(hero({ws:6,a:2}),custom({enemies:[foe({w:3}),foe({w:3})]}));
  const result=knightRound(fight,{targets:[0,0]},sequence([6,6,1]));
  assert.deepEqual(result.opponents.map(e=>e.w),[0,3]);assert.equal(result.status,'fighting');
  const separate=knightRound(fight,{targets:[0,1]},sequence([6,6,6,6]));
  assert.equal(separate.status,'win');assert.deepEqual(separate.opponents.map(e=>e.w),[0,0]);
});

test('round-five interruptions happen before attacks and consume no extra dice',()=>{
  for(const section of [29,134,198]){
    const entry=source(section);entry.enemies=entry.enemies.map(e=>({...e,ws:1,w:10000,maxW:10000}));
    let fight=startKnightFight(hero({ws:6,s:1,t:6}),entry);
    for(let i=0;i<4;i++)fight=knightRound(fight,{},()=>1);
    const before=fight.history.length;
    fight=knightRound(fight,{},()=>assert.fail('interrupted round must not roll'));
    assert.equal(fight.status,'interrupted');assert.equal(fight.round,4);
    assert.equal(fight.history.length,before);assert.equal(fight.section,String(entry.interruptedSection));
  }
});

test('all other printed interruption deadlines use their own round and destination',()=>{
  for(const section of [81,136,283]){
    const entry=source(section);entry.enemies=entry.enemies.map(e=>({...e,ws:1,w:10000,maxW:10000}));
    let fight=startKnightFight(hero({ws:6,s:1,t:6}),entry);
    for(let i=1;i<entry.interruptBeforeRound;i++)fight=knightRound(fight,{},()=>1);
    fight=knightRound(fight,{},()=>assert.fail('deadline has no attacks'));
    assert.equal(fight.section,String(entry.interruptedSection));
    assert.equal(fight.round,entry.interruptBeforeRound-1);
  }
});

test('bridge defence keeps unlimited enemies alive for all five completed rounds',()=>{
  let fight=startKnightFight(hero({ws:6,s:6,t:6,w:100,maxW:100,armour:0}),source(96));
  const rolls=sequence(Array.from({length:5},()=>[6,1,1]).flat());
  for(let i=0;i<5;i++)fight=knightRound(fight,{},rolls);
  assert.equal(fight.status,'win');assert.equal(fight.section,'55');
  assert.equal(fight.followUpSection,'98');assert.equal(fight.damageInflicted,30);
  assert.equal(fight.opponents[0].w,null);assert.equal(fight.history.length,5);
  assert.equal(fight.history.reduce((n,e)=>n+e.attacks.length,0),10);
});

test('death on the final defence round takes priority over surviving five rounds',()=>{
  let fight=startKnightFight(hero({ws:6,s:6,w:1,maxW:12,armour:0}),source(96));
  for(let i=0;i<4;i++)fight=knightRound(fight,{},sequence([6,1,1]));
  fight=knightRound(fight,{},sequence([6,1,6,6]));
  assert.equal(fight.status,'loss');assert.equal(fight.section,'362');
  assert.equal(fight.followUpSection,undefined);
});

test('Vermintide totals actual damage and uses its own follow-up threshold',()=>{
  let fight=startKnightFight(hero({ws:6,t:6,w:100,maxW:100}),source(258));
  for(let i=0;i<5;i++)fight=knightRound(fight,{},sequence([6,6,1]));
  assert.equal(fight.damageInflicted,15);assert.equal(fight.section,'184');assert.equal(fight.followUpSection,'397');
  let low=startKnightFight(hero({ws:6,s:1,t:6,w:100,maxW:100}),source(258));
  for(let i=0;i<5;i++)low=knightRound(low,{},()=>1);
  assert.equal(low.damageInflicted,0);assert.equal(low.followUpSection,'356');
});

test('protection redirects damage to an unarmoured companion without changing hero Wounds',()=>{
  const fight=startKnightFight(hero({ws:6,s:1,t:2,w:1,maxW:12,armour:1}),source(355));
  const result=knightRound(fight,{},sequence([6,1,6,6,6,6]));
  assert.equal(result.companion.w,6);assert.equal(result.character.w,1);
  assert.equal(result.status,'fighting');assert.equal(result.damageTaken,4);
  assert.equal(result.history[0].attacks[1].saveRoll,undefined);
});

test('enemy-first companion death stops the turn immediately',()=>{
  const entry=source(276);entry.protectedCompanion.w=2;
  const fight=startKnightFight(hero({t:2,armour:1}),entry);
  const result=knightRound(fight,{},sequence([6,6]));
  assert.equal(result.status,'loss');assert.equal(result.section,'375');
  assert.equal(result.character.w,12);assert.equal(result.history[0].attacks.length,1);
});

test('Guard of Morr sparring stops at five Wounds, before the counterattack',()=>{
  const fight=startKnightFight(hero({ws:6}),source(254));
  const result=knightRound(fight,{},sequence([6,6,1]));
  assert.equal(result.opponents[0].w,5);assert.equal(result.status,'win');assert.equal(result.section,'305');
  const hurt=startKnightFight(hero({w:5}),source(254));
  assert.equal(hurt.status,'loss');assert.equal(hurt.section,'195');assert.equal(hurt.round,0);
});

test('the two-round duel ends with an interruption rather than a deathmatch',()=>{
  const entry=source(205);entry.enemies[0]={...entry.enemies[0],ws:1,t:6};
  let fight=startKnightFight(hero({ws:6,s:1,t:6}),entry);
  fight=knightRound(fight,{},()=>1);assert.equal(fight.status,'fighting');
  fight=knightRound(fight,{},()=>1);assert.equal(fight.status,'interrupted');assert.equal(fight.section,'396');
  assert.ok(fight.opponents[0].w>0);assert.throws(()=>knightRound(fight));
});

test('late victory remains possible in fights with round-dependent destinations',()=>{
  const entry=source(17);entry.enemies=[foe({s:1,t:1,w:5})];
  let fight=startKnightFight(hero({ws:6,s:1,t:6}),entry);
  for(let i=0;i<5;i++)fight=knightRound(fight,{},()=>6);
  assert.equal(fight.round,5);assert.equal(fight.status,'win');assert.equal(fight.section,'207');
  const fast=knightRound(startKnightFight(hero({ws:6,s:6,t:6}),entry),{},sequence([6]));
  assert.equal(fast.status,'win');assert.equal(fast.section,'123');
});

test('temporary combat modifiers and armour suppression never overwrite the saved character',()=>{
  for(const [section,expected]of [[130,2],[339,4]]){
    const fight=startKnightFight(hero(),source(section));
    const result=knightRound(fight,{},()=>1);
    assert.equal(result.history[0].attacks[0].hitThreshold,expected);assert.equal(result.character.ws,4);
  }
  const fight=startKnightFight(hero({armour:1,t:2}),source(90));
  const result=knightRound(fight,{},sequence([1,6,6,6,6]));
  assert.equal(result.character.w,8);assert.equal(result.character.armour,1);
});

test('entry changes are opt-in, and Taint six ends the fight before dice are rolled',()=>{
  const base=hero({taint:5});const entry=source(32);
  assert.equal(startKnightFight(base,entry).character.taint,5);
  const fight=startKnightFight(base,entry,{applyEntryEffects:true});
  assert.equal(fight.status,'loss');assert.equal(fight.section,'26');assert.equal(fight.round,0);
  assert.equal(base.taint,5);assert.equal(startKnightFight(hero(),source(136),{applyEntryEffects:true}).character.w,1);
});

test('armour weakness adds damage only to an unsaved wound against an eligible Skaven',()=>{
  const entry=custom({armourWeaknessDamage:1,enemies:[foe({armouredSkaven:true})]});
  const result=knightRound(startKnightFight(hero({ws:6}),entry,{armourWeakness:true}),{},sequence([6,6,1]));
  assert.equal(result.damageInflicted,4);
  entry.enemies[0].armouredSkaven=false;
  const ordinary=knightRound(startKnightFight(hero({ws:6}),entry,{armourWeakness:true}),{},sequence([6,6,1]));
  assert.equal(ordinary.damageInflicted,3);
});

test('any damage during the Ghoul fight is distinguished from starting below full Wounds',()=>{
  const entry=source(124);entry.enemies=[foe({w:1,t:1,ws:1})];
  const result=knightRound(startKnightFight(hero({w:6,ws:6,s:6}),entry),{},sequence([6]));
  assert.equal(result.section,'279');assert.equal(result.followUpSection,'86');
  assert.equal(result.character.w,6);
});

test('item-dependent victory, missing printed defeat reference and save-load continuation are preserved',()=>{
  const entry=source(155);entry.enemies=[foe({w:1,t:1})];
  for(const [owned,target]of [[true,'163'],[false,'188']]){
    const saved=JSON.parse(JSON.stringify(startKnightFight(hero({ws:6,s:6}),entry,{victoryItem:owned})));
    assert.equal(knightRound(saved,{},sequence([6])).section,target);
  }
  const noRoute=source(388);noRoute.initiative='enemy';noRoute.enemies=[foe({ws:6,s:6})];
  const defeat=knightRound(startKnightFight(hero({w:1,t:1,armour:0}),noRoute),{},sequence([6]));
  assert.equal(defeat.status,'loss');assert.equal(defeat.section,null);
});

test('Dammeblad acquisition is once-only, preserves damage multiplier and reduces Taint once',()=>{
  const base=hero({taint:2,weapon:{name:'Test',damage:0.5}});
  const result=acquireKnightWeapon(base,defaults.specialWeapon);
  assert.equal(result.ws,5);assert.equal(result.a,2);assert.equal(result.taint,1);assert.equal(result.weapon.damage,0.5);
  assert.deepEqual(acquireKnightWeapon(result,defaults.specialWeapon),result);
  assert.equal(base.ws,4);assert.equal(base.taint,2);
});

test('recovery restores only the selected stats and does not reset Taint',()=>{
  const result=knightRecovery(hero({s:1,t:2,w:1,taint:4}),{restoreWounds:true,restoreStrength:true,restoreToughness:true});
  assert.equal(result.w,12);assert.equal(result.s,3);assert.equal(result.t,3);assert.equal(result.taint,4);
  assert.equal(knightRecovery(hero({w:10}),{wounds:4}).w,12);
});

test('prisoner interrogation has independent counters and death takes precedence over corruption',()=>{
  const rules=defaults.interrogation;
  assert.deepEqual(knightInterrogation({w:2,taint:9},rules.methods[0],rules),{w:0,taint:11,section:'154'});
  assert.deepEqual(knightInterrogation({w:6,taint:2},rules.methods[0],rules),{w:4,taint:4,section:'189'});
  assert.deepEqual(knightInterrogation(rules.initial,rules.methods[2],rules),{w:7,taint:1,section:'304'});
  assert.deepEqual(rules.initial,{w:8,taint:0});
});
