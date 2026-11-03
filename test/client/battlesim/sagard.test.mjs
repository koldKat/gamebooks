import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startSagardFight, sagardTurn, resolveSagardTurn, fleeSagardFight, healSagardFight,
  cancelSagardFight, validateSagardFight} from '../../../public/js/battlesim/engines/sagard/core.js';
import {emptySagardState, rememberSagardFight, createSagardState} from '../../../public/js/battlesim/engines/sagard/state.js';

const rules = {maxHeroHp: 20, damageByLevel: Object.fromEntries(Array.from({length: 6}, (_, n) => [n, [0, 1, 2, n + 1]]))};
const foe = (name = 'Synthetic opponent', hp = 10, extra = {}) => ({name, hp, level: 2, ...extra});
const start = (spec = {}, hero = {}, options = {}) => startSagardFight({level: 2, hp: 20, ...hero},
  {name: 'Synthetic encounter', opponents: [foe()], winTarget: '2', lossTarget: '3', escapeTarget: '4', ...spec}, rules, options);
const reload = fight => JSON.parse(JSON.stringify(fight));
const step = (fight, die = 1, target) => resolveSagardTurn(reload(fight), die, {target});

test('independent damage rolls alternate, zero misses, HP reaches zero exactly, and inputs remain unchanged', () => {
  const original = start({}, {hp: 1});
  const missed = step(original); assert.equal(sagardTurn(missed).attackerId, 'enemy0');
  assert.equal(original.log.length, 0); assert.equal(missed.hero.hp, 1);
  const lost = step(missed, 2); assert.equal(lost.status, 'loss'); assert.equal(lost.destination, '3');
  assert.throws(() => step(lost)); assert.equal(lost.hero.hp, 0);
  const won = step(start({opponents: [foe('Synthetic fragile foe', 1)]}), 3);
  assert.equal(won.status, 'win'); assert.equal(won.destination, '2');
});

test('every living group member retaliates, while a serial fight admits only one opponent at a time', () => {
  const opponents = [foe('First synthetic foe', 1), foe('Second synthetic foe', 10), foe('Third synthetic foe', 10)];
  let fight = step(start({opponents}), 2, 'enemy0');
  assert.equal(sagardTurn(fight).attackerId, 'enemy1');
  fight = step(fight); assert.equal(sagardTurn(fight).attackerId, 'enemy2');
  fight = step(fight); assert.equal(fight.round, 2); assert.equal(sagardTurn(fight).attackerId, 'hero');
  fight = start({opponents, enemyMode: 'serial'});
  assert.deepEqual(sagardTurn(fight).targets, ['enemy0']); assert.throws(() => step(fight, 2, 'enemy1'));
  fight = step(fight, 2); assert.equal(fight.round, 2); assert.equal(sagardTurn(fight).attackerId, 'hero');
  assert.deepEqual(sagardTurn(fight).targets, ['enemy1']);
});

test('extra initial hero attacks occur once and enemy free attacks precede the normal round', () => {
  let fight = start({heroOpeningAttacks: 5});
  for (let n = 0; n < 5; n++) {assert.equal(sagardTurn(fight).attackerId, 'hero'); fight = step(fight);}
  assert.equal(sagardTurn(fight).attackerId, 'enemy0'); fight = step(fight);
  assert.equal(fight.round, 2); fight = step(fight); assert.equal(sagardTurn(fight).attackerId, 'enemy0');
  fight = start({enemyOpeningFreeAttacks: true, opponents: [foe('A'), foe('B')]});
  assert.equal(sagardTurn(fight).canFlee, false);
  const order = [];
  for (let n = 0; n < 5; n++) {order.push(sagardTurn(fight).attackerId); fight = step(fight, 1, n === 2 ? 'enemy0' : undefined);}
  assert.deepEqual(order, ['enemy0', 'enemy1', 'hero', 'enemy0', 'enemy1']);
});

test('a sleeping opponent starts retaliation in round four and never acts after being defeated', () => {
  let fight = start({opponents: [foe('Synthetic watcher', 1), foe('Synthetic sleeper', 10, {retaliationStartsRound: 4})]});
  fight = step(fight, 2, 'enemy0'); assert.equal(fight.round, 2);
  fight = step(fight, 1, 'enemy1'); assert.equal(fight.round, 3);
  fight = step(fight, 1, 'enemy1'); assert.equal(fight.round, 4);
  fight = step(fight, 1, 'enemy1'); assert.equal(sagardTurn(fight).attackerId, 'enemy1');
});

test('companions attack and an allies-first opponent cannot select the hero while any companion lives', () => {
  let fight = start({alliesFirst: true, allies: [foe('Synthetic companion A', 1), foe('Synthetic companion B', 1)]});
  const order = [];
  for (let n = 0; n < 3; n++) {order.push(sagardTurn(fight).attackerId); fight = step(fight);}
  assert.deepEqual(order, ['hero', 'ally0', 'ally1']); assert.deepEqual(sagardTurn(fight).targets, ['ally0', 'ally1']);
  assert.throws(() => step(fight, 2, 'hero')); assert.throws(() => step(fight, 2));
  fight = step(fight, 2, 'ally0'); assert.equal(fight.allies[0].hp, 0);
  fight = step(fight); fight = step(fight); assert.equal(sagardTurn(fight).attackerId, 'enemy0');
  assert.deepEqual(sagardTurn(fight).targets, ['ally1']);
  fight = step(fight, 2); fight = step(fight); assert.deepEqual(sagardTurn(fight).targets, ['hero']);
});

test('one initiative roll selects even hero-first or odd enemy-first for the entire fight', () => {
  let fight = start({initiative: 'random'}); assert.equal(sagardTurn(fight).kind, 'initiative');
  fight = step(fight, 1); assert.equal(sagardTurn(fight).attackerId, 'enemy0');
  fight = step(fight); fight = step(fight); assert.equal(fight.round, 2); assert.equal(sagardTurn(fight).attackerId, 'enemy0');
  assert.equal(sagardTurn(step(start({initiative: 'random'}), 2)).attackerId, 'hero');
});

test('failed even-roll escape preserves the normal hero attack and cannot repeat in the same round', () => {
  const original = start(); let fight = fleeSagardFight(original, 1);
  assert.equal(sagardTurn(fight).attackerId, 'hero'); assert.equal(sagardTurn(fight).canFlee, false);
  assert.throws(() => fleeSagardFight(fight, 2)); fight = step(fight); fight = step(fight);
  assert.equal(sagardTurn(fight).canFlee, true); fight = fleeSagardFight(fight, 4);
  assert.equal(fight.status, 'fled'); assert.equal(fight.destination, '4'); assert.equal(original.log.length, 0);
  assert.throws(() => fleeSagardFight(start({escape: 'none'}), 2));
});

test('quarter-chance escape accepts only four and leaves failed rolls available for ordinary combat', () => {
  let fight = fleeSagardFight(start({escape: 'four'}), 2); assert.equal(fight.status, 'fighting');
  assert.equal(sagardTurn(fight).attackerId, 'hero');
  fight = fleeSagardFight(start({escape: 'four'}), 4); assert.equal(fight.status, 'fled');
});

test('the initial double strike is followed by exactly one reply before the no-roll break-off decision', () => {
  let fight = start({heroOpeningAttacks: 2, breakOffAfterFirstRound: true, breakOffTarget: '9'});
  fight = step(fight); fight = step(fight); assert.equal(sagardTurn(fight).attackerId, 'enemy0');
  fight = step(fight); assert.equal(sagardTurn(fight).kind, 'breakOff');
  const left = resolveSagardTurn(fight, null, {decision: 'leave'});
  assert.equal(left.status, 'withdrawn'); assert.equal(left.destination, '9');
  fight = resolveSagardTurn(fight, null, {decision: 'continue'}); assert.equal(fight.round, 2);
  fight = step(fight); assert.equal(sagardTurn(fight).attackerId, 'enemy0');
  fight = step(fight); assert.equal(fight.round, 3); assert.equal(sagardTurn(fight).kind, 'attack');
});

test('weapon bonus adds damage even to a zero result, while armor and a finite shield absorb each hit', () => {
  let fight = step(start({}, {damageBonus: 1, damageReduction: 1, shield: 2}), 1);
  assert.equal(fight.opponents[0].hp, 9); fight = step(fight, 4);
  assert.equal(fight.hero.hp, 20); assert.equal(fight.hero.shield, 0); assert.equal(fight.log.at(-1).shieldUsed, 2);
  fight = step(fight, 1); fight = step(fight, 4); assert.equal(fight.hero.hp, 18);
});

test('only an explicit swarm transfers excess damage to other opponents', () => {
  const opponents = Array.from({length: 4}, (_, n) => foe('Synthetic swarm member ' + n, 1));
  let fight = step(start({opponents}), 4, 'enemy0'); assert.equal(fight.opponents.filter(r => r.hp === 0).length, 1);
  fight = step(start({opponents, swarmSpillover: true}), 4, 'enemy0');
  assert.equal(fight.opponents.filter(r => r.hp === 0).length, 3); assert.equal(sagardTurn(fight).attackerId, 'enemy3');
});

test('melting precedes each enemy attack, requires no die, and prevents the attack when it ends the fight', () => {
  let fight = step(start({enemyMeltBeforeAttack: 2, opponents: [foe('Synthetic melting foe', 4)]}));
  assert.equal(sagardTurn(fight).kind, 'melt'); fight = step(fight, null);
  assert.equal(fight.opponents[0].hp, 2); assert.equal(sagardTurn(fight).kind, 'attack');
  fight = step(fight, 1); assert.equal(fight.opponents[0].hp, 2);
  fight = step(fight, 1); fight = step(fight, null);
  assert.equal(fight.status, 'win'); assert.equal(fight.hero.hp, 20); assert.equal(fight.log.at(-1).kind, 'melt');
});

test('healing is instant at an enemy turn and consumes its own item without changing combat order', () => {
  let fight = start({}, {hp: 10}, {fang: true, moss: true}); const turn = sagardTurn(fight);
  fight = healSagardFight(fight, 'fang'); assert.equal(fight.hero.hp, 20);
  assert.equal(fight.healing.fang, false); assert.equal(fight.healing.moss, true);
  assert.deepEqual(sagardTurn(fight), turn); assert.throws(() => healSagardFight(fight, 'fang'));
  fight = step(fight); fight = step(fight, 4); const after = sagardTurn(fight);
  fight = healSagardFight(fight, 'moss'); assert.equal(fight.hero.hp, 20); assert.deepEqual(sagardTurn(fight), after);
});

test('saved outcomes enter history exactly once, while fleeing, withdrawal and cancellation earn no fight result', () => {
  let state = emptySagardState(); state.fight = step(start({opponents: [foe('Synthetic fragile foe', 1)]}), 2);
  rememberSagardFight(state, 1); rememberSagardFight(state, 1); assert.equal(state.history.length, 1);
  state.fight = step(step(start({}, {hp: 1})), 2); rememberSagardFight(state, 1);
  assert.deepEqual(state.history.map(r => r.outcome), ['win', 'loss']); assert.deepEqual(state.history.map(r => r.ts), [1, 2]);
  state.fight = fleeSagardFight(start(), 2); rememberSagardFight(state, 3);
  state.fight = cancelSagardFight(start()); rememberSagardFight(state, 4); assert.equal(state.history.length, 2);
});

test('stale callbacks cannot alter another book or playthrough, and saved fights resume without resetting casualties', () => {
  let run = {}, bookId = 999, saves = 0; const definition = {id: 999, stateKey: 'syntheticSagard'};
  const store = createSagardState(() => ({run, bookId, definition, saveState: () => saves++}));
  let token = store.snapshot(); assert.equal(store.update(s => {s.fight = start(); return s;}, token), true);
  const original = run.syntheticSagard; assert.equal(store.update(s => s, token), false);
  token = store.snapshot(); run = {}; assert.equal(store.update(s => s, token), false);
  run = {syntheticSagard: reload(original)}; assert.deepEqual(store.snapshot().state.fight, original.fight);
  token = store.snapshot(); bookId = 1000; assert.equal(store.update(s => s, token), false); assert.equal(saves, 1);
});

test('manual source gaps, invalid dice and corrupted saves fail without modifying the supplied state', () => {
  assert.throws(() => start({mode: 'manual', manualReason: 'Synthetic unreadable stat'}));
  const fight = start(); assert.throws(() => step(fight, 5)); assert.throws(() => step(fight, ''));
  const corrupted = reload(fight); corrupted.opponents[0].hp = -1; assert.throws(() => validateSagardFight(corrupted));
  corrupted.opponents[0].hp = 10; corrupted.queue[0] = 'missing'; assert.throws(() => validateSagardFight(corrupted));
  assert.equal(fight.log.length, 0);
});
