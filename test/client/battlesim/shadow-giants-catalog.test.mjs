import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readRosterDocument} from '../../helpers/roster-db.cjs';
import * as combat from '../../../public/js/battlesim/engines/fighting-fantasy/core.js';

const rows = readRosterDocument(266).enemies;
const entries = [...new Map(rows.map(row => [row.stats.entry.section, row.stats.entry])).values()];
const entry = section => entries.find(row => row.section === String(section));
const settings = entries[0].support;
const hero = changes => ({...combat.newCharacter(settings.defaults, () => 6), ...changes});
const begin = (section, changes = {}, applyEntry = false) => combat.startFight(hero(changes),
  entry(section), {applyEntry, items:settings.items}, () => 3);

test('the installed catalog covers all 22 source tables and ten Zombie survivor counts', () => {
  assert.equal(entries.length, 31);
  assert.equal(rows.length, 85);
  assert.equal(new Set(entries.map(row => row.section.split('-')[0])).size, 22);
  for (const preset of entries) {
    assert.ok(preset.sourcePages.length && preset.printedRules.length);
    const fight = begin(preset.section, {items:{warHammer:true}});
    assert.equal(fight.status, 'active');
    assert.equal(fight.enemies.length, preset.enemies.length);
  }
  for (let count = 1; count <= 10; count++) {
    assert.equal(entry('135-' + count).enemies.length, count);
    assert.ok(entry('135-' + count).enemies.every(enemy => enemy.skill === 6 && enemy.stamina === 6));
  }
  assert.equal(entry('135-0'), undefined);
  assert.deepEqual(entry(45).enemies.map(enemy => [enemy.skill,enemy.stamina]), [[6,2],[5,2],[6,3]]);
});

test('weapons apply their printed bonus only in the matching encounter', () => {
  for (const [section, weapon, bonus] of [[7,'fireSword',1],[382,'fireSword',1],
    [86,'vampireSword',2],[216,'vampireSword',2],[131,'serpentSword',2],[345,'demonSword',2]]) {
    assert.equal(combat.attackModifier(begin(section, {items:{[weapon]:true}}), settings.items), bonus);
    assert.equal(combat.attackModifier(begin(219, {items:{[weapon]:true}}), settings.items), 0);
  }
  assert.equal(combat.attackModifier(begin(219, {items:{helmet:true,shield:true}}), settings.items), 2);
});

test('Spider Hag poison and sword strikes can be entered once without repeating losses', () => {
  assert.equal(begin(147, {}, true).character.skill, 10);
  assert.equal(begin(147, {}, true).character.stamina, 21);
  assert.equal(begin(147).character.stamina, 24);
  for (const section of [21,42,248]) {
    assert.equal(begin(section, {}, true).character.stamina, 22);
    assert.equal(begin(section).character.stamina, 24);
  }
});

test('Gorgon variants retain distinct penalties, round limits and destinations', () => {
  assert.equal(entry(182).attackModifier, -5);
  assert.equal(entry(355).attackModifier, -3);
  assert.equal(entry(182).roundLimitLuck.rounds, 3);
  assert.deepEqual(entry(355).roundLimitLuck, {rounds:3,lucky:'168',unlucky:'318'});
  assert.equal(entry(379).surviveRounds, 2);
  assert.equal(entry(379).win, '201');
  assert.equal(entry(379).attackModifier, undefined);
  assert.equal(entry(88).escape.damage, 2);
  assert.equal(entry(88).escape.destination, '11');
});
