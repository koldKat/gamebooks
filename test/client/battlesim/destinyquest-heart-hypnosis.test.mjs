import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeDestinyRoster} from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
import {createHeartFight} from '../../../public/js/battlesim/engines/destinyquest/heart.js';
import {startDestinyRound,rollDestinySpeed,resolveDestinySpeed,rollDestinyDamage,resolveDestinyDamage,endDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {resolveDestinyAbilityRoll} from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';
import {useDestinyAbility} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
const roster=decodeDestinyRoster(JSON.parse(readFileSync(new URL('../../fixtures/battlesim/heart-roster.json',import.meta.url))).enemies);
const hero={speed:20,brawn:0,magic:0,armour:0,health:40,maxHealth:40};
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
const clone=f=>JSON.parse(JSON.stringify(f));
const fight=(options={})=>createHeartFight({...hero,...options.hero},371,{...options,roster});
const counter=f=>f.encounter.acceptedRollCounters[0];
const win=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(2,3,3,4)),rolls());

test('Kaala counts accepted hero ones in Speed and damage across rounds and saves, losing on the eighth',()=>{
  let f=fight();
  for(let round=1;round<=4;round++){
    f=rollDestinySpeed(startDestinyRound(f,0),rolls(1,2,3,4));assert.equal(counter(f).count||0,2*(round-1));
    f=resolveDestinySpeed(clone(f),rolls());assert.equal(counter(f).count,2*round-1);
    f=resolveDestinyDamage(rollDestinyDamage(f,rolls(1)),rolls());assert.equal(counter(f).count,2*round);
    if(round<4){assert.equal(f.status,'active');f=endDestinyRound(f);}
  }
  assert.equal(f.status,'loss');assert.equal(f.opponents[0].health,100);
});

test('rerolling ones before accepting Speed or a score prevents their contribution to hypnosis',()=>{
  let f=rollDestinySpeed(startDestinyRound(fight({abilities:{charm:2}}),0),rolls(1,2,3,4));
  f=useDestinyAbility(f,'charm',{die:0},rolls(6));f=resolveDestinySpeed(f,rolls());assert.equal(counter(f).count||0,0);
  f=rollDestinyDamage(f,rolls(1));f=useDestinyAbility(f,'charm',{die:0},rolls(3));f=resolveDestinyDamage(f,rolls());
  assert.equal(counter(f).count||0,0);
});

test('the mirror replaces the hero counter with Kaala’s counter and wins on eight opponent ones',()=>{
  let f=fight({encounterOptions:{goldenMirror:true},hero:{speed:0,armour:20}});
  for(let round=1;round<=4;round++){
    f=resolveDestinySpeed(rollDestinySpeed(startDestinyRound(f,0),rolls(1,1,1,2)),rolls());
    assert.equal(counter(f).owner,'opponent');assert.equal(counter(f).count,2*round-1);
    f=resolveDestinyDamage(rollDestinyDamage(f,rolls(1)),rolls());assert.equal(counter(f).count,2*round);
    if(round<4)f=endDestinyRound(clone(f));
  }
  assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'537');
  assert.equal(f.opponents[0].health,100);
});

test('changing Kaala dice before acceptance counts the resulting ones only once',()=>{
  let f=rollDestinySpeed(startDestinyRound(fight({abilities:{sneak:1},encounterOptions:{goldenMirror:true}}),0),rolls(3,4,1,2));
  f=useDestinyAbility(f,'sneak',{die:1},rolls());
  f=resolveDestinySpeed(f,rolls());assert.equal(counter(f).count,2);
});

test('replacement damage dice count, and the eighth one stops their damage before it is applied',()=>{
  let f=win(startDestinyRound(fight({abilities:{'stone-rain':1}}),0));counter(f).count=7;
  f=useDestinyAbility(f,'stone-rain',{deferDamage:true},rolls(1));
  f=resolveDestinyAbilityRoll(clone(f),rolls(),{roster});
  assert.equal(f.status,'loss');assert.equal(f.opponents[0].health,100);assert.equal(counter(f).count,8);
});

test('Elysium ability checks count before the requested modifier can execute',()=>{
  let f=rollDestinySpeed(startDestinyRound(fight({abilities:{charm:1,'elysium-soaked':1}}),0),rolls(2,3,3,4));counter(f).count=7;
  f=useDestinyAbility(f,'charm',{die:0},rolls(1));assert.equal(f.turn.pendingAbility.type,'ability-check');
  f=resolveDestinyAbilityRoll(f,rolls(),{roster});assert.equal(f.status,'loss');assert.equal(f.used.charm,undefined);
});

test('automatic Faith checks count and can end the fight without resuming the suspended roll',()=>{
  let f=startDestinyRound(fight({abilities:{faith:1,'elysium-soaked':1}}),0);counter(f).count=7;
  f=rollDestinySpeed(f,rolls(3,3,3,4,1));assert.equal(f.turn.pendingAbility.type,'automatic-modifier');
  f=resolveDestinyAbilityRoll(f,rolls(),{roster});assert.equal(f.status,'loss');assert.equal(counter(f).count,8);
});

test('Kaala venom requires an actual Health hit, persists for six per round, and Toxicology prevents it',()=>{
  for(const [armour,abilities,venom] of [[0,{},6],[20,{},undefined],[0,{toxicology:1},undefined]]){
    let f=startDestinyRound(fight({hero:{speed:0,armour},abilities}),0);
    f=resolveDestinySpeed(rollDestinySpeed(f,rolls(2,3,3,4)),rolls());
    f=resolveDestinyDamage(rollDestinyDamage(f,rolls(2)),rolls());
    assert.equal(f.encounter.heroStatuses?.venom,venom);const hp=f.hero.health;
    f=endDestinyRound(f);assert.equal(f.hero.health,hp-(venom||0));
  }
});

test('a saved die reused from an earlier roll does not count as another newly rolled one',()=>{
  let f=fight();f.savedHeroDie={round:1,value:1};
  f=resolveDestinySpeed(rollDestinySpeed(startDestinyRound(f,0),rolls(2,3,4)),rolls());
  assert.equal(counter(f).count||0,0);
  f=fight({encounterOptions:{goldenMirror:true}});f.savedOpponentDice={round:1,target:0,dice:[1,1]};
  f=resolveDestinySpeed(rollDestinySpeed(startDestinyRound(f,0),rolls(2,3)),rolls());assert.equal(counter(f).count||0,0);
});

test('ability outcome dice count before any further dice or healing are applied',()=>{
  let f=win(startDestinyRound(fight({abilities:{'ley-line-infusion':1}}),0));counter(f).count=7;
  f=useDestinyAbility(f,'ley-line-infusion',{},rolls(1));
  f=resolveDestinyAbilityRoll(f,rolls(),{roster});assert.equal(f.status,'loss');assert.equal(counter(f).count,8);
  assert.equal(f.opponents[0].health,100);
});
