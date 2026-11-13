import test from 'node:test';
import assert from 'node:assert/strict';
import {startFight, combatAction} from '../../../public/js/battlesim/engines/round-checks/combat.js';

const hero = {merc:3, mouth:4, focus:3};
const round = (target = 9, stats = ['merc'], extra = {}) => ({dice:2, target, stats, ...extra});
const start = (rounds, rules = {}, options = {}, player = hero) => startFight(player, {name:'Synthetic encounter', rounds, rules}, options);
const act = (fight, kind, values = {}) => combatAction(fight, {kind, expectedRevision:fight.revision, ...values});
const resolve = (fight, playerDice, enemyDice) => act(act(fight, 'roll', {playerDice, enemyDice}), 'resolve');

test('mixed dice and previous wins affect only their printed rounds', () => {
  let f = start([round(9), round(13, ['mouth'], {winsBonus:3}), round(20, ['merc','focus'], {dice:3})], {goal:{kind:'atLeast', wins:2}});
  f = resolve(f, [3,3]); f = resolve(f, [3,3]); f = resolve(f, [6,6,6]);
  assert.deepEqual(f.rounds.map(row => row.total), [9,13,24]);
  assert.equal(f.result, 'win'); assert.equal(f.status, 'fighting');
  assert.equal(act(f, 'finish').status, 'win');
});
test('an early victory does not consume another round or allow more dice', () => {
  let f = start([round(9), round(10)], {stopOnWin:true, goal:{kind:'atLeast', wins:1}});
  f = resolve(f, [3,3]); assert.equal(f.round, 1); assert.equal(f.result, 'win');
  assert.throws(() => act(f, 'roll', {playerDice:[6,6]}));
});
test('Palmetto damage changes Merc before later rolls, while his guard bonus starts after round two', () => {
  let f = start([
    round(5, ['focus'], {dice:1, lossChanges:{merc:-3}}),
    round(17, ['merc','focus'], {dice:3}),
    round(11, ['merc'], {bonusFromRound:1, bonus:2}),
    round(9, ['merc'], {bonusFromRound:1, bonus:2}),
  ], {goal:{kind:'atLeast', wins:3}});
  f = resolve(f, [1]); assert.equal(f.player.merc, 0);
  f = resolve(f, [6,6,6]); assert.equal(f.rounds[1].total, 21);
  f = resolve(f, [2,3]); assert.equal(f.rounds[2].total, 7);
  f = resolve(f, [3,4]); assert.equal(f.rounds[3].total, 9);
  assert.equal(f.result, 'loss');
});
test('only the final horror roll decides the result and includes previous victories', () => {
  let f = start([round(14, ['focus','focus']), round(15, ['merc','mouth']),
    round(15, ['merc'], {params:{chaos:1}}), round(5, [], {dice:1, winsBonus:1})],
  {goal:{kind:'last'}}, {params:{chaos:8}});
  f = resolve(f, [1,1]); f = resolve(f, [4,4]); f = resolve(f, [3,3]); f = resolve(f, [3]);
  assert.deepEqual(f.rounds.map(row => row.won), [false,true,true,true]); assert.equal(f.result, 'win');
});
test('opposed caps, min/max stat selection and losing ties preserve the Octopus rules', () => {
  let f = start([
    round(0, ['focus'], {opposed:{dice:2, bonus:2, cap:12}}),
    round(0, ['focus','mouth'], {select:'max', opposed:{dice:2, bonus:4, cap:13}}),
    round(0, ['focus','merc'], {select:'min', opposed:{dice:2, bonus:6, cap:11}}),
  ], {goal:{kind:'always'}, choiceEffect:{when:{lossesMin:2}, fields:['merc','mouth','focus'], amount:-2}}, {}, {...hero, merc:2});
  f = resolve(f, [6,3], [6,6]); f = resolve(f, [6,4], [6,6]); f = resolve(f, [6,3], [6,6]);
  assert.deepEqual(f.rounds.map(row => row.target), [12,13,11]);
  assert.deepEqual(f.rounds.map(row => row.won), [false,true,false]);
  assert.throws(() => act(f, 'finish'));
  f = act(f, 'choose', {stat:'focus'}); assert.equal(f.player.focus, 1);
  assert.throws(() => act(f, 'choose', {stat:'focus'})); assert.equal(act(f, 'finish').status, 'win');
});
test('negative current stats and derived guard targets are not clamped', () => {
  let f = start([round(3, ['merc'], {targetParameter:'guards', targetFactor:2}),
    round(0, ['merc'], {targetParameter:'guards', targetFactor:2})],
  {goal:{kind:'atLeast', wins:1}}, {params:{guards:5}}, {...hero, merc:-2});
  f = resolve(f, [6,6]); assert.equal(f.rounds[0].target, 13); assert.equal(f.rounds[0].total, 10);
  f = resolve(f, [6,6]); assert.equal(f.rounds[1].target, 10); assert.equal(f.result, 'win');
});
test('per-loss costs differ from a single penalty and the printed postfight minimum runs last', () => {
  const rules = {goal:{kind:'manual'}, finishEffects:[
    {when:{lossesMin:1, parameter:{name:'alert', max:2}}, changes:{merc:-1}},
    {when:{lossesMin:1, parameter:{name:'alert', min:3}}, perLossChanges:{merc:-1}},
  ]};
  for (const [alert, merc] of [[2,2], [3,1]]) {
    let f = start([round(20), round(20)], rules, {params:{alert}});
    f = resolve(f, [1,1]); f = resolve(f, [1,1]); assert.equal(f.player.merc, merc);
  }
  let f = start([round(20)], {goal:{kind:'always'}, finishEffects:[{changes:{merc:-4}}], minimums:{merc:1}});
  f = resolve(f, [1,1]); assert.equal(f.player.merc, 1);
});
test('Caltrop adds once to the player total, not each die or the opposed roll', () => {
  let f = start([round(0, ['merc'], {opposed:{dice:2, bonus:2, cap:12}})], {goal:{kind:'last'}}, {caltrop:true});
  f = resolve(f, [3,3], [3,3]); assert.equal(f.rounds[0].total, 11); assert.equal(f.rounds[0].target, 8);
  assert.equal(start([round()]).items.caltrop, false);
});
test('Time Grenade supplies exactly two won rounds and expires with the fight', () => {
  let f = start([round(99), round(99), round(99)], {goal:{kind:'atLeast', wins:2}}, {timeGrenade:true});
  f = act(f, 'grenade'); f = act(f, 'grenade'); assert.equal(f.items.grenade, 0);
  assert.throws(() => act(f, 'grenade')); f = resolve(f, [1,1]); assert.equal(f.result, 'win');
  assert.equal(start([round()]).items.grenade, 0);
});
test('Creepy Ball changes one chosen pending die once and the result then uses that die', () => {
  let f = start([round(10)], {goal:{kind:'last'}}, {creepyBall:true});
  f = act(f, 'roll', {playerDice:[1,1]}); f = act(f, 'creepyBall', {side:'player', index:0});
  assert.deepEqual(f.pending.player, [6,1]); assert.equal(f.items.creepyBall, 0);
  assert.throws(() => act(f, 'creepyBall', {side:'player', index:1}));
  f = act(f, 'resolve'); assert.equal(f.rounds[0].total, 10); assert.equal(f.result, 'win');
});
test('unspecified results require confirmation, fixed results cannot be overridden and finish runs once', () => {
  let f = resolve(start([round(9)]), [3,3]); assert.equal(f.result, 'manual');
  assert.throws(() => act(f, 'finish')); f = act(f, 'finish', {outcome:'loss'}); assert.equal(f.status, 'loss');
  assert.throws(() => act(f, 'finish', {outcome:'win'}));
  f = resolve(start([round(9)], {goal:{kind:'last'}}), [3,3]);
  assert.equal(act(f, 'finish', {outcome:'loss'}).status, 'win');
});
test('invalid, stale and repeated actions leave the original fight untouched', () => {
  const f = start([round()]), before = structuredClone(f);
  assert.throws(() => combatAction(f, {kind:'roll', expectedRevision:1}));
  assert.throws(() => act(f, 'roll', {playerDice:[0,6]}));
  assert.throws(() => act(f, 'roll', {playerDice:[6]}));
  assert.throws(() => act(f, 'resolve')); assert.deepEqual(f, before);
  const pending = act(f, 'roll', {playerDice:[3,3]});
  assert.throws(() => act(pending, 'roll', {playerDice:[6,6]}));
});
test('threshold-derived penalties count met thresholds once and ignore manually supplied totals', () => {
  const rules = {derivedParameters:{penalty:[{name:'alarm',min:2},{name:'chaos',min:6},{name:'pursuit',min:4}]}};
  const spec = {...round(9),params:{penalty:-1}};
  let f = start([spec], rules, {params:{alarm:2,chaos:5,pursuit:4,penalty:99}});
  assert.equal(f.params.penalty,2);
  f = resolve(f,[3,3]); assert.equal(f.rounds[0].total,7);
  assert.equal(start([spec],rules,{params:{alarm:1,chaos:5,pursuit:3}}).params.penalty,0);
  assert.equal(start([spec],rules,{params:{alarm:2,chaos:6,pursuit:4}}).params.penalty,3);
  assert.throws(() => start([spec],{derivedParameters:{penalty:[{name:'alarm',min:1.5}]}}));
});
