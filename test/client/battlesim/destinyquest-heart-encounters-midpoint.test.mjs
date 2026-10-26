import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeDestinyRoster} from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
import {createHeartFight} from '../../../public/js/battlesim/engines/destinyquest/heart.js';
import {startDestinyRound,rollDestinySpeed,resolveDestinySpeed,rollDestinyDamage,resolveDestinyDamage,endDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {resolveDestinyAbilityRoll} from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';
import {destinyStat,destinyDamageScore,destinyStrike} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
import {useLegionAction} from '../../../public/js/battlesim/engines/destinyquest/legion.js';
const roster=decodeDestinyRoster(JSON.parse(readFileSync(new URL('../../fixtures/battlesim/heart-roster.json',import.meta.url))).enemies);
const hero={speed:30,brawn:0,magic:0,armour:20,health:40,maxHealth:40};
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
const fight=(section,options={})=>createHeartFight({...hero,...options.hero},section,{...options,roster});
const win=(f,...extra)=>resolveDestinySpeed(rollDestinySpeed(f,rolls(6,5,1,2)),rolls(...extra));
const lose=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(1,2,6,5)),rolls());
const score=f=>resolveDestinyDamage(rollDestinyDamage(f,rolls(1)));

test('Maximus Dismantle repeatedly replaces damage and lowers Armour by three',()=>{
  let f=fight(484);
  for(const armour of [12,9,6,3,0,0]){
    f=useLegionAction(win(startDestinyRound(f,0)),'dismantle',{roster});
    assert.equal(destinyStat(f,0,'armour'),armour);assert.equal(f.opponents[0].health,40);assert.equal(f.phase,'end');
    f=endDestinyRound(f);
  }
  f.hero.brawn=100;f=score(win(startDestinyRound(f,0)));assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'498');
});

test('Maximus blocks bleed, thorns and the entire Thorn Cage but still takes other passive damage',()=>{
  let f=score(win(startDestinyRound(fight(484,{abilities:{bleed:1,thorns:1,barbs:1}}),0)));
  assert.equal(f.effects.some(e=>e.kind==='bleed'),false);
  assert.equal(destinyStrike(f,0,6,'thorn-cage','dice'),0);
  f=endDestinyRound(f);assert.equal(f.opponents[0].health,39);
});

test('the Furnace uses Magic, Anse adds three to the score and heat ignores Armour',()=>{
  let f=startDestinyRound(fight(490),0);assert.deepEqual([f.opponents[0].brawn,f.opponents[0].magic],[null,4]);
  f=rollDestinyDamage(win(f),rolls(2));assert.equal(destinyDamageScore(f),5);
  f=endDestinyRound(resolveDestinyDamage(f));assert.equal(f.hero.health,37);
  f.hero.brawn=100;f=score(win(startDestinyRound(f,0)));assert.equal(f.encounter.outcomeSection,'431');
});

test('Lycanth disease needs a score Health hit, while the miasma always deals three',()=>{
  for(const [armour,abilities,disease] of [[0,{},2],[20,{},undefined],[0,{toxicology:1},undefined]]){
    let f=lose(startDestinyRound(fight(495,{hero:{speed:0,armour},abilities}),0));
    f=score(f);assert.equal(f.encounter.heroStatuses?.disease,disease);const hp=f.hero.health;
    f=endDestinyRound(f);assert.equal(f.hero.health,hp-3-(disease||0));
  }
});

test('the later Succubus has Magic five and four support damage, with conditional Delirium',()=>{
  let f=rollDestinyDamage(win(startDestinyRound(fight(505),0)),rolls(2));
  assert.equal(destinyDamageScore(f),6);assert.deepEqual([f.opponents[0].brawn,f.opponents[0].magic],[null,5]);
  f=lose(startDestinyRound(fight(505,{hero:{speed:0,armour:0}}),0));f=score(f);f=endDestinyRound(f);
  f.hero.speed=30;f=win(startDestinyRound(f,0),2);assert.equal(f.phase,'ability-rolled');
  f=resolveDestinyAbilityRoll(f,rolls(),{roster});assert.equal(f.phase,'end');
  f=score(win(startDestinyRound(fight(505,{hero:{brawn:100}}),0)));assert.equal(f.encounter.outcomeSection,'519');
});

test('Mandrills gain Speed at each end, cap at fourteen and carry the hero’s wounds into victory',()=>{
  let f=fight(517,{hero:{health:17}});
  for(let round=1;round<=7;round++){
    f=endDestinyRound(score(win(startDestinyRound(f,0))));
    assert.equal(destinyStat(f,0,'speed'),Math.min(14,9+round));assert.equal(f.hero.health,17);
  }
  f.hero.brawn=100;f=score(win(startDestinyRound(f,0)));assert.equal(f.status,'win');assert.equal(f.hero.health,17);
  assert.equal(f.encounter.outcomeSection,'650');
});
