import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeDestinyRoster} from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
import {createHeartFight} from '../../../public/js/battlesim/engines/destinyquest/heart.js';
import {startDestinyRound,rollDestinySpeed,resolveDestinySpeed,rollDestinyDamage,resolveDestinyDamage,endDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {useDestinyAbility} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {destinyStat,destinyDamageScore} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
const seed=JSON.parse(readFileSync(new URL('../../fixtures/battlesim/heart-roster.json',import.meta.url)));
const roster=decodeDestinyRoster(seed.enemies);
const hero={speed:20,brawn:4,magic:0,armour:0,health:30,maxHealth:30};
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
const fight=(section,options={})=>createHeartFight({...hero,...options.hero},section,{...options,roster});
const win=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(6,5,1,2)));
const resume=f=>JSON.parse(JSON.stringify(f));

test('database-shaped roster profiles retain source dashes and the book factory uses Heart abilities',()=>{
  const f=fight(16,{abilities:{prophecy:1}});
  assert.equal(f.abilityCatalog.prophecy.avoidDamage,true);assert.equal(f.opponents[1].speed,null);
  assert.equal(f.opponents[1].brawn,null);assert.equal(f.opponents[1].damageStat,null);
  assert.deepEqual(f.bookRules,{deathMoves:false,deathPenalties:false});
});

test('standard victory restores Health and retains its correct source destination',()=>{
  let f=startDestinyRound(fight(10,{hero:{health:8,brawn:50}}),0);
  f=resolveDestinyDamage(rollDestinyDamage(win(f),rolls(2)));
  assert.equal(f.status,'win');assert.equal(f.hero.health,30);assert.equal(f.encounter.outcomeSection,'20');
});

test('shadow troll regenerates at round start, caps at fifteen and cannot begin another round after defeat',()=>{
  let f=fight(11,{hero:{brawn:50}});f.opponents[0].health=14;
  f=startDestinyRound(resume(f),0);assert.equal(f.opponents[0].health,15);
  f=resolveDestinyDamage(rollDestinyDamage(win(f),rolls(2)));assert.equal(f.status,'win');
  assert.equal(f.opponents[0].health,0);assert.throws(()=>startDestinyRound(f,0),/combat stage/);
});

test('Number Thirteen checks accepted hero dice, allowing a reroll to avoid the one-face hazard',()=>{
  let f=startDestinyRound(fight(13,{abilities:{charm:1}}),0);
  f=rollDestinySpeed(f,rolls(1,3,1,1));assert.equal(f.hero.health,30);
  f=useDestinyAbility(f,'charm',{die:0},rolls(4));f=resolveDestinySpeed(f);assert.equal(f.hero.health,30);
  f=resolveDestinyDamage(rollDestinyDamage(f,rolls(1)));assert.equal(f.hero.health,28);
  let raw=startDestinyRound(fight(13),0);raw=resolveDestinySpeed(rollDestinySpeed(raw,rolls(1,3,1,1)));
  assert.equal(raw.hero.health,28);
});

test('the storm retaliates against normal and passive Health damage',()=>{
  let f=startDestinyRound(fight(14,{hero:{brawn:0},abilities:{barbs:1}}),0);
  f=resolveDestinyDamage(rollDestinyDamage(win(f),rolls(1)));assert.equal(f.hero.health,28);
  assert.equal(f.opponents[0].health,11);
  f=endDestinyRound(resume(f));assert.equal(f.hero.health,26);assert.equal(f.opponents[0].health,10);
});

test('Bilhah has the printed Damage Score bonus without gaining any Speed',()=>{
  let f=startDestinyRound(fight(16,{hero:{speed:0}}),1);
  assert.equal(destinyStat(f,0,'speed'),5);assert.equal(destinyStat(f,0,'brawn'),4);
  f=resolveDestinySpeed(rollDestinySpeed(f,rolls(1,2,6,5)));
  f=rollDestinyDamage(f,rolls(3));assert.equal(destinyDamageScore(f),10);
  f=resolveDestinyDamage(f);assert.equal(f.hero.health,20);
});

test('defeating the ruffians removes only their bonus; defeating Bilhah wins without killing them',()=>{
  let f=startDestinyRound(fight(16,{hero:{brawn:30}}),1);
  f=resolveDestinyDamage(rollDestinyDamage(win(f),rolls(2)));assert.equal(f.status,'active');assert.equal(f.opponents[1].health,0);
  f=startDestinyRound(endDestinyRound(resume(f)),0);assert.equal(destinyStat(f,0,'speed'),5);
  f.turn.winner='opponent';f.turn.damageDice=[3];assert.equal(destinyDamageScore(f),7);
  f=startDestinyRound(fight(16,{hero:{brawn:50}}),0);
  f=resolveDestinyDamage(rollDestinyDamage(win(f),rolls(2)));assert.equal(f.status,'win');
  assert.equal(f.opponents[1].health,15);assert.deepEqual(f.encounter.surrenderedTargets,[1]);assert.equal(f.encounter.outcomeSection,'194');
});

test('reusing a Speed die against Number Thirteen does not roll its hazard again, while an added die does',()=>{
  let f=startDestinyRound(fight(13,{abilities:{'roll-with-it':1,penance:1}}),0);
  f=resolveDestinySpeed(rollDestinySpeed(f,rolls(1,5,2,3)));assert.equal(f.hero.health,28);
  f=useDestinyAbility(f,'penance');assert.equal(f.hero.health,24);
  f=useDestinyAbility(f,'roll-with-it',{die:0},rolls(1));assert.deepEqual(f.turn.damageDice,[1,1]);
  f=resolveDestinyDamage(f);assert.equal(f.hero.health,22);
});
