import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeDestinyRoster} from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
import {createHeartFight} from '../../../public/js/battlesim/engines/destinyquest/heart.js';
import {useLegionAction} from '../../../public/js/battlesim/engines/destinyquest/legion.js';
import {useDestinyAbility} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {startDestinyRound,rollDestinySpeed,resolveDestinySpeed,rollDestinyDamage,resolveDestinyDamage,endDestinyRound,retargetDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {resolveDestinyAbilityRoll} from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';
import {destinyStat,destinyDamageScore} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
const roster=decodeDestinyRoster(JSON.parse(readFileSync(new URL('../../fixtures/battlesim/heart-roster.json',import.meta.url))).enemies);
const hero={speed:20,brawn:4,magic:2,armour:0,health:30,maxHealth:30};
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
const clone=f=>JSON.parse(JSON.stringify(f));
const fight=(section,options={})=>createHeartFight({...hero,...options.hero},section,{...options,roster});
const win=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(6,5,1,2)));
const lose=(f,...dice)=>resolveDestinySpeed(rollDestinySpeed(f,rolls(1,2,6,5)),rolls(...dice));
const resolve=f=>resolveDestinyAbilityRoll(clone(f),rolls(),{roster});

test('undead war band uses warrior initiative, caps priest healing and resolves the exact Speed12/13 boundary',()=>{
  for(const [dice,health]of [[[4,5],25],[[5,5],30]]){
    let f=startDestinyRound(fight(249,{hero:{speed:3},abilities:{bleed:1,venom:1}}),0);
    f=resolveDestinyDamage(rollDestinyDamage(win(f),rolls(2)));assert.equal(f.opponents[0].health,37);
    assert.equal(f.effects.some(e=>['bleed','venom'].includes(e.kind)),false);
    f=endDestinyRound(f,[],rolls(...dice));assert.equal(f.phase,'ability-rolled');
    f=endDestinyRound(resolve(f),[],rolls());assert.equal(f.hero.health,health);assert.equal(f.opponents[0].health,40);
  }
});

test('defeated mages stop testing and defeating warriors defeats surviving resource groups',()=>{
  let f=startDestinyRound(fight(249,{hero:{brawn:30}}),0);f=retargetDestinyRound(win(f),1);
  f=resolveDestinyDamage(rollDestinyDamage(f,rolls(1)));assert.equal(f.opponents[1].health,0);
  f=endDestinyRound(f,[],rolls());assert.equal(f.phase,'start');
  f=startDestinyRound(fight(249,{hero:{brawn:100}}),0);f=resolveDestinyDamage(rollDestinyDamage(win(f),rolls(1)));
  assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'314');assert.deepEqual(f.opponents.map(o=>o.health),[0,0,0]);
});

test('Benin rescue heals once including a lethal hit and clears venom from that same blow',()=>{
  let f=startDestinyRound(fight(280,{hero:{speed:0,health:10}}),0);f.hero.health=9;
  f=resolveDestinyDamage(rollDestinyDamage(lose(f),rolls(6)));
  assert.equal(f.hero.health,30);assert.equal(f.encounter.heroStatuses?.venom,undefined);assert.equal(f.encounter.heroThresholdHealing[0].used,true);
  f=startDestinyRound(endDestinyRound(clone(f)),0);f=resolveDestinyDamage(rollDestinyDamage(lose(f),rolls(2)));
  assert.equal(f.hero.health,25);assert.equal(f.encounter.heroStatuses.venom,2);f=endDestinyRound(f);assert.equal(f.hero.health,23);
  assert.equal(destinyStat(f,'hero','brawn'),5);assert.equal(destinyStat(f,'hero','magic'),3);
});

test('the flaming skull can be selected after beating Shadow and its flames stop immediately on defeat',()=>{
  let f=startDestinyRound(fight(284),0);f=rollDestinyDamage(win(f),rolls(2));assert.equal(destinyDamageScore(f),8);
  f=endDestinyRound(resolveDestinyDamage(f));assert.equal(f.hero.health,28);
  f=startDestinyRound(fight(284,{hero:{brawn:30}}),0);f=retargetDestinyRound(win(f),1);
  f=resolveDestinyDamage(rollDestinyDamage(f,rolls(2)));assert.equal(f.opponents[1].health,0);assert.equal(f.status,'active');
  f=endDestinyRound(f);assert.equal(f.hero.health,30);
});

test('sap growth hurts only at the next start and both magic actions replace the winning score',()=>{
  let f=startDestinyRound(fight(288),0);f=endDestinyRound(resolveDestinyDamage(rollDestinyDamage(win(f),rolls(1))));
  assert.equal(f.hero.health,30);assert.equal(f.encounter.resources.saps,1);
  f=win(startDestinyRound(clone(f),0));assert.equal(f.hero.health,29);
  f=useLegionAction(f,'power-pruning',{roster});assert.equal(destinyStat(f,0,'armour'),8);assert.equal(f.phase,'end');
  assert.throws(()=>useLegionAction(f,'blast-the-bile',{roster}),/Replace a winning/);
  f=endDestinyRound(f);assert.equal(f.encounter.resources.saps,2);
  f=win(startDestinyRound(f,0));assert.equal(f.hero.health,27);
  f=useLegionAction(f,'blast-the-bile',{roster});assert.equal(f.encounter.resources.saps,0);assert.equal(f.phase,'end');
  f=endDestinyRound(f);assert.equal(f.encounter.resources.saps,1);
});

test('Vas breaks the ant boulder on four or higher, while three or less allows the normal attack',()=>{
  for(const [die,phase]of [[3,'damage'],[4,'end'],[6,'end']]){
    let f=startDestinyRound(fight(290,{hero:{speed:0}}),0);f=resolve(lose(f,die));assert.equal(f.phase,phase);
    if(phase==='damage')f=resolveDestinyDamage(rollDestinyDamage(f,rolls(2)));
    assert.equal(f.hero.health,phase==='damage'?26:30);
  }
});

test('Bilhah’s second encounter gets the ruffian score bonus and its own win/loss destinations',()=>{
  let f=startDestinyRound(fight(295,{hero:{speed:0}}),0);f=rollDestinyDamage(lose(f),rolls(2));assert.equal(destinyDamageScore(f),9);
  f=startDestinyRound(fight(295,{hero:{brawn:100}}),0);f=resolveDestinyDamage(rollDestinyDamage(win(f),rolls(1)));
  assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'194');assert.equal(f.opponents[1].health,15);
  f=startDestinyRound(fight(295,{hero:{speed:0,health:1}}),0);f=resolveDestinyDamage(rollDestinyDamage(lose(f),rolls(1)));
  assert.equal(f.encounter.outcomeSection,'244');
});

test('Benin’s one/two results heal only himself and cap at eighteen instead of rolling damage',()=>{
  for(const die of [1,2,3]){
    let f=startDestinyRound(fight(312,{hero:{speed:0}}),0);f.opponents[0].health=17;
    f=resolve(lose(f,die));assert.equal(f.phase,die<=2?'end':'damage');
    assert.equal(f.opponents[0].health,die<=2?18:17);assert.equal(f.hero.health,30);
    if(die===3){f=resolveDestinyDamage(rollDestinyDamage(f,rolls(3)));assert.equal(f.hero.health,25);}
  }
});

test('blood ticks bombard on three or less, ignore Armour and heal only after actual enemy Health damage',()=>{
  for(const armour of [0,30]){
    let f=startDestinyRound(fight(327,{hero:{speed:0,armour}}),0,rolls(3));f=resolve(f);assert.equal(f.hero.health,28);
    f.opponents[0].health=20;f=resolveDestinyDamage(rollDestinyDamage(lose(f),rolls(1)));
    assert.equal(f.opponents[0].health,armour===0?21:20);
  }
  let safe=startDestinyRound(fight(327),0,rolls(4));safe=resolve(safe);assert.equal(safe.hero.health,30);
});

test('Inkheart Brawn grows only to eight and its ink immunity stops the entire Thorn Cage ability',()=>{
  let f=fight(362,{hero:{speed:5},abilities:{'thorn-cage':1}});
  for(let round=1;round<=6;round++){
    f=startDestinyRound(f,0);f=endDestinyRound(resolveDestinySpeed(rollDestinySpeed(f,rolls(1,2,1,2))));
    assert.equal(destinyStat(f,0,'brawn'),Math.min(8,4+round));
  }
  f.hero.speed=20;f=win(startDestinyRound(f,0));assert.throws(()=>useDestinyAbility(f,'thorn-cage',{},rolls()),/immune/);
});

test('Gaia checks roots after passive damage on each third round, mitigates swallowing and then resets the roots',()=>{
  for(const [rootsHealth,passive,expectedHealth]of [[20,0,20],[0,0,30],[1,1,30]]){
    let f=fight(384,{hero:{armour:5}});f.round=2;
    f=startDestinyRound(f,0);f=resolveDestinyDamage(rollDestinyDamage(win(f),rolls(1)));
    f.opponents[1].health=rootsHealth;
    if(passive)f.effects.push({kind:'bleed',target:1,amount:passive,from:1,until:100});
    f=endDestinyRound(clone(f));assert.equal(f.hero.health,expectedHealth);assert.equal(f.opponents[1].health,20);
    if(rootsHealth===0||passive)assert.equal(f.effects.some(effect=>effect.target===1),false);
  }
});

test('destroying Xenos books spends exactly three source objects and replaces each winning damage score',()=>{
  let f=fight(390);
  for(let count=1;count<=3;count++){
    f=win(startDestinyRound(f,0));f=useLegionAction(f,'destroy-book',{roster});
    assert.equal(f.encounter.resources.books,3-count);assert.equal(f.phase,'end');
    assert.deepEqual(['speed','magic','armour'].map(stat=>destinyStat(f,0,stat)),[12-count,9-count,9-count]);
    f=endDestinyRound(clone(f));
  }
  f=win(startDestinyRound(f,0));assert.throws(()=>useLegionAction(f,'destroy-book',{roster}),/No source objects/);
  assert.equal(f.encounter.resources.books,0);
});
