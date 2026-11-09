import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRosterRows } from '../../helpers/roster-db.cjs';
import { loadRosterDataset } from '../../../public/js/battlesim/roster-data.js';
import { createFight, attack } from '../../../public/js/battlesim/engines/way-of-the-tiger/combat.js';

const entries = await loadRosterDataset(311, 'TIGER_ENCOUNTERS', async () => ({ ok: true, json: async () => getRosterRows(311) }));
test('the installed Assassin roster contains complete, distinct printed attack profiles', () => {
  assert.equal(entries.length, 29);
  assert.equal(new Set(entries.map(entry => entry.section)).size, 29);
  const section = id => entries.find(entry => entry.section === id);
  assert.equal(section('321').opponents[0].endurance, 22);
  assert.equal(section('333').opponents[0].endurance, 26);
  assert.equal(section('268').opponents[1].endurance, 12);
  assert.equal(section('284').opponents[1].endurance, 16);
  for (const entry of entries) {
    assert.equal(entry.sourceStatsCompared, true);
    for (const enemy of entry.opponents.filter(enemy => enemy.counterOnly)) {
      assert.equal(enemy.endurance, null);
      assert.equal(enemy.defense, null);
    }
    const fight = createFight({ endurance: 100, punch: 100, kick: 100, throw: 100 }, entry.opponents, { rules: entry.rules });
    assert.equal(attack(fight, { target: 0, technique: entry.technique, defense: entry.opponents[0].defense,
      counters: entry.opponents.map((enemy, target) => ({ target, defense: entry.playerDefense, damageDice: enemy.damageDice, damageBonus: enemy.damageBonus })) }, () => 0), true, entry.section);
    assert.ok(Number.isFinite(fight.player.endurance), entry.section);
    for (const enemy of fight.opponents.filter(enemy => !enemy.counterOnly)) assert.ok(Number.isFinite(enemy.endurance), entry.section);
  }
});
