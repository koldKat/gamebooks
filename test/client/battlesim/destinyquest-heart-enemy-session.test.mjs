import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeDestinyRoster} from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
import {createHeartFight} from '../../../public/js/battlesim/engines/destinyquest/heart.js';
import {createDestinyFight} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {configureDestinyAbilities} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {HEART_ABILITIES as catalog} from '../../../public/js/battlesim/engines/destinyquest/heart-abilities.js';
import {captureDestinyAbsorbedAbility} from '../../../public/js/battlesim/engines/destinyquest/enemy-absorption.js';
import {createDestinySession,applyDestinySessionAction} from '../../../public/js/battlesim/engines/destinyquest/session.js';
import {destinyStat} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
const act=(s,name,payload={},...dice)=>applyDestinySessionAction(s,name,payload,{roll:rolls(...dice)});

test('source-backed Daala captures a real activation, replays it next round and retains printed stats and immunity',()=>{
  const roster=decodeDestinyRoster(JSON.parse(readFileSync(new URL('../../fixtures/battlesim/heart-roster.json',import.meta.url))).enemies);
  const fight=createHeartFight({speed:30,brawn:0,magic:0,armour:20,health:60,maxHealth:60},774,{roster,abilities:{fearless:1}});
  assert.equal(fight.opponents[0].speed,15);assert.equal(fight.opponents[0].brawn,12);
  assert.equal(fight.opponents[0].magic,null);assert.equal(fight.opponents[0].armour,16);assert.equal(fight.opponents[0].health,100);
  assert.deepEqual(fight.encounter.passiveImmunityByTarget[0],['bleed']);
  let s=createDestinySession({fight,fightId:'source-774'});
  s=act(s,'start-round',{target:0});s=act(s,'ability',{name:'fearless'});
  assert.equal(s.fight.enemyAbilityState.queue[0].used,false);
  s=act(s,'roll-speed',{},6,5,1,2);s=act(s,'resolve-speed');s=act(s,'roll-damage',{},1);s=act(s,'resolve-damage');s=act(s,'end-round');
  s=act(JSON.parse(JSON.stringify(s)),'start-round',{target:0});
  assert.equal(s.fight.enemyAbilityState.queue[0].usedRound,2);assert.equal(destinyStat(s.fight,0,'speed'),17);
  assert.equal(s.fight.opponents[0].magic,null);assert.equal(s.fight.used.fearless,1);
  assert.equal(roster.find(e=>e.section==='774').adapter.rules.winSection,'890');
});
function setup(copies,abilities={}){
  const f=configureDestinyAbilities(createDestinyFight({speed:20,brawn:0,magic:0,armour:20,health:60,maxHealth:60},[{speed:15,brawn:12,magic:null,armour:16,health:100}]),abilities,{}, {catalog,bookRules:{deathMoves:false,deathPenalties:false}});
  f.encounter={enemyAbsorption:{target:0,categories:['sp','co'],delayRounds:1,ignoreWeaponCareerRequirements:true},growingStatusOnHit:{target:0,kinds:['score','dice'],name:'Boiling blood',increment:1,maximum:4}};
  f.round=1;for(const name of copies)captureDestinyAbsorbedAbility(f,name,catalog[name]);
  return createDestinySession({fight:f,fightId:'enemy-copy',setup:{hero:f.hero},character:{owner:'Player',gold:7}});
}
function speed(s,enemyWins=true,...extra){
  s=act(s,'roll-speed',{},...(enemyWins?[1,2,6,6]:[6,5,1,2]));return act(s,'resolve-speed',{},...extra);
}

test('session start plays the earliest eligible copied SP and its extra enemy Speed die is rolled normally',()=>{
  let s=setup(['charge','haste']);s=act(s,'start-round',{target:0});assert.equal(s.fight.enemyAbilityState.queue[0].used,false);assert.equal(s.fight.enemyAbilityState.queue[1].used,true);
  s=act(s,'roll-speed',{},6,5,1,2,3);assert.deepEqual(s.fight.turn.heroSpeedDice,[6,5]);assert.deepEqual(s.fight.turn.opponentSpeedDice,[1,2,3]);
  assert.equal(s.character.owner,'Player');assert.equal(s.character.gold,7);
});

test('copied dice reduction affects only the real player Speed roll',()=>{
  let s=act(setup(['immobilise']),'start-round',{target:0});s=act(s,'roll-speed',{},6,1,2);
  assert.deepEqual(s.fight.turn.heroSpeedDice,[6]);assert.deepEqual(s.fight.turn.opponentSpeedDice,[1,2]);
});

test('copied Piercing and Fatal Blow affect actual incoming scores with the real player protections',()=>{
  for(const [copy,abilities,damage] of [['piercing',{},13],['piercing',{'second-skin':1},0],['fatal-blow',{},3]]){
    let s=act(setup([copy],abilities),'start-round',{target:0});s=speed(s);assert.equal(s.fight.turn.winner,'opponent');
    s=act(s,'roll-damage',{},1);s=act(s,'resolve-damage');assert.equal(s.fight.hero.health,60-damage);
  }
});

test('copied Dodge avoids the real player score and Command reverses its attack',()=>{
  let s=act(setup(['dodge']),'start-round',{target:0});s.fight.hero.brawn=30;s=speed(s,false);
  s=act(s,'roll-damage',{},6);s=act(s,'resolve-damage');assert.equal(s.fight.opponents[0].health,100);
  s=act(setup(['command']),'start-round',{target:0});s=speed(s,false);assert.equal(s.fight.turn.winner,'opponent');
});

test('copied replacement dice pause in the session and never roll an additional normal score',()=>{
  let s=act(setup(['cleave']),'start-round',{target:0});s=speed(s,true,4);
  assert.equal(s.fight.phase,'enemy-ability');assert.equal(s.fight.hero.health,60);
  s=act(JSON.parse(JSON.stringify(s)),'resolve-enemy-ability');assert.equal(s.fight.phase,'end');assert.equal(s.fight.hero.health,56);
  assert.throws(()=>act(s,'roll-damage',{},6),/stage/);
});

test('Stone Rain continues as the same copied attack while preserving category limits and every pending roll',()=>{
  let s=act(setup(['stone-rain']),'start-round',{target:0});s=speed(s,true,3);s=act(s,'resolve-enemy-ability');assert.equal(s.fight.hero.health,57);
  s=act(s,'end-round');s=act(s,'start-round',{target:0});s=speed(s,true,3,4);
  assert.equal(s.fight.enemyAbilityState.pending.view.turn.pendingAbility.groups[0].dice.length,2);
  s=act(JSON.parse(JSON.stringify(s)),'resolve-enemy-ability');assert.equal(s.fight.enemyAbilityState.usedCategories.co,3);
  assert.equal(s.fight.hero.health,49);
});

test('Stone Skin retains its copied stance and rolls its defence on a later player victory',()=>{
  let s=act(setup(['stone-skin']),'start-round',{target:0});s=speed(s);
  assert.equal(s.fight.phase,'end');assert.equal(destinyStat(s.fight,0,'speed'),13);
  s=act(s,'end-round');s=act(s,'start-round',{target:0});s=speed(s,false,1);assert.equal(s.fight.phase,'enemy-ability');
  s=act(s,'resolve-enemy-ability');assert.equal(s.fight.phase,'end');assert.equal(s.fight.opponents[0].health,100);
});

test('copied Vortex rolls in the opponent context on following rounds',()=>{
  let s=act(setup(['vortex']),'start-round',{target:0});s=speed(s);s=act(s,'end-round');
  s=act(s,'start-round',{target:0},1);assert.equal(s.fight.opponents[0].health,98);assert.equal(s.fight.hero.health,60);
});

test('actual player raw-roll passives apply to copied dice without copying those passives to the enemy',()=>{
  let s=setup(['rake'],{lightning:1,'sweet-spot':1,'fiery-temper':1});s.fight.sweetSpot=6;
  s=act(s,'start-round',{target:0});s=speed(s,true,6,6,1);
  // Rake is unmodified and resolves immediately; two damage sixes empower the
  // player, Sweet Spot strikes the enemy, and real Health damage triggers Lightning.
  assert.equal(destinyStat(s.fight,'hero','brawn'),2);assert.equal(s.fight.enemyAbilityState.actor.abilities.lightning,undefined);
  assert.equal(s.fight.opponents[0].health,90);assert.equal(s.fight.hero.health,47);
});
