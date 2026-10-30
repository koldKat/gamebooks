import test from 'node:test';
import assert from 'node:assert/strict';
import { startFleetExchange, resolveFleetExchangeLosses }
  from '../../../../public/js/battlesim/engines/combat-command/fleet-exchange.js';

const matrix = hits => Array.from({ length: 11 }, () => Array(11).fill(hits));
const unit = (key, count, hp = 1) => ({ key, type: key, name: key, count, ordnance: 1, hitsPerShip: hp });
const plan = extra => ({ keys: ['player'], casualtyKeys: ['player'], chart: 'A', volleys: 1, ...extra });
const manual = extra => ({ enemyChart: 'B', playerRolls: [7], enemyRoll: 8, ...extra });
const noRandom = () => { throw Error('A stored manual roll must not be rerolled'); };

test('enemy return fire uses survivors after the player volley, not simultaneous strength', () => {
  const charts = { A: matrix(2), B: Array.from({ length: 11 }, () => [0, 4, ...Array(9).fill(4)]) };
  const result = startFleetExchange([unit('player', 3)], [unit('enemy', 11)], charts, plan(), manual(), noRandom);
  assert.equal(result.status, 'resolved');
  assert.equal(result.enemy[0].count, 9);
  assert.equal(result.player[0].count, 3);
  assert.equal(result.history[1].strength, 9);
  assert.equal(result.history[1].hits, 0);
});

test('a pending enemy allocation survives reload without rerolling or applying a volley twice', () => {
  const charts = { A: matrix(2), B: matrix(1) };
  const original = [unit('player', 2, 2)];
  const saved = startFleetExchange(original, [unit('one', 5), unit('two', 5)], charts,
    plan({ volleys: 2 }), manual({ playerRolls: [6, 9] }), noRandom);
  assert.equal(saved.status, 'awaiting-enemy-losses');
  assert.equal(saved.current.roll.total, 6);
  assert.equal(saved.history.length, 0);
  const next = resolveFleetExchangeLosses(JSON.parse(JSON.stringify(saved)), { one: 1, two: 1 }, noRandom);
  assert.equal(next.status, 'awaiting-enemy-losses');
  assert.equal(next.current.roll.total, 9);
  assert.equal(next.history.length, 1);
  const result = resolveFleetExchangeLosses(next, { one: 1, two: 1 }, noRandom);
  assert.equal(result.status, 'resolved');
  assert.deepEqual(result.enemy.map(group => group.count), [3, 3]);
  assert.equal(result.player[0].damage, 1);
  assert.equal(result.history.length, 3);
  assert.equal(saved.enemy[0].count, 5, 'old pending state is immutable');
  assert.equal(original[0].damage, undefined);
});

test('pending player losses retain the already rolled attack and reject invalid allocation atomically', () => {
  const charts = { A: matrix(0), B: matrix(2) };
  const saved = startFleetExchange([unit('player', 3), unit('ally', 3)], [unit('enemy', 2)], charts,
    plan({ casualtyKeys: ['player', 'ally'] }), manual(), noRandom);
  assert.equal(saved.status, 'awaiting-player-losses');
  assert.equal(saved.current.roll.total, 8);
  assert.throws(() => resolveFleetExchangeLosses(saved, { player: 1 }, noRandom), /exactly/);
  const result = resolveFleetExchangeLosses(saved, { player: 1, ally: 1 }, noRandom);
  assert.equal(result.status, 'resolved');
  assert.deepEqual(result.player.map(group => group.count), [2, 2]);
  assert.equal(saved.history.length, 1);
});

test('explicit fallback damage reaches a second wing only after the first is completely eliminated', () => {
  const charts = { A: matrix(0), B: matrix(3) }, players = [unit('player', 1), unit('protected', 1, 2)];
  const ordinary = startFleetExchange(players, [unit('enemy', 1)], charts, plan(), manual(), noRandom);
  assert.equal(ordinary.player[1].count, 1);
  assert.equal(ordinary.history[1].unusedHits, 2);
  const fallback = startFleetExchange(players, [unit('enemy', 1)], charts,
    plan({ fallbackCasualtyKeys: ['protected'] }), manual(), noRandom);
  assert.deepEqual(fallback.player.map(group => group.count), [0, 0]);
  assert.equal(fallback.history[1].shipsLost, 2);
  assert.equal(fallback.history[1].roll.total, 8);
});

test('a division chart exception is reevaluated after player fire eliminates that division', () => {
  const charts = { A: matrix(1), B: matrix(0), C: matrix(5) };
  const saved = startFleetExchange([unit('player', 3)], [unit('guard', 3), unit('strong', 1)], charts,
    plan(), manual({ enemyChartOverrides: [{ key: 'strong', chart: 'C' }] }), noRandom);
  const result = resolveFleetExchangeLosses(saved, { strong: 1 }, noRandom);
  assert.equal(result.history[1].chart, 'B');
  assert.equal(result.player[0].count, 3);
});

test('wiping the enemy suppresses return fire and two volleys remain a single enemy reply', () => {
  const charts = { A: matrix(2), B: matrix(1) };
  const dead = startFleetExchange([unit('player', 3)], [unit('enemy', 2)], charts, plan(), manual(), noRandom);
  assert.equal(dead.history.length, 1);
  const special = startFleetExchange([unit('player', 3)], [unit('enemy', 8)], charts,
    plan({ volleys: 2 }), manual({ playerRolls: [2, 12] }), noRandom);
  assert.equal(special.history.filter(event => event.side === 'player').length, 2);
  assert.equal(special.history.filter(event => event.side === 'enemy').length, 1);
  assert.equal(special.enemy[0].count, 4);
});

test('automatic dice are retained across pending allocations', () => {
  let calls = 0;
  const random = () => { calls++; return 3; };
  const saved = startFleetExchange([unit('player', 3)], [unit('one', 3), unit('two', 3)],
    { A: matrix(1), B: matrix(0) }, plan(), { enemyChart: 'B' }, random);
  assert.equal(calls, 2);
  assert.deepEqual(saved.current.roll.dice, [3, 3]);
  const result = resolveFleetExchangeLosses(saved, { one: 1 }, random);
  assert.equal(calls, 4, 'only the new enemy roll consumes further dice');
  assert.equal(result.history[0].roll.total, 6);
});
