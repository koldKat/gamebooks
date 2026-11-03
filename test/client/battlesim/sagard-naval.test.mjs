import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startSagardNaval, validateSagardNavalFight, sagardNavalTurn, resolveSagardNaval,
  withdrawSagardNaval, cancelSagardNaval} from '../../../public/js/battlesim/engines/sagard/naval.js';
import {emptySagardState, rememberSagardFight} from '../../../public/js/battlesim/engines/sagard/state.js';

const foe = (hp = 3, chart = [0, 1, 2, 3]) => ({name: 'Synthetic sea opponent', hp, chart});
const start = (kind = 'fleet', options = {}, opponents = [foe()], ship = {}) => startSagardNaval(
  {hp: 5, maxHp: 30, ...ship}, {name: 'Synthetic naval encounter', winTarget: 'won', lossTarget: 'sunk',
    escapeTarget: 'escaped', withdrawnTarget: 'left', opponents, naval: {kind, heroChart: [0, 1, 2, 3],
      actions: ['ram', 'missile', 'board'], ramSinkFaces: [4], ramThreatFaces: [1], ramConfirmFaces: [1],
      boardKillFaces: [4], escapeFaces: [4], surrenderFaces: [4], escapeThreatFaces: [1],
      escapeConfirmFaces: [1], ...options}});
const step = (fight, die, options) => resolveSagardNaval(JSON.parse(JSON.stringify(fight)), die, options);
const action = (fight, decision) => step(fight, null, {decision});

test('reusable single-ship tracks do not turn separate printed encounters into a fleet', () => {
  const fight = start('galleon', {singleOpponent: true}, [foe(2), foe(3), foe(4)]);
  assert.equal(fight.opponents.length, 1); assert.equal(fight.opponents[0].hp, 2);
  const chosen = startSagardNaval({hp: 5, maxHp: 30}, fight.encounter, {opponentIndex: 2});
  assert.equal(chosen.opponents.length, 1); assert.equal(chosen.opponents[0].hp, 4);
  assert.throws(() => startSagardNaval({hp: 5, maxHp: 30}, fight.encounter, {opponentIndex: 3}));
});

test('ship outcomes update only ship HP and enter history once, preserving character HP and equipment', () => {
  const state = emptySagardState(); state.setup = {hp: 17, level: 4, shield: 8};
  state.fight = step(action(start(), 'ram'), 4);
  rememberSagardFight(state, 100); rememberSagardFight(state, 100);
  assert.equal(state.setup.hp, 17); assert.equal(state.setup.level, 4); assert.equal(state.setup.shield, 8);
  assert.equal(state.setup.shipHp, 5); assert.equal(state.history.length, 1);
});

test('ramming handles successes, misses, confirmation and the distinct immediate sinking rule', () => {
  for (let die = 1; die <= 4; die++) {
    const original = action(start(), 'ram');
    const result = step(original, die);
    assert.equal(original.status, 'fighting');
    assert.equal(result.status, die === 4 ? 'win' : 'fighting');
    if (die === 1) {
      assert.equal(result.phase, 'ramConfirm');
      assert.equal(step(result, 1).status, 'loss');
      assert.equal(step(result, 2).phase, 'chooseAction');
    } else if (die !== 4) assert.equal(result.phase, 'chooseAction');
  }
  const dreadnought = action(start('fleet', {ramConfirmFaces: null}), 'ram');
  assert.equal(step(dreadnought, 1).status, 'loss');
});

test('fleet missiles attack the selected ship and receive only its reply; casualties admit the next ship', () => {
  let fight = start('fleet', {chooseShipEachRound: true}, [foe(1), foe(5)]);
  assert.equal(fight.phase, 'chooseShip');
  assert.throws(() => step(fight, null, {target: 'enemy8'}));
  fight = step(fight, null, {target: 'enemy1'});
  fight = step(action(fight, 'missile'), 2);
  assert.equal(fight.opponents[1].hp, 4);
  assert.equal(sagardNavalTurn(fight).attackerId, 'enemy1');
  fight = step(fight, 2); assert.equal(fight.ship.hp, 4); assert.equal(fight.phase, 'chooseShip');
  fight = step(fight, null, {target: 'enemy0'});
  fight = step(action(fight, 'missile'), 2);
  assert.equal(fight.phase, 'chooseAction'); assert.equal(fight.target, 'enemy1');
  assert.equal(fight.ship.hp, 4);
});

test('boarding snapshots both strengths and retains the defeated crew reply, including mutual destruction', () => {
  let fight = action(start('fleet', {}, [foe(1)], {hp: 2}), 'board');
  fight = step(fight, 4);
  assert.equal(fight.phase, 'boardEnemy'); assert.equal(fight.boardEnemyShots, 1);
  fight = step(fight, 4); assert.equal(fight.status, 'win'); assert.equal(fight.ship.hp, 1);
  fight = action(start('fleet', {}, [foe(1)], {hp: 1}), 'board');
  fight = step(step(fight, 4), 4);
  assert.equal(fight.status, 'loss'); assert.equal(fight.ship.hp, 0);
  validateSagardNavalFight(JSON.parse(JSON.stringify(fight)));
  assert.throws(() => step(fight, 1));
});

test('boarding survivors use their reduced strengths in the following round', () => {
  let fight = action(start('fleet', {}, [foe(2)], {hp: 2}), 'board');
  fight = step(step(fight, 4), 1);
  assert.equal(fight.boardEnemyShots, 2);
  fight = step(step(fight, 4), 1);
  assert.equal(fight.ship.hp, 1); assert.equal(fight.opponents[0].hp, 1);
  fight = action(fight, 'board');
  assert.equal(fight.boardHeroShots, 1); assert.equal(fight.boardEnemyShots, 1);
});

test('escape-only fire follows a failed escape and never invents opponent HP', () => {
  let fight = start('escape', {}, [foe(null, [0, 0, 1, 4])]);
  assert.equal(fight.opponents[0].hp, null);
  assert.equal(step(fight, 4).destination, 'escaped');
  fight = step(fight, 1); assert.equal(fight.phase, 'enemyAttack');
  fight = step(fight, 4); assert.equal(fight.ship.hp, 1); assert.equal(fight.phase, 'escape');
  fight = step(step(fight, 2), 4); assert.equal(fight.status, 'loss');
  assert.throws(() => withdrawSagardNaval(start('escape')));
});

test('galleon surrender preserves strength; escape and voluntary breakoff award no victory', () => {
  let fight = start('galleon');
  const won = step(fight, 4); assert.equal(won.status, 'win'); assert.equal(won.opponents[0].hp, 3);
  const escaped = step(step(fight, 1), 1);
  assert.equal(escaped.status, 'withdrawn'); assert.equal(escaped.destination, 'left');
  const attack = step(step(fight, 1), 2); assert.equal(attack.phase, 'missileHero');
  const left = withdrawSagardNaval(attack); assert.equal(left.status, 'withdrawn');
  assert.equal(fight.phase, 'precheck'); assert.equal(fight.log.length, 0);
  assert.equal(cancelSagardNaval(fight).status, 'cancelled');
});

test('hunters strike first and hero kill counts remove whole opponents without invented HP', () => {
  let fight = start('hunters', {heroChart: [1, 1, 2, 3]}, Array.from({length: 5}, () => foe(null, [0, 0, 2, 5])));
  for (let n = 0; n < 5; n++) {
    assert.equal(sagardNavalTurn(fight).attackerId, 'enemy' + n); fight = step(fight, 1);
  }
  assert.equal(fight.phase, 'heroAttack'); fight = step(fight, 4);
  assert.equal(fight.opponents.filter(row => row.alive).length, 2);
  assert.equal(sagardNavalTurn(fight).attackerId, 'enemy3');
  fight = step(step(fight, 1), 1); fight = step(fight, 3);
  assert.equal(fight.status, 'win'); assert.ok(fight.opponents.every(row => row.hp === null));
});

test('tentacle damage can be divided freely and defeated tentacles never retaliate', () => {
  let fight = start('tentacles', {heroChart: [2, 3, 4, 5]}, [foe(2), foe(2)]);
  fight = step(step(fight, 1), 1); fight = step(fight, 4);
  assert.equal(fight.pendingDamage, 5);
  assert.throws(() => step(fight, null, {target: 'enemy0', amount: 3}));
  fight = step(fight, null, {target: 'enemy0', amount: 1});
  fight = step(fight, null, {target: 'enemy1', amount: 2});
  assert.deepEqual(sagardNavalTurn(fight).targets, ['enemy0']);
  fight = step(fight, null, {target: 'enemy0', amount: 1});
  assert.equal(fight.status, 'win');
  validateSagardNavalFight(JSON.parse(JSON.stringify(fight)));
  let second = start('tentacles', {heroChart: [2, 3, 4, 5]}, [foe(2), foe(5)]);
  second = step(step(second, 1), 1); second = step(second, 1);
  second = step(second, null, {target: 'enemy0', amount: 2});
  assert.equal(sagardNavalTurn(second).attackerId, 'enemy1');
});

test('invalid input and damaged saves fail without changing a fight', () => {
  const fight = action(start(), 'ram');
  for (const die of [0, 5, '', null, 1.5]) assert.throws(() => step(fight, die));
  const invalid = JSON.parse(JSON.stringify(fight)); invalid.ship.hp = 31;
  assert.throws(() => validateSagardNavalFight(invalid));
  const queue = start('hunters'); queue.attackQueue = ['enemy4'];
  assert.throws(() => validateSagardNavalFight(queue));
  assert.equal(fight.log.length, 1);
});
