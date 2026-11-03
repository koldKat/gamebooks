import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startSagardFight, resolveSagardTurn, fleeSagardFight, sagardTurn} from '../../../public/js/battlesim/engines/sagard/core.js';
import {startSagardForces, resolveSagardForces, fleeSagardForces, canFleeSagardForces,
  validateSagardForcesFight} from '../../../public/js/battlesim/engines/sagard/forces.js';
import {emptySagardState, rememberSagardFight} from '../../../public/js/battlesim/engines/sagard/state.js';

const rules = {maxHeroHp: 20, damageByLevel: Object.fromEntries(Array.from({length: 6}, (_, n) => [n, [0, 1, 2, 3]]))};
const foe = {name: 'Synthetic foe', hp: 10, level: 2};
const reload = value => JSON.parse(JSON.stringify(value));
const start = (escape = 'even', forces = {}, count = 0) => startSagardForces({level: 2, hp: 20},
  {name: 'Synthetic force', escape, escapeTarget: 'away', opponents: [foe],
    forces: {allies: 3, enemies: 2, allyKillFaces: [4], enemyKillFaces: [4], initiative: 'hero', duelTiming: 'after',
      escapeOnlyWithoutAllies: true, duelEncounter: {opponents: [foe]}, ...forces}}, rules, {alliesRemaining: count});

test('crew-only escape restrictions apply before and during an individual duel', () => {
  const withCrew = start('even', {duelTiming: 'before'}, 1);
  assert.equal(canFleeSagardForces(withCrew), false);
  assert.throws(() => fleeSagardForces(withCrew, 4));
  const duel = resolveSagardForces(reload(withCrew), null, {decision: 'duel'});
  assert.equal(canFleeSagardForces(duel), false);
  assert.throws(() => fleeSagardForces(duel, 4));
  const allowed = start('even', {duelTiming: 'before', escapeOnlyWithoutAllies: false}, 1);
  assert.equal(canFleeSagardForces(allowed), true);
});

test('a failed group escape cannot repeat before the next combat round', () => {
  const original = start();
  let fight = fleeSagardForces(reload(original), 1);
  assert.equal(fight.status, 'fighting'); assert.equal(fight.phase, 'chooseDuel');
  assert.equal(canFleeSagardForces(fight), false);
  assert.throws(() => fleeSagardForces(fight, 4));
  fight = resolveSagardForces(reload(fight), null, {decision: 'duel'});
  assert.equal(canFleeSagardForces(fight), false);
  fight = resolveSagardForces(reload(fight), 1);
  fight = resolveSagardForces(reload(fight), 1);
  assert.equal(fight.duel.round, 2); assert.equal(canFleeSagardForces(fight), true);
  assert.equal(original.log.length, 0);
});

test('escaping during a duel preserves participants and earns no battle outcome', () => {
  let fight = resolveSagardForces(start(), null, {decision: 'duel'});
  fight = fleeSagardForces(reload(fight), 4);
  assert.equal(fight.status, 'fled'); assert.equal(fight.destination, 'away');
  assert.equal(fight.hero.hp, 20); assert.equal(fight.enemiesRemaining, 2);
  assert.equal(fight.duel.opponents[0].hp, 10);
  validateSagardForcesFight(reload(fight));
  const state = emptySagardState(); state.fight = fight; rememberSagardFight(state);
  assert.equal(state.history.length, 0);
  assert.throws(() => fleeSagardForces(fight, 4));
});

test('a failed duel escape preserves the normal action and cannot be retried in that round', () => {
  let fight = resolveSagardForces(start(), null, {decision: 'duel'});
  fight = fleeSagardForces(reload(fight), 1);
  assert.equal(sagardTurn(fight.duel).attackerId, 'hero');
  assert.equal(fight.duel.opponents[0].hp, 10);
  assert.throws(() => fleeSagardForces(fight, 4));
  fight = resolveSagardForces(reload(fight), 1);
  assert.equal(canFleeSagardForces(fight), false);
});

test('declared escape faces apply without changing the supplied force state on invalid input', () => {
  assert.equal(fleeSagardForces(start('four'), 2).status, 'fighting');
  assert.equal(fleeSagardForces(start('four'), 4).status, 'fled');
  assert.equal(fleeSagardForces(start('one'), 1).status, 'fled');
  const fight = start(), saved = JSON.stringify(fight);
  assert.throws(() => fleeSagardForces(fight, 0)); assert.equal(JSON.stringify(fight), saved);
});

test('escape alternatives require an explicit choice and retain their own odds and destinations', () => {
  const alternatives = [{label: 'First approach', faces: [4], target: 'first'}, {label: 'Second approach', faces: [2, 4], target: 'second'}];
  for (const [variant, option] of alternatives.entries()) for (let die = 1; die <= 4; die++) {
    const original = startSagardFight({level: 2, hp: 20}, {name: 'Synthetic', opponents: [foe], escape: 'none', escapeVariants: alternatives}, rules);
    assert.equal(sagardTurn(original).canFlee, true);
    assert.throws(() => fleeSagardFight(original, die));
    const fight = fleeSagardFight(reload(original), die, {variant});
    assert.equal(fight.status, option.faces.includes(die) ? 'fled' : 'fighting');
    if (fight.status === 'fled') assert.equal(fight.destination, option.target);
    else assert.equal(sagardTurn(fight).attackerId, 'hero');
    assert.equal(original.escapeAttempted, false);
  }
});

test('escape alternatives can change on a later attempt without a campaign flag', () => {
  let fight = startSagardFight({level: 2, hp: 20}, {name: 'Synthetic', opponents: [foe], escape: 'none',
    escapeVariants: [{label: 'First', faces: [4], target: 'first'}, {label: 'Second', faces: [2], target: 'second'}]}, rules);
  fight = fleeSagardFight(fight, 2, {variant: 0});
  assert.throws(() => fleeSagardFight(fight, 2, {variant: 1}));
  fight = resolveSagardTurn(reload(fight), 1); fight = resolveSagardTurn(reload(fight), 1);
  fight = fleeSagardFight(reload(fight), 2, {variant: 1});
  assert.equal(fight.status, 'fled'); assert.equal(fight.destination, 'second');
});
