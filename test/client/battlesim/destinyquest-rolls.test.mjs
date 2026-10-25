import test from 'node:test';
import assert from 'node:assert/strict';
import { createDestinyFight, startDestinyRound, rollDestinySpeed, resolveDestinySpeed,
  rollDestinyDamage, resolveDestinyDamage, endDestinyRound } from '../../../public/js/battlesim/engines/destinyquest/core.js';
import { configureDestinyAbilities, useDestinyAbility as use } from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import { resolveDestinyAbilityRoll as resolve } from './destinyquest-fixtures.mjs';
import { destinyStat } from '../../../public/js/battlesim/engines/destinyquest/effects.js';

const rolls = (...values) => () => { assert.ok(values.length, 'Unexpected roll'); return values.shift(); };
const enemies = (count = 1) => Array.from({ length: count }, (_, i) =>
  ({ name: 'Enemy ' + i, speed: 10, brawn: 4, armour: 3, health: 80 }));
function setup(abilities, equipment = {}, foes = enemies(), hero = {}) {
  return configureDestinyAbilities(createDestinyFight({ speed: 20, brawn: 4, magic: 3,
    armour: 2, health: 20, maxHealth: 30, ...hero }, foes), abilities, equipment);
}
const start = (...args) => startDestinyRound(setup(...args), 0);
const win = fight => resolveDestinySpeed(rollDestinySpeed(fight, rolls(6, 6, 1, 1)));
const hit = (fight, ...values) => resolveDestinyDamage(rollDestinyDamage(fight, rolls(...values)));

test('Take the Bait exposes its three dice so Charm can turn failure into an exact-threshold success', () => {
  let fight = use(win(start({ 'take-the-bait': 1, charm: 1 }, { leftHand: { type: 'grapple', speed: 2 } })),
    'take-the-bait', {}, rolls(1, 1, 1));
  assert.equal(fight.phase, 'ability-rolled');
  assert.equal(fight.opponents[0].health, 80);
  fight = use(fight, 'charm', { die: 0 }, rolls(6));
  fight = resolve(fight);
  assert.equal(fight.opponents[0].health, 70);
  assert.equal(fight.takeBaitSucceededRound, 1);
  assert.equal(fight.phase, 'end');
  fight = startDestinyRound(endDestinyRound(fight), 0);
  assert.equal(destinyStat(fight, 0, 'speed'), 8);
});

test('a failed grapple consumes its combat use and the ordinary damage opportunity', () => {
  let fight = use(win(start({ 'take-the-bait': 1 }, { leftHand: { type: 'grapple', speed: 2 } })),
    'take-the-bait', {}, rolls(1, 1, 1));
  fight = resolve(fight);
  assert.equal(fight.phase, 'end');
  assert.equal(fight.opponents[0].health, 80);
  assert.equal(fight.used['take-the-bait'], 1);
  assert.throws(() => rollDestinyDamage(fight), /stage/);
});

test('Spirit Breaker requires a successful grapple from an earlier round', () => {
  let fight = win(start({ 'spirit-breaker': 1 }));
  assert.throws(() => use(fight, 'spirit-breaker'), /earlier round/);
  fight = use(win(start({ 'take-the-bait': 1, 'spirit-breaker': 1 }, { leftHand: { type: 'grapple', speed: 2 } })),
    'take-the-bait', {}, rolls(3, 3, 3));
  fight = resolve(fight);
  fight = win(startDestinyRound(endDestinyRound(fight), 0));
  fight = use(fight, 'spirit-breaker', {}, rolls(1, 2, 3));
  assert.equal(fight.opponents[0].health, 63);
  assert.equal(destinyStat(fight, 0, 'armour'), 1);
});

test('Warg Strike has separate outcome and damage windows with no early damage', () => {
  let fight = use(win(start({ 'warg-strike': 1, charm: 1, 'critical-strike': 1 })),
    'warg-strike', { deferDamage: true }, rolls(1));
  assert.throws(() => use(fight, 'critical-strike'), /damage dice/);
  fight = use(fight, 'charm', { die: 0 }, rolls(6));
  fight = resolve(fight, rolls(1, 1, 1));
  assert.equal(fight.phase, 'ability-rolled');
  assert.equal(fight.opponents[0].health, 80);
  fight = resolve(use(fight, 'critical-strike'));
  assert.equal(fight.opponents[0].health, 62);
  assert.equal(endDestinyRound(fight).opponents[0].health, 61);
});

test('Chaotic Catalyst follows every printed outcome band and only affects immediate neighbours', () => {
  for (const outcome of [1, 2, 3, 4, 5, 6]) {
    const foes = enemies(4);
    foes[1].health = 70; foes[1].maxHealth = 80;
    let fight = use(win(start({ 'chaotic-catalyst': 1 }, {}, foes)), 'chaotic-catalyst', { target: 1 }, rolls(outcome));
    fight = resolve(fight, rolls(1, 1, 1, 1, 1, 1));
    if (outcome <= 2) assert.equal(fight.opponents[1].health, 76);
    else if (outcome <= 4) assert.equal(endDestinyRound(fight).opponents[1].health, 68);
    else assert.deepEqual(fight.opponents.map(e => e.health), [79, 66, 79, 80]);
  }
});

test('Pick n mix respects potion charges and the one-backpack-item round limit', () => {
  let fight = use(start({ 'pick-n-mix': 2, charm: 1 }), 'pick-n-mix', {}, rolls(2));
  fight = resolve(use(fight, 'charm', { die: 0 }, rolls(6)));
  assert.equal(fight.hero.health, 26);
  assert.equal(fight.phase, 'speed');
  assert.throws(() => use(fight, 'pick-n-mix'), /backpack item/);
  fight = startDestinyRound(endDestinyRound(hit(win(fight), 1)), 0);
  fight = resolve(use(fight, 'pick-n-mix', {}, rolls(1)));
  assert.equal(fight.hero.health, 28);
});

test('a deferred shared cleave roll can be modified once for all affected opponents', () => {
  let fight = use(win(start({ cleave: 1, 'critical-strike': 1 }, {}, enemies(3))), 'cleave', { deferDamage: true }, rolls(1));
  assert.equal(fight.turn.pendingAbility.groups.length, 1);
  assert.deepEqual(fight.opponents.map(e => e.health), [80, 80, 80]);
  fight = resolve(use(fight, 'critical-strike'));
  assert.deepEqual(fight.opponents.map(e => e.health), [74, 74, 74]);
});

test('separate target rolls stay independent when applying a damage modifier', () => {
  let fight = use(win(start({ aftershock: 1, finesse: 1 }, {}, enemies(3))),
    'aftershock', { targets: [0, 1], deferDamage: true }, rolls(1, 1));
  fight = use(fight, 'finesse', { group: 1, die: 0 }, rolls(4));
  fight = resolve(fight);
  assert.deepEqual(fight.opponents.map(e => e.health), [79, 74, 80]);
});

test('a passive-triggered death move can still modify its own damage dice after a standoff', () => {
  const foes = enemies(2); foes[0].health = 1;
  let fight = start({ barbs: 1, 'shadow-thorns': 1, 'critical-strike': 1 }, {}, foes, { speed: 10 });
  fight = resolveDestinySpeed(rollDestinySpeed(fight, rolls(3, 3, 3, 3)));
  fight = endDestinyRound(fight);
  fight = use(fight, 'shadow-thorns', { deferDamage: true }, rolls(1));
  fight = resolve(use(fight, 'critical-strike'));
  assert.equal(fight.opponents[1].health, 73);
  assert.equal(fight.phase, 'start');
  assert.equal(fight.turn.used.dm, true);
});

test('Rake remains unmodifiable even when the caller requests a damage window', () => {
  const fight = use(win(start({ rake: 1, 'critical-strike': 1 })), 'rake', { deferDamage: true }, rolls(1, 1, 1));
  assert.equal(fight.phase, 'end');
  assert.equal(fight.opponents[0].health, 77);
  assert.equal(fight.turn.pendingAbility, undefined);
});

test('Power Totem heals and damages each round; Totem Blast cancels both benefits but retains its paid magic cost', () => {
  let fight = use(win(start({ 'power-totem': 1, 'totem-blast': 1 }, { leftHand: { type: 'totem' } })), 'power-totem');
  assert.equal(destinyStat(fight, 'hero', 'magic'), 2);
  fight = endDestinyRound(fight);
  assert.equal(fight.hero.health, 21);
  assert.equal(fight.opponents[0].health, 79);
  fight = use(win(startDestinyRound(fight, 0)), 'totem-blast', {}, rolls(1, 1));
  fight = endDestinyRound(fight);
  assert.equal(fight.hero.health, 21);
  assert.equal(fight.opponents[0].health, 77);
  assert.equal(destinyStat(fight, 'hero', 'magic'), 2);
  fight = win(startDestinyRound(fight, 0));
  assert.throws(() => use(fight, 'totem-blast'), /Activate/);
});

test('Creeping Cold grows from damage-score sixes even if armour prevents health damage', () => {
  const foes = enemies(); foes[0].armour = 99;
  let fight = use(win(start({ 'creeping-cold': 1 }, {}, foes)), 'creeping-cold');
  fight = endDestinyRound(fight);
  assert.equal(fight.opponents[0].health, 79);
  fight = hit(win(startDestinyRound(fight, 0)), 6);
  assert.equal(fight.turn.healthDamage, 0);
  fight = endDestinyRound(fight);
  assert.equal(fight.opponents[0].health, 77);
});

test('Sound the Charge reserves its combat slot only if its optional damage bonus is used', () => {
  let fight = use(start({ 'sound-the-charge': 1, weaver: 1 }, { leftHand: { type: 'horn' } }), 'sound-the-charge');
  fight = resolveDestinySpeed(rollDestinySpeed(fight, rolls(1, 1, 1, 1, 1)));
  fight = rollDestinyDamage(fight, rolls(2, 3));
  assert.deepEqual(fight.turn.damageDice, [2, 3]);
  assert.equal(fight.turn.used.co, true);
  assert.equal(fight.hero.health, 22);
  fight = use(start({ 'sound-the-charge': 1 }, { leftHand: { type: 'horn' } }), 'sound-the-charge');
  fight = resolveDestinySpeed(rollDestinySpeed(fight, rolls(1, 1, 1, 1, 1)));
  fight = rollDestinyDamage(fight, rolls(2), { soundCharge: false });
  assert.deepEqual(fight.turn.damageDice, [2]);
  assert.equal(fight.turn.used.co, false);
  fight = use(start({ 'sound-the-charge': 1, 'deep-wound': 1 }, { leftHand: { type: 'horn' } }), 'sound-the-charge');
  fight = resolveDestinySpeed(rollDestinySpeed(fight, rolls(1, 1, 1, 1, 1)));
  fight = rollDestinyDamage(use(fight, 'deep-wound'), rolls(2, 3));
  assert.deepEqual(fight.turn.damageDice, [2, 3]);
});

test('Upper Hand wins only the following round and does not consume speed dice', () => {
  const foes = enemies(2); foes[0].health = 1;
  let fight = use(hit(win(start({ 'upper-hand': 1 }, {}, foes)), 1), 'upper-hand');
  fight = startDestinyRound(endDestinyRound(fight), 1);
  fight = resolveDestinySpeed(rollDestinySpeed(fight, rolls()));
  assert.equal(fight.turn.winner, 'hero');
  assert.deepEqual(fight.turn.heroSpeedDice, []);
  fight = startDestinyRound(endDestinyRound(hit(fight, 1)), 1);
  assert.equal(fight.turn.autoWin, undefined);
});

test('Gouge increases an existing bleed and does not create additional stacked bleeds', () => {
  let fight = hit(win(start({ bleed: 1, gouge: 1 })), 1);
  fight = use(fight, 'gouge');
  fight = endDestinyRound(fight);
  assert.equal(fight.opponents[0].health, 76);
  assert.equal(fight.effects.filter(e => e.kind === 'bleed').length, 1);
});

test('invalid pending-damage selections cannot mutate dice, spend modifiers or deal damage', () => {
  const fight = use(win(start({ cleave: 1, charm: 1 })), 'cleave', { deferDamage: true }, rolls(1));
  const before = structuredClone(fight);
  assert.throws(() => use(fight, 'charm', { group: 9, die: 0 }, rolls(6)), /die/);
  assert.deepEqual(fight, before);
  const ready = win(start({ wither: 1 }));
  assert.throws(() => use(ready, 'wither', { deferDamage: true, attribute: 'health' }), /brawn or magic/);
  assert.equal(ready.used.wither, undefined);
});

test('a pending ability can be serialized and resumed without replaying its spent charge', () => {
  let fight = use(win(start({ 'warg-strike': 1 })), 'warg-strike', { deferDamage: true }, rolls(1));
  fight = JSON.parse(JSON.stringify(fight));
  fight = resolve(fight, rolls(2, 3));
  fight = JSON.parse(JSON.stringify(fight));
  fight = resolve(fight);
  assert.equal(fight.used['warg-strike'], 1);
  assert.equal(fight.opponents[0].health, 75);
  assert.throws(() => resolve(fight), /pending/);
});

test('modifying a Counter damage die does not modify the enemy attack it interrupts', () => {
  let fight = start({ counter: 1, 'critical-strike': 1 }, {}, enemies(), { speed: 0 });
  fight = resolveDestinySpeed(rollDestinySpeed(fight, rolls(1, 1, 6, 6)));
  fight = use(fight, 'counter', { deferDamage: true }, rolls(1));
  fight = resolve(use(fight, 'critical-strike'));
  assert.equal(fight.opponents[0].health, 74);
  assert.equal(fight.phase, 'damage');
  fight = hit(fight, 6);
  assert.equal(fight.turn.damageScore, 8);
  assert.equal(fight.hero.health, 14);
});

test('Choke Hold damage can be rerolled before its health loss and next-round slowdown apply', () => {
  let fight = hit(use(win(start({ piercing: 1, 'choke-hold': 1, charm: 1 })), 'piercing'), 1);
  fight = use(fight, 'choke-hold', { deferDamage: true }, rolls(1, 1));
  assert.equal(fight.opponents[0].health, 75);
  fight = resolve(use(fight, 'charm', { die: 0 }, rolls(6)));
  assert.equal(fight.opponents[0].health, 68);
  fight = startDestinyRound(endDestinyRound(fight), 0);
  assert.equal(destinyStat(fight, 0, 'speed'), 9);
});
