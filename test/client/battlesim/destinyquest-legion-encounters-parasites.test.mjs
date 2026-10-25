import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodeDestinyRoster} from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
import {createLegionFight,useLegionAction} from '../../../public/js/battlesim/engines/destinyquest/legion.js';
import {startDestinyRound,rollDestinySpeed,resolveDestinySpeed,rollDestinyDamage,resolveDestinyDamage,endDestinyRound,retargetDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {useDestinyAbility} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {destinyStat} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
import {resolveDestinyAbilityRoll} from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';
const roster=decodeDestinyRoster(JSON.parse(fs.readFileSync(new URL('../../../data/simulator-rosters/1286.json',import.meta.url),'utf8')).enemies);
const hero={speed:20,brawn:3,magic:0,armour:4,health:30,maxHealth:30};
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected roll');return values.shift();};
const make=(section,options={})=>createLegionFight({...hero,...options.hero},section,{roster,...options});
const round=f=>startDestinyRound(f,0);
const win=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(6,5,1,2)));
const lose=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(1,2,6,5)));
const hit=(f,face=4)=>resolveDestinyDamage(rollDestinyDamage(f,rolls(face)));
const resume=f=>JSON.parse(JSON.stringify(f));

test('Zen starts with three protected Speed dice, then allows ordinary reduction from round two',()=>{
  let f=round(make('382',{hero:{brawn:0},abilities:{webbed:1}}));assert.throws(()=>useDestinyAbility(f,'webbed'),/immune/);
  f=rollDestinySpeed(f,rolls(6,5,1,2,3));assert.equal(f.turn.opponentSpeedDice.length,3);f=hit(resolveDestinySpeed(f),1);
  f=round(endDestinyRound(f));f=useDestinyAbility(f,'webbed');f=rollDestinySpeed(f,rolls(6,5,1));assert.equal(f.turn.opponentSpeedDice.length,1);
});

test('Zen Trample adds five to the damage score before armour absorption',()=>{
  let f=round(make('382',{hero:{speed:0,armour:20,health:100,maxHealth:100}}));f=resolveDestinySpeed(rollDestinySpeed(f,rolls(1,2,6,5,4)));f=hit(f,6);
  assert.equal(f.turn.damageScore,21);assert.equal(f.hero.health,99);
});

test('entering the angler stomach costs five health once per won attack and ignores armour for that attack only',()=>{
  let f=win(round(make('438',{hero:{health:20,brawn:10}})));f=useLegionAction(f,'enter-stomach',{roster});assert.equal(f.hero.health,15);assert.throws(()=>useLegionAction(f,'enter-stomach',{roster}),/once/);
  f=hit(f);assert.equal(f.opponents[0].health,46);f=win(round(endDestinyRound(f)));f=hit(f);assert.equal(f.opponents[0].health,46);
});

test('Kindle breath uses three dice against Speed and ignores Armour on failure',()=>{
  let f=make('454',{hero:{speed:5,brawn:0,armour:100}});f=resolveDestinySpeed(rollDestinySpeed(round(f),rolls(6,6,1,1)));f=hit(f,1);
  f=endDestinyRound(f,[],rolls(3,3,3));f=resolveDestinyAbilityRoll(f,rolls());f=endDestinyRound(f);assert.equal(f.hero.health,25);
});

test('Dread reduces only Brawn and Magic for the combat',()=>{
  const f=make('462',{hero:{brawn:6,magic:5}});assert.equal(destinyStat(f,'hero','brawn'),4);assert.equal(destinyStat(f,'hero','magic'),3);assert.equal(destinyStat(f,'hero','speed'),20);
});

test('destroying the unarmoured painting removes only its Wailing Bride effects and preserves other modifiers',()=>{
  let f=make('464',{abilities:{sear:1}});assert.equal(f.opponents[1].armour,null);f=endDestinyRound(hit(win(round(f))));assert.equal(destinyStat(f,'hero','speed'),19);
  f.opponents[1].health=5;f=round(resume(f));f=useDestinyAbility(f,'sear');f=win(f);f=retargetDestinyRound(f,1);f=hit(f,6);
  assert.equal(f.opponents[1].health,0);assert.equal(f.opponents[1].armour,null);assert.equal(f.status,'active');assert.equal(destinyStat(f,'hero','speed'),20);assert.equal(destinyStat(f,'hero','brawn'),3);
  assert.ok(f.effects.some(e=>e.source==='sear'));assert.equal(f.effects.some(e=>e.source==='wailing-bride'),false);
});

test('defeating the Count first silences the still-intact painting',()=>{
  let f=make('464',{hero:{brawn:100}});f=hit(win(round(f)));assert.equal(f.status,'win');assert.equal(f.opponents[1].health,35);assert.deepEqual(f.encounter.surrenderedTargets,[1]);
});

test('leviathan parasite kills immediately remove only their own effects without inventing Armour values',()=>{
  let f=make('470',{hero:{brawn:0}});assert.deepEqual(f.opponents.slice(1).map(o=>o.armour),[null,null,null]);assert.equal(destinyStat(f,'hero','speed'),19);
  f=endDestinyRound(hit(win(round(f)),1));assert.equal(f.hero.health,26);
  f.opponents[2].health=1;f=retargetDestinyRound(win(round(resume(f))),2);f=endDestinyRound(hit(f));assert.equal(f.hero.health,24);
  f.opponents[3].health=1;f=retargetDestinyRound(win(round(f)),3);f=hit(f);assert.equal(destinyStat(f,'hero','speed'),20);f=endDestinyRound(f);assert.equal(f.hero.health,22);
});

test('killing the leviathan ends the fight without falsely killing its remaining parasites',()=>{
  let f=hit(win(round(make('470',{hero:{brawn:100}}))));assert.equal(f.status,'win');assert.deepEqual(f.opponents.slice(1).map(o=>o.health),[20,20,20]);assert.deepEqual(f.encounter.surrenderedTargets,[1,2,3]);
});

test('Purple Worm gains one Speed and Brawn per ten Health lost',()=>{
  let f=hit(win(round(make('472',{hero:{brawn:11}}))));assert.equal(f.opponents[0].health,30);assert.equal(destinyStat(f,0,'speed'),6);assert.equal(destinyStat(f,0,'brawn'),6);
  f=hit(win(round(endDestinyRound(f))));assert.equal(destinyStat(f,0,'speed'),7);assert.equal(destinyStat(f,0,'brawn'),7);
});

test('Giant Ooze locks the following round to one die without blocking unrelated Speed boosts',()=>{
  let f=endDestinyRound(hit(win(round(make('481',{hero:{brawn:0},abilities:{haste:1,quicksilver:1}}))),1));f=round(resume(f));assert.equal(f.turn.heroSpeedCount,1);assert.equal(f.turn.heroSpeedDiceLocked,true);
  assert.throws(()=>useDestinyAbility(f,'haste'),/dice count/);f=useDestinyAbility(f,'quicksilver');assert.equal(destinyStat(f,'hero','speed'),22);
});

test('Wormwood glancing blows skip damage without becoming a dodge that Ensnare can cancel',()=>{
  let f=round(make('490',{abilities:{ensnare:1}}));f=resolveDestinySpeed(rollDestinySpeed(f,rolls(6,5,1,2)),rolls(1));f=resolveDestinyAbilityRoll(f,rolls());assert.equal(f.phase,'end');assert.equal(f.opponents[0].health,50);assert.throws(()=>useDestinyAbility(f,'ensnare'),/must dodge/);
  f=make('490');f.opponents[0].health=1;f=resolveDestinySpeed(rollDestinySpeed(round(f),rolls(6,5,1,2)),rolls(3));f=resolveDestinyAbilityRoll(f,rolls());assert.equal(f.phase,'damage');f=hit(f);assert.equal(f.encounter.outcomeSection,'533');
});

test('Command still triggers Wormwood armour check when it steals an enemy win',()=>{
  let f=lose(round(make('490',{hero:{speed:0},abilities:{command:1}})));f=useDestinyAbility(f,'command',{},rolls(2));assert.equal(f.phase,'ability-rolled');f=resolveDestinyAbilityRoll(f,rolls());assert.equal(f.phase,'end');assert.equal(f.opponents[0].health,50);
});

test('the second mage retains printed null Magic while its fixed bolt remains fully functional',()=>{
  let f=make('491',{hero:{speed:0}});assert.equal(f.opponents[0].magic,null);assert.equal(f.opponents[0].normal.magic,null);assert.throws(()=>destinyStat(f,0,'magic'),/no such/);
  for(let i=0;i<2;i++){f=resolveDestinyDamage(lose(round(f)),rolls());if(!i)f=endDestinyRound(f);}
  assert.equal(f.hero.health,20);assert.equal(f.opponents[0].magic,null);
});

test('Count blood-drinker adds exactly one die and heals only after actual health damage',()=>{
  for(const section of ['505','535','545']){
    let f=make(section,{hero:{speed:0}});f.opponents[0].health=30;f=lose(round(f));f=rollDestinyDamage(f,rolls(6,6));assert.deepEqual(f.turn.damageDice,[6,6]);f=resolveDestinyDamage(f);assert.equal(f.opponents[0].health,32);
    f=make(section,{hero:{speed:0},abilities:{dodge:1}});f.opponents[0].health=30;f=rollDestinyDamage(lose(round(f)),rolls(6,2));f=useDestinyAbility(f,'dodge');f=resolveDestinyDamage(f);assert.equal(f.opponents[0].health,30);
  }
});

test('Kalimari allows an ink-bomb reroll before acceptance, then blocks non-passive abilities for that round only',()=>{
  let f=rollDestinySpeed(round(make('510',{abilities:{charm:1}})),rolls(1,6,1,2));f=useDestinyAbility(f,'charm',{die:0},rolls(3));f=resolveDestinySpeed(f);assert.equal(f.turn.winner,'hero');
  f=rollDestinySpeed(round(make('510',{abilities:{heal:1,'fire-aura':1}})),rolls(1,6,1,2));f=resolveDestinySpeed(f);assert.equal(f.turn.winner,'opponent');assert.throws(()=>useDestinyAbility(f,'heal'),/blocked/);
  f=hit(f);f=endDestinyRound(f);assert.equal(f.opponents[0].health,59);f=round(f);f=useDestinyAbility(f,'heal');assert.equal(f.hero.health,24);
});

test('Phoenix rises within the same battle, retaining wounds and spent abilities until its second form dies',()=>{
  let f=make('543',{hero:{health:10,brawn:100},abilities:{heal:1}});f=round(f);f=useDestinyAbility(f,'heal');f=hit(win(f));assert.equal(f.status,'active');assert.equal(f.hero.health,14);assert.equal(f.opponents[1].health,30);assert.equal(f.phase,'end');
  f=startDestinyRound(endDestinyRound(resume(f)),1);assert.throws(()=>useDestinyAbility(f,'heal'),/no uses/);f=hit(win(f));assert.equal(f.status,'win');assert.equal(f.hero.health,30);
});
