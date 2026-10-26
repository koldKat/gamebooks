import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeDestinyRoster} from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
import {createHeartFight} from '../../../public/js/battlesim/engines/destinyquest/heart.js';
import {startDestinyRound,rollDestinySpeed,resolveDestinySpeed,retargetDestinyRound,rollDestinyDamage,resolveDestinyDamage,endDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {resolveDestinyAbilityRoll} from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';
import {useDestinyAbility} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {useLegionAction} from '../../../public/js/battlesim/engines/destinyquest/legion.js';
import {destinyStat,destinyDamageScore,destinyStrike} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
const roster=decodeDestinyRoster(JSON.parse(readFileSync(new URL('../../fixtures/battlesim/heart-roster.json',import.meta.url))).enemies);
const hero={speed:30,brawn:0,magic:0,armour:20,health:40,maxHealth:40};
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
const clone=f=>JSON.parse(JSON.stringify(f));
const fight=(section,options={})=>createHeartFight({...hero,...options.hero},section,{...options,roster});
const win=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(6,5,2,3)),rolls());
const lose=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(2,3,6,5)),rolls());
const score=f=>resolveDestinyDamage(rollDestinyDamage(f,rolls(1)));
const resolveEnd=(f,...values)=>endDestinyRound(resolveDestinyAbilityRoll(endDestinyRound(f,[],rolls(...values)),rolls(),{roster}),[],rolls());

test('the Weeper releases one additional slime per round, each dealing one damage through Armour',()=>{
  let f=fight(586);
  for(let round=1,total=0;round<=4;round++){
    f=endDestinyRound(score(win(startDestinyRound(f,0))));total+=round;assert.equal(f.hero.health,40-total);
  }
  f.hero.brawn=200;f=score(win(startDestinyRound(f,0)));assert.equal(f.encounter.outcomeSection,'709');
});

test('sniper fire strikes the hero on one through three and Zambezi on four through six without granting hero-hit healing',()=>{
  for(const face of [1,2,3,4,5,6]){
    let f=score(win(startDestinyRound(fight(588,{hero:{health:30},abilities:{vampirism:1}}),0)));
    f=resolveEnd(f,face);assert.equal(f.hero.health,face<=3?27:30);assert.equal(f.opponents[0].health,face<=3?60:57);
    assert.equal(f.turn.lastHeroDamage?.[0],undefined);
  }
});

test('Zambezi victory carries current Health even when the sniper lands the killing shot',()=>{
  let f=score(win(startDestinyRound(fight(588,{hero:{health:19}}),0)));f.opponents[0].health=3;
  f=endDestinyRound(f,[],rolls(4));f=resolveDestinyAbilityRoll(clone(f),rolls(),{roster});
  assert.equal(f.status,'win');assert.equal(f.hero.health,19);assert.equal(f.encounter.outcomeSection,'780');
});

test('langur piercing ignores Armour unless Second Skin is active',()=>{
  for(const abilities of [{},{'second-skin':1}]){
    let f=score(lose(startDestinyRound(fight(596,{hero:{speed:0},abilities}),0)));
    assert.equal(f.hero.health,abilities['second-skin']?40:35);
  }
});

test('squirrel stones use the sixteen/seventeen Speed boundary and stop when the squirrels are defeated',()=>{
  for(const [speed,damage] of [[4,5],[5,0]]){
    let f=score(win(startDestinyRound(fight(596),0)));f.hero.speed=speed;
    f=resolveEnd(f,6,6);assert.equal(f.hero.health,40-damage);
  }
  let f=score(retargetDestinyRound(win(startDestinyRound(fight(596,{hero:{brawn:200}}),0)),1));
  f=endDestinyRound(f,[],rolls());assert.equal(f.hero.health,40);assert.equal(f.status,'active');
});

test('defeating the langurs makes living squirrels flee and preserves wounds for the next wave',()=>{
  let f=score(win(startDestinyRound(fight(596,{hero:{brawn:200,health:17}}),0)));
  assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'687');assert.equal(f.hero.health,17);
  assert.equal(f.opponents[1].health,30);assert.deepEqual(f.encounter.surrenderedTargets,[1]);
});

test('Perez hurts for every freshly rolled Speed one, retaining the original hit after a reroll',()=>{
  for(const [initial,replacement,damage] of [[[1,2],5,4],[[1,1],1,12],[[2,3],1,4]]){
    let f=rollDestinySpeed(startDestinyRound(fight(597,{abilities:{charm:1}}),0),rolls(...initial,2,3));
    f=useDestinyAbility(f,'charm',{die:0},rolls(replacement));assert.equal(f.hero.health,40-damage);
  }
  let f=score(win(startDestinyRound(fight(597,{hero:{brawn:200,health:17}}),0)));
  assert.equal(f.status,'win');assert.equal(f.hero.health,17);assert.equal(f.encounter.outcomeSection,'720');
});

test('Lich Rune Master healing caps at ninety and cannot resurrect a lich killed by passives',()=>{
  for(const face of [1,2]){
    let f=score(win(startDestinyRound(fight(599),0)));f.opponents[0].health=88;
    f=resolveEnd(f,face);assert.equal(f.opponents[0].health,90);
  }
  let f=score(win(startDestinyRound(fight(599,{abilities:{barbs:1}}),0)));f.opponents[0].health=1;
  f=resolveEnd(f,1);assert.equal(f.opponents[0].health,0);assert.equal(f.status,'win');
});

test('Lich lightning deals current Armour damage and does not grant an unprinted Insulated exception',()=>{
  for(const face of [3,4])for(const abilities of [{},{insulated:1}]){
    let f=score(win(startDestinyRound(fight(599,{hero:{armour:6},abilities}),0)));
    f=resolveEnd(f,face);assert.equal(f.hero.health,34);
  }
});

test('Lich curse lowers only next-round Speed by two and a Hexed hero is immune',()=>{
  for(const face of [5,6])for(const abilities of [{},{hexed:1}]){
    let f=score(win(startDestinyRound(fight(599,{abilities}),0)));f=resolveEnd(f,face);
    f=startDestinyRound(clone(f),0);assert.equal(destinyStat(f,'hero','speed'),abilities.hexed?30:28);
    f=resolveEnd(score(win(f)),3);f=startDestinyRound(f,0);assert.equal(destinyStat(f,'hero','speed'),30);
  }
});

test('Lich permits retreat to the tunnels at any combat stage',()=>{
  const f=useLegionAction(startDestinyRound(fight(599),0),'retreat',{roster});
  assert.equal(f.status,'retreat');assert.equal(f.history.at(-1).section,'889');
});

test('Sheva rolls three Speed dice and Curse can reduce that number',()=>{
  for(const cursed of [false,true]){
    let f=startDestinyRound(fight(704,{abilities:{curse:1}}),0);
    if(cursed)f=useDestinyAbility(f,'curse');
    f=rollDestinySpeed(f,cursed?rolls(2,3,6,5):rolls(2,3,6,5,4));assert.equal(f.turn.opponentSpeedDice.length,cursed?2:3);
  }
  let f=startDestinyRound(fight(704,{hero:{speed:0,armour:0}}),0);
  f=resolveDestinySpeed(rollDestinySpeed(f,rolls(2,3,6,5,4)),rolls());f=score(f);assert.equal(f.encounter.heroStatuses.bleed,1);
  const hp=f.hero.health;f=endDestinyRound(f);assert.equal(f.hero.health,hp-1);
});

test('Jack o’ Lantern retains printed zero Speed and wins at section 201 with standard combat',()=>{
  let f=startDestinyRound(fight(713,{hero:{speed:0,brawn:20}}),0);assert.equal(f.opponents[0].speed,0);
  f=resolveDestinySpeed(rollDestinySpeed(f,rolls(2,3,1,2)),rolls());f=score(f);
  assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'201');
});

test('the alligator’s sixes repeatedly add damage dice, followed by two drowning damage through Armour',()=>{
  let f=lose(startDestinyRound(fight(718,{hero:{speed:0,armour:0}}),0));f=rollDestinyDamage(f,rolls(6,6,2));
  assert.deepEqual(f.turn.damageDice,[6,6,2]);assert.equal(destinyDamageScore(f),20);
  f=endDestinyRound(resolveDestinyDamage(f));assert.equal(f.hero.health,18);
});

test('Drecko reduces Speed for the whole fight and Delirium is conditional on an actual Health hit',()=>{
  let f=startDestinyRound(fight(722),0);assert.equal(destinyStat(f,'hero','speed'),29);assert.equal(win(f).phase,'damage');
  f=score(lose(startDestinyRound(fight(722,{hero:{speed:0,armour:0}}),0)));f=endDestinyRound(f);f.hero.speed=30;
  f=resolveDestinySpeed(rollDestinySpeed(startDestinyRound(f,0),rolls(6,5,2,3)),rolls(2));
  f=resolveDestinyAbilityRoll(f,rolls(),{roster});assert.equal(f.phase,'end');assert.equal(destinyStat(f,'hero','speed'),29);
});

test('the wheel alternates fourteen/twelve Speed while Fire Shield reduces six flame damage to two',()=>{
  let f=fight(727,{abilities:{'fire-shield':1}});
  for(let round=1;round<=6;round++){
    f=startDestinyRound(f,0);assert.equal(destinyStat(f,0,'speed'),round%2?14:12);
    f=endDestinyRound(score(win(f)));assert.equal(f.hero.health,40-round*2);
  }
  f=endDestinyRound(score(win(startDestinyRound(fight(727),0))));assert.equal(f.hero.health,34);
});

test('destroying Ixion stops flames, while destroying the wheel automatically defeats Ixion',()=>{
  let f=score(retargetDestinyRound(win(startDestinyRound(fight(727,{hero:{brawn:200}}),0)),1));
  f=endDestinyRound(f);assert.equal(f.status,'active');assert.equal(f.hero.health,40);
  f=score(win(startDestinyRound(fight(727,{hero:{brawn:200}}),0)));
  assert.equal(f.status,'win');assert.equal(f.opponents[1].health,0);assert.equal(f.encounter.outcomeSection,'888');
});

test('macaques reflect current Armour only from actual score/dice Health damage without an unprinted Insulated exception',()=>{
  for(const abilities of [{},{insulated:1}]){
    let f=score(win(startDestinyRound(fight(754,{hero:{brawn:10,armour:6},abilities}),0)));
    assert.equal(f.hero.health,34);let hp=f.hero.health;
    destinyStrike(f,0,1,'barbs','passive');assert.equal(f.hero.health,hp);
    destinyStrike(f,0,1,'test','dice');assert.equal(f.hero.health,hp-6);
  }
});

test('macaque victory preserves the wounds left by reflected lightning for the next challenge',()=>{
  const f=score(win(startDestinyRound(fight(754,{hero:{brawn:200,armour:3,health:17}}),0)));
  assert.equal(f.status,'win');assert.equal(f.hero.health,14);assert.equal(f.encounter.outcomeSection,'517');
});
