import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIRE_WOLF_SPELLS, createFireWolfMagicSection, enterFireWolfMagicSection,
  castFireWolfSpell, castFireWolfRegentSpell } from '../../../public/js/battlesim/engines/demonspawn/fire-wolf-magic.js';

const low = () => 0, high = () => 0.999;
const player = extra => ({ lifePoints: 200, power: 100, maxPower: 100, ...extra });
const rolls = values => () => values.shift();

test('all ten spell costs match the printed spell table', () => {
  assert.deepEqual(FIRE_WOLF_SPELLS, { armour: 25, crypt: 10, fireball: 15, invisibility: 30,
    paralysis: 30, poisonNeedle: 25, resurrection: 50, retrace: 20, timewarp: 10, xenophobia: 15 });
});

test('failed inclination blocks every spell for the section without consuming power', () => {
  const p = player(), magic = createFireWolfMagicSection(122, p);
  assert.equal(castFireWolfSpell(magic, p, 'armour', {}, low).error, 'no-inclination');
  assert.equal(castFireWolfSpell(magic, p, 'crypt', {}, high).error, 'no-inclination');
  assert.equal(p.power, 100); assert.deepEqual(magic.used, []);
});

test('casting failure spends power and the spell cannot be tried again in that section', () => {
  const p = player(), magic = createFireWolfMagicSection(122, p);
  const r = castFireWolfSpell(magic, p, 'armour', {}, rolls([0.999, 0.999, 0, 0]));
  assert.equal(r.success, false); assert.equal(p.power, 75); assert.equal(magic.armour, 0);
  assert.equal(castFireWolfSpell(magic, p, 'armour', {}, high).error, 'unavailable');
  assert.equal(castFireWolfSpell(magic, p, 'crypt', {}, high).destination, 150);
  assert.equal(p.power, 65);
});

test('affinity succeeds at 4 and a spell succeeds at 6, not only above those thresholds', () => {
  const p = player(), magic = createFireWolfMagicSection(122, p);
  const r = castFireWolfSpell(magic, p, 'armour', {}, rolls([0.2, 0.2, 0.4, 0.4]));
  assert.equal(r.inclinationRoll, 4); assert.equal(r.roll, 6); assert.equal(r.success, true);
  assert.equal(magic.armour, 10);
});

test('missing power or invalid targets cannot consume rolls, affinity, cooldowns or power', () => {
  for (const [spell, extra, options, error] of [
    ['armour', { power: 24 }, {}, 'insufficient-power'],
    ['resurrection', {}, {}, 'wrong-life-state'],
    ['fireball', {}, {}, 'no-target'],
    ['retrace', {}, { destination: 20, visited: [10] }, 'unvisited-destination'],
  ]) {
    const p = player(extra), magic = createFireWolfMagicSection(122, p), before = structuredClone({ p, magic });
    assert.equal(castFireWolfSpell(magic, p, spell, options, () => { throw Error('Unexpected roll'); }).error, error);
    assert.deepEqual({ p, magic }, before);
  }
});

test('new sections regain exactly one Power and reset spells; dialog reopen does neither', () => {
  const p = player({ power: 98 }), first = createFireWolfMagicSection(122, p);
  first.used.push('armour'); first.inclination = false;
  assert.equal(enterFireWolfMagicSection(first, '122', p), first); assert.equal(p.power, 98);
  const second = enterFireWolfMagicSection(first, 124, p);
  assert.equal(p.power, 99); assert.deepEqual(second.used, []); assert.equal(second.inclination, null);
  const third = enterFireWolfMagicSection(second, 146, p); assert.equal(p.power, 100);
  enterFireWolfMagicSection(third, 152, p); assert.equal(p.power, 100);
});

test('Life can explicitly pay missing spell Power one-for-one even when the original maximum is lower than its cost', () => {
  const p = player({ lifePoints: 30, power: 5, maxPower: 5 }), magic = createFireWolfMagicSection(173, p);
  const r = castFireWolfSpell(magic, p, 'armour', { useLife: true }, high);
  assert.equal(r.success, true); assert.equal(r.lifeCost, 20);
  assert.equal(p.lifePoints, 10); assert.equal(p.power, 0); assert.equal(p.maxPower, 5);
  const failed = player({ lifePoints: 30, power: 5 });
  const failedMagic = createFireWolfMagicSection(173, failed);
  const failure = castFireWolfSpell(failedMagic, failed, 'armour', { useLife: true }, rolls([0.999, 0.999, 0, 0]));
  assert.equal(failure.success, false); assert.equal(failed.lifePoints, 10); assert.equal(failed.power, 0);
});

test('Fireball deals fifty Life and does not silently alter any unrelated combat state', () => {
  const p = player(), e = { lifePoints: 100, skill: 70 }, magic = createFireWolfMagicSection(173, p, e);
  assert.equal(castFireWolfSpell(magic, p, 'fireball', { enemy: e }, high).damage, 50);
  assert.equal(e.lifePoints, 50); assert.equal(e.skill, 70); assert.equal(p.lifePoints, 200);
});

test('Poison Needle succeeds only when its immunity die is three or less', () => {
  for (const [immunityRandom, killed] of [[0, true], [0.4, true], [0.6, false]]) {
    const p = player(), e = { lifePoints: 640 }, magic = createFireWolfMagicSection(173, p, e);
    const r = castFireWolfSpell(magic, p, 'poisonNeedle', { enemy: e }, rolls([0.999, 0.999, 0.999, 0.999, immunityRandom]));
    assert.equal(r.immune, !killed); assert.equal(e.lifePoints, killed ? 0 : 640); assert.equal(p.power, 75);
  }
});

test('Resurrection is dead-only and leaves surviving enemy Life untouched', () => {
  const p = player({ lifePoints: 0 }), e = { lifePoints: 51 }, magic = createFireWolfMagicSection(173, p, e);
  const r = castFireWolfSpell(magic, p, 'resurrection', { enemy: e }, high);
  assert.equal(r.rerollCharacter, true); assert.equal(r.destination, '173');
  assert.equal(e.lifePoints, 51); assert.equal(p.power, 50); assert.equal(p.lifePoints, 0);
});

test('Retrace allows any visited section but restores neither Life nor Power', () => {
  const p = player({ lifePoints: 12 }), magic = createFireWolfMagicSection(173, p);
  const r = castFireWolfSpell(magic, p, 'retrace', { destination: 20, visited: ['prologue', '20', 124] }, high);
  assert.equal(r.destination, 20); assert.equal(p.lifePoints, 12); assert.equal(p.power, 80);
});

test('Timewarp restores both section-entry Life snapshots, not natural maxima or spent Power', () => {
  const p = player(), e = { lifePoints: 300 }, magic = createFireWolfMagicSection(173, p, e);
  p.lifePoints = 20; e.lifePoints = 10;
  castFireWolfSpell(magic, p, 'timewarp', { enemy: e }, high);
  assert.equal(p.lifePoints, 200); assert.equal(e.lifePoints, 300); assert.equal(p.power, 90);
});

test('Invisibility, Paralysis and Xenophobia return distinct printed effects', () => {
  const p = player(), e = { lifePoints: 300 }, magic = createFireWolfMagicSection(173, p, e);
  castFireWolfSpell(magic, p, 'invisibility', {}, high); assert.equal(magic.invisible, true);
  assert.equal(castFireWolfSpell(magic, p, 'paralysis', { enemy: e }, high).avoidCombat, true);
  castFireWolfSpell(magic, p, 'xenophobia', { enemy: e }, high); assert.equal(magic.enemyDamageReduction, 5);
});

test('Regent spells cost a separate 2d6 Life even when they fail', () => {
  const regent = { lifePoints: 610 };
  const r = castFireWolfRegentSpell(regent, 'firebolt', rolls([0.999, 0.999, 0, 0]));
  assert.equal(r.cost, 12); assert.equal(r.success, false); assert.equal(regent.lifePoints, 598);
});

test('Regent spell effects match the printed values, without inventing a Leprosy rounding rule', () => {
  for (const [spell, key, expected] of [['blight', 'paralysisRounds', 2], ['timetrap', 'destination', 120],
    ['crackOfDoom', 'damage', 50], ['firebolt', 'damage', 75], ['leprosy', 'leprosyPercent', 10]]) {
    assert.equal(castFireWolfRegentSpell({ lifePoints: 610 }, spell, high)[key], expected);
  }
});
