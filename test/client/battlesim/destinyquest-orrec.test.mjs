import test from 'node:test';
import assert from 'node:assert/strict';
import {createWinterFight, resolveDestinyAbilityRoll as resolve, WINTER_ENCOUNTERS} from './destinyquest-fixtures.mjs';
import {configureWinterEncounter} from '../../../public/js/battlesim/engines/destinyquest/winters-fury.js';
import {resolveDestinyAbilityRoll} from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';
import {useDestinyAbility as use} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {startDestinyRound, rollDestinySpeed, resolveDestinySpeed, rollDestinyDamage,
  resolveDestinyDamage, endDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {destinyStat} from '../../../public/js/battlesim/engines/destinyquest/effects.js';

const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected dice');return values.shift();};
const make=(abilities={},extra={})=>createWinterFight({speed:0,brawn:4,armour:0,health:30,maxHealth:50,...extra},459,{abilities});
const start=(abilities={},extra={})=>startDestinyRound(make(abilities,extra),0,rolls());
const win=fight=>resolveDestinySpeed(rollDestinySpeed(fight,rolls(6,6,1,1)));
const lose=fight=>resolveDestinySpeed(rollDestinySpeed(fight,rolls(1,1,6,6)));

for(const face of [1,2,3,4,5,6])test('speed interception follows printed die face '+face,()=>{
  const fight=start({charge:1,radiance:1}),before=structuredClone(fight);
  let pending=use(fight,'charge',{},rolls(face));assert.deepEqual(fight,before);
  assert.equal(pending.used.charge,undefined);assert.equal(destinyStat(pending,'hero','speed'),0);
  pending=JSON.parse(JSON.stringify(pending));const result=resolve(pending,rolls());
  assert.equal(result.used.charge,1);assert.equal(result.turn.used.sp,true);assert.equal(result.turn.playedSpeedAbility,true);
  assert.equal(result.turn.passedEncounterAbility,undefined);assert.equal(result.phase,'speed');
  assert.equal(destinyStat(result,'hero','speed'),face<=2?0:2);
  assert.throws(()=>use(result,'radiance',{},rolls()),/Only one ability/);
});

test('evaded deep wound spends its use without adding its own or Heart Steal dice',()=>{
  const fight=win(start({'deep-wound':1,'heart-steal':1},{speed:20}));
  const result=resolve(use(fight,'deep-wound',{},rolls(1)),rolls());
  assert.equal(result.phase,'damage');assert.equal(result.turn.extraDamageDice,undefined);assert.equal(result.used['deep-wound'],1);
  assert.deepEqual(rollDestinyDamage(result,rolls(3)).turn.damageDice,[3]);
});

test('a passed deep wound applies once without checking the same move again',()=>{
  const fight=win(start({'deep-wound':1,'heart-steal':1},{speed:20}));
  const result=resolve(use(fight,'deep-wound',{},rolls(3)),rolls());
  assert.equal(result.turn.extraDamageDice,2);assert.equal(result.used['deep-wound'],1);
  assert.deepEqual(rollDestinyDamage(result,rolls(1,2,3)).turn.damageDice,[1,2,3]);
});

test('an evaded replacement leaves ordinary damage available',()=>{
  const fight=win(start({cleave:1},{speed:20}));const result=resolve(use(fight,'cleave',{},rolls(2)),rolls());
  assert.equal(result.phase,'damage');assert.equal(result.turn.normalDamageReplaced,undefined);assert.equal(result.used.cleave,1);
  assert.deepEqual(rollDestinyDamage(result,rolls(4)).turn.damageDice,[4]);
});

test('costs and independent play-trigger passives still apply when the move is evaded',()=>{
  let fight=win(start({'dark-pact':1,weaver:1},{speed:20}));fight=resolve(use(fight,'dark-pact',{},rolls(1)),rolls());
  assert.equal(fight.hero.health,28);assert.equal(fight.turn.damageScoreBonus,undefined);
  fight=resolve(use(start({charge:1,'wind-chill':1}),'charge',{},rolls(1)),rolls());
  assert.equal(fight.opponents[0].health,38);assert.equal(destinyStat(fight,'hero','speed'),0);
});

test('an evaded move cannot resurrect a character killed by its activation cost',()=>{
  const fight=win(start({'dark-pact':1,weaver:1},{speed:20,health:4}));
  const result=resolve(use(fight,'dark-pact',{},rolls(2)),rolls());assert.equal(result.hero.health,0);assert.equal(result.status,'loss');
});

test('modifier and opening abilities are outside Sixth Sense',()=>{
  const modified=use(start({cunning:1}),'cunning',{},rolls());assert.equal(modified.phase,'speed');assert.equal(destinyStat(modified,'hero','brawn'),7);
  const opening=use(make({'first-blood':1}),'first-blood',{target:0},rolls());assert.equal(opening.opponents[0].health,36);
});

test('Charm can edit the saved interception die without spending the attempted move twice',()=>{
  let fight=use(start({charge:1,charm:1}),'charge',{},rolls(1));fight=use(fight,'charm',{die:0},rolls(6));
  assert.deepEqual(fight.turn.pendingAbility.dice,[6]);fight=resolve(fight,rolls());
  assert.equal(fight.used.charge,1);assert.equal(fight.used.charm,1);assert.equal(destinyStat(fight,'hero','speed'),2);
});

test('interception preserves an existing attack roll when Command is evaded',()=>{
  let fight=lose(start({command:1}));fight.phase='ability-rolled';
  const attack={type:'encounter',name:'Saved attack',event:{kind:'damage-if-low',name:'Saved attack',limit:2,amount:5,attackChoice:true},dice:[4],returnPhase:'damage'};
  fight.turn.pendingAbility=attack;fight=resolve(use(fight,'command',{},rolls(1)),rolls());
  assert.equal(fight.phase,'ability-rolled');assert.deepEqual(fight.turn.pendingAbility,attack);assert.equal(fight.turn.winner,'opponent');
  fight=resolve(fight,rolls());assert.equal(fight.phase,'damage');assert.equal(fight.used.command,1);
});

test('a passed Command interrupts the suspended attack normally',()=>{
  let fight=lose(start({command:1}));fight.phase='ability-rolled';
  fight.turn.pendingAbility={type:'encounter',name:'Saved attack',event:{attackChoice:true},dice:[4],returnPhase:'damage'};
  fight=resolve(use(fight,'command',{},rolls(6)),rolls());assert.equal(fight.phase,'damage');assert.equal(fight.turn.pendingAbility,undefined);assert.equal(fight.turn.winner,'hero');
});

test('head-blow is checked before Sixth Sense and its approved ability is consumed once',()=>{
  let fight=start({charge:1});fight.character={penalties:['head-blow']};fight=use(fight,'charge',{},rolls(6));
  assert.equal(fight.turn.pendingAbility.name,'head-blow');fight=resolve(fight,rolls());
  fight=use(fight,'charge',{},rolls(1));assert.equal(fight.turn.pendingAbility.type,'ability-interception');fight=resolve(fight,rolls());
  assert.equal(fight.used.charge,1);assert.equal(fight.turn.used.sp,true);assert.equal(fight.turn.passedSpeedAbility,undefined);
});

test('pending interception and invalid enemy targets cannot be replaced or rerolled',()=>{
  const fight=start({radiance:1,gouge:1});assert.throws(()=>use(fight,'radiance',{target:99},rolls()),/living opponent/);
  const pending=use(fight,'radiance',{},rolls(1)),before=structuredClone(pending);
  assert.throws(()=>use(pending,'gouge',{},rolls()),/interception/);assert.deepEqual(pending,before);
});

test('Swift Steps starts next round and expires without another health hit',()=>{
  let fight=resolveDestinyDamage(rollDestinyDamage(lose(start()),rolls(1)),rolls());assert.equal(fight.hero.health,27);assert.equal(destinyStat(fight,0,'speed'),3);
  fight=startDestinyRound(endDestinyRound(fight),0);assert.equal(destinyStat(fight,0,'speed'),4);
  fight=resolveDestinySpeed(rollDestinySpeed(fight,rolls(6,6,4,4)));assert.equal(fight.turn.winner,'standoff');
  fight=startDestinyRound(endDestinyRound(fight),0);assert.equal(destinyStat(fight,0,'speed'),3);
});

test('fully absorbed attacks grant no Swift Steps bonus',()=>{
  let fight=resolveDestinyDamage(rollDestinyDamage(lose(start({}, {armour:99})),rolls(1)),rolls());
  fight=startDestinyRound(endDestinyRound(fight),0);assert.equal(destinyStat(fight,0,'speed'),3);
});

test('renamed metadata controls interception categories, dice and threshold',()=>{
  const roster=structuredClone(WINTER_ENCOUNTERS),preset=roster.find(row=>row.section==='459');preset.section='911';
  Object.assign(preset.adapter.rules.abilityInterception,{categories:['mo'],dice:2,cancelMaximum:4});
  let fight=startDestinyRound(configureWinterEncounter(make({cunning:1}),911,{roster}),0);
  fight=use(fight,'cunning',{},rolls(2,2));assert.deepEqual(fight.turn.pendingAbility.dice,[2,2]);
  fight=resolveDestinyAbilityRoll(fight,rolls(),{roster});assert.equal(destinyStat(fight,'hero','brawn'),4);assert.equal(fight.used.cunning,1);assert.equal(fight.turn.used.mo,undefined);
});
