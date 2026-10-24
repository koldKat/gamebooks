import test from 'node:test';
import assert from 'node:assert/strict';
import * as combat from '../../../public/js/battlesim/books/808/combat.js';
import { createState } from '../../../public/js/battlesim/books/808/state.js';
import bg from '../../../public/js/i18n/bg/battlesim/battlesim808.js';
import en from '../../../public/js/i18n/en/battlesim/battlesim808.js';
import { loadFixtureRoster } from './roster-fixtures.mjs';
await loadFixtureRoster(808);

test('mech defaults and difficulty preserve printed choices', () => {
  assert.equal(combat.newCharacter('sparta').weapons, 5);
  assert.equal(combat.newCharacter('olympia').armour, 3);
  assert.equal(combat.chooseDie('normal', 2, 6), 2);
  assert.equal(combat.chooseDie('normal', 2, 6, true), 6);
  assert.equal(combat.chooseDie('easy', 1), 1);
  assert.throws(() => combat.chooseDie('hard', 2, 3));
});
test('attack removes one opponent before each remaining enemy defends', () => {
  const original = combat.startFight(combat.newCharacter(), 2, 'Custom enemy');
  let fight = combat.applyRoll(original, 1);
  assert.equal(original.remaining, 2);
  assert.equal(fight.remaining, 1);
  assert.equal(fight.defenceRemaining, 1);
  fight = combat.applyRoll(fight, 6);
  assert.equal(fight.phase, 'damage');
  assert.throws(() => combat.applyRoll(fight, 1));
  fight = combat.allocateDamage(fight, 'weapons');
  assert.equal(fight.character.weapons, 2);
  assert.equal(fight.phase, 'attack');
  fight = combat.applyRoll(fight, 1);
  assert.equal(fight.outcome, 'win');
});
test('all surviving enemies roll separately and armour reductions affect later rolls', () => {
  let fight = combat.startFight(combat.newCharacter(), 2, 'Two enemies');
  fight = combat.applyRoll(fight, 6);
  fight = combat.applyRoll(fight, 5);
  fight = combat.allocateDamage(fight, 'armour');
  assert.equal(fight.character.armour, 3);
  assert.equal(fight.phase, 'defence');
  fight = combat.applyRoll(fight, 4);
  assert.equal(fight.phase, 'damage');
  fight = combat.allocateDamage(fight, 'weapons');
  assert.equal(fight.phase, 'attack');
});
test('section36 entry damage is chosen before combat and zero armour is fatal', () => {
  let fight = combat.startFight({...combat.newCharacter(), armour: 1}, 36, 'Ambush');
  assert.equal(fight.phase, 'damage');
  assert.throws(() => combat.escapeFight(fight, 1));
  const survived = combat.allocateDamage(fight, 'weapons');
  assert.equal(survived.phase, 'attack');
  fight = combat.allocateDamage(fight, 'armour');
  assert.equal(fight.outcome, 'loss');
  assert.equal(fight.destination, 'scoring');
});
test('Mycenae receives range shots without retaliation before normal combat', () => {
  let fight = combat.startFight(combat.newCharacter('mycenae'), 92, 'Three enemies');
  assert.equal(fight.phase, 'sniper');
  fight = combat.applyRoll(fight, 6);
  assert.equal(fight.sniperRemaining, 1);
  assert.equal(fight.phase, 'sniper');
  fight = combat.applyRoll(fight, 1);
  assert.equal(fight.remaining, 2);
  assert.equal(fight.phase, 'attack');
  assert.equal(fight.defenceRemaining, 0);
});
test('escape uses range and Olympia bonus, respects Sparta and section92', () => {
  assert.equal(combat.escapeFight(combat.startFight(combat.newCharacter('olympia'), 2, 'Enemy'), 3).outcome, 'escape');
  assert.equal(combat.escapeFight(combat.startFight(combat.newCharacter(), 2, 'Enemy'), 3).outcome, 'loss');
  assert.throws(() => combat.escapeFight(combat.startFight(combat.newCharacter('sparta'), 2, 'Enemy'), 1));
  assert.throws(() => combat.escapeFight(combat.startFight(combat.newCharacter(), 92, 'Enemy'), 1));
});
test('personal combats distinguish fast rescue, injured Mina, death, and heavy weapons', () => {
  const start = () => combat.startFight(combat.newCharacter(), 71, 'Ravagers');
  assert.equal(combat.applyRoll(combat.applyRoll(start(), 1), 2).destination, '28');
  assert.equal(combat.applyRoll(combat.applyRoll(start(), 1), 2).remaining, 0);
  let fight = start();
  for (const die of [6, 6, 1, 2]) fight = combat.applyRoll(fight, die);
  assert.equal(fight.destination, '82');
  fight = start();
  for (const die of [6, 6, 6, 6, 1]) fight = combat.applyRoll(fight, die);
  assert.equal(fight.outcome, 'loss');
  assert.equal(combat.applyRoll(combat.startFight(combat.newCharacter(), 96, 'Ravager'), 4).outcome, 'loss');
  assert.equal(combat.applyRoll(combat.startFight({...combat.newCharacter(), heavyWeapons: true}, 96, 'Ravager'), 5).outcome, 'win');
});
test('field repairs allocate two lost points per half hour, never revive or overfill', () => {
  let character = {...combat.newCharacter(), mechanic: true, weapons: 1, armour: 2};
  character = combat.repairCharacter(character, 'weapons');
  character = combat.repairCharacter(character, 'armour');
  assert.equal(character.repairMinutes, 30);
  character = combat.repairCharacter(character, 'armour');
  assert.equal(character.repairMinutes, 60);
  assert.throws(() => combat.repairCharacter(character, 'armour'));
  assert.throws(() => combat.repairCharacter({...character, armour: 0}, 'armour'));
  assert.throws(() => combat.repairCharacter({...character, mechanic: false}, 'weapons'));
});

test('run state is isolated, saves atomically, and records a result only once', () => {
  let run = {}, book = 808, saves = 0;
  const store = createState(() => ({currentBookId: book, currentPlaythrough: () => run, saveState: () => saves++}));
  store.change(data => { data.character = combat.newCharacter(); });
  store.change(data => { data.fight = combat.startFight(data.character, 27, 'Custom opponent'); });
  store.change(data => { data.fight = combat.applyRoll(data.fight, 1); });
  assert.equal(run.sim808.history.length, 1);
  store.change(() => {});
  assert.equal(run.sim808.history.length, 1);
  assert.equal(saves, 4);
  const old = run;
  assert.equal(store.change(() => { run = {}; }), false);
  assert.equal(old.sim808.history.length, 1);
  assert.equal(store.read(), null);
  book = 807;
  assert.equal(store.change(() => {}), false);
});

test('Bulgarian and English simulator dictionaries have matching placeholders', () => {
  assert.deepEqual(Object.keys(bg).sort(), Object.keys(en).sort());
  for (const key of Object.keys(bg)) {
    assert.deepEqual((bg[key].match(/\{\w+\}/g) ?? []).sort(), (en[key].match(/\{\w+\}/g) ?? []).sort(), key);
  }
});
