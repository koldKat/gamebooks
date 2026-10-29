import { readRosterDocument } from '../../helpers/roster-db.cjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodeDestinyRoster} from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
import {createLegionFight,legionRosterFor,useLegionAction} from '../../../public/js/battlesim/engines/destinyquest/legion.js';
import {startDestinyRound,rollDestinySpeed,resolveDestinySpeed,rollDestinyDamage,resolveDestinyDamage,endDestinyRound,continueDestinyCombat} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {useDestinyAbility} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {destinyStat} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
import {resolveDestinyAbilityRoll} from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';
import {applyDestinySessionAction,createDestinySession} from '../../../public/js/battlesim/engines/destinyquest/session.js';

const seed=readRosterDocument(1286);
const roster=decodeDestinyRoster(seed.enemies);
const hero={speed:20,brawn:3,magic:0,armour:4,health:30,maxHealth:30};
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected random roll');return values.shift();};
const fight=(section,options={})=>createLegionFight({...hero,...options.hero},section,{roster,...options});
const round=f=>startDestinyRound(f,0);
const win=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(6,5,1,2)));
const lose=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(1,2,6,5)));
const hit=(f,face=4)=>resolveDestinyDamage(rollDestinyDamage(f,rolls(face)));

test('the staged database seed has 172 source encounters and each uses the full Legion ability catalog',()=>{
  assert.equal(roster.length,172);assert.equal(roster.filter(r=>r.adapter.implemented).length,172);
  for(const entry of roster.filter(r=>r.adapter.implemented)){
    const f=fight(entry.section,{encounterOptions:{rodPlacements:{north:'enfeeblement',east:'slowing',west:'rending'}}});assert.equal(f.encounter.sourceSection,entry.section);assert.equal(Object.keys(f.abilityCatalog).length,141);
    assert.deepEqual(f.bookRules,{deathMoves:false,deathPenalties:false});
    for(const part of entry.parts)assert.equal(part.sourceValues.Health,part.health===null?'-':String(part.health));
  }
  const pending=structuredClone(roster);pending[0].adapter.implemented=false;assert.throws(()=>createLegionFight(hero,pending[0].section,{roster:pending}),/complete rules adapter/);
  assert.throws(()=>legionRosterFor(undefined,'18'),/roster/);
});

test('three staircase ghouls are separate combats: health and potion supplies persist, combat abilities reset',()=>{
  let f=fight('138',{hero:{health:10,brawn:20},abilities:{heal:1},character:{backpack:[{name:'Keep',heal:4}],notes:'keep'}});
  for(let combat=0;combat<3;combat++){
    assert.equal(f.hero.health,10+combat*4);
    f=startDestinyRound(f,combat);f=useDestinyAbility(f,'heal');f=hit(win(f));
    if(combat<2){assert.equal(f.phase,'between-combats');assert.equal(f.status,'active');f=continueDestinyCombat(JSON.parse(JSON.stringify(f)));assert.equal(f.used.heal,undefined);}
  }
  assert.equal(f.status,'win');assert.equal(f.hero.health,30);assert.equal(f.character.backpack.length,1);assert.equal(f.character.notes,'keep');
});

test('leaving the roots records a neutral retreat once, without healing, adding defeats or awarding a win',()=>{
  const original=createDestinySession({character:{defeats:3,notes:'keep'},fight:fight('93',{hero:{health:20}}),fightId:'roots-1'});
  let s=applyDestinySessionAction(original,'book-action',{name:'retreat'},{roster,useBookAction:useLegionAction});
  assert.equal(s.fight.status,'retreat');assert.equal(s.fight.hero.health,20);
  s=applyDestinySessionAction(s,'record-outcome',{}, {timestamp:1234,roll:rolls()});
  assert.equal(s.character.defeats,3);assert.equal(s.history[0].outcome,'retreat');assert.equal(s.character.notes,'keep');
  s=applyDestinySessionAction(s,'record-outcome',{}, {timestamp:1235,roll:rolls()});assert.equal(s.history.length,1);
  assert.equal(original.fight.status,'active');
});

test('Mauler gains the printed next-round ferocity boost only after causing health damage',()=>{
  let f=hit(lose(round(fight('18',{hero:{speed:6,armour:0}}))));
  f=round(endDestinyRound(f));assert.equal(destinyStat(f,0,'speed'),7);
  f=hit(win(f),1);f=round(endDestinyRound(f));assert.equal(destinyStat(f,0,'speed'),5);
});

test('Humbaroth removes one Armour after each damaging score, without changing normal Armour',()=>{
  let f=fight('29',{hero:{speed:0}});f=hit(lose(round(f)));
  assert.equal(destinyStat(f,'hero','armour'),3);assert.equal(f.hero.normal.armour,4);
});

test('Storm elemental reflects fixed ability and end-of-round passive damage as well as ordinary attacks',()=>{
  let f=win(round(fight('33',{hero:{magic:1},abilities:{'ice-shards':1,'fire-aura':1}})));
  f=useDestinyAbility(f,'ice-shards',{},rolls());assert.equal(f.hero.health,28);assert.equal(f.opponents[0].health,24);
  f=endDestinyRound(f);assert.equal(f.hero.health,26);assert.equal(f.opponents[0].health,23);
});

test('surrender encounters finish at their printed thresholds without requiring a kill',()=>{
  let f=hit(win(round(fight('37',{hero:{brawn:10}}))),2);assert.equal(f.status,'win');assert.equal(f.opponents[0].health,8);
  f=hit(win(round(fight('144',{hero:{brawn:12}}))),2);assert.equal(f.status,'active');assert.equal(f.opponents[0].health,15);
  f=hit(win(round(endDestinyRound(f))),2);assert.equal(f.status,'win');assert.equal(f.opponents[0].health,5);
});

test('Zalladell rerolls original ones and twos once, accepting even another one or two',()=>{
  let f=round(fight('49'));f=rollDestinySpeed(f,rolls(6,5,1,2,1,2));assert.deepEqual(f.turn.opponentSpeedDice,[1,2]);
  f=hit(resolveDestinySpeed(f));f=endDestinyRound(f);assert.equal(f.hero.health,29);
});

test('three-ghoul groups retain three complete health pools and piercing respects Second Skin',()=>{
  for(const section of ['59','100']){
    let f=fight(section,{hero:{speed:0,armour:100}});assert.equal(f.opponents.length,3);assert.deepEqual(f.opponents.map(o=>o.health),[30,30,30]);
    f=hit(lose(round(f)));assert.equal(f.hero.health,23);
    f=hit(lose(round(fight(section,{hero:{speed:0,armour:100},abilities:{'second-skin':1}}))));assert.equal(f.hero.health,30);
  }
});

test('Spindle webbing is a one-round Speed penalty, and the torch option removes only that web rule',()=>{
  let f=startDestinyRound(fight('60'),0,rolls(1));assert.equal(f.phase,'ability-rolled');
  f=resolveDestinyAbilityRoll(f,rolls());assert.equal(destinyStat(f,'hero','speed'),19);
  f=startDestinyRound(fight('60',{encounterOptions:{torchWebBurned:true}}),0,rolls());assert.equal(f.phase,'speed');assert.equal(destinyStat(f,'hero','speed'),20);assert.equal(f.encounter.heroStatusOnHit.amount,2);
});

test('Spindle venom starts only after health damage and hurts at the end of the same round',()=>{
  let f=fight('60',{hero:{speed:0,armour:0},encounterOptions:{torchWebBurned:true}});f=hit(lose(round(f)),1);const hp=f.hero.health;
  assert.equal(f.encounter.heroStatuses.venom,2);f=endDestinyRound(f);assert.equal(f.hero.health,hp-2);
});

test('Crone dagger adds health damage through Armour but a dodge still prevents the whole attack',()=>{
  let f=lose(round(fight('62',{hero:{speed:0,armour:100}})));f=hit(f,6);assert.equal(f.hero.health,29);
  f=lose(round(fight('62',{hero:{speed:0,armour:100},abilities:{dodge:1}})));f=useDestinyAbility(f,'dodge');f=hit(f,6);assert.equal(f.hero.health,30);
});

test('Rennie applies First Cut before the fight without rewriting the caller hero',()=>{
  const input={...hero},f=createLegionFight(input,'70',{roster});assert.equal(f.hero.health,29);assert.equal(input.health,30);
});

test('the lake spirit encounter wins after surviving five full rounds while the spirit remains alive',()=>{
  let f=fight('81',{hero:{brawn:0}});
  for(let i=1;i<=5;i++){f=endDestinyRound(hit(win(round(f)),1));assert.equal(f.status,i===5?'win':'active');}
  assert.equal(f.opponents[0].health,50);
});

test('the hag changes only the following round to one Speed die',()=>{
  let f=endDestinyRound(hit(win(round(fight('92')))),[],rolls(1));assert.equal(f.phase,'ability-rolled');
  f=resolveDestinyAbilityRoll(f,rolls());f=round(endDestinyRound(f));assert.equal(f.turn.heroSpeedCount,1);
  f=resolveDestinySpeed(rollDestinySpeed(f,rolls(6,1,2)));f=hit(f);f=endDestinyRound(f,[],rolls(2));f=resolveDestinyAbilityRoll(f,rolls());f=round(endDestinyRound(f));assert.equal(f.turn.heroSpeedCount,undefined);
});

test('Allura regenerates two each round while alive, capped at the printed starting Health',()=>{
  let f=hit(win(round(fight('105'))));assert.equal(f.opponents[0].health,19);f=endDestinyRound(f);assert.equal(f.opponents[0].health,21);
});

test('Valadin heals twice for every rolled six, without exceeding 35',()=>{
  let f=round(fight('109'));f.opponents[0].health=32;f=rollDestinySpeed(f,rolls(1,2,6,6));assert.equal(f.opponents[0].health,35);
});

test('Target Dummy rejects named active abilities and passively ignores Lightning and Thorns',()=>{
  let f=win(round(fight('126',{abilities:{piercing:1,corruption:1,lightning:1,thorns:1}})));
  assert.throws(()=>useDestinyAbility(f,'piercing'),/immune/);
  f=hit(f);assert.throws(()=>useDestinyAbility(f,'corruption'),/immune/);
  const hp=f.opponents[0].health;f=endDestinyRound(f);assert.equal(f.opponents[0].health,hp);
});
