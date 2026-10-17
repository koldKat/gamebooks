import test from 'node:test';
import assert from 'node:assert/strict';
import * as combat from '../../../public/js/battlesim/books/809/combat.js';
import { ENCOUNTERS } from '../../../public/js/battlesim/books/809/definition.js';
import { createState } from '../../../public/js/battlesim/books/809/state.js';
import { COMBAT_TABLE, combatColumn, combatLosses } from '../../../public/js/battlesim/engines/lone-wolf/combat-table.js';
import { COMBAT_TABLE as established } from '../../../public/js/battlesim/books/430/definition.js';
import bg from '../../../public/js/i18n/bg/battlesim/battlesim809.js';
import en from '../../../public/js/i18n/en/battlesim/battlesim809.js';

test('standard Lone Wolf table and all ratio boundaries match established rules', () => {
  assert.deepEqual(COMBAT_TABLE, established);
  const values = [-100,-11,-10,-9,-8,-7,-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6,7,8,9,10,11,100];
  assert.deepEqual(values.map(combatColumn), [0,0,1,1,2,2,3,3,4,4,5,5,6,7,7,8,8,9,9,10,10,11,11,12,12]);
  assert.deepEqual(combatLosses(0, 1), [3,5]);
  assert.deepEqual(combatLosses(0, 0), [12,0]);
  assert.deepEqual(combatLosses(-11, 1), [0,'K']);
  assert.throws(() => combatLosses(0, 10));
});
test('initial rolls use printed 0-9 plus10/20 without free equipment', () => {
  const values = [0,9];
  const character = combat.newCharacter(() => values.shift());
  assert.equal(character.skill, 10);
  assert.equal(character.stamina, 29);
  assert.equal(character.maxStamina, 29);
  assert.equal(character.potions, 0);
});
test('roster, forced unarmed penalty and temporary Vigour match printed encounters', () => {
  assert.deepEqual(ENCOUNTERS.map(row => [row.section,row.skill,row.stamina]), [[44,18,18],[50,16,18],[64,21,28]]);
  const character = {...combat.newCharacter(() => 5), vigour: true};
  const fight = combat.startFight(character, ENCOUNTERS[0], 44);
  assert.equal(fight.ratio, 15+3-4-18);
  assert.equal(fight.character.stamina, 22);
  assert.equal(fight.character.skill, 15);
  assert.equal(character.stamina, 25);
  assert.throws(() => combat.startFight({...character, stamina: 9}, ENCOUNTERS[0], 44));
  assert.equal(combat.startFight({...character, stamina: 10}, ENCOUNTERS[0], 44).character.stamina, 7);
});
test('current endurance carries into combat and zero endurance is fatal even when both die', () => {
  const character = {...combat.newCharacter(() => 0), skill: 16, stamina: 5};
  const fight = combat.startFight(character, {...ENCOUNTERS[1], stamina: 1}, 50);
  const result = combat.round(fight, 1);
  assert.equal(result.enemy.stamina, 0);
  assert.equal(result.character.stamina, 0);
  assert.equal(result.outcome, 'loss');
  assert.equal(fight.enemy.stamina, 1);
});
test('escape requires three completed rounds and is forbidden against the Helghast', () => {
  let fight = combat.startFight({...combat.newCharacter(() => 0), stamina: 100, maxStamina: 100}, {...ENCOUNTERS[1], stamina: 100}, 50);
  assert.throws(() => combat.escapeFight(fight));
  for (let i=0; i<3; i++) fight = combat.round(fight, 0);
  assert.equal(combat.escapeFight(fight).destination, '70');
  const helghast = combat.startFight(combat.newCharacter(() => 9), ENCOUNTERS[2], 64);
  helghast.rounds = 20;
  assert.throws(() => combat.escapeFight(helghast));
});
test('potion restores two after combat, Restoration needs water, neither revives the dead', () => {
  const character = {...combat.newCharacter(() => 5), stamina: 10, potions: 1, restoration: true};
  const healed = combat.restore(character, 'potion');
  assert.equal(healed.stamina, 12); assert.equal(healed.potions, 0);
  assert.throws(() => combat.restore(character, 'restoration'));
  assert.equal(combat.restore(character, 'restoration', true).stamina, 15);
  assert.throws(() => combat.restore({...character, stamina: 0}, 'potion'));
});
test('state isolates runs and records a completed result exactly once', () => {
  let run = {}, book = 809;
  const store = createState(() => ({currentBookId: book, currentPlaythrough: () => run, saveState() {}}));
  store.change(data => { data.character = combat.newCharacter(() => 9); });
  store.change(data => { data.fight = combat.startFight(data.character, {...ENCOUNTERS[1], skill: 0, stamina: 1}, 50); });
  store.change(data => { data.fight = combat.round(data.fight, 0); });
  assert.equal(run.sim809.history.length, 1);
  store.change(() => {});
  assert.equal(run.sim809.history.length, 1);
  assert.equal(store.change(() => { run = {}; }), false);
  assert.equal(store.read(), null);
  book = 808;
  assert.equal(store.change(() => {}), false);
});

test('simulator translations have matching keys and substitution fields', () => {
  assert.deepEqual(Object.keys(bg).sort(), Object.keys(en).sort());
  for (const key of Object.keys(bg)) {
    assert.deepEqual((bg[key].match(/\{\w+\}/g) ?? []).sort(), (en[key].match(/\{\w+\}/g) ?? []).sort(), key);
  }
});
