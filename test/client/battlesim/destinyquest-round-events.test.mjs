import test from 'node:test';
import assert from 'node:assert/strict';
import { createDestinyFight, startDestinyRound, rollDestinySpeed, resolveDestinySpeed,
  rollDestinyDamage, resolveDestinyDamage, endDestinyRound, retargetDestinyRound } from '../../../public/js/battlesim/engines/destinyquest/core.js';
import { configureDestinyAbilities, useDestinyAbility as use } from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import { resolveDestinyAbilityRoll as resolve } from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';
import { destinyStat, addDestinyStatEffect } from '../../../public/js/battlesim/engines/destinyquest/effects.js';

const rolls = (...values) => () => { assert.ok(values.length, 'Unexpected roll'); return values.shift(); };
const foes = (count = 1) => Array.from({ length: count }, (_, index) =>
  ({ name: 'Foe ' + index, speed: 2, brawn: 4, armour: 3, health: 80 }));
const setup = (abilities, equipment = {}, opponents = foes(), hero = {}) => configureDestinyAbilities(
  createDestinyFight({ speed: 2, brawn: 4, magic: 3, armour: 2, health: 20, maxHealth: 30, ...hero }, opponents), abilities, equipment);
const start = (...args) => startDestinyRound(setup(...args), 0);
const speed = (fight, ...dice) => resolveDestinySpeed(rollDestinySpeed(fight, rolls(...dice)));
const win = fight => speed(fight, 6, 6, 1, 1);
const hit = (fight, value = 1) => resolveDestinyDamage(rollDestinyDamage(fight, rolls(value)));

test('first blood and first cut apply once before combat and trigger harmful hit passives', () => {
  let fight = use(setup({ 'first-blood': 1, 'first-cut': 1, bleed: 1, venom: 1 }), 'first-blood', { target: 0 });
  assert.equal(fight.opponents[0].health, 76);
  fight = use(fight, 'first-cut', { target: 0 });
  assert.equal(fight.opponents[0].health, 75);
  assert.throws(() => use(fight, 'first-blood', { target: 0 }), /once/);
  assert.throws(() => configureDestinyAbilities(fight, {}), /before combat/);
  fight = endDestinyRound(speed(startDestinyRound(fight, 0), 3, 3, 3, 3));
  assert.equal(fight.opponents[0].health, 72);
});

test('snap jack triggers exactly at its rolled round, needs a victim then, and ignores armour', () => {
  let fight = use(setup({ 'best-laid-plans': 1 }), 'best-laid-plans', { trap: 'snap-jack' }, rolls(2));
  fight = endDestinyRound(speed(startDestinyRound(fight, 0, rolls()), 3, 3, 3, 3));
  const before = structuredClone(fight);
  assert.throws(() => startDestinyRound(fight, 0, rolls()), /trap/);
  assert.deepEqual(fight, before);
  fight = startDestinyRound(fight, 0, rolls(), { trapTargets: [0] });
  assert.equal(fight.opponents[0].health, 70);
  fight = endDestinyRound(speed(fight, 3, 3, 3, 3));
  fight = startDestinyRound(fight, 0, rolls());
  assert.equal(fight.opponents[0].health, 70);
});

test('cluster mine accepts chosen victims up to its trigger count and has editable separate damage dice', () => {
  let fight = use(setup({ 'best-laid-plans': 1, charm: 1 }, {}, foes(3)), 'best-laid-plans', { trap: 'cluster-mine' }, rolls(2));
  fight = endDestinyRound(speed(startDestinyRound(fight, 0), 3, 3, 3, 3));
  assert.throws(() => startDestinyRound(fight, 0, rolls(), { trapTargets: [0, 1, 2] }), /trap/);
  fight = startDestinyRound(fight, 0, rolls(1, 2), { trapTargets: [0, 2], deferTrapDamage: true });
  assert.equal(fight.phase, 'ability-rolled');
  fight = resolve(use(fight, 'charm', { group: 1, die: 0 }, rolls(6)));
  assert.deepEqual(fight.opponents.map(e => e.health), [79, 80, 74]);
  assert.deepEqual([0, 1, 2].map(i => destinyStat(fight, i, 'armour')), [2, 3, 2]);
  assert.equal(fight.phase, 'speed');
});

test('Vortex starts on the subsequent round, uses an unmodifiable die and affects everyone in its chosen band', () => {
  let fight = use(win(start({ vortex: 1, charm: 1 }, {}, foes(2))), 'vortex');
  fight = endDestinyRound(fight, [], rolls());
  fight = startDestinyRound(fight, 0, rolls(1));
  assert.equal(fight.hero.health, 18);
  assert.throws(() => use(fight, 'charm', { die: 0 }, rolls(6)), /unavailable/);
  fight = endDestinyRound(speed(fight, 3, 3, 3, 3));
  fight = startDestinyRound(fight, 0, rolls(3));
  assert.deepEqual(fight.opponents.map(e => e.health), [78, 78]);
  assert.equal(fight.history.filter(row => row.type === 'round-event').length, 2);
});

test('Dry Ice chooses a fresh one-round speed effect at each subsequent round start', () => {
  for (const result of [1, 3, 6]) {
    let fight = endDestinyRound(use(win(start({ 'dry-ice': 1 }, {}, foes(2))), 'dry-ice'));
    fight = startDestinyRound(fight, 0, rolls(result));
    assert.equal(destinyStat(fight, 'hero', 'speed'), result === 1 ? 1 : 2);
    assert.deepEqual([0, 1].map(i => destinyStat(fight, i, 'speed')), result === 6 ? [0, 0] : [2, 2]);
    fight = endDestinyRound(hit(win(fight)));
    fight = startDestinyRound(fight, 0, rolls(3));
    assert.equal(destinyStat(fight, 'hero', 'speed'), 2);
    assert.equal(destinyStat(fight, 0, 'speed'), 2);
  }
});

test('Crystal Armour checks all six shatter outcomes even when armour prevents health damage', () => {
  for (const result of [1, 2, 3, 4, 5, 6]) {
    let fight = use(win(start({ 'crystal-armour': 1 }, { leftHand: { id: 'syns-heart' } }, foes(), { armour: 99 })), 'crystal-armour');
    fight = endDestinyRound(fight);
    assert.equal(fight.opponents[0].health, 79);
    fight = speed(startDestinyRound(fight, 0), 1, 1, 6, 6);
    fight = resolveDestinyDamage(rollDestinyDamage(fight, rolls(6)), rolls(result));
    assert.equal(fight.turn.healthDamage, 0);
    assert.equal(fight.phase, 'ability-rolled');
    fight = resolve(fight);
    assert.equal(fight.crystalArmour, result >= 5);
    assert.equal(fight.hero.health, result <= 2 ? 16 : 20);
    assert.equal(destinyStat(fight, 'hero', 'armour'), result >= 5 ? 102 : 99);
    fight = endDestinyRound(fight);
    assert.equal(fight.opponents[0].health, result >= 5 ? 78 : 79);
  }
});

test('Crystal Armour can be saved with Charm, and an avoided attack requires no shatter roll', () => {
  let fight = use(win(start({ 'crystal-armour': 1, charm: 1 }, { leftHand: { id: 'syns-heart' } })), 'crystal-armour');
  fight = speed(startDestinyRound(endDestinyRound(fight), 0), 1, 1, 6, 6);
  fight = resolveDestinyDamage(rollDestinyDamage(fight, rolls(1)), rolls(1));
  fight = resolve(use(fight, 'charm', { die: 0 }, rolls(6)));
  assert.equal(fight.crystalArmour, true);
  fight = use(win(start({ 'crystal-armour': 1, dodge: 1 }, { leftHand: { id: 'syns-heart' } })), 'crystal-armour');
  fight = speed(startDestinyRound(endDestinyRound(fight), 0), 1, 1, 6, 6);
  fight = use(fight, 'dodge');
  fight = resolveDestinyDamage(rollDestinyDamage(fight, rolls(6)), rolls());
  assert.equal(fight.phase, 'end');
  assert.equal(fight.crystalArmour, true);
});

test('Armour Plating rounds transport toughness down and remains a combat-only bonus', () => {
  let fight = use(setup({ 'armour-plating': 1 }, { transport: { toughness: 9 } }), 'armour-plating');
  assert.equal(destinyStat(fight, 'hero', 'armour'), 6);
  assert.equal(fight.hero.normal.armour, 2);
  assert.throws(() => use(fight, 'armour-plating'), /once/);
});

test('Ice Mantle adds its permanent bonus once, supports an already-included bonus, and blocks armour reductions', () => {
  for (const included of [true, false]) {
    const fight = use(setup({ 'ice-mantle': 1 }), 'ice-mantle', { bonusAlreadyIncluded: included });
    const expected = included ? 2 : 4;
    assert.equal(fight.hero.normal.armour, expected);
    addDestinyStatEffect(fight, 'hero', 'armour', -9, null, 'test');
    assert.equal(destinyStat(fight, 'hero', 'armour'), expected);
  }
});

test('Sweet Spot and Exploit count real opponent rolls and rerolls, rather than die substitutions', () => {
  let fight = use(setup({ 'sweet-spot': 1, exploit: 1, boneshaker: 1, sneak: 1 }), 'sweet-spot', { number: 1 });
  fight = rollDestinySpeed(startDestinyRound(fight, 0), rolls(6, 6, 1, 6));
  assert.equal(fight.opponents[0].health, 77);
  fight = use(fight, 'boneshaker', {}, rolls(1, 1));
  assert.equal(fight.opponents[0].health, 71);
  fight = use(fight, 'sneak', { die: 0 });
  assert.equal(fight.opponents[0].health, 71);
});

test('Brittle Edge triggers on an enemy damage roll even when it causes no health damage', () => {
  let fight = speed(start({ 'brittle-edge': 1 }, {}, foes(), { armour: 99 }), 1, 1, 6, 6);
  fight = hit(fight, 1);
  assert.equal(fight.hero.health, 20);
  assert.equal(fight.opponents[0].health, 78);
});

test('Malefic Runes awards one magic per distinct defeated foe, including passive deaths', () => {
  const opponents = foes(3); opponents[0].health = 1; opponents[1].health = 1;
  let fight = start({ barbs: 1, 'malefic-runes': 1 }, {}, opponents);
  fight = endDestinyRound(speed(fight, 3, 3, 3, 3));
  assert.equal(destinyStat(fight, 'hero', 'magic'), 5);
  assert.deepEqual(fight.defeated, [0, 1]);
});

test('Hooked preserves a saved hero die this round and next without generating a replacement roll', () => {
  let fight = rollDestinySpeed(start({ hooked: 1, charm: 1, feint: 1 }), rolls(6, 5, 1, 1));
  fight = use(fight, 'hooked', { die: 0 });
  assert.throws(() => use(fight, 'charm', { die: 0 }, rolls(1)), /Saved/);
  fight = endDestinyRound(hit(resolveDestinySpeed(fight)));
  fight = rollDestinySpeed(startDestinyRound(fight, 0), rolls(2, 1, 1));
  assert.deepEqual(fight.turn.heroSpeedDice, [6, 2]);
  fight = use(fight, 'feint', { dice: [1] }, rolls(4));
  assert.deepEqual(fight.turn.heroSpeedDice, [6, 4]);
});

test('Silver Frost reuses only its original opponent dice and prevents changes to frozen faces', () => {
  let fight = rollDestinySpeed(start({ 'silver-frost': 1, boneshaker: 1, sneak: 1 }), rolls(6, 6, 1, 2));
  fight = use(fight, 'silver-frost');
  assert.throws(() => use(fight, 'boneshaker', {}, rolls()), /Frozen/);
  assert.throws(() => use(fight, 'sneak', { die: 0 }), /Saved/);
  fight = endDestinyRound(hit(resolveDestinySpeed(fight)));
  fight = rollDestinySpeed(startDestinyRound(fight, 0), rolls(2, 3));
  assert.deepEqual(fight.turn.opponentSpeedDice, [1, 2]);
});

test('Torrent can add a die before cleave or during its editable damage window', () => {
  let fight = use(win(start({ torrent: 1, cleave: 1 })), 'torrent', { ability: 'cleave' });
  fight = use(fight, 'cleave', {}, rolls(1, 2));
  assert.equal(fight.opponents[0].health, 77);
  fight = use(win(start({ torrent: 1, cleave: 1 })), 'cleave', { deferDamage: true }, rolls(1));
  fight = resolve(use(fight, 'torrent', {}, rolls(2)));
  assert.equal(fight.opponents[0].health, 77);
});

test('Veiled Strike is optional, requires a matching evasion and can be used once per trigger', () => {
  let fight = speed(start({ 'veiled-strike': 1, evade: 1 }), 1, 1, 6, 6);
  assert.throws(() => use(fight, 'veiled-strike'), /first/);
  fight = use(fight, 'evade');
  fight = use(fight, 'veiled-strike', { deferDamage: true }, rolls(2));
  fight = resolve(fight);
  assert.equal(fight.opponents[0].health, 78);
  assert.throws(() => use(fight, 'veiled-strike'), /first/);
  fight = hit(fight, 6);
  assert.equal(fight.hero.health, 20);
});

test('round-start trap validation occurs before consuming any random event dice', () => {
  let fight = use(setup({ 'best-laid-plans': 1, vortex: 1 }), 'best-laid-plans', { trap: 'cluster-mine' }, rolls(2));
  fight = endDestinyRound(use(win(startDestinyRound(fight, 0)), 'vortex'));
  const before = structuredClone(fight);
  assert.throws(() => startDestinyRound(fight, 0, rolls(), { trapTargets: [] }), /trap/);
  assert.deepEqual(fight, before);
});
