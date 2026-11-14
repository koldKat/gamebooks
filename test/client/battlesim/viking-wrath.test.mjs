import test from 'node:test';
import assert from 'node:assert/strict';
import {startFight, combatAction, validateFight} from '../../../public/js/battlesim/books/731/combat.js';

const enemy = (strength = 11, energy = 5) => ({name:'Отар', section:'371', strength, energy});
const player = (strength = 11, energy = 5) => ({strength, energy});
const round = (fight, playerDie, enemyDie) => combatAction(fight,
  {kind:'round', expectedRevision:fight.revision, playerDie, enemyDie});

test('731 applies the printed opening strength adjustment once, to the weaker fighter', () => {
  assert.equal(startFight(player(10), enemy()).player.energy, 4);
  assert.equal(startFight(player(13), enemy()).opponent.energy, 3);
  const original = startFight(player(), enemy());
  assert.equal(original.player.energy, 5);
  const next = round(original, 5, 3);
  assert.equal(next.opponent.energy, 4);
  assert.equal(original.opponent.energy, 5);
  assert.equal(next.player.energy, 5);
});

test('731 extended combat uses strength plus 1d6; differences of zero or one cause no injury', () => {
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) {
    const fight = round(startFight(player(), enemy()), a, b);
    assert.equal(fight.player.energy, 5 - Number(b - a > 1));
    assert.equal(fight.opponent.energy, 5 - Number(a - b > 1));
    assert.equal(fight.status, 'fighting');
  }
  let fight = startFight(player(11, 2), enemy(11, 1));
  fight = round(fight, 6, 1);
  assert.equal(fight.status, 'win');
  assert.equal(fight.destination, 372);
  fight = round(startFight(player(11, 1), enemy()), 1, 6);
  assert.equal(fight.status, 'loss');
  assert.equal(fight.dead, true);
  assert.equal(fight.destination, 389);
});

test('731 quick combat adds adjusted energy and distinguishes both victories, rescue and death', () => {
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) {
    const fight = round(startFight(player(), enemy(), 'quick'), a, b);
    const difference = a - b;
    assert.equal(fight.destination, difference > 1 ? 372 : difference === 1 ? 377 : difference === 0 ? 382 : 389);
    assert.equal(fight.status, difference > 0 ? 'win' : 'loss');
    assert.equal(fight.rescued, difference === 0);
    assert.equal(fight.player.energy, difference === 0 ? 4 : 5);
    assert.equal(fight.dead, difference < 0);
  }
  const adjusted = round(startFight(player(13), enemy(), 'quick'), 1, 1);
  assert.equal(adjusted.events.at(-1).playerTotal, 19);
  assert.equal(adjusted.events.at(-1).enemyTotal, 15);
  const depletedEnemy = startFight(player(20), enemy(), 'quick');
  assert.equal(depletedEnemy.status, 'fighting');
  assert.equal(depletedEnemy.opponent.energy, 0);
  assert.equal(round(depletedEnemy, 1, 1).destination, 372);
  const fatalRescue = round(startFight(player(11, 1), enemy(11, 1), 'quick'), 3, 3);
  assert.equal(fatalRescue.destination, 382);
  assert.equal(fatalRescue.rescued, false);
  assert.equal(fatalRescue.dead, true);
});

test('731 zero energy ends combat at setup and stale or repeated actions cannot resolve twice', () => {
  assert.equal(startFight(player(1, 1), enemy()).status, 'loss');
  assert.equal(startFight(player(20), enemy()).status, 'win');
  const fight = startFight(player(), enemy());
  assert.throws(() => combatAction(fight, {kind:'round', expectedRevision:1}), /Stale/);
  assert.throws(() => round(fight, 0, 1), /Invalid/);
  assert.throws(() => round(fight, 1.5, 1), /Invalid/);
  assert.throws(() => startFight(player(), enemy(), 'unknown'), /Invalid/);
  const completed = round(startFight(player(), enemy(), 'quick'), 6, 1);
  assert.throws(() => round(completed, 6, 1), /Stale/);
  assert.deepEqual(validateFight(JSON.parse(JSON.stringify(completed))), completed);
});
