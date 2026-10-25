import test from 'node:test';
import assert from 'node:assert/strict';
import {createWinterFight, resolveDestinyAbilityRoll as resolve} from './destinyquest-fixtures.mjs';
import {startDestinyRound, rollDestinySpeed, resolveDestinySpeed, rollDestinyDamage,
  resolveDestinyDamage, endDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {useDestinyAbility as use} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {useDestinyOpening} from '../../../public/js/battlesim/engines/destinyquest/openings.js';

const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected dice');return values.shift();};
const make=(abilities={})=>createWinterFight({speed:20,brawn:30,magic:0,armour:0,health:30,maxHealth:50},548,{abilities});
const attack=fight=>rollDestinyDamage(resolveDestinySpeed(rollDestinySpeed(startDestinyRound(fight,0,rolls()),rolls(6,6,1,1))),rolls(1));
const saved=fight=>JSON.parse(JSON.stringify(fight));

for(const face of [1,2,3,4,5,6])test('Mott first defeat uses saved revival die '+face,()=>{
  const fight=attack(make()),before=structuredClone(fight);
  const pending=resolveDestinyDamage(fight,rolls(face));assert.deepEqual(fight,before);
  assert.equal(pending.status,'active');assert.equal(pending.phase,'ability-rolled');
  assert.deepEqual(pending.turn.pendingAbility.dice,[face]);assert.equal(pending.turn.pendingAbility.event.kind,'revival');
  assert.equal(pending.history.some(row=>row.type==='outcome'),false);
  const result=resolve(saved(pending),rolls());
  assert.equal(result.opponents[0].health,face===1?0:10);
  assert.equal(result.status,face===1?'win':'active');
  assert.equal(result.encounter.revivalChecks[0].used,true);
  assert.throws(()=>resolve(result,rolls()),/No pending/);
});

test('second defeat is final with no additional revival roll or duplicate outcome',()=>{
  let fight=resolve(resolveDestinyDamage(attack(make()),rolls(6)),rolls());
  fight=endDestinyRound(fight,[],rolls());fight=resolveDestinyDamage(attack(fight),rolls());
  assert.equal(fight.status,'win');assert.deepEqual(fight.defeated,[0]);
  assert.equal(fight.history.filter(row=>row.type==='outcome').length,1);
  assert.throws(()=>startDestinyRound(fight,0,rolls()),/unavailable/);
});

test('revival does not trigger final-defeat rewards before the second kill',()=>{
  let fight=resolve(resolveDestinyDamage(attack(make({'malefic-runes':1})),rolls(2)),rolls());
  assert.equal(fight.defeated,undefined);assert.deepEqual(fight.turn.deaths,[]);
  assert.equal(fight.effects.some(row=>row.source==='malefic-runes'),false);
  fight=endDestinyRound(fight,[],rolls());fight=resolveDestinyDamage(attack(fight),rolls());
  assert.equal(fight.effects.filter(row=>row.source==='malefic-runes').length,1);
});

test('failed revival grants final-defeat rewards once',()=>{
  const result=resolve(resolveDestinyDamage(attack(make({'malefic-runes':1})),rolls(1)),rolls());
  assert.deepEqual(result.defeated,[0]);assert.equal(result.effects.filter(row=>row.source==='malefic-runes').length,1);
});

test('opening damage can trigger revival without creating a false death move',()=>{
  let fight=make({'first-blood':1});fight.opponents[0].health=4;
  const before=structuredClone(fight);fight=useDestinyOpening(fight,'first-blood',{target:0},rolls(6));
  assert.equal(before.opponents[0].health,4);assert.equal(fight.phase,'ability-rolled');
  fight=resolve(saved(fight),rolls());assert.equal(fight.phase,'start');assert.deepEqual(fight.turn.deaths,[]);
  assert.equal(startDestinyRound(fight,0,rolls()).round,1);
});

test('combat ability death awaits revival and spends the ability only once',()=>{
  let fight=resolveDestinySpeed(rollDestinySpeed(startDestinyRound(make({cleave:1}),0,rolls()),rolls(6,6,1,1)));fight.opponents[0].health=1;
  fight=use(fight,'cleave',{target:0},rolls(2,4));
  assert.equal(fight.phase,'ability-rolled');assert.equal(fight.used.cleave,1);
  fight=resolve(saved(fight),rolls());assert.equal(fight.opponents[0].health,10);assert.equal(fight.used.cleave,1);
  assert.notEqual(fight.phase,'death-move');
});

test('end-of-round revival resumes the next round without replaying passive damage',()=>{
  let fight=startDestinyRound(make(),0,rolls());fight.phase='end';fight.opponents[0].health=1;
  fight=endDestinyRound(fight,[{target:0,amount:1,ignoreArmour:true,source:'test'}],rolls(2));
  assert.equal(fight.phase,'ability-rolled');fight=resolve(saved(fight),rolls());
  assert.equal(fight.phase,'start');assert.equal(fight.opponents[0].health,10);
  fight=startDestinyRound(fight,0,rolls());assert.equal(fight.round,2);assert.equal(fight.opponents[0].health,10);
  assert.equal(fight.history.filter(row=>row.type==='passive').length,1);
});

test('simultaneous player death remains a loss without an unnecessary revival roll',()=>{
  let fight=startDestinyRound(make(),0,rolls());fight.phase='end';fight.opponents[0].health=1;fight.hero.health=1;
  fight=endDestinyRound(fight,[{target:0,amount:1,ignoreArmour:true},{target:'hero',amount:1,ignoreArmour:true}],rolls());
  assert.equal(fight.status,'loss');assert.equal(fight.encounter.revivalChecks[0].used,undefined);
});

test('custom metadata controls the threshold and restored health',()=>{
  let fight=attack(make());Object.assign(fight.encounter.revivalChecks[0],{minimum:5,health:7});
  fight=resolve(resolveDestinyDamage(fight,rolls(5)),rolls());assert.equal(fight.opponents[0].health,7);
  fight=attack(make());Object.assign(fight.encounter.revivalChecks[0],{minimum:5,health:7});
  fight=resolve(resolveDestinyDamage(fight,rolls(4)),rolls());assert.equal(fight.status,'win');
});

test('failed revival offers a death move when another opponent remains',()=>{
  let fight=make();fight.opponents.push(structuredClone(fight.opponents[0]));
  fight=resolve(resolveDestinyDamage(attack(fight),rolls(1)),rolls());
  assert.equal(fight.status,'active');assert.equal(fight.phase,'death-move');assert.deepEqual(fight.turn.deaths,[0]);
});

test('end-of-round failure preserves the next-round boundary through a death move',()=>{
  let fight=make();fight.opponents.push(structuredClone(fight.opponents[0]));
  fight=startDestinyRound(fight,0,rolls());fight.phase='end';fight.opponents[0].health=1;
  fight=resolve(endDestinyRound(fight,[{target:0,amount:1,ignoreArmour:true}],rolls(1)),rolls());
  assert.equal(fight.phase,'death-move');assert.equal(fight.turn.afterDeathMove,'start');
});

test('a deferred ability roll resolves before revival without losing either saved roll',()=>{
  let fight=resolveDestinySpeed(rollDestinySpeed(startDestinyRound(make({cleave:1}),0,rolls()),rolls(6,6,1,1)));
  fight.opponents[0].health=1;fight=use(fight,'cleave',{target:0,deferDamage:true},rolls(2));
  assert.equal(fight.turn.pendingAbility.type,'damage');
  fight=resolve(saved(fight),rolls(5));assert.equal(fight.turn.pendingAbility.event.kind,'revival');
  assert.deepEqual(fight.turn.pendingAbility.dice,[5]);fight=resolve(saved(fight),rolls());
  assert.equal(fight.opponents[0].health,10);assert.equal(fight.used.cleave,1);assert.equal(fight.phase,'end');
});

test('two revival checks queue separately without overwriting the first saved die',()=>{
  let fight=make();fight.opponents.push(structuredClone(fight.opponents[0]));
  fight.encounter.revivalChecks.push({...fight.encounter.revivalChecks[0],target:1});
  fight=startDestinyRound(fight,0,rolls());fight.phase='end';fight.opponents.forEach(o=>o.health=1);
  fight=endDestinyRound(fight,[{target:0,amount:1,ignoreArmour:true},{target:1,amount:1,ignoreArmour:true}],rolls(2));
  assert.equal(fight.turn.pendingAbility.event.target,0);
  fight=resolve(saved(fight),rolls(3));assert.equal(fight.opponents[0].health,10);
  assert.equal(fight.turn.pendingAbility.event.target,1);assert.deepEqual(fight.turn.pendingAbility.dice,[3]);
  fight=resolve(saved(fight),rolls());assert.equal(fight.opponents[1].health,10);assert.equal(fight.phase,'start');
});
