import test from 'node:test';
import assert from 'node:assert/strict';
import {ENCOUNTERS} from '../../../public/js/battlesim/books/906/definition.js';
import * as combat from '../../../public/js/battlesim/books/906/combat.js';
import {createState} from '../../../public/js/battlesim/books/906/state.js';

const character = () => combat.newCharacter(() => 0.99);
const sequence = (...values) => () => { assert(values.length, 'Unexpected random roll'); return values.shift(); };
const custom = (c = character(), extra = {}) => combat.startFight(0, c,
  {party: ['captain'], opponents: [{displayName: 'Враг', skill: 7, stamina: 8}], ...extra});

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
