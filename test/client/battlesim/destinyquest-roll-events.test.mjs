import test from 'node:test';
import assert from 'node:assert/strict';
import { createWinterFight } from './destinyquest-fixtures.mjs';
import { startDestinyRound, rollDestinySpeed, resolveDestinySpeed, rollDestinyDamage, resolveDestinyDamage,
  endDestinyRound, skipDestinyDeathMove } from '../../../public/js/battlesim/engines/destinyquest/core.js';
import { useDestinyAbility as use } from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import { resolveDestinyAbilityRoll as resolve } from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';
import { destinyStat } from '../../../public/js/battlesim/engines/destinyquest/effects.js';

const rolls = (...values) => () => { assert.ok(values.length, 'Unexpected roll'); return values.shift(); };
const preset = (section, abilities = {}, hero = {}, options = {}) => createWinterFight({ speed: 20, brawn: 4, magic: 3,
  armour: 2, health: 80, maxHealth: 80, ...hero }, section, { abilities, ...options });
const end = fight => endDestinyRound(fight.phase === 'death-move' ? skipDestinyDeathMove(fight) : fight, [], rolls());
const attack = (fight, face = 1) => resolveDestinyDamage(rollDestinyDamage(fight, rolls(face)));

test('Caul doubles lock rerolls without applying his rule to the tentacles or blocking other modifiers', () => {
  let fight = rollDestinySpeed(startDestinyRound(preset(737, { boneshaker: 1, cunning: 1 }), 0), rolls(6, 5, 2, 2));
  assert.throws(() => use(fight, 'boneshaker'), /cannot alter/);
  fight = use(fight, 'cunning');
  assert.equal(resolveDestinySpeed(fight).turn.winner, 'opponent');
  fight = rollDestinySpeed(startDestinyRound(preset(737, { boneshaker: 1 }), 1), rolls(6, 5, 2, 2));
  fight = use(fight, 'boneshaker', {}, rolls(3, 4));
  assert.equal(resolveDestinySpeed(fight).turn.winner, 'hero');
});

test('Fafnir drains both attributes permanently only while its tentacles live', () => {
  let fight = attack(resolveDestinySpeed(rollDestinySpeed(startDestinyRound(preset(737), 0), rolls(6, 5, 2, 3))));
  fight = end(resolve(endDestinyRound(fight, [], rolls(3))));
  assert.equal(destinyStat(fight, 'hero', 'brawn'), 3);
  assert.equal(destinyStat(fight, 'hero', 'magic'), 2);
  fight.opponents[1].health = 0;
  fight = end(attack(resolveDestinySpeed(rollDestinySpeed(startDestinyRound(fight, 0), rolls(6, 5, 2, 3)))));
  assert.equal(destinyStat(fight, 'hero', 'brawn'), 3);
});

test('Blue Angel forbids active and passive abilities while her daggers keep dealing end damage', () => {
  let fight = startDestinyRound(preset(716, { frenzy: 1, decay: 1 }), 0);
  assert.throws(() => use(fight, 'frenzy'), /unavailable/);
  fight = end(attack(resolveDestinySpeed(rollDestinySpeed(fight, rolls(6, 5, 2, 3)))));
  assert.equal(fight.opponents[0].health, 68);
  assert.equal(fight.hero.health, 78);
});

test('each prison guardian releases its own manacle and Gjoll pestilence starts next round', () => {
  let fight = preset(594, {}, { brawn: 60 });
  const turn = target => {
    fight = attack(resolveDestinySpeed(rollDestinySpeed(startDestinyRound(fight, target), rolls(6, 5, 2, 3))));
    fight = end(fight);
  };
  turn(1);
  assert.equal(fight.opponents[0].health, 130);
  assert.equal(fight.hero.health, 78); // Reflection before Sephix falls, no living Sephix end damage.
  assert.equal(destinyStat(fight, 'hero', 'armour'), 1);
  turn(2);
  assert.equal(fight.opponents[0].health, 125);
  assert.equal(fight.opponents[0].armour, 4);
  assert.equal(destinyStat(fight, 'hero', 'armour'), 1);
  turn(3);
  assert.equal(fight.opponents[0].magic, 4);
  turn(4);
  assert.equal(destinyStat(fight, 0, 'speed'), 11);
  assert.equal(destinyStat(fight, 'hero', 'speed'), 20);
});

test('Gjoll victory defeats remaining guardians and multi-target dice reflect once per victim', () => {
  let fight = preset(594, { cleave: 1 }, { brawn: 0, magic: 0 });
  fight = resolveDestinySpeed(rollDestinySpeed(startDestinyRound(fight, 0), rolls(6, 5, 2, 3)));
  fight = use(fight, 'cleave', { deferDamage: true }, rolls(1));
  fight = resolve(fight);
  assert.equal(fight.hero.health, 70);
  fight = preset(594, {}, { brawn: 200 });
  fight = attack(resolveDestinySpeed(rollDestinySpeed(startDestinyRound(fight, 0), rolls(6, 5, 2, 3))));
  assert.equal(fight.status, 'win');
  assert.deepEqual(fight.opponents.map(enemy => enemy.health), [0, 0, 0, 0, 0]);
});

test('Sabin knives apply to original and newly rerolled ones, without recounting unchanged dice', () => {
  let fight = rollDestinySpeed(startDestinyRound(preset(655, { feint: 1, charm: 1 }), 0), rolls(1, 1, 2, 3));
  assert.equal(fight.hero.health, 76);
  fight = use(fight, 'feint', { dice: [0] }, rolls(1));
  assert.equal(fight.hero.health, 74);
  fight = use(fight, 'charm', { die: 1 }, rolls(6));
  assert.equal(fight.hero.health, 74);
  fight = end(attack(resolveDestinySpeed(fight)));
  assert.equal(fight.hero.health, 70);
});

test('saved hero ones do not count as fresh knife rolls', () => {
  let fight = preset(655);
  fight.savedHeroDie = { round: 1, value: 1 };
  fight = rollDestinySpeed(startDestinyRound(fight, 0), rolls(1, 2, 3));
  assert.equal(fight.hero.health, 78);
  assert.deepEqual(fight.turn.heroSpeedDice, [1, 1]);
});

test('terrordactyl doubles force a loss and block combat and modifier abilities for that round', () => {
  let fight = rollDestinySpeed(startDestinyRound(preset(387, { command: 1, boneshaker: 1 }), 0), rolls(6, 5, 2, 2));
  assert.throws(() => use(fight, 'boneshaker'), /blocked/);
  fight = resolveDestinySpeed(fight);
  assert.equal(fight.turn.winner, 'opponent');
  assert.throws(() => use(fight, 'command'), /blocked/);
  fight = end(attack(fight));
  fight = rollDestinySpeed(startDestinyRound(fight, 0), rolls(6, 5, 2, 3));
  fight = use(fight, 'boneshaker', {}, rolls(2, 3));
  assert.equal(fight.used.boneshaker, 1);
});

test('a terrordactyl double rolled by Boneshaker still triggers dive bomb', () => {
  let fight = rollDestinySpeed(startDestinyRound(preset(387, { boneshaker: 1 }), 0), rolls(6, 5, 2, 3));
  fight = use(fight, 'boneshaker', {}, rolls(4, 4));
  assert.equal(resolveDestinySpeed(fight).turn.winner, 'opponent');
});

test('mammoth trunk damage remains editable and a new double after reroll triggers a second whack', () => {
  let fight = rollDestinySpeed(startDestinyRound(preset(419, { watchful: 1, feint: 1 }), 0), rolls(3, 3, 2, 4, 6, 2));
  assert.equal(fight.phase, 'ability-rolled');
  assert.equal(destinyStat(fight, 'hero', 'armour'), 1);
  fight = resolve(use(fight, 'watchful', { die: 0 }));
  assert.equal(fight.hero.health, 77);
  fight = use(fight, 'feint', { dice: [0] }, rolls(3, 1, 2));
  assert.equal(fight.phase, 'ability-rolled');
  fight = resolve(JSON.parse(JSON.stringify(fight)));
  assert.equal(fight.hero.health, 74);
  assert.equal(destinyStat(fight, 'hero', 'armour'), 0);
});

test('a mammoth damage six expands to exactly three dice and slows only the following round', () => {
  let fight = resolveDestinySpeed(rollDestinySpeed(startDestinyRound(preset(419, {}, { speed: 3 }), 0), rolls(1, 2, 6, 5)));
  fight = rollDestinyDamage(fight, rolls(6, 6, 6));
  assert.deepEqual(fight.turn.damageDice, [6, 6, 6]);
  fight = end(resolveDestinyDamage(fight));
  fight = startDestinyRound(fight, 0);
  assert.equal(destinyStat(fight, 'hero', 'speed'), 2);
  fight = resolveDestinySpeed(rollDestinySpeed(fight, rolls(6, 5, 1, 2)));
  fight = end(attack(fight));
  fight = startDestinyRound(fight, 0);
  assert.equal(destinyStat(fight, 'hero', 'speed'), 3);
});

test('killing the mammoth with a roll passive cannot bypass its pending simultaneous trunk damage', () => {
  let fight = use(preset(419, { 'sweet-spot': 1 }, { health: 2, maxHealth: 80 }), 'sweet-spot', { number: 2 });
  fight.opponents[0].health = 1;
  fight = rollDestinySpeed(startDestinyRound(fight, 0), rolls(3, 3, 2, 4, 1, 1));
  assert.equal(fight.opponents[0].health, 0);
  assert.equal(fight.status, 'active');
  assert.equal(fight.phase, 'ability-rolled');
  fight = resolve(fight);
  assert.equal(fight.status, 'loss');
});

test('Hyperbole charges for its current armour on both original and rerolled doubles', () => {
  let fight = use(startDestinyRound(preset(681, { insight: 1, boneshaker: 1 }), 0), 'insight');
  fight = rollDestinySpeed(fight, rolls(6, 5, 2, 2));
  assert.equal(fight.hero.health, 78);
  fight = use(fight, 'boneshaker', {}, rolls(4, 4));
  assert.equal(fight.hero.health, 76);
});

test('Hyperbole tongue stages health damage and its next-round slow without replaying the test', () => {
  let fight = attack(resolveDestinySpeed(rollDestinySpeed(startDestinyRound(preset(681), 0), rolls(6, 5, 2, 3))));
  fight = resolve(endDestinyRound(fight, [], rolls(2)));
  fight = end(fight);
  assert.equal(fight.hero.health, 78);
  fight = startDestinyRound(fight, 0);
  assert.equal(destinyStat(fight, 'hero', 'speed'), 19);
});

test('chimera tail lashes on original and rerolled doubles only while the tail lives', () => {
  let fight = rollDestinySpeed(startDestinyRound(preset(693, { feint: 1, charm: 1 }), 0), rolls(3, 3, 2, 4));
  assert.equal(fight.hero.health, 75);
  fight = use(fight, 'feint', { dice: [0] }, rolls(3));
  assert.equal(fight.hero.health, 70);
  fight.opponents[2].health = 0;
  fight = use(fight, 'charm', { die: 0 }, rolls(3));
  assert.equal(fight.hero.health, 70);
});

test('chimera head drains persist, living troll arms heal living parts, and the career bonus is explicit', () => {
  let fight = preset(693, { bleed: 1 }, { brawn: 12, magic: 10 }, { character: { career: 'einherjar' } });
  fight = attack(resolveDestinySpeed(rollDestinySpeed(startDestinyRound(fight, 0), rolls(6, 5, 2, 3))));
  assert.equal(fight.turn.damageScore, 16);
  fight = end(fight);
  assert.equal(fight.opponents[0].health, 31); // Eleven damage, two troll healing, no Bleed.
  assert.equal(destinyStat(fight, 'hero', 'brawn'), 11);
  assert.equal(destinyStat(fight, 'hero', 'magic'), 9);
  fight.opponents[0].health = 0;
  fight.opponents[1].health = 0;
  fight = end(attack(resolveDestinySpeed(rollDestinySpeed(startDestinyRound(fight, 2), rolls(6, 5, 2, 3)))));
  assert.equal(fight.opponents[0].health, 0);
  assert.equal(destinyStat(fight, 'hero', 'brawn'), 11);
});
