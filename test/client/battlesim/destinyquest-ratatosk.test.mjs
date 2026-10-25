import test from 'node:test';
import assert from 'node:assert/strict';
import {createWinterFight, resolveDestinyAbilityRoll as resolve} from './destinyquest-fixtures.mjs';
import {startDestinyRound, retargetDestinyRound, rollDestinySpeed, endDestinyRound, skipDestinyDeathMove, settleDestinyFight}
  from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {destinyStrike} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
import {useDestinyAbility as use} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';

const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected dice');return values.shift();};
const make=(abilities={})=>createWinterFight({speed:20,brawn:30,armour:99,health:100,maxHealth:100},597,{abilities});
const saved=fight=>JSON.parse(JSON.stringify(fight));
const next=fight=>{fight.phase='end';let r=endDestinyRound(fight,[],rolls());if(r.phase==='death-move')r=skipDestinyDeathMove(r);return r;};

for(const face of [1,2,3,4,5,6])test('saved summon roll '+face+' produces the printed number of saplings',()=>{
  const fight=make(),before=structuredClone(fight),pending=startDestinyRound(fight,0,rolls(face));
  assert.deepEqual(fight,before);assert.equal(pending.phase,'ability-rolled');assert.equal(pending.opponents.length,2);
  assert.deepEqual(pending.turn.pendingAbility.dice,[face]);assert.throws(()=>rollDestinySpeed(pending,rolls()),/unavailable/);
  const result=resolve(saved(pending),rolls());assert.equal(result.phase,'speed');assert.equal(result.round,1);
  assert.equal(result.opponents.length,face<=2?4:3);assert.equal(result.encounter.endEffects.length,face<=2?3:2);
  for(const actor of result.opponents.slice(2))assert.deepEqual(
    [actor.name,actor.speed,actor.magic,actor.armour,actor.health,actor.damageStat],['Shadow sapling',5,4,1,5,'magic']);
  assert.throws(()=>resolve(result,rolls()),/No pending/);
});

test('newborn saplings are independently selectable before the speed roll',()=>{
  let fight=resolve(startDestinyRound(make(),0,rolls(1)),rolls());
  fight=retargetDestinyRound(fight,3);assert.equal(fight.target,3);
  destinyStrike(fight,3,5,'test');assert.equal(fight.opponents[2].health,5);assert.equal(fight.opponents[1].health,5);
});

test('all living saplings inflict armour-ignoring damage each round',()=>{
  let fight=resolve(startDestinyRound(make(),0,rolls(1)),rolls());fight=next(fight);
  assert.equal(fight.hero.health,97);
  fight=resolve(startDestinyRound(fight,0,rolls(6)),rolls());assert.equal(fight.opponents.length,5);
  fight=next(fight);assert.equal(fight.hero.health,93);
});

test('defeated saplings stop contributing while surviving offspring remain independent',()=>{
  let fight=resolve(startDestinyRound(make(),0,rolls(1)),rolls());destinyStrike(fight,2,5,'test');fight=next(fight);
  assert.equal(fight.hero.health,98);assert.equal(fight.opponents[3].health,5);
});

test('Ratatosk death stops summons but existing saplings must still be defeated',()=>{
  let fight=resolve(startDestinyRound(make(),0,rolls(6)),rolls());destinyStrike(fight,0,100,'test');
  settleDestinyFight(fight,rolls());assert.equal(fight.status,'active');fight=next(fight);
  assert.equal(fight.hero.health,98);fight=startDestinyRound(saved(fight),1,rolls());
  assert.equal(fight.phase,'speed');assert.equal(fight.opponents.length,3);
  destinyStrike(fight,1,5,'test');destinyStrike(fight,2,5,'test');settleDestinyFight(fight,rolls());
  assert.equal(fight.status,'win');assert.equal(fight.history.filter(h=>h.type==='outcome').length,1);
});

test('Charm edits the saved summon die and the result is applied only once',()=>{
  let fight=startDestinyRound(make({charm:1}),0,rolls(1));fight=use(fight,'charm',{die:0},rolls(6));
  fight=resolve(saved(fight),rolls());assert.equal(fight.opponents.length,3);assert.equal(fight.used.charm,1);
});

test('invalid starts and dice leave input unchanged without adding saplings',()=>{
  const fight=make(),before=structuredClone(fight);
  assert.throws(()=>startDestinyRound(fight,9,rolls()),/living/);
  assert.throws(()=>startDestinyRound(fight,0,()=>7),/1-6/);assert.deepEqual(fight,before);
});

test('source requirement skips the roll if the summoner is already defeated',()=>{
  const fight=make();fight.opponents[0].health=0;
  const result=startDestinyRound(fight,1,rolls());assert.equal(result.phase,'speed');assert.equal(result.opponents.length,2);
});

test('summon metadata controls both count branches and spawned attributes',()=>{
  const fight=make(),rule=fight.encounter.startTests[0];Object.assign(rule,{limit:4,lowCount:3,highCount:2});
  rule.opponent.health=7;rule.opponent.name='Edited seedling';rule.endDamage=2;
  const result=resolve(startDestinyRound(fight,0,rolls(4)),rolls());assert.equal(result.opponents.length,5);
  assert.equal(result.opponents[4].health,7);assert.equal(result.opponents[4].name,'Edited seedling');
  assert.equal(next(result).hero.health,93);
});
