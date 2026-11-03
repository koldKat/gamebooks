import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startSagardFight, sagardTurn, resolveSagardTurn, validateSagardFight,
  throwSagardProjectile, useSagardDagger} from '../../../public/js/battlesim/engines/sagard/core.js';
import {emptySagardState, rememberSagardFight} from '../../../public/js/battlesim/engines/sagard/state.js';

const rules = {maxHeroHp: 20, damageByLevel: Object.fromEntries(Array.from({length: 6}, (_, n) => [n, [0, 1, 2, 3]]))};
const foe = name => ({name, level: null, hp: 9, chart: null});
const spec = {name: 'Synthetic jabbing foes', escape: 'none', opponents: [foe('A')],
  enemyAttack: {kind: 'jab', triggerFaces: [4], confirmationFaces: [4], target: 'captured'}};
const start = (entry = {}, ruleOptions = {}, options = {}) => startSagardFight({level: 2, hp: 20, shield: 3, damageReduction: 2},
  {...spec, ...entry}, {...rules, ...ruleOptions}, options);
const reload = value => JSON.parse(JSON.stringify(value));
const step = (fight, die, options) => resolveSagardTurn(reload(fight), die, options);

test('all trigger/confirmation rolls preserve capture probability without ordinary HP damage', () => {
  let captures = 0;
  for (let first = 1; first <= 4; first++) for (let second = 1; second <= 4; second++) {
    let fight = step(start(), 1);
    assert.equal(sagardTurn(fight).kind, 'jab');
    fight = step(fight, first);
    if (first === 4) {
      assert.equal(fight.phase, 'jabConfirm');
      assert.equal(sagardTurn(reload(fight)).kind, 'jabConfirm');
      fight = step(fight, second);
    }
    if (fight.status === 'loss') {captures++; assert.equal(fight.destination, 'captured');}
    else {assert.equal(fight.round, 2); assert.equal(sagardTurn(fight).attackerId, 'hero');}
    assert.equal(fight.hero.hp, 20);
    assert.equal(fight.hero.shield, 3);
    assert.equal(fight.opponents[0].level, null);
    assert.equal(fight.opponents[0].chart, null);
    validateSagardFight(reload(fight));
  }
  assert.equal(captures, 1);
});

test('each surviving jabbing opponent acts once and a failed confirmation passes to the next', () => {
  let fight = step(start({opponents: [foe('A'), foe('B')]}), 1, {target: 'enemy0'});
  fight = step(fight, 4); fight = step(fight, 2);
  assert.equal(sagardTurn(fight).attackerId, 'enemy1');
  assert.equal(sagardTurn(fight).kind, 'jab');
  fight = step(fight, 1);
  assert.equal(fight.round, 2); assert.equal(sagardTurn(fight).attackerId, 'hero');
});

test('a defeated opponent never receives a jab or confirmation roll', () => {
  let fight = start({opponents: [{...foe('A'), hp: 1}, foe('B')]});
  fight = step(fight, 2, {target: 'enemy0'});
  assert.equal(fight.opponents[0].hp, 0);
  assert.equal(sagardTurn(fight).attackerId, 'enemy1');
  fight = step(fight, 4); fight = step(fight, 4);
  assert.equal(fight.status, 'loss');
  const state = emptySagardState(); state.fight = reload(fight); state.unrelated = {keep: true};
  rememberSagardFight(state, 100); rememberSagardFight(state, 101);
  assert.equal(state.history.length, 1); assert.equal(state.history[0].outcome, 'loss');
  assert.equal(state.setup.hp, 20); assert.deepEqual(state.unrelated, {keep: true});
});

test('unknown printed levels cannot gain poison or dagger instant kills', () => {
  const projectiles = [{id: 'dart', label: 'Synthetic dart', kind: 'poison', maxHeld: 1,
    shotsPerRound: 1, damage: 2, defeatsLevelAtMost: 1, phases: ['round']}];
  let fight = start({}, {projectiles}, {ammo: {dart: 1}});
  fight = throwSagardProjectile(reload(fight), 'dart', null);
  assert.equal(fight.opponents[0].hp, 7);
  fight = start({}, {magicDagger: {maximumPower: 3, defeatsLevelAtMost: 2}}, {magicDaggerPower: 3});
  assert.throws(() => useSagardDagger(fight, {mode: 'destroy'}));
  fight = useSagardDagger(reload(fight));
  assert.equal(fight.opponents[0].hp, 6);
});

test('invalid special attacks and invented source statistics fail without changing saved combat', () => {
  for (const enemyAttack of [{kind: 'unknown'}, {...spec.enemyAttack, triggerFaces: [0]},
    {...spec.enemyAttack, confirmationFaces: []}]) assert.throws(() => start({enemyAttack}));
  assert.throws(() => start({opponents: [{...foe('A'), level: 1}]}));
  const fight = step(step(start(), 1), 4), serialized = JSON.stringify(fight);
  for (const die of [0, 5, null]) assert.throws(() => resolveSagardTurn(fight, die));
  assert.equal(JSON.stringify(fight), serialized);
  for (const value of [{level: 1}, {chart: [0, 0, 0, 0]}]) {
    const altered = reload(fight); Object.assign(altered.opponents[0], value);
    assert.throws(() => validateSagardFight(altered));
  }
});
