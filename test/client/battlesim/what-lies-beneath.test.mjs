import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFight, startCheck, changeDie, currentCheck, finishCheck, resolveRecovery } from '../../../public/js/battlesim/books/1808/combat.js';

const rolls = (...values) => () => {
  assert.ok(values.length, 'Unexpected die roll');
  return values.shift();
};
const player = overrides => ({ hit: 2, dex: 1, vigor: 8, ward: 0, ...overrides });
const single = { living: true, checks: [{ threshold: 4, failVigor: -3 }] };

test('Hit uses the highest die and weapon and crystal retain different limits', () => {
  const f = createFight(single, player({ weapon: true, crystal: true }));
  startCheck(f, {}, rolls(1, 3));
  assert.equal(changeDie(f, 'crystal', 0, rolls(2)), true);
  assert.equal(changeDie(f, 'weapon', 1), true);
  assert.equal(changeDie(f, 'weapon', 0), false);
  assert.deepEqual(finishCheck(f).dice, [2, 4]);
  assert.equal(f.status, 'win');
  assert.equal(finishCheck(f), undefined);
});

test('printed waves advance through target values and shield protects on each qualifying hit', () => {
  const spec = { living: true, survivalWins: true, checks: [
    { threshold: 2, failVigor: -2 }, { threshold: 3, failVigor: -3 }, { threshold: 4, failVigor: -4 },
  ] };
  const f = createFight(spec, player({ shield: true, crystal: true }));
  const die = rolls(1, 1, 1, 1, 1, 1, 3);
  startCheck(f, {}, die);
  assert.equal(changeDie(f, 'crystal', 0, die), true);
  assert.equal(finishCheck(f).damage, 2);
  assert.equal(currentCheck(f).threshold, 3);
  startCheck(f, {}, die);
  assert.equal(changeDie(f, 'crystal', 0, die), false);
  assert.equal(finishCheck(f).damage, 2);
  assert.equal(currentCheck(f).threshold, 4);
  startCheck(f, {}, die);
  assert.equal(finishCheck(f).damage, 3);
  assert.equal(f.player.vigor, 1);
  assert.equal(f.status, 'win');
});

test('six repeated checks and success-count retries use their own stop conditions', () => {
  const step = { threshold: 4, failVigor: -1 };
  const fixed = createFight({ living: true, checks: Array(6).fill(step), survivalWins: true }, player({ hit: 1 }));
  for (let n = 0; n < 6; n++) {
    assert.equal(fixed.status, 'fighting');
    startCheck(fixed, {}, rolls(1));
    finishCheck(fixed);
  }
  assert.equal(fixed.status, 'win');
  assert.equal(fixed.player.vigor, 2);
  const retry = createFight({ living: true, checks: [step], successesRequired: 4 }, player({ hit: 1 }));
  for (const result of [2, 4, 2, 4, 4, 6]) {
    assert.equal(retry.status, 'fighting');
    startCheck(retry, {}, rolls(result));
    finishCheck(retry);
  }
  assert.equal(retry.attempts, 6);
  assert.equal(retry.successes, 4);
  assert.equal(retry.status, 'win');
});

test('ward rolls can skip all checks and trap damage includes player-resolved gates', () => {
  const ward = createFight({ ...single, sequence: 'wardRoll' }, player({ ward: 3 }), {}, rolls(2, 4));
  assert.equal(ward.totalChecks, 0);
  assert.equal(ward.status, 'skipped');
  const trap = createFight({ living: true, sequence: 'trap', survivalWins: true,
    vigorByCombinedSuccesses: [4, 2, 1, 0], checks: [{ threshold: 3 }] },
  player({ hit: 1 }), { dexPassed: true, witPassed: false });
  startCheck(trap, {}, rolls(4));
  assert.equal(finishCheck(trap).damage, 1);
  assert.equal(trap.status, 'win');
});

test('alligator checks enforce the Dex penalty and the starving target', () => {
  const spec = { living: true, sequence: 'alligator', checks: [{ threshold: 5, failVigor: 'die' }] };
  const stuck = createFight(spec, player({ hit: 1, starving: true, ranged: true }), { dexPassed: false });
  assert.equal(currentCheck(stuck).threshold, 6);
  assert.equal(startCheck(stuck, {}, rolls()).forcedResult, false);
  assert.equal(finishCheck(stuck, rolls(3)).damage, 3);
  const ready = createFight(spec, player({ hit: 2, starving: true, pixiePowder: true, ward: 1, fierySpirit: 1 }), { dexPassed: true });
  const check = startCheck(ready, { useFiery: true }, rolls(1, 1, 1, 5));
  assert.equal(check.threshold, 5);
  assert.equal(ready.player.ward, 0);
  assert.equal(ready.player.vigor, 9);
  assert.equal(finishCheck(ready).success, true);
});

test('ranged rolls and potion effects follow the printed conditions', () => {
  const spec = { living: true, checks: [{ threshold: 2 }] };
  const ranged = createFight(spec, player({ dex: 3, ranged: true }));
  const check = startCheck(ranged, {}, rolls(3));
  assert.equal(check.threshold, 1);
  assert.deepEqual(check.dice, []);
  assert.equal(finishCheck(ranged).success, true);
  const potion = createFight(single, player({ silverTongue: 1 }));
  assert.equal(startCheck(potion, { useSilver: true, witPassed: false }, rolls(2, 3)).forcedResult, null);
  assert.equal(potion.player.silverTongue, 0);
  assert.equal(finishCheck(potion).success, false);
  const skeleton = createFight({ ...single, living: false }, player({ silverTongue: 1 }));
  startCheck(skeleton, { useSilver: true, witPassed: true }, rolls(2, 3));
  assert.equal(skeleton.player.silverTongue, 1);
  assert.equal(finishCheck(skeleton).success, false);
});

test('Vigor recovery can prevent ordinary defeat, never a printed instant death', () => {
  const recoverable = createFight(single, player({ hit: 1, vigor: 2, gnomeFood: 1 }));
  startCheck(recoverable, {}, rolls(1));
  finishCheck(recoverable);
  assert.equal(recoverable.stage, 'recovery');
  assert.equal(resolveRecovery(recoverable, 'gnomeFood'), true);
  assert.equal(recoverable.player.vigor, 3);
  const fatal = createFight({ living: true, checks: [{ threshold: 5, fatal: true }] },
    player({ gnomeFood: 1 }));
  startCheck(fatal, {}, rolls(2, 2));
  finishCheck(fatal);
  assert.equal(fatal.status, 'loss');
  assert.equal(resolveRecovery(fatal, 'gnomeFood'), false);
});
