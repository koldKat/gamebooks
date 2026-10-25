import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodeDestinyRoster} from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
import {createLegionFight,useLegionAction} from '../../../public/js/battlesim/engines/destinyquest/legion.js';
import {startDestinyRound,rollDestinySpeed,resolveDestinySpeed,rollDestinyDamage,resolveDestinyDamage,endDestinyRound,retargetDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {useDestinyAbility,useDestinyBackpackItem} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {destinyStat} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
import {resolveDestinyAbilityRoll} from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';
const roster=decodeDestinyRoster(JSON.parse(fs.readFileSync(new URL('../../../data/simulator-rosters/1286.json',import.meta.url),'utf8')).enemies);
const hero={speed:20,brawn:3,magic:0,armour:4,health:30,maxHealth:30};
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected roll');return values.shift();};
const make=(section,options={})=>createLegionFight({...hero,...options.hero},section,{roster,...options});
const round=f=>startDestinyRound(f,0);
const win=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(6,5,1,2)));
const lose=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(1,2,6,5)));
const hit=(f,face=4)=>resolveDestinyDamage(rollDestinyDamage(f,rolls(face)));
const resume=f=>JSON.parse(JSON.stringify(f));

test('Caeleb shield damage happens before a reroll and cannot be undone by Charm',()=>{
  let f=round(make('676',{abilities:{charm:1}}));
  f=rollDestinySpeed(f,rolls(1,4,2,3));assert.equal(f.hero.health,24);
  f=useDestinyAbility(resume(f),'charm',{die:0},rolls(6));assert.equal(f.hero.health,24);
  f=resolveDestinySpeed(f);assert.equal(f.hero.health,24);
});

test('the late bone wyvern retains its two damage beak and bone immunities',()=>{
  let f=win(round(make('681',{abilities:{bleed:1,venom:1}})));f=hit(f);
  assert.equal(f.effects.some(effect=>['bleed','venom'].includes(effect.kind)),false);
  f=endDestinyRound(f);assert.equal(f.hero.health,28);
});

test('Death Orb beam uses three dice and hits only above ten, once at round end',()=>{
  for(const [dice,expected] of [[[3,3,4],30],[[3,4,4],28]]){
    let f=hit(win(round(make('684'))));f=endDestinyRound(f,[],rolls(...dice));
    assert.equal(f.phase,'ability-rolled');assert.equal(f.hero.health,30);
    f=resolveDestinyAbilityRoll(resume(f),rolls(),{roster});assert.equal(f.phase,'end');
    f=endDestinyRound(f,[],rolls());assert.equal(f.hero.health,expected);assert.equal(f.phase,'start');
  }
});

test('stone giant variants retain distinct Health and golem counts, with damage from each living golem',()=>{
  for(const[section,hp,count]of[['554',50,4],['652',40,4],['658',50,2]]){
    let f=make(section,{hero:{brawn:10,health:100,maxHealth:100}});assert.equal(f.opponents[0].health,hp);assert.equal(f.opponents.length,count+1);
    f=endDestinyRound(hit(win(round(f)),1));assert.equal(f.hero.health,100-count);
    f.opponents[1].health=1;f=retargetDestinyRound(win(round(resume(f))),1);f=endDestinyRound(hit(f));assert.equal(f.hero.health,100-count-(count-1));
    f=hit(win(round(make(section,{hero:{brawn:100}}))));assert.equal(f.status,'win');assert.ok(f.opponents.every(o=>o.health===0));
  }
});

test('bone and bloated-body immunities do not inherit unrelated rock immunities',()=>{
  let f=win(round(make('555',{abilities:{piercing:1,bleed:1,venom:1}})));f=useDestinyAbility(f,'piercing');f=hit(f,1);assert.equal(f.opponents[0].health,136);assert.equal(f.effects.some(e=>['bleed','venom'].includes(e.kind)),false);
  f=win(round(make('557',{hero:{brawn:20},abilities:{piercing:1,bleed:1,venom:1}})));assert.throws(()=>useDestinyAbility(f,'piercing'),/immune/);f=hit(f);assert.ok(f.effects.some(e=>e.kind==='bleed'));assert.ok(f.effects.some(e=>e.kind==='venom'));
});

test('Chilblain uses the two printed Armour values without inventing intermediate values',()=>{
  const f=make('564');assert.equal(destinyStat(f,0,'armour'),20);f.opponents[1].health=0;assert.equal(destinyStat(f,0,'armour'),20);
  for(let i=2;i<=4;i++)f.opponents[i].health=0;assert.equal(destinyStat(f,0,'armour'),10);
  f.effects.push({kind:'stat',target:0,attribute:'armour',amount:-2,from:0,until:99,source:'rust'});assert.equal(destinyStat(f,0,'armour'),8);
});

test('ice weakness doubles only the Sear bonus and Fire Aura, while disease and bleeding remain blocked',()=>{
  let f=win(round(make('564',{hero:{brawn:20},abilities:{sear:1,'fire-aura':1,bleed:1,venom:1,disease:1}})));f=useDestinyAbility(f,'sear');f=hit(f);
  assert.equal(f.turn.damageScore,26);assert.equal(f.opponents[0].health,74);assert.equal(f.effects.some(e=>['bleed','venom','disease'].includes(e.kind)),false);
  f=endDestinyRound(f);assert.equal(f.opponents[0].health,72);assert.deepEqual(f.opponents.slice(1).map(o=>o.health),[18,18,18,18]);assert.equal(f.hero.health,26);
});

test('ice weakness doubles ongoing Burn without doubling Ignite damage dice',()=>{
  let f=win(round(make('564',{abilities:{ignite:1,burn:1}})));f=useDestinyAbility(f,'ignite',{},rolls(1,2));assert.equal(f.opponents[0].health,77);assert.deepEqual(f.opponents.slice(1).map(o=>o.health),[17,17,17,17]);
  f=endDestinyRound(f);assert.equal(f.opponents[0].health,75);assert.deepEqual(f.opponents.slice(1).map(o=>o.health),[15,15,15,15]);
});

test('Crazy Hal adds one to a score and this Inferno variant does not silently gain Impale immunity',()=>{
  let f=win(round(make('578',{abilities:{impale:1}})));f=useDestinyAbility(f,'impale');f=hit(f);assert.equal(f.turn.damageScore,11);
});

test('Flay allows eligible rerolls before damage from Speed and spell-damage ones is accepted',()=>{
  let f=round(make('582',{hero:{health:100,maxHealth:100},abilities:{charm:2,cleave:1}}));f=rollDestinySpeed(f,rolls(1,1,1,2));assert.equal(f.hero.health,100);
  f=useDestinyAbility(f,'charm',{die:0},rolls(4));f=resolveDestinySpeed(f);assert.equal(f.hero.health,92);
  f=useDestinyAbility(f,'cleave',{deferDamage:true},rolls(1));assert.equal(f.hero.health,92);f=useDestinyAbility(f,'charm',{die:0},rolls(4));f=resolveDestinyAbilityRoll(f,rolls());assert.equal(f.hero.health,92);assert.equal(f.opponents[0].health,96);
});

test('Kick Start revives once during an accepted hazard and a later fatal roll cannot deal a posthumous attack',()=>{
  let f=round(make('582',{hero:{health:10},abilities:{'kick-start':1,rake:1}}));f=resolveDestinySpeed(rollDestinySpeed(f,rolls(1,1,1,2)));assert.equal(f.hero.health,15);assert.equal(f.used['kick-start'],1);
  f=hit(f,1);assert.equal(f.hero.health,7);f=win(round(endDestinyRound(f)));f=useDestinyAbility(f,'rake',{},rolls(1,1,1));assert.equal(f.status,'loss');assert.equal(f.opponents[0].health,100);
});

test('Malcontent leeches actual health damage after Armour, not damage caused by its crows',()=>{
  let f=make('595',{hero:{speed:0,armour:10,health:100,maxHealth:100}});f.opponents[0].health=50;f=hit(lose(round(f)));assert.equal(f.hero.health,91);assert.equal(f.opponents[0].health,59);
  f=endDestinyRound(f);assert.equal(f.hero.health,87);assert.equal(f.opponents[0].health,59);
});

test('Janna can end an enemy-winning round before the flesh golem rolls damage',()=>{
  let f=round(make('615',{hero:{speed:0}}));f=resolveDestinySpeed(rollDestinySpeed(f,rolls(1,2,6,5)),rolls(2));f=resolveDestinyAbilityRoll(f,rolls());assert.equal(f.phase,'end');assert.equal(f.hero.health,30);assert.equal(f.turn.damageDice,null);
});

test('Dismantle repeatedly replaces a winning attack and never lowers Armour twice in one round',()=>{
  let f=make('625');
  for(const armour of [20,16,12]){f=win(round(f));f=useLegionAction(f,'dismantle',{roster});assert.equal(destinyStat(f,0,'armour'),armour);assert.equal(f.opponents[0].health,50);assert.throws(()=>useLegionAction(f,'dismantle',{roster}),/Replace/);f=endDestinyRound(f);}
});

test('east rods apply to the whole group while preserving printed missing attributes',()=>{
  assert.throws(()=>make('650'),/Choose the rod/);
  let f=make('650',{encounterOptions:{eastRod:'slowing'}});assert.equal(destinyStat(f,0,'speed'),13);assert.equal(f.opponents[1].speed,null);
  f=make('650',{encounterOptions:{eastRod:'enfeeblement'}});assert.equal(destinyStat(f,0,'brawn'),12);assert.equal(f.opponents[1].brawn,null);assert.equal(f.opponents[1].magic,null);
  f=make('650',{encounterOptions:{eastRod:'rending'}});assert.equal(destinyStat(f,0,'armour'),11);assert.equal(destinyStat(f,1,'armour'),6);assert.equal(f.opponents[0].normal.armour,15);
});

test('rod placements require one distinct rod per passage and do not mutate the supplied character',()=>{
  const character={notes:'keep'},placements={north:'enfeeblement',east:'rending',west:'slowing'};
  const f=make('650',{character,encounterOptions:{rodPlacements:placements}});assert.deepEqual(f.character.rodPlacements,placements);assert.deepEqual(character,{notes:'keep'});assert.equal(f.character.notes,'keep');
  assert.throws(()=>make('650',{encounterOptions:{rodPlacements:{...placements,west:'rending'}}}),/different rod/);
});

test('Brothers Grimm counts living companions for score only, using saved survival or explicit choices',()=>{
  let f=hit(win(round(make('653'))));assert.equal(f.turn.damageScore,11);
  f=hit(win(round(make('653',{encounterOptions:{jannaAlive:true,gullAlive:false,laineAlive:false,klaretAlive:false}}))));assert.equal(f.turn.damageScore,8);
  f=make('653',{character:{companions:{janna:{alive:false},gull:{alive:false},laine:{alive:true},klaret:{alive:true}}}});assert.deepEqual(f.encounter.survivingAllies,['laine','klaret']);
  f=useDestinyAbility(win(round(make('653',{abilities:{cleave:1}}))),'cleave',{},rolls(2));assert.equal(f.opponents[0].health,118);
});

test('late enemies block exactly their three forbidden dodges while Lord of Pain applies Disease',()=>{
  for(const section of ['601','653','662'])for(const name of ['sidestep','evade','vanish'])assert.throws(()=>useDestinyAbility(round(make(section,{abilities:{[name]:1}})),name),/unavailable/);
  let f=hit(lose(round(make('627',{hero:{speed:0}}))));const hp=f.hero.health;f=endDestinyRound(f);assert.equal(f.hero.health,hp-2);assert.equal(f.encounter.failureSection,'748');
});
