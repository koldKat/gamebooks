import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeDestinyRoster} from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
import {createHeartFight} from '../../../public/js/battlesim/engines/destinyquest/heart.js';
import {startDestinyRound,rollDestinySpeed,resolveDestinySpeed,retargetDestinyRound,rollDestinyDamage,resolveDestinyDamage,endDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {resolveDestinyAbilityRoll} from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';
import {useDestinyAbility,useDestinyPotionModifier} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {destinyStat,destinyDamageScore,isDestinyOpponentActive,isDestinyOpponentDead,addDestinyStatEffect} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
import {createDestinySession,beginDestinySession,applyDestinySessionAction} from '../../../public/js/battlesim/engines/destinyquest/session.js';
const roster=decodeDestinyRoster(JSON.parse(readFileSync(new URL('../../fixtures/battlesim/heart-roster.json',import.meta.url))).enemies);
const hero={speed:30,brawn:0,magic:0,armour:20,health:60,maxHealth:60};
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
const clone=f=>JSON.parse(JSON.stringify(f));
const fight=(section,options={})=>createHeartFight({...hero,...options.hero},section,{...options,roster});
const win=(f,...extra)=>resolveDestinySpeed(rollDestinySpeed(f,rolls(6,5,2,3)),rolls(...extra));
const lose=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(2,3,6,5)),rolls());
const score=(f,...values)=>resolveDestinyDamage(rollDestinyDamage(f,rolls(...(values.length?values:[1]))));
const wind='totem-wind-guardian',infected='totem-infected-wound',shadow='totem-shadow-shift',earth='totem-earth-fist',booster='totem-boogies-booster';
const mort=(names=[wind,infected,booster],options={})=>fight(616,{...options,encounterOptions:{totemAbilities:names}});

test('Imp mirrors starting stats independently of later hero buffs and uses its highest current damage attribute',()=>{
  let f=fight(675,{hero:{speed:0,brawn:6,magic:9,armour:0}});
  assert.deepEqual([f.opponents[0].speed,f.opponents[0].brawn,f.opponents[0].magic],[0,6,9]);
  f.hero.brawn=100;addDestinyStatEffect(f,0,'magic',-5,null,'test');
  f=rollDestinyDamage(lose(startDestinyRound(f,0)),rolls(1));assert.equal(destinyDamageScore(f),7);
});

test('Imp remains fightable through five rounds and escapes only at the start of round six',()=>{
  let f=fight(675);
  for(let round=1;round<=5;round++)f=endDestinyRound(score(win(startDestinyRound(f,0))));
  assert.equal(f.status,'active');f=startDestinyRound(clone(f),0);assert.equal(f.status,'loss');assert.equal(f.encounter.outcomeSection,'829');
  f=fight(675);for(let round=1;round<=4;round++)f=endDestinyRound(score(win(startDestinyRound(f,0))));
  f.hero.brawn=200;f=score(win(startDestinyRound(f,0)));assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'642');
});

test('Mortzilla requires exactly three distinct declared totem abilities and disables ordinary special abilities',()=>{
  for(const totemAbilities of [undefined,[wind,infected],[wind,wind,booster],[wind,infected,'barbs']])assert.throws(()=>fight(616,{encounterOptions:{totemAbilities}}),/distinct encounter abilities/);
  const f=mort(undefined,{abilities:{barbs:1,quicksilver:1}});assert.deepEqual(Object.keys(f.abilities).sort(),[wind,infected,booster].sort());
  assert.throws(()=>useDestinyAbility(startDestinyRound(f,0),'quicksilver'),/unavailable/);
});

test('Wind Guardian lasts throughout combat and infected wound adds one persistent three-damage effect only after a score Health hit',()=>{
  let f=startDestinyRound(mort(undefined,{hero:{speed:20,brawn:10}}),0);f=useDestinyAbility(f,wind);assert.equal(destinyStat(f,'hero','speed'),22);
  f=endDestinyRound(score(win(f)));assert.equal(f.opponents[0].health,50);assert.equal(destinyStat(f,'hero','speed'),21);
  f=endDestinyRound(score(win(startDestinyRound(f,0))));assert.equal(f.opponents[0].health,41);assert.equal(destinyStat(f,'hero','speed'),20);
  assert.equal(f.effects.filter(e=>e.source===infected).length,1);
  f=endDestinyRound(score(win(startDestinyRound(mort(),0))));assert.equal(f.opponents[0].health,60);assert.equal(f.effects.some(e=>e.source===infected),false);
});

test('Shadow Shift uses six armourless dice once; Earth Fist uses two dice and sets Armour to zero for the remaining combat',()=>{
  let f=win(startDestinyRound(mort([shadow,earth,booster]),0));f=useDestinyAbility(f,shadow,{},rolls(1,2,3,4,5,6));
  assert.equal(f.opponents[0].health,39);assert.equal(f.phase,'end');f=win(startDestinyRound(endDestinyRound(f),0));
  assert.throws(()=>useDestinyAbility(f,shadow,{},rolls()),/no uses left/);
  f=useDestinyAbility(f,earth,{},rolls(1,2));assert.equal(f.opponents[0].health,36);assert.equal(destinyStat(f,0,'armour'),0);
  f=startDestinyRound(endDestinyRound(f),0);assert.equal(destinyStat(f,0,'armour'),0);
});

test('Boogie restores depleted attributes twice, preserves beneficial boosts and permits ordinary potion modifiers',()=>{
  let f=mort(undefined,{hero:{speed:1,armour:100},character:{potionModifiers:{speed:{amount:2,uses:1}}}});
  for(let round=1;round<=3;round++)f=endDestinyRound(score(win(startDestinyRound(f,0))));
  assert.equal(destinyStat(f,'hero','speed'),0);f=startDestinyRound(f,0);f=useDestinyAbility(clone(f),booster);assert.equal(destinyStat(f,'hero','speed'),1);
  f=useDestinyPotionModifier(f,'speed');assert.equal(destinyStat(f,'hero','speed'),3);assert.equal(f.character.potionModifiers.speed.uses,0);
  f=endDestinyRound(score(win(f)));f=startDestinyRound(f,0);f=useDestinyAbility(f,booster);assert.equal(destinyStat(f,'hero','speed'),1);
  assert.throws(()=>useDestinyAbility(f,booster),/no uses left/);
});

test('restricted ability selection retains forced curses and explicitly activates the selected passive under Hexed',()=>{
  let f=mort(undefined,{hero:{brawn:10,magic:9},abilities:{hexed:1,'curse-of-weakness':1,barbs:1}});f=startDestinyRound(f,0);
  assert.equal(destinyStat(f,'hero','brawn'),5);assert.equal(f.abilities.barbs,undefined);
  assert.equal(f.abilityQuota.activePassives.includes(infected),true);
  f=endDestinyRound(score(win(f)));f=startDestinyRound(f,0);f=useDestinyAbility(f,booster);
  assert.equal(destinyStat(f,'hero','brawn'),5);assert.equal(f.effects.some(e=>e.source==='curse-of-weakness'),true);
});

test('Mortzilla session actions preserve the normal character ability collection and original item data',()=>{
  const character={abilities:{barbs:1,quicksilver:1},items:['Existing item']};
  let s=beginDestinySession(createDestinySession({character}),{hero,section:'616',abilities:character.abilities,encounterOptions:{totemAbilities:[wind,infected,booster]}},{roster,outcomeId:'mortzilla',createFight:createHeartFight});
  s=applyDestinySessionAction(s,'start-round',{target:0},{roster});s=applyDestinySessionAction(s,'ability',{name:wind},{roster});
  assert.deepEqual(s.character.abilities,character.abilities);assert.deepEqual(s.character.items,character.items);assert.deepEqual(character.items,['Existing item']);
});

test('Hanuman remains active at zero Health, grants no defeat and still attacks normally after being weakened',()=>{
  let f=score(win(startDestinyRound(fight(650,{hero:{brawn:100,armour:0}}),0)));
  assert.equal(f.opponents[0].health,0);assert.equal(f.status,'active');assert.equal(isDestinyOpponentActive(f,0),true);assert.equal(isDestinyOpponentDead(f,0),false);
  assert.equal(f.defeated?.includes(0)||false,false);f=endDestinyRound(f);f.hero.speed=0;
  f=score(lose(startDestinyRound(clone(f),0)));assert.equal(f.hero.health,53);
});

test('Hanuman disarm needs a new winning round, one/two fails and three through six wins with monkeys defeated',()=>{
  let base=score(win(startDestinyRound(fight(650,{hero:{brawn:100}}),0)));base=endDestinyRound(base);
  for(const face of [1,2,3,4,5,6]){
    let f=win(startDestinyRound(clone(base),0),face);assert.equal(f.turn.pendingAbility.name,'Disarm Hanuman');
    f=resolveDestinyAbilityRoll(f,rolls(),{roster});
    assert.equal(f.status,face<=2?'active':'win');
    if(face<=2){assert.equal(f.phase,'end');assert.throws(()=>rollDestinyDamage(f),/stage/);}
    else{assert.equal(f.encounter.outcomeSection,'737');assert.equal(f.opponents[1].health,0);}
  }
});

test('defeating spider monkeys immediately restores their Speed penalty without ending the encounter',()=>{
  let f=startDestinyRound(fight(650,{hero:{brawn:20,speed:20}}),0);assert.equal(destinyStat(f,'hero','speed'),19);
  f=score(retargetDestinyRound(win(f),1));assert.equal(f.opponents[1].health,0);assert.equal(f.status,'active');assert.equal(destinyStat(f,'hero','speed'),20);
});
