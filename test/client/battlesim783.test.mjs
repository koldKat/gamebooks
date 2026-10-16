import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ENCOUNTERS } from '../../public/js/battlesim/books/783/definition.js';
import * as combat from '../../public/js/battlesim/books/783/combat.js';
import { createState } from '../../public/js/battlesim/books/783/state.js';

const rolls = (...values) => () => { assert.ok(values.length, 'unexpected extra die'); return values.shift(); };
const hero = changes => ({ ...combat.newCharacter(), ...changes });
const start = (section, character = hero(), options = {}) => combat.startFight(section, character, { damageAtThree: 1, ...options });

test('source roster and initial twenty-point allocation', () => {
  assert.equal(ENCOUNTERS.length, 12);
  assert.equal(ENCOUNTERS.flatMap(entry => entry.enemies).length, 19);
  assert.deepEqual(combat.newCharacter(), { strength: 8, wisdom: 6, charm: 6, life: 30, faith: 200, justice: 0, debate: 0, dead: false });
  assert.throws(() => combat.newCharacter({ strength: 13, wisdom: 3, charm: 4 }));
  assert.throws(() => combat.newCharacter({ strength: 8, wisdom: 8, charm: 8 }));
  assert.equal(ENCOUNTERS.find(row => row.section === 217).enemies[0].life, null);
  assert.equal(ENCOUNTERS.find(row => row.section === 247).enemies[0].life, null);
});

test('damage brackets, explicit source ambiguity and harmless ties', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 20].map(value => combat.damageForDifference(value, 1)), [0, 1, 1, 1, 2, 2]);
  assert.equal(combat.damageForDifference(3, 2), 2);
  assert.throws(() => combat.startFight(99, hero()));
  assert.throws(() => combat.damageForDifference(3, 0));
  const input = start(0, hero(), { opponents: [{ displayName: 'Test', strength: 8, life: 10 }] });
  const before = structuredClone(input);
  const result = combat.round(input, 0, rolls(3, 3, 3, 3));
  assert.equal(result.character.life, 30); assert.equal(result.enemies[0].life, 10);
  assert.deepEqual(input, before);
  const three = start(0, hero(), { damageAtThree: 2, opponents: [{ strength: 5, life: 10 }] });
  assert.equal(combat.round(three, 0, rolls(3, 3, 3, 3)).enemies[0].life, 8);
});

test('temporary Strength stays in fight config and never changes the saved base', () => {
  for (const [section, bonus] of [[99, 10], [187, 20]]) {
    const character = hero(), fight = start(section, character);
    const result = combat.round(fight, 0, rolls(3, 3, 3, 3));
    assert.equal(result.events[0].playerAttack, 14 + bonus);
    assert.equal(result.character.strength, 8); assert.equal(character.strength, 8);
  }
});

test('simultaneous opponents can all hit but only the chosen target can take damage', () => {
  const input = start(176, hero({ strength: 20 }));
  const result = combat.round(input, 1, rolls(3, 3, 3, 3, 3, 3));
  assert.equal(result.enemies[0].life, 7); assert.equal(result.enemies[1].life, 7);
  const incoming = combat.round(start(176, hero({ strength: 0 })), 0, rolls(1, 1, 6, 6, 6, 6));
  assert.equal(incoming.character.life, 26);
  assert.equal(incoming.events.filter(row => row.kind === 'incoming').length, 2);
});

test('nonlethal bouts count lost LIFE without invented enemy totals', () => {
  for (const [section, limit, win, lose] of [[217, 3, 95, 304], [247, 5, 168, 340]]) {
    let fight = start(section, hero({ strength: 100 }));
    while (!fight.outcome) fight = combat.round(fight, 0, rolls(3, 3, 3, 3));
    assert.equal(fight.outcome, 'win'); assert.equal(fight.destination, win);
    assert.equal(fight.enemies[0].life, null); assert.ok(fight.enemies[0].lost >= limit);
    fight = start(section, hero({ strength: 0 }));
    while (!fight.outcome) fight = combat.round(fight, 0, rolls(1, 1, 6, 6));
    assert.equal(fight.destination, lose); assert.equal(fight.character.dead, false);
    assert.equal(fight.character.life, 30 - fight.playerLost);
  }
  const fatal = combat.round(start(217, hero({ strength: 0, life: 1 })), 0, rolls(1, 1, 6, 6));
  assert.equal(fatal.destination, 200); assert.equal(fatal.character.dead, true);
});

test('optional narrative damage and codeword reduction apply once at start', () => {
  assert.equal(start(239).character.life, 30);
  const fight = start(239, hero(), { applyEntry: true });
  assert.equal(fight.character.life, 27);
  assert.equal(combat.round(fight, 0, rolls(6, 6, 1, 1)).character.life, 27);
  assert.equal(start(210).enemies[0].life, 12);
  assert.equal(start(210, hero(), { kratuna: true }).enemies[0].life, 9);
  assert.equal(start(239, hero({ life: 2 }), { applyEntry: true }).outcome, 'loss');
});

test('custom fields reject missing, fractional or out-of-range numbers and dead characters', () => {
  for (const opponent of [{ strength: '', life: 10 }, { strength: 7, life: null }, { strength: 7.5, life: 10 }]) {
    assert.throws(() => start(0, hero(), { opponents: [opponent] }));
  }
  assert.throws(() => start(999)); assert.throws(() => start(99, hero({ faith: 0 })));
  const fight = start(0, hero({ strength: 100 }), { opponents: [{ strength: 0, life: 1 }] });
  const result = combat.round(fight, 0, rolls(3, 3, 3, 3));
  assert.equal(result.outcome, 'win'); assert.equal(result.destination, null);
  assert.throws(() => combat.round(result, 0));
});

test('saved state is immutable on read, run-isolated, bounded and records results once', () => {
  const run = {}, other = {}; let selected = run, saved = 0;
  const store = createState(() => ({ currentBookId: 783, currentPlaythrough: () => selected, saveState: () => saved++ }));
  assert.equal(store.read(), null); assert.equal(saved, 0);
  store.change(data => { data.character = hero(); });
  const before = structuredClone(run);
  store.read(); assert.deepEqual(run, before); assert.equal(saved, 1);
  store.change(data => {
    data.encounterName = 'Test';
    data.fight = combat.round(start(0, hero({ strength: 100 }), { opponents: [{ strength: 0, life: 1 }] }), 0, rolls(3, 3, 3, 3));
    data.log = Array(200).fill('round');
  });
  store.change(data => { data.fight = structuredClone(data.fight); });
  assert.equal(run.sim783.history.length, 1); assert.equal(run.sim783.log.length, 160);
  const unchanged = structuredClone(run);
  assert.equal(store.change(() => { selected = other; }), false);
  assert.deepEqual(run, unchanged); assert.deepEqual(other, {});
});
