import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeDestinyRoster} from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
import {createHeartFight} from '../../../public/js/battlesim/engines/destinyquest/heart.js';
import {useLegionAction as action} from '../../../public/js/battlesim/engines/destinyquest/legion.js';
import {startDestinyRound,rollDestinySpeed,resolveDestinySpeed,rollDestinyDamage,resolveDestinyDamage,endDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {useDestinyAbility} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {resolveDestinyAbilityRoll} from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';
import {destinyStat} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
const roster=decodeDestinyRoster(JSON.parse(readFileSync(new URL('../../fixtures/battlesim/heart-roster.json',import.meta.url))).enemies);
const hero={speed:20,brawn:4,magic:2,armour:0,health:30,maxHealth:30};
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
const clone=f=>JSON.parse(JSON.stringify(f));
const fight=(section,options={})=>createHeartFight({...hero,...options.hero},section,{...options,roster});
const win=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(6,5,1,2)));
const lose=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(1,2,6,5)));

test('Gairn shields at start four, clears existing passives, forces skeleton initiative and cannot win merely by hiding',()=>{
  let f=fight(158,{abilities:{barbs:1,'fire-aura':1}});f.round=3;
  f.effects.push({kind:'bleed',target:0,amount:1,from:1,until:100},{kind:'stat',target:0,attribute:'armour',amount:-1,from:1,until:100});
  f=startDestinyRound(f,0);assert.equal(f.round,4);assert.equal(f.target,1);assert.equal(f.status,'active');
  assert.deepEqual(f.encounter.inactiveTargets,[0]);assert.equal(f.effects.some(e=>e.kind==='bleed'),false);assert.equal(destinyStat(f,0,'armour'),3);
  f=endDestinyRound(resolveDestinyDamage(rollDestinyDamage(win(f),rolls(1))));
  assert.equal(f.opponents[0].health,50);assert.equal(f.status,'active');
  f.hero.brawn=100;f=win(startDestinyRound(clone(f),1));f=resolveDestinyDamage(rollDestinyDamage(f,rolls(1)));
  assert.equal(f.opponents[1].health,0);assert.equal(f.encounter.inactiveTargets.includes(0),false);assert.equal(f.status,'active');
  f=win(startDestinyRound(endDestinyRound(f),0));f=resolveDestinyDamage(rollDestinyDamage(f,rolls(1)));
  assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'124');
});

test('Frost Fire starts after Gairn Health damage and never starts from a skeleton hit',()=>{
  let f=startDestinyRound(fight(158,{hero:{speed:0}}),0);f=resolveDestinyDamage(rollDestinyDamage(lose(f),rolls(1)));
  assert.equal(f.hero.health,24);assert.equal(f.encounter.heroStatuses['frost-fire'],1);f=endDestinyRound(f);assert.equal(f.hero.health,23);
  f=fight(158,{hero:{speed:0}});f.round=3;f=startDestinyRound(f,0);
  f=resolveDestinyDamage(rollDestinyDamage(lose(f),rolls(1)));assert.equal(f.hero.health,25);assert.equal(f.encounter.heroStatuses,undefined);
});

test('Book of Binding requires the source item and replaces a winning score only while Gairn is exposed',()=>{
  let f=win(startDestinyRound(fight(158),0));assert.throws(()=>action(f,'book-of-binding',{roster}),/required source item/);
  f=win(startDestinyRound(fight(158,{encounterOptions:{bookOfBinding:true}}),0));
  f=action(f,'book-of-binding',{roster});assert.equal(f.phase,'end');assert.deepEqual(['speed','magic','armour'].map(stat=>destinyStat(f,0,stat)),[3,3,2]);
  f=endDestinyRound(f);f.round=3;f=win(startDestinyRound(f,0));
  assert.throws(()=>action(f,'book-of-binding',{roster}),/not exposed/);
});

test('Ventus replacement attacks build two/three/four/five armourless dice and then exhaust',()=>{
  let f=fight(237,{hero:{health:100,maxHealth:100}});
  for(let count=2;count<=5;count++){
    f=win(startDestinyRound(f,0));const hp=f.opponents[0].health;
    f=action(f,'thousand-fists',{roster},rolls(...Array(count).fill(1)));
    assert.equal(f.opponents[0].health,hp-count);assert.equal(f.phase,'end');f=endDestinyRound(clone(f));
  }
  f=win(startDestinyRound(f,0));assert.throws(()=>action(f,'thousand-fists',{roster},rolls()),/exhausted/);
});

test('a gap resets the companion sequence and its damage does not apply hero on-hit passives or fund Vampirism',()=>{
  let f=win(startDestinyRound(fight(237,{abilities:{bleed:1,leech:1,vampirism:1},hero:{health:20}}),0));
  f=action(f,'thousand-fists',{roster,deferDamage:true},rolls(1,2));
  f=resolveDestinyAbilityRoll(clone(f),rolls());assert.equal(f.hero.health,20);assert.equal(f.effects.some(e=>e.kind==='bleed'),false);
  assert.throws(()=>useDestinyAbility(f,'vampirism'),/health damage/i);
  f=endDestinyRound(f);f.round++;
  f=win(startDestinyRound(f,0));const hp=f.opponents[0].health;f=action(f,'thousand-fists',{roster},rolls(1,1));assert.equal(f.opponents[0].health,hp-2);
});

test('sacrificing golems avoids only the lost-round attack and permanently removes their end damage',()=>{
  let f=startDestinyRound(fight(268,{hero:{speed:0}}),0);f=lose(f);
  f=action(f,'sacrifice-golems',{roster});assert.equal(f.phase,'end');assert.equal(f.hero.health,30);assert.equal(f.encounter.golemsAlive,false);
  f=endDestinyRound(f);assert.equal(f.hero.health,27);assert.equal(f.opponents[0].health,80);
  f=lose(startDestinyRound(f,0));assert.throws(()=>action(f,'sacrifice-golems',{roster}),/available companion/);
});

test('Furious Roar replaces the winning score and buffs only the next three rounds, without stacking on refresh',()=>{
  let f=win(startDestinyRound(fight(268),0));f=action(f,'furious-roar',{roster});
  assert.equal(destinyStat(f,'hero','speed'),20);assert.equal(f.phase,'end');
  f=endDestinyRound(f);assert.equal(f.opponents[0].health,78);assert.equal(f.hero.health,27);
  f.round=2;assert.deepEqual(['speed','brawn','magic'].map(stat=>destinyStat(f,'hero',stat)),[21,5,3]);
  f.round=4;assert.equal(destinyStat(f,'hero','speed'),21);f.round=5;assert.equal(destinyStat(f,'hero','speed'),20);
  f=win(startDestinyRound(f,0));f=action(f,'furious-roar',{roster});f=endDestinyRound(f);
  f=win(startDestinyRound(f,0));f=action(f,'furious-roar',{roster});f.round++;
  assert.equal(destinyStat(f,'hero','speed'),21);assert.equal(f.effects.filter(e=>e.source==='furious-roar').length,3);
});

test('Forger flame growth uses one/two/three and Knockdown applies next round only, respecting immunity',()=>{
  for(const steadfast of [false,true]){
    let f=startDestinyRound(fight(422,{hero:{speed:2},abilities:steadfast?{steadfast:1}:{}}),0,rolls(3));
    f=resolveDestinyAbilityRoll(f,rolls(),{roster});assert.equal(destinyStat(f,0,'brawn'),4);
    f=resolveDestinyDamage(rollDestinyDamage(lose(f),rolls(1)));assert.equal(f.hero.health,25);
    f=startDestinyRound(endDestinyRound(f),0,rolls(4));f=resolveDestinyAbilityRoll(f,rolls(),{roster});
    assert.equal(destinyStat(f,'hero','speed'),steadfast?2:1);assert.equal(destinyStat(f,0,'brawn'),4);
    f.round++;assert.equal(destinyStat(f,'hero','speed'),2);
  }
});

test('Rocco and Papyrus victories preserve remaining Health and their distinct onward sections',()=>{
  for(const [section,destination]of [[427,'444'],[444,'208']]){
    let f=win(startDestinyRound(fight(section,{hero:{brawn:100,health:12}}),0));
    f=resolveDestinyDamage(rollDestinyDamage(f,rolls(1)));assert.equal(f.status,'win');assert.equal(f.hero.health,12);assert.equal(f.encounter.outcomeSection,destination);
  }
});

test('Umbra end-round backstab triggers through three and lets Armour absorb its ten damage',()=>{
  for(const die of [3,4]){
    let f=win(startDestinyRound(fight(432,{hero:{armour:4}}),0));f=resolveDestinyDamage(rollDestinyDamage(f,rolls(1)));
    f=endDestinyRound(f,[],rolls(die));f=resolveDestinyAbilityRoll(f,rolls(),{roster});f=endDestinyRound(clone(f),[],rolls());
    assert.equal(f.hero.health,die===3?24:30);
  }
});

test('Cuddles and Quetzal piercing ignore Armour unless Second Skin protects the hero',()=>{
  for(const [section,damage,bleed]of [[434,5,1],[457,8,0]])for(const immune of [false,true]){
    let f=startDestinyRound(fight(section,{hero:{speed:0,armour:20},abilities:immune?{'second-skin':1}:{}}),0);
    f=resolveDestinyDamage(rollDestinyDamage(lose(f),rolls(2)));assert.equal(f.hero.health,immune?30:30-damage);
    f=endDestinyRound(f);assert.equal(f.hero.health,immune?30:30-damage-bleed);
  }
});

test('the later Orgorath has forty Health and still applies three Deadly Thorns damage on a standoff',()=>{
  let f=startDestinyRound(fight(468,{hero:{speed:5}}),0);assert.equal(f.opponents[0].health,40);
  f=endDestinyRound(resolveDestinySpeed(rollDestinySpeed(f,rolls(1,2,1,2))));assert.equal(f.hero.health,27);
});
