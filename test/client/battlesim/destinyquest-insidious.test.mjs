import test from 'node:test';
import assert from 'node:assert/strict';
import {createWinterFight, resolveDestinyAbilityRoll as resolve, WINTER_ENCOUNTERS} from './destinyquest-fixtures.mjs';
import {configureWinterEncounter as configure} from '../../../public/js/battlesim/engines/destinyquest/winters-fury.js';
import {startDestinyRound, retargetDestinyRound, rollDestinySpeed, resolveDestinySpeed,
  rollDestinyDamage, resolveDestinyDamage, endDestinyRound, skipDestinyDeathMove} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {useDestinyAbility, destinyUnusedAbilities, resolveDestinyAbilitySacrifice} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {hasDestinyAbility} from '../../../public/js/battlesim/engines/destinyquest/effects.js';

const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected dice');return values.shift();};
const make=(extra={},abilities={})=>createWinterFight({speed:0,brawn:4,armour:3,health:100,maxHealth:100,...extra},435,{abilities});
const idleRound=fight=>{fight=startDestinyRound(fight,0,rolls());fight.phase='end';return endDestinyRound(fight,[],rolls());};
const hit=(fight,target=0,...extraDice)=>resolveDestinyDamage(rollDestinyDamage(resolveDestinySpeed(
  rollDestinySpeed(startDestinyRound(fight,target,rolls()),rolls(1,1,6,6))),rolls(1)),rolls(...extraDice));

test('parasites begin reproducing only on round two and have independent original stats',()=>{
  let fight=make();fight=idleRound(fight);assert.equal(fight.opponents.length,5);assert.equal(fight.hero.health,98);
  const input=fight,original=structuredClone(fight);fight=startDestinyRound(fight,5,rolls());assert.deepEqual(input,original);
  assert.equal(fight.opponents.length,7);assert.equal(fight.target,5);
  for(const index of [5,6])assert.deepEqual([fight.opponents[index].speed,fight.opponents[index].magic,fight.opponents[index].armour,fight.opponents[index].health,fight.opponents[index].damageStat],[9,4,3,8,'magic']);
  fight.opponents[5].health=1;assert.equal(fight.opponents[6].health,8);assert.equal(fight.opponents[3].health,8);
  fight=retargetDestinyRound(fight,6);assert.equal(fight.target,6);
});

test('every living parasite causes one armour-ignoring end damage including newborns',()=>{
  let fight=make({armour:99});fight=idleRound(fight);fight=idleRound(fight);
  assert.equal(fight.hero.health,94);fight=idleRound(fight);assert.equal(fight.opponents.length,9);assert.equal(fight.hero.health,88);
});

test('dead seepers stop producing while their surviving offspring remain in play',()=>{
  let fight=idleRound(make());fight.opponents[1].health=0;fight=startDestinyRound(fight,0,rolls());
  assert.equal(fight.opponents.length,6);assert.equal(fight.opponents[3].health,8);
  fight.phase='end';fight=endDestinyRound(fight,[],rolls());assert.equal(fight.hero.health,95);
  fight.opponents[2].health=0;fight=startDestinyRound(fight,5,rolls());assert.equal(fight.opponents.length,6);
});

test('dead parasites do not contribute end damage and a damaged original never weakens newborns',()=>{
  let fight=idleRound(make());fight.opponents[3].health=0;fight.opponents[4].magic=0;fight.opponents[4].armour=0;
  fight=startDestinyRound(fight,0,rolls());assert.equal(fight.opponents[5].magic,4);assert.equal(fight.opponents[6].armour,3);
  fight.phase='end';fight=endDestinyRound(fight,[],rolls());assert.equal(fight.hero.health,95);
});

test('spawned enemies survive reload and invalid or repeated starts cannot duplicate them',()=>{
  let fight=idleRound(make()),before=structuredClone(fight);
  assert.throws(()=>startDestinyRound(fight,100,rolls()),/living opponent/);assert.deepEqual(fight,before);
  fight=startDestinyRound(JSON.parse(JSON.stringify(fight)),6,rolls());assert.equal(fight.opponents.length,7);
  before=structuredClone(fight);assert.throws(()=>startDestinyRound(fight,6,rolls()),/stage/);assert.deepEqual(fight,before);
  fight=JSON.parse(JSON.stringify(fight));fight.phase='end';fight=endDestinyRound(fight,[],rolls());
  fight=startDestinyRound(fight,0,rolls());assert.equal(fight.opponents.length,9);
});

test('Insidious health damage offers a saved sacrifice choice without extra dice',()=>{
  const fight=hit(make({}, {charge:1,cunning:1}));assert.equal(fight.hero.health,96);assert.equal(fight.phase,'ability-choice');
  assert.equal(fight.turn.pendingAbility.type,'ability-sacrifice');assert.equal(fight.turn.pendingAbility.event.damageOnDecline,5);
  assert.deepEqual(destinyUnusedAbilities(fight),['charge','cunning']);
  const before=structuredClone(fight),result=resolveDestinyAbilitySacrifice(JSON.parse(JSON.stringify(fight)),'cunning',rolls());
  assert.equal(result.phase,'end');assert.equal(result.hero.health,96);assert.equal(hasDestinyAbility(result,'cunning'),false);assert.equal(hasDestinyAbility(result,'charge'),true);
  assert.deepEqual(fight,before);assert.equal(fight.abilities.cunning,1);
});

test('a sacrificed ability cannot return later in that fight but remains on the character for new fights',()=>{
  let fight=resolveDestinyAbilitySacrifice(hit(make({}, {cunning:1})),'cunning',rolls());
  fight=endDestinyRound(fight,[],rolls());fight=startDestinyRound(fight,1,rolls());
  assert.throws(()=>useDestinyAbility(fight,'cunning'),/unavailable/);assert.equal(fight.abilities.cunning,1);
  assert.equal(hasDestinyAbility(make({}, {cunning:1}),'cunning'),true);
});

test('used actions and always-on passives cannot masquerade as unused abilities',()=>{
  const fight=hit(make({}, {cunning:1,barbs:1,heal:2}));fight.used.cunning=1;fight.used.heal=1;
  assert.deepEqual(destinyUnusedAbilities(fight),['heal']);
  const before=structuredClone(fight);assert.throws(()=>resolveDestinyAbilitySacrifice(fight,'cunning',rolls()),/unused ability/);
  assert.throws(()=>resolveDestinyAbilitySacrifice(fight,'barbs',rolls()),/unused ability/);assert.deepEqual(fight,before);
  assert.equal(hasDestinyAbility(resolveDestinyAbilitySacrifice(fight,'heal',rolls()),'heal'),false);
});

test('declining sacrifice takes exactly five extra damage through armour and only once',()=>{
  const fight=hit(make()),result=resolveDestinyAbilitySacrifice(fight,null,rolls());
  assert.equal(result.hero.health,91);assert.equal(result.phase,'end');
  assert.throws(()=>resolveDestinyAbilitySacrifice(result,null,rolls()),/No ability sacrifice/);
});

test('the sacrifice penalty can be fatal without recovery or resurrection',()=>{
  const fight=hit(make({health:7}));assert.equal(fight.hero.health,3);
  const result=resolveDestinyAbilitySacrifice(fight,null,rolls());assert.equal(result.hero.health,0);assert.equal(result.status,'loss');
});

test('seepers and parasites never demand sacrifices, and fully blocked boss hits do not either',()=>{
  assert.equal(hit(make(),1).phase,'end');assert.equal(hit(make(),3).phase,'end');
  const fight=hit(make({armour:99}));assert.equal(fight.hero.health,100);assert.equal(fight.phase,'end');
});

test('the sacrifice waits behind crystal armour instead of replacing its pending roll',()=>{
  let fight=make();fight.crystalArmour=true;fight=hit(fight,0,1);
  assert.equal(fight.phase,'ability-rolled');assert.equal(fight.turn.pendingAbility.name,'crystal-armour');
  assert.equal(fight.turn.afterAbilityEvents.length,1);fight=resolve(fight,rolls());
  assert.equal(fight.phase,'ability-choice');assert.equal(fight.turn.pendingAbility.type,'ability-sacrifice');
});

test('victory requires the original enemies and every spawned parasite to be defeated',()=>{
  let fight=make({speed:20,brawn:100});
  for(const target of [1,2,0,3,4,5]){
    fight=resolveDestinySpeed(rollDestinySpeed(startDestinyRound(fight,target,rolls()),rolls(6,6,1,1)));
    fight=resolveDestinyDamage(rollDestinyDamage(fight,rolls(1)),rolls());
    if(target===5){assert.equal(fight.status,'win');assert.equal(fight.hero.health,100);break;}
    assert.equal(fight.status,'active');if(fight.phase==='death-move')fight=skipDestinyDeathMove(fight);
    fight=endDestinyRound(fight,[],rolls());
  }
});

test('spawn timing, source, count, child stats and passive damage follow renamed metadata',()=>{
  const roster=structuredClone(WINTER_ENCOUNTERS),preset=roster.find(row=>row.section==='435');preset.section='910';
  const spawn=preset.adapter.rules.spawnAtRoundStart[0];Object.assign(spawn,{source:0,fromRound:1,count:2,endDamage:3});spawn.opponent.health=11;
  preset.adapter.rules.spawnAtRoundStart=[spawn];
  let fight=configure(make(),910,{roster});fight=startDestinyRound(fight,6,rolls());assert.equal(fight.opponents.length,7);
  assert.deepEqual(fight.opponents.slice(5).map(row=>row.health),[11,11]);
  fight.phase='end';fight=endDestinyRound(fight,[],rolls());assert.equal(fight.hero.health,92);
});

test('declining a choice uses the penalty captured from metadata',()=>{
  const roster=structuredClone(WINTER_ENCOUNTERS);roster.find(row=>row.section==='435').adapter.rules.healthHitTestsByTarget['0'].damageOnDecline=9;
  const fight=hit(configure(make(),435,{roster}));assert.equal(resolveDestinyAbilitySacrifice(fight,null,rolls()).hero.health,87);
});
