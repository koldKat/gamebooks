import test from 'node:test';
import assert from 'node:assert/strict';
import { INNSMOUTH_ENCOUNTERS, rollInnsmouthCharacter, innsmouthWeightPenalty, innsmouthTest,
  createInnsmouthFight, attackInnsmouth, innsmouthTurn, openingInnsmouthShot,
  throwInnsmouthKnife, divertInnsmouthEnemy, eatInnsmouthRation, finishInnsmouthFight } from '../../../public/js/battlesim/engines/innsmouth.js';

const player = values => ({ ...rollInnsmouthCharacter(() => .5), ...values });
const fight = (section = 64, values = {}) => createInnsmouthFight(section, player(values));
const random = (...rolls) => { let i = 0; return () => ((rolls[i++] ?? 1) - .5) / 6; };

test('Innsmouth starts with printed attributes, three meals, six bullets and fifteen Health', () => {
  const p = rollInnsmouthCharacter(() => 0);
  for (const key of ['speed', 'accuracy', 'stealth', 'detection', 'power']) assert.equal(p[key], 7);
  assert.equal(p.health, 15); assert.equal(p.rations, 3); assert.equal(p.bullets, 6); assert.equal(p.weight, 3);
  assert.equal(p.conspicuousness, 4); assert.equal(p.weaponDamage, 2);
});

test('all twenty-seven encounters retain source profiles and pre-applied surprise damage', () => {
  assert.equal(INNSMOUTH_ENCOUNTERS.length, 27);
  for (const e of INNSMOUTH_ENCOUNTERS) { assert.ok(Object.isFrozen(e)); assert.ok(e.enemies.every(Object.isFrozen)); }
  assert.equal(fight(253).enemies[0].health, 6);
  assert.equal(fight(294).enemies[1].health, 4);
  assert.equal(fight(595).enemies[0].health, 4);
});

test('standard tests include equality; Conspicuousness requires strictly greater', () => {
  assert.equal(innsmouthTest(player({ accuracy: 8 }), 'accuracy', random(4, 4)).success, true);
  assert.equal(innsmouthTest(player({ conspicuousness: 8 }), 'conspicuousness', random(4, 4)).success, false);
  assert.equal(innsmouthTest(player({ conspicuousness: 8 }), 'conspicuousness', random(4, 5)).success, true);
});

test('weight penalties apply at21/36, only to Speed/Stealth, and reject overcapacity', () => {
  assert.deepEqual([20, 21, 35, 36, 40].map(innsmouthWeightPenalty), [0, 1, 1, 2, 2]);
  assert.throws(() => innsmouthWeightPenalty(41));
  assert.equal(innsmouthTest(player({ speed: 8, weight: 21 }), 'speed', random(4, 4)).success, false);
  assert.equal(innsmouthTest(player({ accuracy: 8, weight: 21 }), 'accuracy', random(4, 4)).success, true);
});

test('initiative resolves Speed, Accuracy, Health, then player equality', () => {
  assert.equal(innsmouthTurn(fight(64, { speed: 5, accuracy: 8, health: 5 })), -1);
  assert.equal(innsmouthTurn(fight(64, { speed: 5, accuracy: 8, health: 4 })), 0);
  assert.equal(innsmouthTurn(fight(64, { speed: 5, accuracy: 7 })), 0);
  assert.equal(innsmouthTurn(fight(64, { speed: 6 })), -1);
});

test('one ordinary attack per turn alternates; misses cause zero damage', () => {
  const f = fight(); assert.equal(innsmouthTurn(f), -1);
  assert.equal(attackInnsmouth(f, 0, false, random(6, 6)).damage, 0);
  assert.equal(innsmouthTurn(f), 0);
  assert.equal(attackInnsmouth(f, 0, false, random(1, 1)).damage, 3);
  assert.equal(f.player.health, 12); assert.equal(innsmouthTurn(f), -1); assert.equal(f.round, 2);
});

test('gun miss spends a bullet and adds two Conspicuousness', () => {
  const f = fight(); const result = attackInnsmouth(f, 0, true, random(1));
  assert.equal(result.damage, 0); assert.equal(f.player.bullets, 5); assert.equal(f.player.conspicuousness, 6);
});

test('gun uses face damage2..5 and outright kill6, not Accuracy or weapon damage', () => {
  const f = fight(78, { speed: 12, accuracy: 0 });
  assert.equal(attackInnsmouth(f, 0, true, random(5)).damage, 5); assert.equal(f.enemies[0].health, 10);
  attackInnsmouth(f, 0, false, random(6, 6));
  assert.equal(attackInnsmouth(f, 0, true, random(6)).damage, 10); assert.equal(f.status, 'win');
});

test('empty gun does not consume the turn or mutate state', () => {
  const f = fight(64, { bullets: 0 }), before = structuredClone(f);
  assert.equal(attackInnsmouth(f, 0, true), null); assert.deepEqual(f, before);
});

test('simultaneous fights permit one player attack and one attack per surviving enemy per round', () => {
  const f = fight(74, { speed: 12, accuracy: 12 });
  assert.deepEqual(f.queue, [-1, 0, 1]);
  attackInnsmouth(f, 1, false, random(1, 1));
  assert.deepEqual(f.queue, [0, 1]); assert.equal(f.enemies[1].health, 4);
  attackInnsmouth(f, 1, false, random(6, 6)); attackInnsmouth(f, 1, false, random(6, 6));
  assert.deepEqual(f.queue, [-1, 0, 1]); assert.equal(f.round, 2);
});

test('killed simultaneous enemies lose their scheduled turn and cannot be targeted', () => {
  const f = fight(74, { speed: 12, weaponDamage: 10, accuracy: 12 });
  attackInnsmouth(f, 0, false, random(1, 1)); assert.deepEqual(f.queue, [1]);
  attackInnsmouth(f, 1, false, random(6, 6));
  const before = structuredClone(f); assert.equal(attackInnsmouth(f, 0), null); assert.deepEqual(f, before);
});

test('sequential fights activate the next enemy with fresh initiative, never an untouched full group', () => {
  const f = fight(45, { speed: 7, accuracy: 12, weaponDamage: 6 });
  assert.equal(innsmouthTurn(f), -1);
  attackInnsmouth(f, 0, false, random(1, 1));
  assert.equal(f.sequence, 1); assert.equal(f.status, 'fighting'); assert.equal(innsmouthTurn(f), 1);
});

test('section397 ends after first death rather than requiring three kills', () => {
  const f = fight(397, { weaponDamage: 5, accuracy: 12 });
  attackInnsmouth(f, 0, false, random(1, 1));
  assert.equal(f.status, 'win'); assert.equal(f.enemies[1].health, 6);
});

test('printed section560 optional shot precedes initiative and can be declined', () => {
  const f = fight(560); assert.equal(attackInnsmouth(f), null);
  assert.equal(openingInnsmouthShot(f, true, random(6)).damage, 8); assert.equal(f.status, 'win');
  const g = fight(560, { bullets: 0 }); assert.equal(openingInnsmouthShot(g, true), null);
  assert.equal(openingInnsmouthShot(g, false).skipped, true); assert.ok(attackInnsmouth(g));
});

test('throwing knife is free, once per combat, recoverable except on miss and does not add noise', () => {
  const f = fight(78, { speed: 12, throwingKnife: true });
  assert.equal(throwInnsmouthKnife(f, 0, random(3)).damage, 3);
  assert.equal(innsmouthTurn(f), -1); assert.equal(f.player.conspicuousness, 4); assert.equal(f.player.bullets, 6);
  assert.equal(throwInnsmouthKnife(f), null);
  f.enemies[0].health = 0; finishInnsmouthFight(f); assert.equal(f.player.throwingKnife, true);
  const g = fight(64, { throwingKnife: true }); throwInnsmouthKnife(g, 0, random(1));
  g.enemies[0].health = 0; finishInnsmouthFight(g); assert.equal(g.player.throwingKnife, false);
});

test('successful diversion marks avoidance without fabricating an XP victory', () => {
  const f = fight(387); assert.equal(divertInnsmouthEnemy(f), true); assert.equal(f.sequence, 1);
  divertInnsmouthEnemy(f); assert.equal(f.status, 'avoided'); assert.equal(f.enemies[0].health, 7);
  assert.equal(divertInnsmouthEnemy(fight(74)), false);
});

test('food restores three, respects initialHealth and reduces carried weight outside combat only', () => {
  const p = player({ health: 14 }); assert.equal(eatInnsmouthRation(p, null), true);
  assert.equal(p.health, 15); assert.equal(p.rations, 2); assert.equal(p.weight, 2);
  assert.equal(eatInnsmouthRation(p, null), false);
  assert.equal(eatInnsmouthRation(player({ health: 10 }), fight()), false);
  assert.equal(eatInnsmouthRation(player({ health: 10 }), null, true), false);
  assert.equal(eatInnsmouthRation(player({ health: 0 }), null), false);
});

test('death always takes priority and finished fights are mutation neutral', () => {
  const f = fight(); f.player.health = f.enemies[0].health = 0; finishInnsmouthFight(f);
  assert.equal(f.status, 'loss'); const before = structuredClone(f);
  assert.equal(attackInnsmouth(f), null); assert.deepEqual(f, before);
});

test('invalid characters and unavailable encounters are rejected without modifying the caller', () => {
  assert.throws(() => fight(999)); assert.throws(() => fight(64, { health: 0 }));
  assert.throws(() => fight(64, { conspicuousness: 3 })); assert.throws(() => fight(64, { weight: 41 }));
  const p = player(); createInnsmouthFight(64, p); assert.equal(p.health, 15);
});
