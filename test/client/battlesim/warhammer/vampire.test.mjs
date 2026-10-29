import { readRosterDocument } from '../../../helpers/roster-db.cjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { vampireCharacter, vampireRecovery, vampireStats, startVampireFight, vampireRound, resumeVampireFight } from '../../../../public/js/battlesim/engines/warhammer/vampire.js';
import { loadRosterDataset } from '../../../../public/js/battlesim/roster-data.js';

const catalog=readRosterDocument(1457);
const entries=[...new Map(catalog.enemies.map(row=>[row.stats.entryIndex,row.stats.entry])).values()];
const source=section=>structuredClone(entries.find(entry=>entry.section===String(section)));
const hero=(extra={})=>vampireCharacter({...structuredClone(entries[0].playerDefaults.character),...extra});
const enemy=(extra={})=>({key:'test',name:'Test opponent',ws:1,s:3,t:3,w:100,maxW:100,a:1,armour:0,weapon:{name:'Test',damage:1},...extra});
const custom=(extra={})=>({section:'custom',win:'2',loss:'3',initiative:'you',enemies:[enemy()],...extra});
function dice(values){let i=0;const roll=()=>{assert.ok(i<values.length,'Unexpected extra die');return values[i++];};roll.used=()=>i;return roll;}

test('database metadata supplies all 99 source contexts and 184 profiles without changing source data',async()=>{
  const loaded=await loadRosterDataset(1457,'CATALOG',async()=>({ok:true,json:async()=>catalog.enemies}));
  assert.equal(loaded.length,99);assert.equal(catalog.enemies.length,184);
  for(const entry of loaded){const before=JSON.stringify(entry);const fight=startVampireFight(hero(),entry);assert.equal(fight.opponents.length,entry.enemies.length);assert.equal(JSON.stringify(entry),before);}
  assert.equal(source(6).enemies[0].s,7);assert.equal(source(170).enemies[0].t,8);
  assert.equal(source(178).enemies[0].ws,8);assert.equal(source(240).enemies[0].a,8);assert.equal(source(290).enemies[0].a,1);
  assert.equal(source(155).enemies[0].w,3);assert.equal(source(106).enemies.length,4);
});

test('Taint has a floor of one and no corruption death ceiling; zero player Attacks remain valid',()=>{
  assert.equal(vampireRecovery(hero(),{taint:-100}).taint,1);
  assert.equal(startVampireFight(hero({taint:100,a:0}),custom()).status,'fighting');
  const f=startVampireFight(hero({a:1}),custom(),{nextBattleAttackPenalty:true});
  assert.equal(vampireStats(f).a,0);const next=vampireRound(f,{},dice([1]));
  assert.equal(next.history[0].attacks.length,1);assert.equal(next.history[0].attacks[0].attacker,'Test opponent');
});

test('holy and companion bonuses are derived for the whole fight without permanently modifying the sheet',()=>{
  const original=hero();const f=startVampireFight(original,source(85));
  assert.equal(vampireStats(f).s,original.s+1);assert.equal(vampireStats(f).t,original.t+1);assert.equal(vampireStats(f).a,original.a+1);
  assert.deepEqual(f.character,original);
  const next=startVampireFight(f.character,custom());assert.equal(vampireStats(next).a,original.a);
  assert.equal(vampireStats(startVampireFight(original,source(110))).a,original.a+1);
});

test('mixed initiative keeps the mob before the player and the priest after the player',()=>{
  const cfg=source(108);cfg.enemies.forEach(e=>e.ws=1);
  const f=vampireRound(startVampireFight(hero({ws:1}),cfg),{},()=>1);
  assert.deepEqual(f.history[0].attacks.map(a=>a.attacker),['Frenzied Mob','Frenzied Mob','Frenzied Mob','Frenzied Mob','Frenzied Mob','You','Warrior Priest','Warrior Priest']);
  assert.equal(cfg.enemies[0].rerollFailedWounds,undefined);assert.equal(cfg.enemies[1].rerollFailedWounds,true);
});

test('only an explicitly opted-in enemy rerolls a failed wound die, once',()=>{
  const foe=enemy({ws:6,rerollFailedWounds:true});
  const f=startVampireFight(hero({a:0,t:3,armour:0}),custom({enemies:[foe]}));
  const rolls=dice([6,1,6]);const next=vampireRound(f,{},rolls);
  assert.equal(next.character.w,f.character.w-3);assert.equal(next.history[0].attacks[0].woundReroll,6);assert.equal(rolls.used(),3);
});

test('source damage rounds up, companion damage halves downward, then item reductions apply',()=>{
  const f=startVampireFight(hero({a:0,t:3,armour:0}),custom({incomingDamageMultiplier:.5,enemies:[enemy({ws:6,s:5,weapon:{name:'Claws',damage:.5},magicalAttack:true})]}),{bloodstone:true,vanhalRing:true});
  const next=vampireRound(f,{},dice([6,6]));assert.equal(next.character.w,f.character.w);assert.equal(next.history[0].attacks[0].damage,0);
});

test('Wyrmfang uses its extra multiplier only against a marked Undead target',()=>{
  for(const undead of [false,true]){
    const f=startVampireFight(hero({ws:6,s:4,weapon:{name:'Test',damage:2,undeadDamage:3}}),custom({enemies:[enemy({a:0,undead})]}));
    const next=vampireRound(f,{},dice([6,6]));assert.equal(next.damageInflicted,undead?12:8);
  }
});

test('an immediate control threshold preserves the surviving foe and unspent attacks on resume',()=>{
  const cfg=source(271);cfg.initiative='you';cfg.enemies[0].armour=0;
  const f=startVampireFight(hero({ws:6,s:6,a:2,weapon:{name:'Test',damage:1}}),cfg);
  const paused=vampireRound(f,{},dice([6,6]));assert.equal(paused.status,'paused');assert.equal(paused.opponents[0].w,1);
  assert.equal(paused.pending.cursor,2);assert.equal(paused.round,1);assert.equal(paused.section,'191');
  const resumed=resumeVampireFight(paused,{resumeSection:'271',win:'11',loss:'314'});
  assert.equal(resumed.opponents[0].w,1);const next=vampireRound(resumed,{},()=>1);
  assert.equal(next.round,1);assert.equal(next.history[0].attacks.length,5);assert.equal(next.status,'fighting');
  assert.throws(()=>resumeVampireFight(paused,{resumeSection:'348'}));assert.equal(paused.status,'paused');
});

test('nonlethal submission interrupts immediately rather than allowing extra enemy attacks',()=>{
  const cfg=source(112);cfg.enemies[0].armour=0;
  const f=vampireRound(startVampireFight(hero({ws:6,s:100,weapon:{name:'Test',damage:1}}),cfg),{},dice([6]));
  assert.equal(f.status,'win');assert.equal(f.section,'132');assert.equal(f.opponents[0].w,1);assert.equal(f.history[0].attacks.length,1);
});

test('the fifth-round portal takes effect before any fifth-round rolls',()=>{
  let f=startVampireFight(hero({ws:1,a:1}),source(304));
  for(let i=0;i<4;i++)f=vampireRound(f,{},()=>1);
  const next=vampireRound(f,{},()=>{throw Error('Must not roll');});assert.equal(next.status,'interrupted');assert.equal(next.section,'262');assert.equal(next.round,4);
});

test('fast and slow victories retain distinct destinations',()=>{
  for(const round of [1,4]){
    const cfg=source(224);cfg.initiative='you';cfg.enemies[0].w=1;cfg.enemies[0].armour=0;
    let f=startVampireFight(hero({ws:6,s:6}),cfg);f.round=round-1;
    f=vampireRound(f,{},dice([6]));assert.equal(f.section,round===1?'352':'172');
  }
});

test('the joust first round compares damage without losing Wounds; tied rounds award neither side',()=>{
  const cfg=source(182);cfg.enemies[0].ws=1;cfg.enemies[0].armour=0;
  let f=startVampireFight(hero({ws:6,s:6,weapon:{name:'Test',damage:1}}),cfg);
  f=vampireRound(f,{},dice([1,6,6]));assert.equal(f.character.w,18);assert.equal(f.opponents[0].w,14);assert.equal(f.roundWins.you,1);
  f.character.ws=1;f=vampireRound(f,{},dice([1,1]));assert.equal(f.roundWins.you,1);
  f.character.ws=6;f=vampireRound(f,{},dice([1,6,6]));assert.equal(f.status,'win');assert.equal(f.section,'162');assert.equal(f.roundWins.you,2);
});

test('the Warlock retains previous injuries only when the printed continuation asks for them',()=>{
  const previous=startVampireFight(hero(),source(185));previous.opponents[0].w=2;
  const follow=startVampireFight(hero(),source(315),{},previous);assert.equal(follow.opponents[0].w,2);
  assert.equal(startVampireFight(hero(),source(185),{},previous).opponents[0].w,12);
  assert.equal(previous.opponents[0].w,2);
});

test('explicitly allocated attacks do not jump from a defeated target to another foe',()=>{
  const cfg=custom({enemies:[enemy({key:'a',w:1,a:0}),enemy({key:'b',a:0})]});
  const f=vampireRound(startVampireFight(hero({ws:6,s:6,a:2}),cfg),{targets:[0,0]},dice([6]));
  assert.equal(f.opponents[1].w,100);assert.equal(f.history[0].attacks.length,1);
});
