import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeDestinyRoster} from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
import {createHeartFight} from '../../../public/js/battlesim/engines/destinyquest/heart.js';
import {startDestinyRound,rollDestinySpeed,resolveDestinySpeed,rollDestinyDamage,resolveDestinyDamage,endDestinyRound,retargetDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {destinyStat,destinyStrike,isDestinyOpponentActive,hasDestinyAbility,destinyRollOpponentDice} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
import {useLegionAction} from '../../../public/js/battlesim/engines/destinyquest/legion.js';
import {useDestinyAbility,destinyNeverUsedAbilities} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {setDestinyPassiveActivation} from '../../../public/js/battlesim/engines/destinyquest/ability-quota.js';
const roster=decodeDestinyRoster(JSON.parse(readFileSync(new URL('../../fixtures/battlesim/heart-roster.json',import.meta.url))).enemies);
const hero={speed:30,brawn:0,magic:0,armour:20,health:60,maxHealth:60};
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
const fight=(section,options={})=>createHeartFight({...hero,...options.hero},section,{...options,roster});
const win=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(6,5,1,2)),rolls());
const score=f=>resolveDestinyDamage(rollDestinyDamage(f,rolls(1)));
const reap=(f,ability)=>useLegionAction(f,'rune-reaper',{roster,ability});

test('damned souls enter at start three with separate null stats and inflict two damage each at round end',()=>{
  let f=fight(864);assert.equal(f.opponents.length,4);
  for(const soul of f.opponents.slice(1))assert.deepEqual([soul.speed,soul.brawn,soul.magic,soul.armour,soul.health],[null,null,null,6,40]);
  for(let i=0;i<2;i++){
    assert.equal(isDestinyOpponentActive(f,1),false);assert.throws(()=>startDestinyRound(f,1),/living opponent/);
    f=endDestinyRound(score(win(startDestinyRound(f,0))));assert.equal(f.hero.health,60);
  }
  f=win(startDestinyRound(f,0));assert.equal(isDestinyOpponentActive(f,1),true);
  f=score(retargetDestinyRound(f,2));f=endDestinyRound(f);assert.equal(f.hero.health,54);
  f=startDestinyRound(f,0);destinyStrike(f,1,40,'test','dice');f=endDestinyRound(score(win(f)));
  assert.equal(f.hero.health,50,'only the remaining two souls deal damage');
});

test('dark judgement heals only living summoned souls, before and after an opponent reroll',()=>{
  let f=fight(864,{abilities:{fear:1}});f.round=2;f=startDestinyRound(f,0);
  [f.opponents[1].health,f.opponents[2].health,f.opponents[3].health]=[20,0,38];
  f=rollDestinySpeed(f,rolls(6,5,2,2));assert.deepEqual(f.opponents.slice(1).map(o=>o.health),[26,0,40]);
  f.turn.opponentSpeedDice=destinyRollOpponentDice(f,2,rolls(3,3),'speed');assert.deepEqual(f.opponents.slice(1).map(o=>o.health),[32,0,40]);
  f=fight(864);f.opponents[1].health=20;f=rollDestinySpeed(startDestinyRound(f,0),rolls(6,5,2,2));
  assert.equal(f.opponents[1].health,20,'souls outside play do not heal');
});

test('harvest soul heals Virgil for actual damage after armour, capped at starting Health',()=>{
  for(const [armour,health,expected] of [[20,60,80],[10,60,83],[0,2,82]]){
    let f=fight(864,{hero:{speed:0,armour,health}});f.opponents[0].health=80;
    f=resolveDestinySpeed(rollDestinySpeed(startDestinyRound(f,0),rolls(1,2,6,5)));
    f=score(f);assert.equal(f.opponents[0].health,expected);
  }
  let f=fight(864,{hero:{speed:0,armour:0}});f.opponents[0].health=118;
  f=score(resolveDestinySpeed(rollDestinySpeed(startDestinyRound(f,0),rolls(1,2,6,5))));assert.equal(f.opponents[0].health,120);
});

test('ten-Health victory preserves Virgil and defeats only souls already in play',()=>{
  for(const summoned of [false,true]){
    let f=fight(864,{hero:{brawn:121}});if(summoned)f.round=2;
    f=score(win(startDestinyRound(f,0)));assert.equal(f.opponents[0].health,10);
    assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'503');
    assert.deepEqual(f.opponents.slice(1).map(o=>o.health),summoned?[0,0,0]:[40,40,40]);
    assert.equal(f.defeated?.includes(0)||false,false);
  }
});

test('human Virgil uses Brawn for scores and current Magic for armourless round-end fire',()=>{
  let f=fight(892,{hero:{speed:0,armour:20}});
  f=score(resolveDestinySpeed(rollDestinySpeed(startDestinyRound(f,0),rolls(1,2,6,5))));
  assert.equal(f.turn.damageScore,13);assert.equal(f.hero.health,60);
  f=endDestinyRound(f);assert.equal(f.hero.health,50);
  f.hero.speed=30;f=win(startDestinyRound(f,0));f.abilities={cunning:1};
  f=reap(f,'cunning');assert.equal(destinyStat(f,0,'magic'),8);
  f=endDestinyRound(f);assert.equal(f.hero.health,42);
});

test('Holy light heals on Speed doubles before and after reroll and victory occurs at ten Health',()=>{
  let f=fight(892,{abilities:{fear:1},hero:{brawn:121}});f.opponents[0].health=110;
  f=rollDestinySpeed(startDestinyRound(f,0),rolls(6,5,2,2));assert.equal(f.opponents[0].health,116);
  f.turn.opponentSpeedDice=destinyRollOpponentDice(f,2,rolls(3,3),'speed');assert.equal(f.opponents[0].health,120);
  f=score(resolveDestinySpeed(f));assert.equal(f.status,'win');assert.equal(f.opponents[0].health,10);assert.equal(f.encounter.outcomeSection,'741');
});

test('Rune Reaper replaces winning damage and sacrificed abilities remain blocked after Refresh',()=>{
  let f=win(startDestinyRound(fight(892,{abilities:{cunning:1,refresh:1}}),0));const hp=f.opponents[0].health;
  f=reap(f,'cunning');assert.equal(f.phase,'end');assert.equal(f.opponents[0].health,hp);assert.equal(destinyStat(f,0,'magic'),8);
  assert.equal(hasDestinyAbility(f,'cunning'),false);assert.throws(()=>useDestinyAbility(f,'refresh',{restore:'cunning'}),/already used ability/);
  f=startDestinyRound(endDestinyRound(f),0);assert.throws(()=>useDestinyAbility(f,'cunning'),/unavailable|available|ability/i);
});

test('previously used abilities remain ineligible after Refresh or Magic Tap restores their charges',()=>{
  let f=startDestinyRound(fight(892,{abilities:{cunning:1,refresh:1,'magic-tap':1}}),0);
  f=useDestinyAbility(f,'cunning');f=useDestinyAbility(f,'refresh',{restore:'cunning'});assert.equal(f.used.cunning,0);
  f=useDestinyAbility(f,'magic-tap');f=resolveDestinySpeed(rollDestinySpeed(f,rolls(3,3,1,2)));assert.equal(f.used['magic-tap'],0);
  for(const name of ['cunning','refresh','magic-tap'])assert.throws(()=>reap(JSON.parse(JSON.stringify(f)),name),/never used/);
  assert.deepEqual(destinyNeverUsedAbilities(f),[]);
});

test('Rune Reaper excludes automatic passives and forced curses but allows a never-activated Hexed passive',()=>{
  let f=win(startDestinyRound(fight(892,{abilities:{barbs:1,'curse-of-frailty':1,cunning:1}}),0));
  assert.deepEqual(destinyNeverUsedAbilities(f),['cunning']);
  assert.throws(()=>reap(f,'barbs'),/never used/);assert.throws(()=>reap(f,'curse-of-frailty'),/never used/);
  f=fight(892,{abilities:{hexed:1,barbs:1,bleed:1}});f=setDestinyPassiveActivation(f,'bleed',true);f=setDestinyPassiveActivation(f,'bleed',false);
  f=win(startDestinyRound(f,0));assert.deepEqual(destinyNeverUsedAbilities(f),['barbs']);
  f=reap(f,'barbs');assert.equal(hasDestinyAbility(f,'barbs'),false);assert.equal(destinyStat(f,0,'magic'),8);
});
