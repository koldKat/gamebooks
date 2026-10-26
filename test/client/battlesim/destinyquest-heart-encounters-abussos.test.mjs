import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeDestinyRoster} from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
import {createHeartFight} from '../../../public/js/battlesim/engines/destinyquest/heart.js';
import {startDestinyRound,rollDestinySpeed,resolveDestinySpeed,rollDestinyDamage,resolveDestinyDamage,endDestinyRound,continueDestinyCombat} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {destinyStat,hasDestinyAbility} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
import {useDestinyAbility} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {setDestinyPassiveActivation} from '../../../public/js/battlesim/engines/destinyquest/ability-quota.js';
import {prepareDestinyDamage} from '../../../public/js/battlesim/engines/destinyquest/damage.js';
import {resolveDestinyAbilityRoll} from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';
import {recordDestinyOutcome,createDestinyCharacter} from '../../../public/js/battlesim/engines/destinyquest/character.js';
const roster=decodeDestinyRoster(JSON.parse(readFileSync(new URL('../../fixtures/battlesim/heart-roster.json',import.meta.url))).enemies);
const hero={speed:30,brawn:0,magic:0,armour:20,health:60,maxHealth:60};
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
const fight=(section='815',options={})=>createHeartFight({...hero,...options.hero},section,{...options,roster});
const resume=(section,rounds=0,used=[],options={})=>fight(section,{...options,encounterOptions:{previousChallengeRounds:rounds,usedChallengeAbilities:used}});
const win=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(6,5,1,2)),rolls());
const score=(f,...defence)=>resolveDestinyDamage(rollDestinyDamage(f,rolls(1,...defence)),rolls());

test('all four challenge combats carry Health and spent abilities without intermediate victories',()=>{
  let f=fight('815',{hero:{brawn:1000},abilities:{cunning:1}});f.hero.health=31;
  f=useDestinyAbility(startDestinyRound(f,0),'cunning');f=score(win(f));
  for(const [index,section] of [[1,'298'],[2,'533'],[3,'712']]){
    assert.equal(f.phase,'between-combats');assert.equal(f.status,'active');assert.equal(f.hero.health,31);
    assert.equal(f.history.filter(e=>e.type==='outcome').length,0);
    f=continueDestinyCombat(JSON.parse(JSON.stringify(f)));
    assert.equal(f.encounter.sourceSection,section);assert.equal(f.encounter.consecutiveCombats.completedRounds,index);
    assert.equal(f.used.cunning,1);assert.equal(destinyStat(f,'hero','brawn'),1000);
    f=startDestinyRound(f,index);assert.throws(()=>useDestinyAbility(f,'cunning'),/uses left|already been activated/);
    f=score(win(f),...(section==='712'?[6]:[]));
  }
  assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'738');assert.equal(f.hero.health,60);
  assert.equal(f.history.filter(e=>e.type==='outcome').length,1);
});

test('Shonac transforms only at the end of the fourth round and preserves the bonus thereafter',()=>{
  let f=fight();for(let i=0;i<3;i++)f=endDestinyRound(score(win(startDestinyRound(f,0))));
  assert.deepEqual(['speed','magic','armour'].map(a=>destinyStat(f,0,a)),[11,8,3]);
  f=endDestinyRound(score(win(startDestinyRound(f,0))));
  assert.deepEqual(['speed','magic','armour'].map(a=>destinyStat(f,0,a)),[12,12,7]);
  f=endDestinyRound(score(win(startDestinyRound(f,0))));
  assert.deepEqual(['speed','magic','armour'].map(a=>destinyStat(f,0,a)),[12,12,7]);
});

test('Rap Unzal heals two per completed round up to starting Health and Fengz inflicts four armourless damage',()=>{
  let f=resume('298');f.opponents[0].health=35;
  f=endDestinyRound(score(win(startDestinyRound(f,0))));assert.equal(f.opponents[0].health,37);
  f.opponents[0].health=39;f=endDestinyRound(score(win(startDestinyRound(f,0))));assert.equal(f.opponents[0].health,40);
  f=resume('533');f=endDestinyRound(score(win(startDestinyRound(f,0))));assert.equal(f.hero.health,56);
});

test('the twentieth round deadline combines every fight and transition cannot grant a twenty-first round',()=>{
  let f=resume('298',19);f=endDestinyRound(score(win(startDestinyRound(f,0))));
  assert.equal(f.status,'loss');assert.equal(f.encounter.outcomeSection,'630');
  f=fight('815',{hero:{brawn:1000}});f.round=19;f=score(win(startDestinyRound(f,0)));
  assert.equal(f.phase,'between-combats');f=continueDestinyCombat(f);
  assert.equal(f.status,'loss');assert.equal(f.encounter.outcomeSection,'630');
  f=resume('712',19,[],{hero:{brawn:1000}});f=score(win(startDestinyRound(f,0)),6);
  assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'738');
});

test('automatic passives require a combat choice, stay active within that combat and cannot be reused later',()=>{
  let f=fight('815',{abilities:{barbs:1,bleed:1,'curse-of-weakness':1}});
  assert.equal(hasDestinyAbility(f,'barbs'),false);f=setDestinyPassiveActivation(f,'barbs');
  f=endDestinyRound(score(win(startDestinyRound(f,0))));assert.equal(f.opponents[0].health,39);
  f=endDestinyRound(score(win(startDestinyRound(f,0))));assert.equal(f.opponents[0].health,38);
  f.hero.brawn=1000;f=score(win(startDestinyRound(f,0)));f=continueDestinyCombat(f);
  assert.equal(hasDestinyAbility(f,'barbs'),false);assert.equal(hasDestinyAbility(f,'bleed'),false);
  assert.throws(()=>setDestinyPassiveActivation(f,'barbs'),/already been activated/);
  f=setDestinyPassiveActivation(f,'bleed');assert.equal(hasDestinyAbility(f,'bleed'),true);
  assert.equal(destinyStat(f,'hero','brawn'),0,'forced weakness remains after resetting temporary combat boosts');
});

test('once-only activation also applies to duplicate item charges and Magic Tap restored by doubles',()=>{
  let f=fight('815',{abilities:{heal:3,'magic-tap':1}});f.hero.health=20;
  f=useDestinyAbility(startDestinyRound(f,0),'heal');f=endDestinyRound(score(win(f)));
  f=startDestinyRound(f,0);assert.throws(()=>useDestinyAbility(f,'heal'),/already been activated/);
  f=useDestinyAbility(f,'magic-tap');f=rollDestinySpeed(f,rolls(3,3,1,2));assert.equal(f.used['magic-tap'],0);
  assert.throws(()=>useDestinyAbility(f,'magic-tap'),/already been activated/);
});

test('Hexed quota resets between combats while challenge ability choices remain consumed',()=>{
  let f=fight('815',{hero:{brawn:1000},abilities:{hexed:1,barbs:1,bleed:1}});
  f=setDestinyPassiveActivation(f,'barbs');assert.deepEqual(f.abilityQuota.used,['barbs']);
  f=score(win(startDestinyRound(f,0)));f=continueDestinyCombat(f);
  assert.deepEqual(f.abilityQuota.used,[]);assert.equal(hasDestinyAbility(f,'barbs'),false);
  assert.throws(()=>setDestinyPassiveActivation(f,'barbs'),/already been activated/);
  f=setDestinyPassiveActivation(f,'bleed');assert.deepEqual(f.abilityQuota.used,['bleed']);assert.equal(hasDestinyAbility(f,'bleed'),true);
});

test('set-granted ability provenance survives a linked combat boundary without creating gear',()=>{
  let f=fight('815',{hero:{brawn:1000},abilities:{'faith-and-duty-set':1}});
  assert.deepEqual(f.abilityGrantSources.redemption,['faith-and-duty-set']);
  const equipment=JSON.parse(JSON.stringify(f.equipment));
  f=continueDestinyCombat(score(win(startDestinyRound(f,0))));
  assert.deepEqual(f.abilityGrantSources.redemption,['faith-and-duty-set']);assert.deepEqual(f.equipment,equipment);
});

test('direct later-stage setup requires prior round and ability counts and rejects invalid resumes',()=>{
  for(const section of ['298','533','712']){
    assert.throws(()=>fight(section),/prior challenge/);
    assert.throws(()=>resume(section,20),/prior challenge/);
    assert.throws(()=>resume(section,1,['unknown']),/prior challenge/);
    const f=resume(section,7,['cunning'],{abilities:{cunning:1,barbs:1}});
    assert.equal(f.encounter.consecutiveCombats.completedRounds,7);
    assert.equal(f.used.cunning,1);assert.equal(hasDestinyAbility(f,'barbs'),false);
    assert.throws(()=>useDestinyAbility(startDestinyRound(f,0),'cunning'),/uses left|already been activated/);
  }
});

test('Cutpurse and Pillage never award ghost loot',()=>{
  let f=resume('712',0,[],{hero:{brawn:1000},abilities:{cutpurse:1,pillage:1}});
  assert.equal(hasDestinyAbility(f,'cutpurse'),false);assert.equal(hasDestinyAbility(f,'pillage'),false);
  f=score(win(startDestinyRound(f,0)),6);
  const result=recordDestinyOutcome(createDestinyCharacter({gold:10}),f,'ghosts',rolls());
  assert.equal(result.character.gold,10);assert.equal(result.rewards,undefined);
});

test('Acheron removes matching score dice while retaining Brawn and the original saved rolls',()=>{
  let f=win(startDestinyRound(resume('712',0,[],{hero:{brawn:20}}),0));
  f=rollDestinyDamage(f,rolls(6,6));assert.deepEqual(f.turn.damageDice,[6]);assert.deepEqual(f.turn.cancellationDiceByTarget[0],[6]);
  f=resolveDestinyDamage(JSON.parse(JSON.stringify(f)),rolls());assert.equal(f.turn.damageScore,20);assert.equal(f.opponents[0].health,29);
  assert.deepEqual(f.turn.damageDice,[6]);assert.deepEqual(f.turn.cancellationDiceByTarget[0],[6]);
});

test('Acheron matches damage ability dice too and pending defence dice survive saves without rerolling',()=>{
  let f=win(startDestinyRound(resume('712'),0));
  prepareDestinyDamage(f,'test',{category:'co',hit:'one',dice:2},{deferDamage:true},rolls(2,6,2,4));
  assert.deepEqual(f.turn.pendingAbility.groups[0].cancellationDiceByTarget[0],[2,4]);
  f=resolveDestinyAbilityRoll(JSON.parse(JSON.stringify(f)),rolls(),{roster});assert.equal(f.opponents[0].health,39);
  f=endDestinyRound(score(f,6));f=win(startDestinyRound(f,0));
  prepareDestinyDamage(f,'test',{category:'co',hit:'one',dice:2},{deferDamage:true},rolls(2,2,2,4));
  f=resolveDestinyAbilityRoll(f,rolls(),{roster});assert.equal(f.opponents[0].health,39,'any matching digit removes every die showing that digit');
});
