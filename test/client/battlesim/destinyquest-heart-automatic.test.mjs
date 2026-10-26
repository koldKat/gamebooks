import test from 'node:test';
import assert from 'node:assert/strict';
import {HEART_ABILITIES as catalog} from '../../../public/js/battlesim/engines/destinyquest/heart-abilities.js';
import {createDestinyFight,startDestinyRound,rollDestinySpeed,resolveDestinySpeed,rollDestinyDamage,resolveDestinyDamage,endDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {configureDestinyAbilities,useDestinyAbility as use} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {resolveDestinyAbilityRoll as resolve,finishDestinyAbilityAction} from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';
import {chooseDestinyAutomaticModifier as choose} from '../../../public/js/battlesim/engines/destinyquest/automatic-modifiers.js';
import {setDestinyPassiveActivation as activate} from '../../../public/js/battlesim/engines/destinyquest/ability-quota.js';
import {destinyStat} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
const clone=f=>JSON.parse(JSON.stringify(f));
function setup(abilities){return configureDestinyAbilities(createDestinyFight({speed:20,brawn:4,magic:0,armour:0,health:10,maxHealth:30},[{name:'Opponent',speed:0,brawn:0,armour:0,health:200}]),abilities,{}, {catalog,bookRules:{deathMoves:false,deathPenalties:false}});}
const start=abilities=>startDestinyRound(setup(abilities),0);
const win=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(6,5,1,2)));
const complete=f=>endDestinyRound(resolveDestinyDamage(rollDestinyDamage(f,rolls(1))));

test('Gorilla Rage rolls for every played combat ability and a six grants a permanent chosen attribute',()=>{
  let f=use(win(start({'gorilla-rage':1,'deep-wound':1,compulsion:1})),'deep-wound',{},rolls(6));
  assert.equal(f.turn.pendingAbility.name,'gorilla-rage');assert.equal(f.turn.pendingAbility.stage,'effect');
  f=resolve(clone(f),rolls());assert.equal(f.phase,'ability-choice');
  f=choose(clone(f),'magic');assert.equal(f.phase,'damage');assert.equal(destinyStat(f,'hero','magic'),1);
  f=endDestinyRound(resolveDestinyDamage(rollDestinyDamage(f,rolls(1,2))));
  f=win(startDestinyRound(f,0));f=use(f,'compulsion',{},rolls(6));
  f=choose(resolve(f,rolls()),'brawn');assert.equal(destinyStat(f,'hero','brawn'),5);assert.equal(destinyStat(f,'hero','magic'),1);
});

test('failed Gorilla Rage effect rolls grant nothing, and six choices can be declined without spending an active charge',()=>{
  let f=use(win(start({'gorilla-rage':1,'deep-wound':1})),'deep-wound',{},rolls(5));
  f=resolve(f,rolls());assert.equal(f.phase,'damage');assert.equal(destinyStat(f,'hero','brawn'),4);
  f=use(win(start({'gorilla-rage':1,'deep-wound':1})),'deep-wound',{},rolls(6));
  f=resolve(f,rolls());assert.throws(()=>choose(f,'armour'),/allowed attribute/);
  f=choose(f,null);assert.equal(destinyStat(f,'hero','brawn'),4);assert.equal(f.used['gorilla-rage'],undefined);
});

test('Gorilla Rage must pass Elysium before its effect die is rolled and failure blocks only that modifier for the round',()=>{
  let f=use(win(start({'gorilla-rage':1,'elysium-soaked':1,'deep-wound':1})),'deep-wound',{},rolls(1));
  assert.equal(f.turn.pendingAbility.stage,'status');f=resolve(clone(f),rolls());
  assert.equal(f.phase,'damage');assert.deepEqual(f.turn.failedAbilities,['gorilla-rage']);
  f=use(win(start({'gorilla-rage':1,'elysium-soaked':1,'deep-wound':1})),'deep-wound',{},rolls(2));
  f=resolve(f,rolls(6));assert.equal(f.turn.pendingAbility.stage,'effect');
  f=choose(resolve(f,rolls()),'brawn');assert.equal(destinyStat(f,'hero','brawn'),5);
});

test('Faith healing waits for its own Elysium check and resumes the original Speed roll across save',()=>{
  for(const check of [1,2]){
    let f=rollDestinySpeed(start({faith:1,'elysium-soaked':1}),rolls(3,3,1,2,check));
    assert.equal(f.hero.health,10);assert.equal(f.phase,'ability-rolled');assert.equal(f.turn.pendingAbility.name,'faith');
    f=resolve(clone(f),rolls());assert.equal(f.hero.health,check===1?10:12);assert.equal(f.phase,'speed-rolled');
    assert.deepEqual(f.turn.heroSpeedDice,[3,3]);f=resolveDestinySpeed(f);assert.equal(f.turn.winner,'hero');
  }
});

test('automatic effects suspend deferred combat damage without changing its caster or dice',()=>{
  let f=use(win(start({'gorilla-rage':1,trample:1})),'trample',{deferDamage:true},rolls(1,2,3,6));
  assert.equal(f.turn.pendingAbility.type,'automatic-modifier');assert.equal(f.turn.pendingAbility.suspendedAbility.type,'damage');
  f=resolve(f,rolls());const before=clone(f);
  f=choose(f,'brawn');assert.equal(f.turn.pendingAbility.type,'damage');assert.deepEqual(f.turn.pendingAbility.groups[0].dice,[1,2,3]);
  f.turn.pendingAbility.groups[0].dice[0]=4;assert.deepEqual(before.turn.pendingAbility.suspendedAbility.groups[0].dice,[1,2,3]);
  f=resolve(f,rolls());assert.equal(f.opponents[0].health,191);assert.equal(f.phase,'end');
});

test('Hexed requires Gorilla Rage selection and automatic activations do not take another distinct slot',()=>{
  let f=win(start({hexed:1,'gorilla-rage':1,'deep-wound':1}));
  f=use(f,'deep-wound',{},rolls());assert.equal(f.turn.pendingAbility,undefined);
  f=setup({hexed:1,'gorilla-rage':1,'deep-wound':1});f=activate(f,'gorilla-rage');
  f=use(win(startDestinyRound(f,0)),'deep-wound',{},rolls(6));f=choose(resolve(f,rolls()),'brawn');
  assert.deepEqual(f.abilityQuota.used,['gorilla-rage','deep-wound']);
});

test('a failed Faith check prevents another check or healing from a second doubles roll that round',()=>{
  let f=rollDestinySpeed(start({faith:1,'elysium-soaked':1,compulsion:1}),rolls(3,3,1,2,1));
  f=resolve(f,rolls());f=use(resolveDestinySpeed(f),'compulsion');
  f=rollDestinyDamage(f,rolls(2,2));assert.equal(f.phase,'damage-rolled');assert.equal(f.hero.health,10);
});
