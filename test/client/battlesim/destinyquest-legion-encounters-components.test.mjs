import { readRosterDocument } from '../../helpers/roster-db.cjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodeDestinyRoster} from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
import {createLegionFight} from '../../../public/js/battlesim/engines/destinyquest/legion.js';
import {startDestinyRound,rollDestinySpeed,resolveDestinySpeed,rollDestinyDamage,resolveDestinyDamage,endDestinyRound,retargetDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {useDestinyAbility,useDestinyBackpackItem} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {destinyStat} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
import {resolveDestinyAbilityRoll} from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';
const roster=decodeDestinyRoster(readRosterDocument(1286).enemies);
const hero={speed:20,brawn:3,magic:0,armour:4,health:30,maxHealth:30};
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected roll');return values.shift();};
const make=(section,options={})=>createLegionFight({...hero,...options.hero},section,{roster,...options});
const round=f=>startDestinyRound(f,0);
const win=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(6,6,1,1)));
const lose=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(1,2,6,5)));
const hit=(f,face=4)=>resolveDestinyDamage(rollDestinyDamage(f,rolls(face)));
const resume=f=>JSON.parse(JSON.stringify(f));

test('mage bolts count nonconsecutive wins, never roll normal damage and ignore armour',()=>{
  let f=lose(round(make('323',{hero:{speed:10,brawn:0,armour:100,health:100,maxHealth:100}})));
  assert.equal(f.turn.enemyFixedDamage,0);assert.throws(()=>rollDestinyDamage(f,rolls()),/does not roll/);
  f=resolveDestinyDamage(f,rolls());assert.equal(f.hero.health,100);assert.equal(f.encounter.enemyWinCharge.count,1);
  f=hit(win(round(endDestinyRound(f))),1);f=endDestinyRound(f);assert.equal(f.encounter.enemyWinCharge.count,1);
  f=lose(round(resume(f)));assert.equal(f.turn.enemyFixedDamage,10);f=resolveDestinyDamage(f,rolls());assert.equal(f.hero.health,90);assert.equal(f.encounter.enemyWinCharge.count,2);
});

test('mage-specific forbidden dodges are rejected and Command does not leave a stolen round charged',()=>{
  let f=lose(round(make('323',{hero:{speed:0},abilities:{vanish:1,evade:1,sidestep:1,command:1}})));
  for(const name of ['vanish','evade','sidestep'])assert.throws(()=>useDestinyAbility(f,name),/cannot avoid/);
  f=useDestinyAbility(f,'command');assert.equal(f.turn.enemyFixedDamage,undefined);f=hit(f,1);f=endDestinyRound(f);assert.equal(f.encounter.enemyWinCharge.count||0,0);
});

test('mud and fire evasion hazards compare the accepted end roll with current Speed',()=>{
  for(const[section,damage]of[['337',2],['426',4]]){
    let f=hit(win(round(make(section,{hero:{speed:0,brawn:0}}))),1);f=endDestinyRound(f,[],rolls(2,2));assert.equal(f.phase,'ability-rolled');
    f=resolveDestinyAbilityRoll(f,rolls());assert.equal(f.hero.health,30);f=endDestinyRound(f);assert.equal(f.hero.health,30-damage);
  }
});

test('hydra restores only Health at the start of round four and an earlier kill earns its achievement',()=>{
  let f=make('350',{hero:{brawn:15}});
  for(let i=0;i<3;i++)f=endDestinyRound(hit(win(round(f))));assert.equal(f.opponents[0].health,33);
  f=round(resume(f));assert.equal(f.opponents[0].health,60);
  f=hit(win(round(make('350',{hero:{brawn:100}}))));assert.equal(f.encounter.outcomeSection,'418');
});

test('Nasareim explodes every damage six and Dervish is not cancelled by Second Skin',()=>{
  let f=lose(round(make('352',{hero:{speed:0,armour:100},abilities:{'second-skin':1}})));
  f=rollDestinyDamage(f,rolls(6,6,2));assert.deepEqual(f.turn.damageDice,[6,6,2]);f=resolveDestinyDamage(f);assert.equal(f.hero.health,6);
});

test('Barkrot blocks abilities but permits actual backpack items after its root hazard',()=>{
  let f=startDestinyRound(make('357',{abilities:{heal:1},character:{backpack:[{name:'Potion',heal:4}]}}),0,rolls(2));
  f=resolveDestinyAbilityRoll(f,rolls());assert.equal(f.hero.health,25);assert.throws(()=>useDestinyAbility(f,'heal'),/unavailable/);
  f=useDestinyBackpackItem(f,0,rolls());assert.equal(f.hero.health,29);assert.equal(f.character.backpack.length,0);
});

test('hive queen has a persistent Speed penalty and drones defeat Armour without using Piercing',()=>{
  let f=round(make('358'));assert.equal(destinyStat(f,'hero','speed'),19);f=round(endDestinyRound(hit(win(f))));assert.equal(destinyStat(f,'hero','speed'),19);
  f=hit(lose(round(make('365',{hero:{speed:0,armour:100},abilities:{'second-skin':1}}))));assert.equal(f.hero.health,23);
});

test('Snapjaw constriction increases by two each round, including a JSON resume',()=>{
  let f=make('364',{hero:{brawn:0}});
  f=endDestinyRound(hit(win(round(f)),1));assert.equal(f.hero.health,28);
  f=endDestinyRound(hit(win(round(resume(f))),1));assert.equal(f.hero.health,24);
});

test('the net preserves printed missing stats and can be selected after winning against its hunter',()=>{
  let f=make('366',{hero:{brawn:20}});assert.equal(f.opponents[1].speed,null);assert.equal(f.opponents[1].brawn,null);assert.equal(f.opponents[1].armour,2);
  f=round(f);assert.equal(f.turn.heroSpeedCount,1);f=resolveDestinySpeed(rollDestinySpeed(f,rolls(6,1,2)));
  f=retargetDestinyRound(f,1);assert.equal(f.turn.winner,'hero');f=hit(f);assert.equal(f.opponents[1].health,0);assert.equal(f.status,'active');
  f=round(endDestinyRound(f));assert.equal(f.turn.heroSpeedCount,undefined);f=rollDestinySpeed(f,rolls(6,5,1,2));assert.equal(f.turn.heroSpeedDice.length,2);
});

test('killing the hunter first frees the hero without a second fight against the net',()=>{
  let f=round(make('366',{hero:{brawn:100}}));f=resolveDestinySpeed(rollDestinySpeed(f,rolls(6,1,2)));f=hit(f);assert.equal(f.status,'win');assert.equal(f.opponents[1].health,0);
});

test('centipede loses Speed and Brawn once for each ten Health actually lost',()=>{
  let f=hit(win(round(make('375',{hero:{brawn:9}}))));assert.equal(f.opponents[0].health,50);assert.equal(destinyStat(f,0,'speed'),5);assert.equal(destinyStat(f,0,'brawn'),4);
  f=hit(win(round(endDestinyRound(f))));assert.equal(f.opponents[0].health,40);assert.equal(destinyStat(f,0,'speed'),4);assert.equal(destinyStat(f,0,'brawn'),3);
});

test('Shara rolls three Speed dice and Webbed removes exactly one',()=>{
  let f=useDestinyAbility(round(make('386',{abilities:{webbed:1}})),'webbed');f=rollDestinySpeed(f,rolls(6,5,1,2));assert.equal(f.turn.opponentSpeedDice.length,2);
});

test('King Louis end damage is reduced by normal Armour',()=>{
  let f=endDestinyRound(hit(win(round(make('391',{hero:{brawn:0}}))),1));assert.equal(f.hero.health,19);
});

test('KerKlick permits rerolling a Speed one, applies its accepted-roll hazard once and caps growth',()=>{
  let f=rollDestinySpeed(round(make('393',{hero:{brawn:0},abilities:{charm:1}})),rolls(1,4,2,3));assert.equal(f.hero.health,30);
  f=useDestinyAbility(f,'charm',{die:0},rolls(4));f=resolveDestinySpeed(f);assert.equal(f.hero.health,30);f=endDestinyRound(hit(f,1));assert.equal(destinyStat(f,0,'brawn'),6);
  for(let i=0;i<6;i++)f=endDestinyRound(hit(win(round(f)),1));assert.equal(destinyStat(f,0,'brawn'),10);
  f=rollDestinySpeed(round(make('393')),rolls(1,1,2,3));f=resolveDestinySpeed(f);assert.equal(f.hero.health,28);
});

test('Cinders ignores forbidden fire and Bleed effects while vampire fights keep remaining health',()=>{
  let f=win(round(make('426',{abilities:{ignite:1,burn:1,bleed:1,'fire-aura':1,sear:1}})));
  assert.throws(()=>useDestinyAbility(f,'sear'),/immune/);f=useDestinyAbility(f,'ignite',{},rolls(4,5));assert.equal(f.opponents[0].health,45);
  f=endDestinyRound(f,[],rolls(1,2));f=resolveDestinyAbilityRoll(f,rolls());f=endDestinyRound(f);assert.equal(f.opponents[0].health,45);
  for(const section of ['360','429']){f=hit(win(round(make(section,{hero:{health:10,brawn:100}}))));assert.equal(f.hero.health,10);assert.equal(f.encounter.traitsByTarget[0][0],'vampire');}
});

test('the jester one-round penalty wears off and remains a vulnerable vampire',()=>{
  let f=startDestinyRound(make('435'),0,rolls(1));f=resolveDestinyAbilityRoll(f,rolls());assert.equal(destinyStat(f,'hero','speed'),19);assert.deepEqual(f.encounter.traitsByTarget[0],['vampire']);
  f=hit(win(f));f=endDestinyRound(f);f=startDestinyRound(f,0,rolls(2));f=resolveDestinyAbilityRoll(f,rolls());assert.equal(destinyStat(f,'hero','speed'),20);
});
