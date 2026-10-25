import test from 'node:test';
import assert from 'node:assert/strict';
import {createWinterFight, resolveDestinyAbilityRoll as resolve} from './destinyquest-fixtures.mjs';
import {startDestinyRound, rollDestinySpeed, resolveDestinySpeed, endDestinyRound}
  from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {useDestinyAbility as use, resolveDestinyGambit} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {hasDestinyAbility, destinyStat} from '../../../public/js/battlesim/engines/destinyquest/effects.js';

const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected dice');return values.shift();};
const make=(abilities={},extra={})=>createWinterFight({speed:20,brawn:10,armour:99,health:30,maxHealth:50,...extra},601,{abilities});
const start=(abilities={},extra={})=>startDestinyRound(make(abilities,extra),0,rolls());
const save=fight=>JSON.parse(JSON.stringify(fight));

for(const face of [1,2,3,4,5,6])test('Daring duellist follows printed cancellation face '+face,()=>{
  const fight=start({charge:1}),before=structuredClone(fight);let result=use(fight,'charge',{},rolls(face));
  assert.deepEqual(fight,before);result=resolve(save(result),face<=2?rolls(5):rolls());
  assert.equal(result.used.charge,1);assert.equal(result.turn.used.sp,true);
  if(face<=2){
    assert.equal(result.phase,'ability-rolled');assert.deepEqual(result.turn.pendingAbility.dice,[5]);
    assert.equal(result.hero.health,30);assert.equal(hasDestinyAbility(result,'charge'),false);
    result=resolve(save(result),rolls());assert.equal(result.hero.health,25);assert.equal(destinyStat(result,'hero','speed'),20);
  }else{assert.equal(result.phase,'speed');assert.equal(result.hero.health,30);assert.equal(destinyStat(result,'hero','speed'),22);}
});

test('deflected abilities cannot be restored by Gambit or reused in later rounds',()=>{
  let fight=resolve(resolve(use(start({charge:1}),'charge',{},rolls(1)),rolls(1)),rolls());
  fight.phase='end';fight=endDestinyRound(fight,[],rolls());fight=startDestinyRound(fight,0,rolls());
  fight.used.charge=0;assert.throws(()=>use(fight,'charge',{},rolls()),/unavailable/);
  fight.phase='ability-choice';fight.turn.pendingAbility={name:'gambit-restore',returnPhase:'end'};fight.used.charge=1;
  assert.throws(()=>resolveDestinyGambit(fight,'charge'),/used speed or modifier/);
});

test('combat deflection preserves ordinary damage while suppressing the cancelled effect',()=>{
  let fight=resolveDestinySpeed(rollDestinySpeed(start({'deep-wound':1}),rolls(6,6,1,1)));
  fight=resolve(use(fight,'deep-wound',{},rolls(2)),rolls(4));fight=resolve(save(fight),rolls());
  assert.equal(fight.phase,'damage');assert.equal(fight.turn.extraDamageDice,undefined);assert.equal(fight.hero.health,26);
  assert.equal(hasDestinyAbility(fight,'deep-wound'),false);
});

test('modifiers and passives remain usable without an interception check',()=>{
  let fight=use(start({cunning:1}),'cunning',{},rolls());assert.equal(fight.phase,'speed');assert.equal(destinyStat(fight,'hero','brawn'),13);
  fight=use(make({'first-blood':1}),'first-blood',{target:0},rolls());assert.equal(fight.opponents[0].health,56);
});

test('retaliation can kill an armoured hero and cannot be resolved twice',()=>{
  let fight=resolve(use(start({charge:1},{health:2}),'charge',{},rolls(1)),rolls(6));
  fight=resolve(save(fight),rolls());assert.equal(fight.hero.health,0);assert.equal(fight.status,'loss');
  assert.equal(fight.history.filter(e=>e.type==='outcome').length,1);assert.throws(()=>resolve(fight,rolls()),/No pending/);
});

test('retaliation can trigger Lightning against the actual hunter once',()=>{
  let fight=start({charge:1,lightning:1});fight.restoreOnVictory=false;fight.opponents[0].health=2;
  fight=resolve(use(fight,'charge',{},rolls(1)),rolls(3));fight=resolve(fight,rolls());
  assert.equal(fight.hero.health,27);assert.equal(fight.opponents[0].health,0);assert.equal(fight.status,'win');
});

test('Watchful edits the opponent retaliation die while Charm remains restricted to hero dice',()=>{
  let fight=resolve(use(start({charge:1,charm:1,watchful:1}),'charge',{},rolls(1)),rolls(6));
  assert.throws(()=>use(fight,'charm',{die:0},rolls()),/hero die/);
  fight=use(fight,'watchful',{die:0},rolls());fight=resolve(save(fight),rolls());
  assert.equal(fight.hero.health,29);assert.equal(fight.used.charge,1);assert.equal(fight.used.watchful,1);assert.equal(fight.used.charm,undefined);
});

test('retaliation preserves a suspended incoming attack roll and resumes it after damage',()=>{
  let fight=resolveDestinySpeed(rollDestinySpeed(start({command:1},{speed:0}),rolls(1,1,6,6)));
  const pending={type:'encounter',name:'Saved attack',event:{kind:'damage-if-low',limit:2,amount:5,attackChoice:true},dice:[4],returnPhase:'damage'};
  fight.phase='ability-rolled';fight.turn.pendingAbility=pending;
  fight=resolve(use(fight,'command',{},rolls(1)),rolls(3));
  assert.deepEqual(fight.turn.pendingAbility.suspendedAbility,pending);
  fight=resolve(save(fight),rolls());assert.deepEqual(fight.turn.pendingAbility,pending);assert.equal(fight.hero.health,27);
  fight=resolve(fight,rolls());assert.equal(fight.phase,'damage');assert.equal(fight.turn.winner,'opponent');
});

test('a lethal activation cost does not generate a needless retaliation roll',()=>{
  let fight=resolveDestinySpeed(rollDestinySpeed(start({'dark-pact':1},{health:4}),rolls(6,6,1,1)));
  fight=resolve(use(fight,'dark-pact',{},rolls(2)),rolls());assert.equal(fight.status,'loss');assert.equal(fight.hero.health,0);
});
