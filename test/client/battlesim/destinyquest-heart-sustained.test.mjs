import test from 'node:test';
import assert from 'node:assert/strict';
import {HEART_ABILITIES as catalog} from '../../../public/js/battlesim/engines/destinyquest/heart-abilities.js';
import {createDestinyFight,startDestinyRound,rollDestinySpeed,resolveDestinySpeed,rollDestinyDamage,resolveDestinyDamage,endDestinyRound,continueDestinyCombat} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {configureDestinyAbilities,useDestinyAbility as use} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {continueDestinySustainedDamage as repeat,removeDestinyCombatStance as remove} from '../../../public/js/battlesim/engines/destinyquest/sustained.js';
import {resolveDestinyAbilityRoll as resolve} from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';
import {setDestinyPassiveActivation as activate} from '../../../public/js/battlesim/engines/destinyquest/ability-quota.js';
import {destinyStat} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
const clone=f=>JSON.parse(JSON.stringify(f));
function setup(extra={}){
  return configureDestinyAbilities(createDestinyFight({speed:20,brawn:4,magic:0,armour:0,health:30},[{name:'Opponent',speed:0,brawn:0,armour:80,health:200}]),{'stone-rain':1,'stone-skin':1,...extra},{},{catalog,bookRules:{deathMoves:false,deathPenalties:false}});
}
const win=f=>resolveDestinySpeed(rollDestinySpeed(startDestinyRound(f,0),rolls(6,5,1,2)));
const first=extra=>use(win(setup(extra)),'stone-rain',{},rolls(2));

test('Stone Rain advances one, two, four armourless dice in consecutive wins and cannot be cast twice',()=>{
  let f=first();assert.equal(f.opponents[0].health,198);
  f=repeat(win(endDestinyRound(clone(f))),{},rolls(2,3));assert.equal(f.opponents[0].health,193);
  f=repeat(win(endDestinyRound(clone(f))),{},rolls(1,2,3,4));assert.equal(f.opponents[0].health,183);
  assert.equal(f.used['stone-rain'],1);assert.equal(f.turn.used.co,true);
  f=win(endDestinyRound(clone(f)));
  assert.throws(()=>repeat(f,{},rolls()),/No consecutive/);
  assert.throws(()=>use(f,'stone-rain',{},rolls()),/no uses left/);
});

test('another modifier or newly activated passive ends Stone Rain while existing passive ticks do not',()=>{
  let f=endDestinyRound(first({barbs:1,wisdom:1}));assert.equal(f.opponents[0].health,197);
  f=startDestinyRound(f,0);f=use(f,'wisdom');assert.equal(f.sustainedDamage,undefined);
  f=resolveDestinySpeed(rollDestinySpeed(f,rolls(6,5,1,2)));assert.throws(()=>repeat(f,{},rolls()),/No consecutive/);
  f=endDestinyRound(first({hexed:1,barbs:1}));f=activate(f,'barbs');assert.equal(f.sustainedDamage,undefined);
});

test('a triggered automatic healing modifier interrupts Stone Rain on doubles',()=>{
  let f=startDestinyRound(endDestinyRound(first({faith:1})),0);f.hero.health=20;
  f=rollDestinySpeed(f,rolls(3,3,1,2));
  assert.equal(f.hero.health,22);assert.equal(f.sustainedDamage,undefined);
});

test('losing, a standoff, a different opponent or choosing ordinary damage cannot continue the chain',()=>{
  for(const mode of ['loss','tie','target','normal']){
    let f=endDestinyRound(first());
    if(mode==='loss')f.opponents[0].speed=100;
    if(mode==='tie')f.opponents[0].speed=20;
    if(mode==='target')f.opponents.push({...f.opponents[0],name:'Other'});
    f=startDestinyRound(f,mode==='target'?1:0);
    f=resolveDestinySpeed(rollDestinySpeed(f,mode==='tie'?rolls(1,2,1,2):rolls(6,5,1,2)));
    if(mode==='normal')f=rollDestinyDamage(f,rolls(1));
    assert.equal(f.sustainedDamage,undefined);
    assert.throws(()=>repeat(f,{},rolls()),/No consecutive/);
  }
});

test('continued rain retains separate pending dice for modifiers and save/resume, but another modifier ends future repeats',()=>{
  let f=repeat(win(endDestinyRound(first({charm:1}))),{deferDamage:true},rolls(1,2));
  assert.equal(f.phase,'ability-rolled');assert.equal(f.turn.pendingAbility.groups[0].dice.length,2);
  f=use(clone(f),'charm',{die:0},rolls(6));assert.equal(f.sustainedDamage,undefined);
  f=resolve(clone(f),rolls());assert.equal(f.opponents[0].health,190);assert.equal(f.phase,'end');
});

test('Stone Skin costs the winning damage roll, lowers Speed, blocks other abilities and permits Trample',()=>{
  let f=use(win(setup({trample:1,wisdom:1})),'stone-skin');
  assert.equal(f.phase,'end');assert.equal(f.opponents[0].health,200);assert.equal(destinyStat(f,'hero','speed'),18);
  f=win(endDestinyRound(clone(f)));
  assert.throws(()=>use(f,'wisdom'),/stance blocks/);
  f=use(f,'trample',{},rolls(1,2,3));assert.equal(f.opponents[0].health,194);assert.equal(f.phase,'end');
});

test('Stone Skin defense avoids enemy damage on one/two and permits normal damage on three/six',()=>{
  for(const face of [1,2,3,6]){
    let f=endDestinyRound(use(win(setup()),'stone-skin'));f.opponents[0].speed=100;f.opponents[0].brawn=3;
    f=resolveDestinySpeed(rollDestinySpeed(startDestinyRound(f,0),rolls(6,5,1,2)),rolls(face));
    assert.equal(f.turn.pendingAbility.type,'stance-defense');
    f=resolve(clone(f),rolls());assert.equal(f.phase,face<=2?'end':'damage');
    if(face>2)f=resolveDestinyDamage(rollDestinyDamage(f,rolls(2)));
    assert.equal(f.hero.health,face<=2?30:25);
  }
});

test('Stone Skin keeps existing passive effects, suppresses new modifiers and ends only by forgoing a winning score',()=>{
  let f=use(win(setup({bleed:1,barbs:1,faith:1,hexed:1})),'stone-skin');
  assert.throws(()=>activate(f,'barbs'),/stance blocks/);
  f.effects.push({kind:'bleed',target:0,amount:1,from:1,until:100});
  f=endDestinyRound(f);assert.equal(f.opponents[0].health,199);
  assert.throws(()=>remove(f),/Win a round/);
  f=win(clone(f));f=remove(f);assert.equal(f.phase,'end');assert.equal(f.opponents[0].health,199);
  assert.equal(destinyStat(f,'hero','speed'),20);assert.equal(f.combatStance,undefined);
  f=win(endDestinyRound(f));assert.throws(()=>use(f,'stone-skin'),/no uses left/);
});

test('an intercepted and cancelled ability still breaks Stone Rain because the attempted ability was played',()=>{
  let f=startDestinyRound(endDestinyRound(first({wisdom:1})),0);
  f.encounter={abilityInterception:{name:'Interception',target:0,categories:['mo'],dice:1,cancelMaximum:2}};
  f=use(f,'wisdom',{},rolls(1));assert.ok(f.sustainedDamage);
  f=resolve(clone(f),rolls());assert.equal(f.used.wisdom,1);assert.equal(f.sustainedDamage,undefined);
});

test('separate combats clear active stances, damage chains and persistent score rerolls with their charges',()=>{
  let f=setup();f.opponents.push({...f.opponents[0],name:'Next opponent'});
  f.encounter={consecutiveCombats:{index:0,targets:[0,1]},inactiveTargets:[1]};
  f.phase='between-combats';f.used={'stone-skin':1};
  f.combatStance={name:'stone-skin',allowedAbilities:['trample'],passives:[]};
  f.sustainedDamage={name:'stone-rain',target:0,round:1,index:0};f.scoreRerollAbility='bright-spark';
  f=continueDestinyCombat(clone(f));
  assert.equal(f.combatStance,undefined);assert.equal(f.sustainedDamage,undefined);assert.equal(f.scoreRerollAbility,undefined);assert.deepEqual(f.used,{});
});
