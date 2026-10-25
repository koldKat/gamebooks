import {loadFixtureRoster} from './roster-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as combat from '../../../public/js/battlesim/books/817/combat.js';
import { encounterPreset } from '../../../public/js/battlesim/books/817/definition.js';
import { createState } from '../../../public/js/battlesim/books/817/state.js';
import bg from '../../../public/js/i18n/bg/battlesim/battlesim817.js';
import en from '../../../public/js/i18n/en/battlesim/battlesim817.js';

await loadFixtureRoster(817);

const start = (character = {}, section = 3, count) => combat.startFight(
  {...combat.newCharacter(), ...character}, {...encounterPreset(section), ...(count ? {count} : {})}, section);

test('dictionaries match in keys and placeholders', () => {
  assert.deepEqual(Object.keys(bg).sort(), Object.keys(en).sort());
  for (const key of Object.keys(bg)) assert.deepEqual((bg[key].match(/\{\w+\}/g) ?? []).sort(), (en[key].match(/\{\w+\}/g) ?? []).sort(), key);
});

test('starts unarmed and validates printed inventory limits', () => {
  assert.deepEqual(combat.newCharacter(), {life: 10, blaster: false, shots: 0, grenades: 0, bazookas: 0, medkits: 0});
  for (const change of [{life: 11}, {shots: 1}, {grenades: 5}, {bazookas: 3}, {medkits: 2}]) {
    assert.throws(() => combat.validateCharacter({...combat.newCharacter(), ...change}));
  }
});
test('blaster spends ammunition per alien with no invented retaliation', () => {
  const fight = combat.attack(start({blaster: true, shots: 10}), 'blaster', 4);
  assert.equal(fight.character.shots, 6); assert.equal(fight.character.life, 10);
  assert.equal(fight.remaining, 2); assert.equal(fight.outcome, null);
});
test('shortfall costs Health; an empty battery costs the whole roll', () => {
  let fight = combat.attack(start({blaster: true, shots: 2}), 'blaster', 5);
  assert.equal(fight.character.shots, 0); assert.equal(fight.character.life, 7);
  fight = combat.attack(fight, 'blaster', 3);
  assert.equal(fight.character.life, 4); assert.equal(fight.remaining, 1);
});
test('zero Health is fatal even on the final alien', () => {
  const fight = combat.attack(start({life: 3}, 4), 'melee', 3);
  assert.equal(fight.remaining, 0); assert.equal(fight.outcome, 'loss');
  assert.equal(fight.destination, null);
});
test('grenades kill a die roll of aliens and spend only one grenade', () => {
  const fight = combat.attack(start({grenades: 2}), 'grenade', 6);
  assert.equal(fight.character.grenades, 1); assert.equal(fight.remaining, 0);
  assert.equal(fight.outcome, 'win'); assert.equal(fight.usedExplosives, true);
  assert.throws(() => combat.attack(start(), 'grenade', 1));
});
test('bazookas kill up to three aliens without a damage roll', () => {
  const fight = combat.attack(start({bazookas: 1}, 8), 'bazooka');
  assert.equal(fight.character.bazookas, 0); assert.equal(fight.character.life, 10);
  assert.equal(fight.remaining, 0); assert.equal(fight.outcome, 'win');
  assert.throws(() => combat.attack(start(), 'bazooka'));
});
test('difficulty changes only the printed group sizes', () => {
  assert.deepEqual(['easy', 'hard', 'apocalyptic'].map(d => encounterPreset(14, d).count), [3, 5, 7]);
  assert.deepEqual(['easy', 'hard', 'apocalyptic'].map(d => encounterPreset(55, d).count), [5, 10, 15]);
  assert.equal(encounterPreset(3, 'hard').count, 3);
});
test('hostage encounter tracks explosives without inventing story state', () => {
  const fight = combat.attack(start({grenades: 1}, 30), 'grenade', 2);
  assert.equal(fight.encounter.hostage, true); assert.equal(fight.usedExplosives, true);
  assert.equal(fight.destination, '22');
});
test('section 37 is one forced melee roll regardless of owned weapons', () => {
  const fight = start({blaster: true, shots: 10, grenades: 1}, 37);
  assert.throws(() => combat.attack(fight, 'grenade', 1));
  const result = combat.attack(fight, 'melee', 4);
  assert.equal(result.character.life, 6); assert.equal(result.character.shots, 10);
  assert.equal(result.outcome, 'win'); assert.equal(result.destination, '20');
});
test('medkit heals to ten outside combat and cannot revive', () => {
  assert.equal(combat.useMedkit({...combat.newCharacter(), life: 1, medkits: 1}).life, 10);
  for (const life of [0, 10]) assert.throws(() => combat.useMedkit({...combat.newCharacter(), life, medkits: 1}));
});
test('cancelling preserves spent resources, never awards a win', () => {
  const fight = combat.cancelFight(combat.attack(start({blaster: true, shots: 5}), 'blaster', 3));
  assert.equal(fight.character.shots, 2); assert.equal(fight.outcome, 'cancelled');
  assert.throws(() => combat.attack(fight, 'melee', 1));
});
test('state records each completion once and protects another book/run', () => {
  let book = 817, run = {}, saves = 0;
  const store = createState(() => ({currentBookId: book, currentPlaythrough: () => run, saveState: () => saves++}));
  store.change(data => { data.fight = combat.attack(start({}, 4), 'melee', 1); });
  store.change(() => {}); assert.equal(run.sim817.history.length, 1);
  assert.equal(run.sim817.character.life, 9);
  const before = saves; book = 1;
  assert.equal(store.change(() => {}), false); assert.equal(store.read(), null); assert.equal(saves, before);
  book = 817;
  assert.equal(store.change(() => { run = {}; }), false);
  assert.deepEqual(run, {});
});
