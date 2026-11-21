import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readRosterDocument} from '../../helpers/roster-db.cjs';
import * as combat from '../../../public/js/battlesim/engines/fighting-fantasy/core.js';

const rows = readRosterDocument(265).enemies;
const entries = [...new Map(rows.map(row => [row.stats.entry.section, row.stats.entry])).values()];
const entry = section => entries.find(row => row.section === String(section));
const settings = entries[0].support;
const hero = changes => ({...combat.newCharacter(settings.defaults),
  skillInitial: 12, staminaInitial: 24, luckInitial: 12, ...changes});
const begin = (section, changes = {}, applyEntry = false) =>
  combat.startFight(hero(changes), entry(section), {applyEntry});

test('the installed catalog has all 35 printed stat groups and two explicit variants', () => {
  assert.equal(entries.length, 37);
  assert.equal(rows.length, 54);
  for (const preset of entries) {
    assert.ok(preset.sourcePages.length && preset.printedRules.length);
    const fight = begin(preset.section, {stamina: 24});
    assert.equal(fight.status, 'active');
    assert.equal(fight.enemies.length, preset.enemies.length);
  }
  assert.deepEqual(entry(44).enemies.map(enemy => [enemy.skill, enemy.stamina]),
    [[4, 3], [4, 4], [4, 3], [4, 2], [4, 4], [4, 3]]);
  assert.deepEqual(entry(365).enemies.map(enemy => [enemy.skill, enemy.stamina]),
    [[6, 4], [5, 3], [6, 4], [5, 2], [4, 4]]);
});

test('Ogre and mastiff withdrawal thresholds do not award a combat victory', () => {
  for (const section of [3, 83, 251]) {
    assert.equal(begin(section, {stamina: 8}).status, 'routed');
    assert.equal(begin(section, {stamina: 8}).destination, '149');
    assert.equal(begin(section).config.stopAtEnemyStamina, 3);
    assert.equal(combat.attackModifier(begin(section), settings.items), -1);
  }
  assert.equal(begin(232, {stamina: 4}).destination, '272');
  assert.equal(begin(232, {stamina: 4}).status, 'routed');
});

test('the Queen entry strikes stay separate from ordinary wounds', () => {
  assert.equal(begin(163, {}, true).character.stamina, 9);
  assert.equal(begin(163).character.stamina, 12);
  assert.equal(begin('366-stung', {}, true).character.stamina, 6);
  assert.equal(begin('366-stung').character.stamina, 12);
  assert.equal(begin(366).config.incomingDamage, undefined);
  assert.equal(begin(219).config.incomingDamage, 3);
  assert.equal(begin(199, {}, true).character.skill, 5);
});

test('group limits, Brawling and item effects remain specific to their printed encounters', () => {
  assert.equal(entry(44).activeOpponents, 3);
  for (const section of [44, 136, 324, 444]) {
    assert.equal(entry(section).simultaneous, true);
    assert.equal(entry(section).independentPlayerAttacks, true);
  }
  assert.equal(entry(424).simultaneous, undefined);
  assert.equal(combat.attackModifier(begin(444), settings.items), -1);
  for (const section of [151, 238]) {
    assert.equal(combat.attackModifier(begin(section), settings.items), -2);
    assert.equal(combat.attackModifier(begin(section, {items: {beeswax: true}}), settings.items), 0);
  }
  assert.equal(begin('48-symbol').enemies[0].skill, 8);
  assert.equal(begin(48).enemies[0].skill, 10);
});
