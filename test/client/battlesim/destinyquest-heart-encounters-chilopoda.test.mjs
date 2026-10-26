import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeDestinyRoster} from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
import {createHeartFight} from '../../../public/js/battlesim/engines/destinyquest/heart.js';
import {startDestinyRound,rollDestinySpeed,resolveDestinySpeed,rollDestinyDamage,resolveDestinyDamage,endDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {resolveDestinyAbilityRoll} from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';
import {createDestinySession,applyDestinySessionAction} from '../../../public/js/battlesim/engines/destinyquest/session.js';
const roster=decodeDestinyRoster(JSON.parse(readFileSync(new URL('../../fixtures/battlesim/heart-roster.json',import.meta.url))).enemies);
const hero={speed:30,brawn:0,magic:0,armour:100,health:60,maxHealth:60};
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
const fight=(options={})=>createHeartFight({...hero,...options.hero},775,{...options,roster});
const start=(f,position=[3,4],dice=[1,2])=>startDestinyRound(f,0,rolls(...dice),{gridPosition:position});
const resolve=(f,...dice)=>resolveDestinyAbilityRoll(JSON.parse(JSON.stringify(f)),rolls(...dice),{roster});
const finish=f=>endDestinyRound(resolveDestinyDamage(rollDestinyDamage(resolveDestinySpeed(rollDestinySpeed(f,rolls(6,5,1,2))),rolls(1))));

test('bile uses x then y coordinates and a direct hit inflicts fifteen armourless damage',()=>{
  for(const [dice,health] of [[[3,4],45],[[4,3],60]]){
    let f=start(fight(),[3,4],dice);assert.equal(f.phase,'ability-rolled');assert.equal(f.round,1);
    assert.throws(()=>rollDestinySpeed(f,rolls()),/stage/);
    f=resolve(f);assert.equal(f.phase,'speed');assert.equal(f.hero.health,health);
    assert.deepEqual(f.encounter.gridHazard.occupied,[dice]);
  }
});

test('every round requires a clear square and illegal position choices never mutate the prior fight',()=>{
  const original=fight(),before=JSON.parse(JSON.stringify(original));
  for(const position of [undefined,[],[0,1],[7,1],[1,7],[2.2,1]])assert.throws(()=>startDestinyRound(original,0,rolls(),{gridPosition:position}),/grid square/);
  assert.deepEqual(original,before);
  let f=finish(resolve(start(original,[1,1],[3,4])));const saved=JSON.parse(JSON.stringify(f));
  assert.throws(()=>start(f,[3,4]),/clear grid square/);assert.deepEqual(f,saved);
  f=start(f,[6,6],[2,3]);assert.deepEqual(f.encounter.gridHazard.hero,[6,6]);assert.equal(f.round,2);
});

test('duplicate references reroll once into a new saved pending pair without damage or adding another bile square',()=>{
  let f=finish(resolve(start(fight(),[1,1],[3,4])));f=start(f,[6,6],[3,4]);
  f=resolve(f,3,4);assert.equal(f.phase,'ability-rolled');assert.deepEqual(f.turn.pendingAbility.dice,[3,4]);
  assert.deepEqual(f.encounter.gridHazard.occupied,[[3,4]]);assert.equal(f.hero.health,60);
  f=resolve(f,6,6);assert.deepEqual(f.turn.pendingAbility.dice,[6,6]);
  f=resolve(f);assert.equal(f.hero.health,45);assert.deepEqual(f.encounter.gridHazard.occupied,[[3,4],[6,6]]);
  assert.equal(f.history.filter(e=>e.type==='grid-reroll').length,2);
});

test('bile respects a general damage shield but does not invent Fire Shield or Insulated protection',()=>{
  let f=fight({abilities:{'fire-shield':1,insulated:1}});f.portableShieldHealth=10;
  f=resolve(start(f,[3,4],[3,4]));assert.equal(f.hero.health,55);assert.equal(f.portableShieldHealth,0);
  f=resolve(start(fight({abilities:{'fire-shield':1,insulated:1}}),[3,4],[3,4]));assert.equal(f.hero.health,45);
  f=resolve(start(fight({hero:{health:14}}),[3,4],[3,4]));assert.equal(f.status,'loss');assert.equal(f.hero.health,0);
});

test('session actions preserve the chosen square, pending roll and occupied grid across saves',()=>{
  let s=createDestinySession({fight:fight(),fightId:'bile'});
  s=applyDestinySessionAction(s,'start-round',{target:0,options:{gridPosition:[3,4]}},{roll:rolls(3,4)});
  const saved=JSON.parse(JSON.stringify(s));
  s=applyDestinySessionAction(saved,'resolve-ability',{}, {roll:rolls(),roster});
  assert.deepEqual(saved.fight.encounter.gridHazard.occupied,[]);assert.equal(s.fight.hero.health,45);
  assert.deepEqual(s.fight.encounter.gridHazard.hero,[3,4]);assert.deepEqual(s.fight.encounter.gridHazard.occupied,[[3,4]]);
});

test('defeating Chilopoda ends the fight without another bile phase or altering the saved final grid',()=>{
  let f=resolve(start(fight({hero:{brawn:1000}}),[3,4],[1,2]));
  f=resolveDestinyDamage(rollDestinyDamage(resolveDestinySpeed(rollDestinySpeed(f,rolls(6,5,1,2))),rolls(1)));
  assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'781');assert.deepEqual(f.encounter.gridHazard.occupied,[[1,2]]);
  assert.throws(()=>start(f,[4,4],[2,2]),/stage/);
});
