import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAttempt, rollAttempt, rollStartingStats } from '../../../public/js/battlesim/books/1526/combat.js';
import { attackOptions, beginAttempt, completeAttempt, startFight } from '../../../public/js/battlesim/books/1526/fight.js';
import { createState } from '../../../public/js/battlesim/books/1526/state.js';

const player = { effort: 12, effectiveElan: 7, fists: 2 };
const enemies = [
  { difficulty: 5, fists: 1, toughness: 2 },
  { difficulty: 6, fists: 1, toughness: 1 },
];

function dice(...results) {
  return () => results.shift();
}

test('starting stats round up Elan and use both dice for Effort', () => {
  assert.deepEqual(rollStartingStats(dice(5, 2, 4)), { elan: 9, effort: 60, fists: 2 });
});

test('a tie fails and a lower fist can be chosen', () => {
  const attempt = rollAttempt({ player, enemies, target: 0, effort: 4, simultaneous: false }, dice(3, 6, 2));
  assert.equal(resolveAttempt(attempt, 0).targetDamage, 0);
  assert.equal(resolveAttempt(attempt, 1).targetDamage, 1);
  assert.equal(resolveAttempt(attempt, 1).remainingEffort, 8);
  assert.equal(attempt.opponents.length, 1);
  assert.throws(() => rollAttempt({ player, enemies, target: 0, effort: 8 }, dice()), RangeError);
});

test('multiple hassles reroll high player dice once and compare each foe independently', () => {
  const attempt = rollAttempt({ player, enemies, target: 1, effort: 6, simultaneous: true }, dice(6, 4, 2, 2, 5));
  assert.deepEqual(attempt.dice.map(die => die.result), [4, 2]);
  const result = resolveAttempt(attempt, 0);
  assert.equal(result.targetDamage, 1);
  assert.deepEqual(result.comparisons.map(foe => [foe.index, foe.overcome, foe.target]), [
    [1, true, true],
    [0, false, false],
  ]);
});

test('dwarves reroll ones once, and the group rule stops when one foe remains', () => {
  const attempt = rollAttempt({
    player, enemies, target: 0, effort: 5, simultaneous: true, rerollEnemyOnes: true,
  }, dice(3, 2, 1, 1, 5));
  assert.deepEqual(attempt.opponents[0].dice, [{ initial: 1, result: 1, rerolled: true }]);
  const duel = rollAttempt({
    player, enemies: [enemies[0], { ...enemies[1], toughness: 0 }],
    target: 0, effort: 5, simultaneous: true, rerollEnemyOnes: true,
  }, dice(6, 2, 1));
  assert.equal(duel.group, false);
  assert.equal(duel.dice[0].rerolled, false);
  assert.equal(duel.opponents[0].dice[0].rerolled, false);
});

const stats = { elan: 7, effort: 24, fists: 1, guards: 1 };
const foes = [
  { name: 'Elf 1', difficulty: 4, fists: 0, toughness: 2 },
  { name: 'Elf 2', difficulty: 4, fists: 0, toughness: 1 },
];
function turn(fight, target, effort, ...rolls) {
  beginAttempt(fight, target, effort, dice(...rolls));
  completeAttempt(fight, 0, dice(...rolls.slice(1)));
}

test('a guard loss makes the next round a Multiple Hassle', () => {
  const fight = startFight(stats, foes, { mode: 'guards', onMiss: 'loseGuard' });
  assert.deepEqual(attackOptions(fight).targets, [0]);
  turn(fight, 0, 0, 4);
  assert.equal(fight.player.guards, 0);
  assert.deepEqual(attackOptions(fight).targets, [0, 1]);
  turn(fight, 1, 2, 6, 3);
  assert.deepEqual(fight.enemies.map(enemy => enemy.toughness), [2, 0]);
  assert.deepEqual(attackOptions(fight).targets, [0]);
});

test('each failed comparison takes its own temporary Élan loss', () => {
  const fight = startFight(stats, foes, { mode: 'group', onMiss: 'shambler' });
  turn(fight, 0, 1, 3);
  assert.equal(fight.player.elan, 7);
  assert.equal(attackOptions(fight).effectiveElan, 5);
  assert.equal(fight.player.effort, 23);
  assert.deepEqual(fight.enemies.map(enemy => enemy.toughness), [2, 1]);
});

test('ordered opponents stay ordered and the printed round limit can end the fight without a loss', () => {
  const fight = startFight(stats, foes, { mode: 'ordered', limit: 2, timeoutSection: 1572 });
  assert.throws(() => beginAttempt(fight, 1, 2, dice(6)), RangeError);
  turn(fight, 0, 3, 4);
  turn(fight, 0, 3, 4);
  assert.equal(fight.outcome, 'stopped');
  assert.equal(fight.section, 1572);
});

test('book-only damage, spell rolls and opening-round exceptions apply', () => {
  const armouredElf = startFight(stats, foes.slice(0, 1), { firstFists: 1, firstMissSection: 1147 });
  turn(armouredElf, 0, 2, 4, 5);
  assert.equal(armouredElf.section, 1147);
  const smiting = startFight(stats, [{ ...foes[0], fists: 2 }], { onRoll: 'smiting' });
  turn(smiting, 0, 6, 5, 6, 6);
  assert.equal(smiting.player.effort, 8);
  assert.equal(smiting.enemies[0].toughness, 1);
  const duo = startFight({ ...stats, hitDamage: 2 }, [{ ...foes[0], toughness: 3, fists: 2 }], {
    difficultyOnHit: -1, fistsOnHit: -1,
  });
  turn(duo, 0, 6, 5, 1, 1);
  assert.deepEqual(duo.enemies[0], { ...foes[0], difficulty: 2, fists: 0, toughness: 1 });
});

test('pending rolls persist and history receives one completed result per fight', () => {
  const run = {};
  let saves = 0;
  let readOnly = false;
  const state = createState(() => ({ bookId: 1526, run, readOnly, save: () => { saves++; } }));
  state.change(data => {
    data.fight = startFight(stats, [foes[1]], {});
    beginAttempt(data.fight, 0, 3, dice(2));
  });
  assert.equal(state.read().fight.pending.dice[0].result, 2);
  assert.equal(state.read().fight.player.effort, 21);
  state.change(data => completeAttempt(data.fight, 0));
  state.change(() => {});
  assert.deepEqual(state.read().history.map(item => item.outcome), ['win']);
  readOnly = true;
  assert.equal(state.change(() => { throw Error('should not run in read-only mode'); }), false);
  assert.equal(saves, 3);
});
