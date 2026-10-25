import {loadFixtureRoster} from './roster-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {ENCOUNTERS, COMPANION_PRESETS, STARSHIP_RULES} from '../../../public/js/battlesim/books/906/definition.js';
import * as combat from '../../../public/js/battlesim/books/906/combat.js';
import {createState} from '../../../public/js/battlesim/books/906/state.js';

const character = () => combat.newCharacter(() => 0.99);
const sequence = (...values) => () => { assert(values.length, 'Unexpected random roll'); return values.shift(); };
const custom = (c = character(), extra = {}) => combat.startFight(0, c,
  {party: ['captain'], opponents: [{displayName: 'Враг', skill: 7, stamina: 8}], ...extra});

await loadFixtureRoster(906);

test('source initial values and all declared encounters start without touching original values', () => {
  const c = character(), before = structuredClone(c);
  assert.equal(c.crew.captain.skill, 12); assert.equal(c.crew.captain.stamina, 24);
  assert.equal(c.ship.weapons, 12); assert.equal(c.ship.shields, 18); assert.equal(c.luck, 12);
  for (const encounter of ENCOUNTERS) assert.doesNotThrow(() => combat.startFight(encounter.section, c));
  assert.deepEqual(c, before);
});

test('tied hand attacks are harmless and normal hits cost two stamina', () => {
  const c = character(); c.crew.captain.skill = 7;
  const fight = custom(c), tied = combat.round(fight, {}, () => 0);
  assert.equal(tied.character.crew.captain.stamina, 24); assert.equal(tied.enemies[0].stamina, 8);
  const hit = combat.round(fight, {}, sequence(0.99, 0.99, 0, 0));
  assert.equal(hit.enemies[0].stamina, 6); assert.equal(fight.enemies[0].stamina, 8);
});

test('extra hand attackers compare with the same defender attack without receiving counterwounds', () => {
  const fight = custom(character(), {party: ['captain', 'security']});
  const hit = combat.round(fight, {captain: 0, security: 0}, sequence(0, 0, 0, 0, 0.99, 0.99));
  assert.equal(hit.character.crew.captain.stamina, 22);
  assert.equal(hit.character.crew.security.stamina, 24);
});

test('ship hits require roll strictly under weapons and another hit after zero shields', () => {
  const c = character(); c.ship.weapons = 2;
  const missed = combat.round(custom(c, {mode: 'ship', opponents: [{skill: 0, stamina: 1}]}), {}, () => 0);
  assert.equal(missed.enemies[0].stamina, 1);
  const fight = custom(character(), {mode: 'ship', opponents: [{skill: 0, stamina: 2}]});
  const zero = combat.round(fight, {}, () => 0);
  assert.equal(zero.enemies[0].stamina, 0); assert.equal(zero.outcome, null);
  assert.equal(combat.round(zero, {}, () => 0).outcome, 'win');
  const ours = character(); ours.ship.shields = 0; ours.ship.weapons = 0;
  assert.equal(combat.round(custom(ours, {mode: 'ship', opponents: [{skill: 12, stamina: 12}]}), {}, () => 0).outcome, 'loss');
});

test('phasers use strict roll-under, honour enemy-first and stop after captain death', () => {
  const c = character(); c.crew.captain.skill = 2;
  const fight = custom(c, {mode: 'phaser', opponents: [{skill: 0, stamina: 1}]});
  assert.equal(combat.round(fight, {}, () => 0).enemies[0].stamina, 1);
  const first = custom(character(), {mode: 'phaser', enemyFirst: true, opponents: [{skill: 12, stamina: 1}]});
  const dead = combat.round(first, {}, () => 0);
  assert.equal(dead.outcome, 'loss'); assert.equal(dead.events.length, 1);
});

test('robot first hit reveals armour without ordinary damage; later hits follow the armour die', () => {
  const fight = combat.startFight(239, character());
  const reveal = combat.round(fight, {}, sequence(0.99, 0.99, 0, 0));
  assert.equal(reveal.enemies[0].stamina, 4); assert.equal(reveal.config.armour, true);
  const block = combat.round(reveal, {}, sequence(0.99, 0.99, 0, 0, 0));
  assert.equal(block.enemies[0].stamina, 4);
  const damage = combat.round(block, {}, sequence(0.99, 0.99, 0, 0, 0.99));
  assert.equal(damage.enemies[0].stamina, 3);
});

test('double attacks use the same player attack roll and can wound twice', () => {
  const fight = combat.startFight(297, character()); fight.character.crew.captain.skill = 1;
  const hit = combat.round(fight, {}, () => 0);
  assert.equal(hit.character.crew.captain.stamina, 20);
});

test('Macomonian reroll is optional and its second result is final', () => {
  const fight = custom(character(), {party: ['macom']});
  const pending = combat.round(fight, {}, sequence(0.99, 0.99, 0.5, 0.5));
  assert.ok(pending.pending); assert.throws(() => combat.round(pending));
  const kept = combat.resolveReroll(pending, false, () => 0);
  assert.equal(kept.enemies[0].stamina, 6);
  const rerolled = combat.resolveReroll(pending, true, () => 0);
  assert.equal(rerolled.enemies[0].stamina, 8);
  assert.equal(rerolled.character.crew.macom.stamina, 10);
});

test('the eagle stops on its first wound, including a fatal wound', () => {
  const fight = combat.startFight(245, character()); fight.character.crew.eagle.stamina = 1;
  const hit = combat.round(fight, {}, sequence(0, 0, 0.99, 0.99));
  assert.equal(hit.character.crew.eagle.stamina, 0); assert.equal(hit.outcome, 'continue'); assert.equal(hit.destination, 188);
});

test('three missed shots let the small creature escape without return fire', () => {
  let fight = combat.startFight(307, character());
  for (let i = 0; i < 3; i++) fight = combat.round(fight, {}, () => 0.99);
  assert.equal(fight.outcome, 'escaped'); assert.equal(fight.destination, 19);
  assert.equal(fight.character.crew.captain.stamina, 24);
});

test('doctor recovery respects caps, replacement rules and dead crew', () => {
  const c = character(); c.crew.guard1.stamina = 0; c.crew.captain.stamina = 20;
  const healed = combat.recover(c, 'planet');
  assert.equal(healed.crew.captain.stamina, 22); assert.equal(healed.crew.guard1.stamina, 0);
  const replaced = combat.recover(c, 'replace', 'guard1', () => 0);
  assert.equal(replaced.crew.guard1.skill, 10); assert.equal(replaced.crew.guard1.stamina, 14);
  assert.throws(() => custom(replaced, {party: ['guard1']}));
});

test('run isolation and history recording do not touch the English simulator', () => {
  const old = {unchanged: true}, run = {sim186: old}; let current = run, saves = 0;
  const store = createState(() => ({currentBookId: 906, currentPlaythrough: () => current, saveState: () => saves++}));
  store.change(data => { data.character = character(); data.encounterName = 'Враг'; data.fight = custom(data.character); });
  const before = run.sim906;
  assert.throws(() => store.change(data => { data.character.luck = -1; throw Error('Abort'); }));
  assert.equal(run.sim906, before);
  store.change(data => { data.fight.outcome = 'win'; }); store.change(() => {});
  assert.equal(run.sim906.history.length, 1); assert.equal(run.sim186, old);
  const other = {}; current = other; assert.equal(store.read(), null);
  store.change(data => { data.character = character(); current = run; });
  assert.equal(other.sim906, undefined); assert.equal(saves, 3);
});

test('companion defaults read database profiles without sharing character state', () => {
  const profile = COMPANION_PRESETS.macom, original = structuredClone(profile);
  try {
    profile.skill = 8; profile.stamina = 11;
    const one = character(), two = character();
    assert.equal(one.crew.macom.skill, 8); assert.equal(one.crew.macom.stamina, 11);
    one.crew.macom.stamina = 0;
    assert.equal(two.crew.macom.stamina, 11); assert.equal(profile.stamina, 11);
  } finally { Object.assign(profile, original); }
});

test('saved armour encounters lacking new metadata retain the original reveal route', () => {
  const fight = combat.startFight(239, character());
  delete fight.config.armourDestination;
  const before = structuredClone(fight);
  const reveal = combat.round(fight, {}, sequence(0.99, 0.99, 0, 0));
  assert.equal(reveal.events.find(event => event.kind === 'armourRevealed').destination, 183);
  assert.deepEqual(fight, before);
});

test('catalog armour and nerve settings govern captured encounter wounds', () => {
  const rules = structuredClone(STARSHIP_RULES);
  try {
    STARSHIP_RULES.armour = {threshold: 6, damage: 3, blockedDamage: 0};
    const robot = combat.startFight(183, character());
    assert.equal(combat.round(robot, {}, sequence(0.99, 0.99, 0, 0, 0.7)).enemies[0].stamina, 4);
    assert.equal(combat.round(robot, {}, sequence(0.99, 0.99, 0, 0, 0.99)).enemies[0].stamina, 1);
    STARSHIP_RULES.nerve = {threshold: 6, damage: 5, ordinaryDamage: 1};
    const c = character(); c.crew.captain.skill = 1;
    const guards = combat.startFight(43, c);
    assert.equal(combat.round(guards, {}, () => 0.99).character.crew.captain.stamina, 9);
    assert.equal(guards.character.crew.captain.stamina, 24);
  } finally { Object.assign(STARSHIP_RULES, rules); }
});

test('saved conflict choices use catalog damage without changing the pending input', () => {
  const rules = structuredClone(STARSHIP_RULES);
  try {
    STARSHIP_RULES.conflict = {incomingFace: 2, outgoingFace: 5, damage: 3};
    const fight = combat.round(combat.startFight(208, character()), {}, () => 1 / 6);
    assert.equal(fight.pendingConflict.outgoing, false);
    fight.extension = {kept: true};
    const saved = JSON.parse(JSON.stringify(fight)), before = structuredClone(saved);
    const resolved = combat.resolveConflict(saved, 'captain');
    assert.equal(resolved.character.crew.captain.stamina, 21);
    assert.equal(resolved.events[0].amount, 3);
    assert.deepEqual(resolved.extension, {kept: true});
    assert.deepEqual(saved, before);
  } finally { Object.assign(STARSHIP_RULES, rules); }
});

test('catalog restraint timing and closing range preserve encounter-specific procedures', () => {
  const rules = structuredClone(STARSHIP_RULES);
  try {
    STARSHIP_RULES.restraint = {firstRound: 1, threshold: 1};
    assert.equal(combat.round(combat.startFight(102, character()), {}, () => 0).outcome, 'restrained');
    const fight = combat.startFight(122, character());
    assert.equal(combat.round(fight, {captain: 0}, () => 4 / 6).enemies[0].stamina, 1);
    STARSHIP_RULES.closingRange = {initial: 1};
    assert.equal(combat.round(fight, {captain: 0}, () => 4 / 6).enemies[0].stamina, 0);
  } finally { Object.assign(STARSHIP_RULES, rules); }
});
