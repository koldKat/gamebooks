import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeDestinyRoster} from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
import {createHeartFight} from '../../../public/js/battlesim/engines/destinyquest/heart.js';
import {startDestinyRound,rollDestinySpeed,resolveDestinySpeed,rollDestinyDamage,resolveDestinyDamage,endDestinyRound,settleDestinyFight} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {destinyStat,destinyStrike} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
import {resolveDestinyAbilityRoll} from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';
import {createDestinySession,beginDestinySession,applyDestinySessionAction} from '../../../public/js/battlesim/engines/destinyquest/session.js';
import {createDestinyCharacter,recordDestinyOutcome} from '../../../public/js/battlesim/engines/destinyquest/character.js';
const roster=decodeDestinyRoster(JSON.parse(readFileSync(new URL('../../fixtures/battlesim/heart-roster.json',import.meta.url))).enemies);
const hero={speed:30,brawn:20,magic:0,armour:20,health:60,maxHealth:60};
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
const fight=(options={})=>createHeartFight({...hero,...options.hero},828,{...options,roster});
const win=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(6,5,1,2)),rolls());
const score=(f,...dice)=>resolveDestinyDamage(rollDestinyDamage(f,rolls(1)),rolls(...dice));
const resolve=f=>resolveDestinyAbilityRoll(JSON.parse(JSON.stringify(f)),rolls(),{roster});

test('each blood-money result awards exactly 100 story gold on five/six or slows only the following round',()=>{
  for(const face of [1,2,3,4,5,6]){
    let f=score(win(startDestinyRound(fight(),0)),face);assert.equal(f.phase,'ability-rolled');
    assert.equal(f.turn.healthDamage,10);f=resolve(f);
    assert.equal(destinyStat(f,'hero','speed'),30);
    assert.equal(f.encounter.storyRewards?.length||0,face>=5?1:0);
    if(face>=5)assert.equal(f.encounter.storyRewards[0].gold,100);
    f=startDestinyRound(endDestinyRound(f),0);assert.equal(destinyStat(f,'hero','speed'),face<=4?28:30);
    f.hero.brawn=0;f=endDestinyRound(score(win(f)));f=startDestinyRound(f,0);
    assert.equal(destinyStat(f,'hero','speed'),30);
  }
});

test('only actual score/dice Health damage queues blood money, including a killing blow',()=>{
  let f=startDestinyRound(fight({hero:{brawn:0}}),0);f=score(win(f));
  assert.equal(f.phase,'end');assert.equal(f.encounter.storyRewards,undefined);
  assert.equal(destinyStrike(f,0,0,'test','dice'),0);
  destinyStrike(f,0,2,'barbs','passive');assert.equal(f.turn.afterHealthDamageEvents?.length||0,0);
  destinyStrike(f,0,2,'test','dice');settleDestinyFight(f,rolls(5));
  assert.equal(f.phase,'ability-rolled');f=resolve(f);assert.equal(f.encounter.storyRewards.length,1);
  f=endDestinyRound(f);f.hero.brawn=1000;f=score(win(startDestinyRound(f,0)),6);
  assert.equal(f.opponents[0].health,0);assert.equal(f.status,'active');assert.equal(f.phase,'ability-rolled');
  f=resolve(f);assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'730');
  assert.equal(f.encounter.storyRewards.length,2);
});

test('earned story gold is recorded exactly once on victory or defeat and preserves unrelated character data',()=>{
  for(const status of ['win','loss']){
    let f=resolve(score(win(startDestinyRound(fight(),0)),5));
    f.status=status;f.phase='finished';
    const original=createDestinyCharacter({gold:7,abilities:{cunning:1},equipment:{mainHand:{name:'Original sword'}},notes:'Keep me'});
    const saved=JSON.parse(JSON.stringify(original));const result=recordDestinyOutcome(original,f,'reward');
    assert.equal(result.character.gold,107);assert.equal(result.rewards[0].source,'encounter');
    assert.deepEqual(original,saved);assert.deepEqual(result.character.equipment,saved.equipment);assert.equal(result.character.notes,'Keep me');
    assert.equal(recordDestinyOutcome(result.character,f,'reward').character.gold,107);
    if(status==='loss')assert.equal(result.character.encounterFlags['1287:828:blood-money-disabled'],true);
  }
});

test('losing Kuderas disables blood money in later session attempts without losing previously gained gold',()=>{
  const setup={hero,section:'828',abilities:{},equipment:{}};
  let s=beginDestinySession(createDestinySession({character:{gold:20}}),setup,{roster,outcomeId:'first',createFight:createHeartFight});
  s.fight=resolve(score(win(startDestinyRound(s.fight,0)),5));
  s=applyDestinySessionAction(s,'concede');s=applyDestinySessionAction(s,'record-outcome',{}, {roster,roll:rolls()});
  assert.equal(s.character.gold,120);assert.equal(s.character.encounterFlags['1287:828:blood-money-disabled'],true);
  const after=JSON.parse(JSON.stringify(s));s=applyDestinySessionAction(s,'record-outcome',{}, {roster,roll:rolls()});assert.deepEqual(s,after);
  s=beginDestinySession(JSON.parse(JSON.stringify(s)),setup,{roster,outcomeId:'second',createFight:createHeartFight});
  assert.equal(s.fight.encounter.reflectDamage,undefined);
  s.fight=score(win(startDestinyRound(s.fight,0)));assert.equal(s.fight.phase,'end');assert.equal(s.character.gold,120);
  const ordinary=fight({character:s.character});assert.equal(ordinary.encounter.reflectDamage,undefined);
});

test('each separate damage-dice hit queues one saved reward test and repeats cannot duplicate a resolved result',()=>{
  let f=startDestinyRound(fight(),0);
  destinyStrike(f,0,1,'first','dice');destinyStrike(f,0,2,'second','dice');
  settleDestinyFight(f,rolls(5));assert.equal(f.turn.afterHealthDamageEvents.length,1);
  f=resolveDestinyAbilityRoll(f,rolls(6),{roster});assert.equal(f.phase,'ability-rolled');
  assert.equal(f.encounter.storyRewards.length,1);
  f=resolve(f);assert.equal(f.encounter.storyRewards.length,2);
  assert.throws(()=>resolve(f),/ability|phase|roll/i);
});
