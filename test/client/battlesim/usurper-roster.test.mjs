import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRosterRows } from '../../helpers/roster-db.cjs';
import { loadRosterDataset } from '../../../public/js/battlesim/roster-data.js';
import { createFight, attack } from '../../../public/js/battlesim/engines/way-of-the-tiger/combat.js';

const entries = await loadRosterDataset(312, 'TIGER_ENCOUNTERS', async () => ({ ok: true, json: async () => getRosterRows(312) }));
const profile = id => entries.find(entry => entry.section === id);

test('Usurper keeps distinct source profiles and independent devil fights in its installed roster', () => {
  assert.equal(entries.length, 43);
  assert.equal(new Set(entries.map(entry => entry.section)).size, 43);
  assert.equal(entries.reduce((sum, entry) => sum + entry.opponents.length, 0), 46);
  for (const [section, endurance] of [['30-astaroth', 2], ['198-astaroth', 6], ['260', 33]]) {
    assert.equal(profile(section).opponents[0].endurance, endurance);
  }
  assert.equal(profile('79').playerDefense, 7);
  assert.equal(profile('88').playerDefense, 9);
  assert.equal(profile('99').rules.attackDamageBonus, 2);
  assert.equal(profile('158').rules.attackDamageBonus, 3);
  assert.equal(profile('46-yubi').rules.throwVictory, true);
  assert.equal(profile('46').rules.followupModifier, 2);
  assert.equal(profile('364').rules.followupModifier, 2);
  assert.deepEqual(profile('187').opponents.map(enemy => enemy.endurance), [9, 9, 9, 9]);
  assert.equal(profile('267-flail').opponents[0].defense, 8);
  assert.equal(profile('267-flail').rules.attackDamageBonus, 2);
  assert.equal(profile('408').rules.mirrorPlayer, true);
  for (const section of ['307', '313']) assert.equal(profile(section).opponents[0].manualCounter, true);
  for (const scripted of ['22', '76', '89', '150', '178', '241', '246', '289', '346']) assert.equal(profile(scripted), undefined);
});

test('every reviewed Usurper combat profile runs from the database without invented statistics', () => {
  for (const entry of entries) {
    assert.equal(entry.sourceStatsCompared, true);
    assert.match(entry.sourceSection, /^\d+$/);
    const fight = createFight({ endurance: 100, punch: 100, kick: 100, throw: 100 }, entry.opponents, { rules: entry.rules });
    assert.equal(attack(fight, { target: 0, technique: entry.technique, defense: entry.opponents[0].defense,
      innerForce: entry.rules.innerForceRequired === true,
      counters: entry.opponents.filter(enemy => !enemy.manualCounter).map((enemy, target) => ({ target,
        defense: entry.playerDefense, damageDice: enemy.damageDice, damageBonus: enemy.damageBonus })) }, () => 0), true, entry.section);
    assert.ok(Number.isFinite(fight.player.endurance), entry.section);
    for (const enemy of fight.opponents) assert.ok(Number.isFinite(enemy.endurance), entry.section);
  }
});
