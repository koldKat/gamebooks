import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodeDestinyRoster} from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
import {createLegionFight,useLegionAction} from '../../../public/js/battlesim/engines/destinyquest/legion.js';
import {startDestinyRound,rollDestinySpeed,resolveDestinySpeed,rollDestinyDamage,resolveDestinyDamage,endDestinyRound,retargetDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {useDestinyAbility,useDestinyBackpackItem} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {destinyStat} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
import {resolveDestinyAbilityRoll} from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';
const roster=decodeDestinyRoster(JSON.parse(fs.readFileSync(new URL('../../../data/simulator-rosters/1286.json',import.meta.url),'utf8')).enemies);
const hero={speed:20,brawn:3,magic:0,armour:4,health:100,maxHealth:100};
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected roll');return values.shift();};
const make=(section,options={})=>createLegionFight({...hero,...options.hero},section,{roster,...options});
const round=(f,face)=>startDestinyRound(f,0,rolls(...(face===undefined?[]:[face])));
const win=(f,face)=>resolveDestinySpeed(rollDestinySpeed(f,rolls(6,5,1,2)),rolls(...(face===undefined?[]:[face])));
const lose=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(1,2,6,5)));
const hit=(f,face=4,...response)=>resolveDestinyDamage(rollDestinyDamage(f,rolls(face)),rolls(...response));
const resume=f=>JSON.parse(JSON.stringify(f));

test('Sharroth loses tentacle damage independently and defeats all tentacles on its own death',()=>{
  let f=endDestinyRound(hit(win(round(make('782')))));assert.equal(f.hero.health,92);
  f=make('782',{hero:{brawn:200}});f=hit(retargetDestinyRound(win(round(f)),1));f=endDestinyRound(f);assert.equal(f.hero.health,94);
  f=hit(win(round(f)));assert.equal(f.status,'win');assert.ok(f.opponents.every(o=>o.health===0));
});

test('Baalim reflects fixed damage on normal and dice attacks, including a killing blow',()=>{
  let f=hit(win(round(make('784'))));assert.equal(f.hero.health,100); // Armour absorbs this attack.
  f=make('784',{hero:{brawn:20},abilities:{cleave:1}});f=useDestinyAbility(win(round(f)),'cleave',{},rolls(4));assert.equal(f.hero.health,96);
  f=make('784',{hero:{health:4,brawn:100}});f=hit(win(round(f)));assert.equal(f.status,'loss');assert.equal(f.opponents[0].health,0);
});

test('Dark Arthurian receives capped healing per living necromancer and one allied heal',()=>{
  let f=make('790',{hero:{health:50}});assert.equal(destinyStat(f,'hero','armour'),6);
  f=useLegionAction(f,'heal-me',{roster});assert.equal(f.hero.health,65);assert.throws(()=>useLegionAction(f,'heal-me',{roster}),/used/);
  f.opponents[0].health=70;f=hit(win(round(f)));assert.equal(f.turn.damageScore,9);f=endDestinyRound(f);assert.equal(f.opponents[0].health,76);
  f.opponents[1].health=0;f=endDestinyRound(hit(win(round(f))));assert.equal(f.opponents[0].health,80);
});

test('Architect seals modify their declared score, healing and Armour without stacking unrelated stats',()=>{
  let f=make('804',{hero:{speed:0}});f=hit(lose(round(f)));assert.equal(f.turn.damageScore,21);
  f=make('804');f.opponents[3].health=0;assert.equal(destinyStat(f,0,'armour'),8);
  f.opponents[0].health=70;f=endDestinyRound(hit(win(round(f))));assert.equal(f.opponents[0].health,74);
  f.opponents[2].health=0;f=endDestinyRound(hit(win(round(f))));assert.equal(f.opponents[0].health,74);
});

test('Daarko starts in Shadow and changes forms from round two while preserving one Health pool',()=>{
  let f=make('807');assert.equal(f.opponents[0].magic,11);assert.equal(f.opponents[0].armour,12);
  f=endDestinyRound(hit(win(round(f))));f.opponents[0].health=99;
  f=round(resume(f),3);assert.equal(f.phase,'ability-rolled');f=resolveDestinyAbilityRoll(f,rolls(),{roster});
  assert.equal(f.opponents[0].magic,16);assert.equal(f.opponents[0].armour,10);assert.equal(f.opponents[0].health,99);
  f=endDestinyRound(hit(win(f)));assert.equal(f.hero.health,96);
  f=resolveDestinyAbilityRoll(round(f,5),rolls(),{roster});assert.equal(f.opponents[0].magic,13);assert.equal(f.opponents[0].armour,20);
  f=endDestinyRound(hit(win(f)));assert.equal(f.hero.health,96);assert.equal(f.encounter.endEffects,undefined);
});

test('Shadow form lowers the current highest attack stat and Rock form delays its Speed loss',()=>{
  let f=make('807',{hero:{speed:5,brawn:8,magic:10}});f=hit(lose(round(f)));assert.equal(destinyStat(f,'hero','magic'),8);
  f=endDestinyRound(f);f=resolveDestinyAbilityRoll(round(f,5),rolls(),{roster});f=hit(lose(f));assert.equal(destinyStat(f,'hero','speed'),5);
  f=endDestinyRound(f);f=resolveDestinyAbilityRoll(round(f,1),rolls(),{roster});assert.equal(destinyStat(f,'hero','brawn'),8);assert.equal(destinyStat(f,'hero','magic'),8);assert.equal(destinyStat(f,'hero','speed'),4);
});

test('Sanrah retaliation pauses with saved dice and never triggers on a killing blow',()=>{
  let f=make('809',{hero:{brawn:20}});f=hit(win(round(f)),4,3);
  assert.equal(f.phase,'ability-rolled');assert.equal(f.hero.health,100);assert.deepEqual(f.turn.pendingAbility.dice,[3]);
  f=resolveDestinyAbilityRoll(resume(f),rolls(),{roster});assert.equal(f.hero.health,97);
  f=make('809',{hero:{brawn:200}});f=hit(win(round(f)));assert.equal(f.status,'win');assert.equal(f.hero.health,100);
});

test('Sanrah allies require their keywords and rival score help starts at round three',()=>{
  assert.throws(()=>useLegionAction(make('809'),'healers-gift',{roster}),/not available/);
  let f=make('809',{hero:{health:50},character:{keywords:['rival','companion']}});
  f=useLegionAction(f,'healers-gift',{roster});assert.equal(f.hero.health,62);
  for(let n=1;n<=3;n++){f=hit(win(round(f)));assert.equal(f.turn.damageScore,n===3?9:7);f=endDestinyRound(f);}
});

test('Anomaly has no invented Health and winning rounds absorb Magic rather than rolling damage',()=>{
  let f=make('818',{abilities:{haste:1},character:{backpack:[{name:'Potion',heal:4}]}});
  assert.equal(f.opponents[0].health,null);assert.equal(f.opponents[0].armour,null);
  f=round(f);assert.throws(()=>useDestinyAbility(f,'haste'),/unavailable/);assert.throws(()=>useDestinyBackpackItem(f,0),/unavailable/);
  for(let n=0;n<4;n++){
    f=win(f,3);f=resolveDestinyAbilityRoll(resume(f),rolls(),{roster});
    assert.equal(destinyStat({...f,status:'active'},0,'magic'),16-4*(n+1));
    if(n<3){assert.equal(f.phase,'end');f=round(endDestinyRound(f));}
  }
  assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'922');
});

test('Avian shield takes damage from surviving attackers and its destruction loses the fight',()=>{
  let f=make('821');assert.throws(()=>startDestinyRound(f,5),/living|exposed/);
  for(let n=1;n<=4;n++){f=endDestinyRound(hit(win(round(f))));assert.equal(f.opponents[5].health,100-25*n);}
  assert.equal(f.status,'loss');assert.equal(f.hero.health,100);
});

test('shield survival wins at the start of round seven and early enemy defeat has its own route',()=>{
  let f=make('821');for(const target of [1,2,3,4])f.opponents[target].health=0;
  for(let n=0;n<6;n++){f=endDestinyRound(hit(win(round(f))));assert.equal(f.status,'active');}
  assert.equal(f.opponents[5].health,70);f=round(f);assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'785');
  f=make('821',{hero:{brawn:100}});for(const target of [1,2,3,4])f.opponents[target].health=0;
  f=hit(win(round(f)));assert.equal(f.encounter.outcomeSection,'868');
});

test('Viprus snakes control Speed and their own damage without suppressing Venom',()=>{
  let f=make('835',{hero:{speed:0}});assert.equal(destinyStat(f,'hero','speed'),0);f=hit(lose(round(f)));f=endDestinyRound(f);assert.equal(f.hero.health,79);
  f.opponents[1].health=0;f=endDestinyRound(hit(lose(round(f))));assert.equal(f.hero.health,63);
});

test('Sammain cold grows each round and Shatter Shield changes the achievement route',()=>{
  let f=make('842');f=endDestinyRound(hit(win(round(f))));assert.equal(f.hero.health,98);
  f=endDestinyRound(hit(win(round(f))));assert.equal(f.hero.health,95);
  f=make('842',{hero:{brawn:200}});f=hit(win(round(f)));assert.equal(f.encounter.outcomeSection,'874');
  f=useLegionAction(win(round(make('842',{hero:{brawn:200}}))),'shatter-shield',{roster});
  f=hit(win(round(endDestinyRound(f))));assert.equal(f.encounter.outcomeSection,'869');
});

test('late ordinary foes keep their own piercing, face bonuses and fatigue restrictions',()=>{
  let f=hit(lose(round(make('781',{hero:{speed:0,armour:100}}))));assert.equal(f.hero.health,89);
  f=hit(lose(round(make('816',{hero:{speed:0}}))),5);assert.equal(f.turn.damageScore,20);
  f=make('817',{hero:{brawn:8,magic:10},abilities:{piercing:1,impale:1}});
  assert.equal(destinyStat(f,'hero','brawn'),6);assert.equal(destinyStat(f,'hero','magic'),8);
  assert.throws(()=>useDestinyAbility(win(round(f)),'piercing'),/immune/);
  assert.throws(()=>useDestinyAbility(win(round(f)),'impale'),/immune/);
});
