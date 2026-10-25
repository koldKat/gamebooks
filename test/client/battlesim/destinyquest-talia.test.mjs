import test from 'node:test';
import assert from 'node:assert/strict';
import {createWinterFight} from './destinyquest-fixtures.mjs';
import {startDestinyRound, rollDestinySpeed, resolveDestinySpeed, rollDestinyDamage}
  from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {useDestinyAbility as use} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
const rolls=(...v)=>()=>{assert.ok(v.length,'Unexpected dice');return v.shift();};
const start=abilities=>startDestinyRound(createWinterFight({speed:20,brawn:10,armour:0,health:100},752,{abilities}),0,rolls());

test('initial hero sixes reroll repeatedly until allowed without changing opponent dice',()=>{
  const fight=start({}),before=structuredClone(fight);
  const result=rollDestinySpeed(fight,rolls(6,6,6,6,6,3,4));assert.deepEqual(fight,before);
  assert.deepEqual(result.turn.heroSpeedDice,[3,4]);assert.deepEqual(result.turn.opponentSpeedDice,[6,6]);
  assert.equal(result.history.filter(e=>e.type==='forced-speed-reroll').length,3);
});

test('ordinary non-six rolls do not consume additional dice',()=>{
  assert.deepEqual(rollDestinySpeed(start({}),rolls(2,5,1,3)).turn.heroSpeedDice,[2,5]);
});

test('a voluntarily rerolled hero die must also reroll any resulting sixes',()=>{
  let fight=rollDestinySpeed(start({feint:1}),rolls(1,2,1,3));
  fight=use(fight,'feint',{dice:[0]},rolls(6,6,5));assert.deepEqual(fight.turn.heroSpeedDice,[5,2]);assert.equal(fight.used.feint,1);
});

test('Charm obeys forced speed rerolls and preserves them through saved state',()=>{
  let fight=rollDestinySpeed(start({charm:1}),rolls(1,2,1,3));fight=JSON.parse(JSON.stringify(fight));
  fight=use(fight,'charm',{die:1},rolls(6,4));assert.deepEqual(fight.turn.heroSpeedDice,[1,4]);assert.equal(fight.used.charm,1);
});

test('Agility changes a face without rolling, so its resulting six remains',()=>{
  let fight=rollDestinySpeed(start({agility:1}),rolls(1,2,1,3));fight=use(fight,'agility',{die:0},rolls());
  assert.deepEqual(fight.turn.heroSpeedDice,[6,2]);assert.equal(fight.history.filter(e=>e.type==='forced-speed-reroll').length,0);
});

test('damage dice are unaffected by the speed-only rule',()=>{
  let fight=resolveDestinySpeed(rollDestinySpeed(start({}),rolls(5,5,1,1)));
  fight=rollDestinyDamage(fight,rolls(6));assert.deepEqual(fight.turn.damageDice,[6]);
});

test('invalid and nonterminating random sources reject without mutating the input',()=>{
  const fight=start({}),before=structuredClone(fight);
  assert.throws(()=>rollDestinySpeed(fight,rolls(6,2,1,3,7)),/1-6/);
  assert.throws(()=>rollDestinySpeed(fight,()=>6),/did not produce/);assert.deepEqual(fight,before);
});

test('forced face values are read from editable encounter metadata',()=>{
  const fight=start({});fight.encounter.heroSpeedRerolls.faces=[1,2];
  assert.deepEqual(rollDestinySpeed(fight,rolls(1,6,1,2,2,3)).turn.heroSpeedDice,[3,6]);
});
