import { readRosterDocument } from '../../helpers/roster-db.cjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodeDestinyRoster} from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
import {createLegionFight,useLegionAction,LEGION_BOOK_RULES} from '../../../public/js/battlesim/engines/destinyquest/legion.js';
import {LEGION_ABILITIES} from '../../../public/js/battlesim/engines/destinyquest/legion-abilities.js';
import {startDestinyRound,rollDestinySpeed,resolveDestinySpeed,rollDestinyDamage,resolveDestinyDamage,endDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {useDestinyAbility,useDestinyBackpackItem} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {destinyStat} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
import {resolveDestinyAbilityRoll} from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';
import {beginDestinySession,applyDestinySessionAction,createDestinySession} from '../../../public/js/battlesim/engines/destinyquest/session.js';

const seed=readRosterDocument(1286);
const roster=decodeDestinyRoster(seed.enemies),hero={speed:20,brawn:3,magic:0,armour:4,health:30,maxHealth:30};
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected roll');return values.shift();};
const make=(section,options={})=>createLegionFight({...hero,...options.hero},section,{roster,...options});
const round=f=>startDestinyRound(f,0);
const win=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(6,5,1,2)));
const lose=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(1,2,6,5)));
const hit=(f,face=4)=>resolveDestinyDamage(rollDestinyDamage(f,rolls(face)));

test('the troll heals at the start, not the end, and Steadfast blocks its one-round Knockdown',()=>{
  for(const immune of [false,true]){
    let f=make('156',{hero:{speed:0},abilities:immune?{steadfast:1}:{}});f.opponents[0].health=50;
    f=round(f);assert.equal(f.opponents[0].health,52);f=hit(lose(f));f=endDestinyRound(f);assert.equal(f.opponents[0].health,52);
    f=round(f);assert.equal(destinyStat(f,'hero','speed'),0);assert.equal(f.effects.filter(e=>e.attribute==='speed'&&e.target==='hero').length,immune?0:1);assert.equal(f.opponents[0].health,54);
  }
});

test('Noldor runes stay optional, require possession, apply once and select the correct achievement destination',()=>{
  let f=make('207',{hero:{health:10},encounterOptions:{runeVoldring:true,runeAllura:true,runeTalos:true,runeMalachi:true}});
  assert.equal(destinyStat(f,'hero','armour'),4);assert.equal(destinyStat(f,'hero','speed'),20);
  f=useLegionAction(f,'rune-voldring',{roster});assert.equal(destinyStat(f,'hero','armour'),7);
  f=useLegionAction(f,'rune-talos',{roster});assert.equal(destinyStat(f,'hero','speed'),22);
  f=useLegionAction(f,'rune-allura',{roster});assert.equal(f.hero.health,30);assert.throws(()=>useLegionAction(f,'rune-allura',{roster}),/already/);
  f=win(round(f));f=useLegionAction(f,'rune-malachi',{roster});assert.equal(f.opponents[0].health,30);assert.equal(f.phase,'end');
  f=endDestinyRound(f);f=round(f);f.hero.brawn=100;f=hit(win(f));assert.equal(f.encounter.outcomeSection,'41');
  assert.throws(()=>useLegionAction(make('207'),'rune-voldring',{roster}),/do not have/);
  f=hit(win(round(make('207',{hero:{brawn:100},encounterOptions:{runeVoldring:true}}))));assert.equal(f.encounter.outcomeSection,'52');
});

test('leader-to-ratling handoff carries actual health through session recording without changing the caller',()=>{
  const config={hero:{...hero,brawn:100,health:10},section:'144',abilities:{},equipment:{}};
  let s=beginDestinySession(createDestinySession(),config,{roster,outcomeId:'leader',catalog:LEGION_ABILITIES,bookRules:LEGION_BOOK_RULES,createFight:createLegionFight});
  s.fight=hit(win(round(s.fight)));assert.equal(s.fight.hero.health,10);
  s=applyDestinySessionAction(s,'record-outcome',{}, {timestamp:100,roll:rolls()});assert.equal(s.setup.hero.health,10);
  const edited=structuredClone(s);edited.setup.hero.health=9;
  assert.equal(applyDestinySessionAction(edited,'record-outcome',{}, {timestamp:100,roll:rolls()}).setup.hero.health,9,'replaying a recorded outcome must preserve a later manual setup edit');
  s=beginDestinySession(s,{...s.setup,section:'230'},{roster,outcomeId:'ratling',catalog:LEGION_ABILITIES,bookRules:LEGION_BOOK_RULES,createFight:createLegionFight});
  assert.equal(s.fight.hero.health,10);s.fight=hit(win(round(s.fight)));assert.equal(s.fight.hero.health,30);
  s=applyDestinySessionAction(s,'record-outcome',{}, {timestamp:101,roll:rolls()});assert.equal(s.setup.hero.health,30);assert.equal(config.hero.health,10);
});

test('defeat in a wounded chain prepares full health for retry without rewriting the historical fight',()=>{
  let s=createDestinySession({setup:{hero:{...hero,health:10}},fight:make('230',{hero:{health:10}}),fightId:'defeat'});
  s=applyDestinySessionAction(s,'concede');s=applyDestinySessionAction(s,'record-outcome',{}, {timestamp:100,roll:rolls()});
  assert.equal(s.setup.hero.health,30);assert.equal(s.fight.hero.health,10);assert.equal(s.fight.status,'loss');assert.equal(s.character.defeats,1);
});

test('acid worms test once each round and do exactly two damage on one or two',()=>{
  for(const section of ['232','262','273']){
    let f=startDestinyRound(make(section),0,rolls(2));assert.equal(f.phase,'ability-rolled');f=resolveDestinyAbilityRoll(f,rolls());assert.equal(f.hero.health,28);
    f=hit(win(f),1);f=endDestinyRound(f);f=startDestinyRound(f,0,rolls(3));f=resolveDestinyAbilityRoll(f,rolls());assert.equal(f.hero.health,28);
  }
});

test('Tail Lash counts newly rolled hero ones for speed and damage, including a real reroll',()=>{
  let f=round(make('230',{abilities:{charm:1}}));f=rollDestinySpeed(f,rolls(1,2,2,3));assert.equal(f.hero.health,29);
  f=useDestinyAbility(f,'charm',{die:1},rolls(1));assert.equal(f.hero.health,28);
  f=rollDestinyDamage(resolveDestinySpeed(f),rolls(1));assert.equal(f.hero.health,27);
});

test('spider venom is already active and Holy Water applies only to the hero damage score',()=>{
  let f=make('239');assert.equal(f.opponents.length,2);f=endDestinyRound(hit(win(round(f))));assert.equal(f.hero.health,28);
  f=hit(win(round(make('274'))));assert.equal(f.opponents.length,3);assert.equal(f.turn.damageScore,9);assert.equal(f.opponents[0].health,23);
});

test('Talos blocks active abilities, passives and backpack items together',()=>{
  let f=make('244',{abilities:{heal:1,'fire-aura':1},character:{backpack:[{name:'Potion',heal:4}]}});f=round(f);
  assert.throws(()=>useDestinyAbility(f,'heal'),/unavailable/);assert.throws(()=>useDestinyBackpackItem(f,0),/unavailable/);
  f=hit(win(f));const hp=f.opponents[0].health;f=endDestinyRound(f);assert.equal(f.opponents[0].health,hp);
});

test('Fetch turns hero sixes into ones for speed, damage, modifiers and spell dice, leaving enemy rolls alone',()=>{
  let f=round(make('280',{abilities:{'ice-shield':1,cleave:1}}));f=useDestinyAbility(f,'ice-shield',{},rolls(6));assert.equal(destinyStat(f,'hero','armour'),5);
  f=rollDestinySpeed(f,rolls(6,6,6,5));assert.deepEqual(f.turn.heroSpeedDice,[1,1]);assert.deepEqual(f.turn.opponentSpeedDice,[6,5]);
  f=resolveDestinySpeed(f);f=useDestinyAbility(f,'cleave',{},rolls(6));assert.equal(f.opponents[0].health,34);
  f=round(make('280'));f=rollDestinyDamage(win(f),rolls(6));assert.deepEqual(f.turn.damageDice,[1]);
});

test('Nalsa roars only from the round after two consecutive damaging wins and does not stack',()=>{
  let f=make('293',{hero:{speed:0,health:100,maxHealth:100,armour:0}});
  for(let i=0;i<2;i++){f=hit(lose(round(f)),1);assert.equal(destinyStat(f,0,'brawn'),10);f=endDestinyRound(f);}
  f=round(f);assert.equal(destinyStat(f,0,'speed'),15);assert.equal(destinyStat(f,0,'brawn'),14);
  f=hit(lose(f),1);f=round(endDestinyRound(f));assert.equal(destinyStat(f,0,'brawn'),14);
});

test('Lady Roe heals from actual health damage, both vampires permit Stake, and victory preserves wounds',()=>{
  let f=make('302',{hero:{speed:0}});f.opponents[0].health=40;f=hit(lose(round(f)),1);assert.equal(f.opponents[0].health,42);
  for(const section of ['302','306']){
    f=make(section,{hero:{health:10,brawn:100}});f=hit(win(round(f)));assert.equal(f.status,'win');assert.equal(f.hero.health,10);
    f=round(make(section,{abilities:{stake:1}}));f.opponents[0].health=10;f=useDestinyAbility(f,'stake');assert.equal(f.status,'win');
  }
});

test('Logan starts with four health lost and poison hurts from the first round',()=>{
  let f=make('313');assert.equal(f.hero.health,26);f=endDestinyRound(hit(win(round(f)),1));assert.equal(f.hero.health,24);
});

test('Luke hurts only speed and damage ones, and low health changes both dice pools',()=>{
  let f=round(make('320'));f=rollDestinySpeed(f,rolls(1,1,2,3));assert.equal(f.hero.health,26);
  f=rollDestinyDamage(resolveDestinySpeed(f),rolls(1));assert.equal(f.hero.health,24);
  f=make('320',{hero:{speed:0,brawn:5,armour:100},abilities:{'ice-shield':1}});f.opponents[0].health=20;f=round(f);
  f=useDestinyAbility(f,'ice-shield',{},rolls(1));assert.equal(f.hero.health,30);
  f=rollDestinySpeed(f,rolls(2,3,6));assert.equal(f.turn.opponentSpeedDice.length,1);
  f=resolveDestinySpeed(f);f=rollDestinyDamage(f,rolls(2,3));assert.equal(f.turn.damageDice.length,2);
});

test('the bat swarm allows a real reroll to avoid falling but loses on an unresolved speed one',()=>{
  let f=rollDestinySpeed(round(make('322')),rolls(1,3,2,3));assert.equal(f.status,'active');f=resolveDestinySpeed(f);assert.equal(f.status,'loss');
  f=rollDestinySpeed(round(make('322',{abilities:{charm:1}})),rolls(1,3,2,3));f=useDestinyAbility(f,'charm',{die:0},rolls(4));f=resolveDestinySpeed(f);assert.equal(f.status,'active');assert.equal(f.turn.winner,'hero');
});
