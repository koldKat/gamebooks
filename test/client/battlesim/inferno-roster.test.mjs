import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRosterRows } from '../../helpers/roster-db.cjs';
import { loadRosterDataset } from '../../../public/js/battlesim/roster-data.js';
import { createFight, attack } from '../../../public/js/battlesim/engines/way-of-the-tiger/combat.js';

const entries = await loadRosterDataset(315, 'TIGER_ENCOUNTERS', async () => ({ ok: true, json: async () => getRosterRows(315) }));
const profile = section => entries.find(entry => entry.section === section);

test('Inferno retains eight printed profiles and ten opponent rows with reader stopping rules', () => {
  assert.deepEqual(entries.map(entry => entry.section), ['12', '382', '162', '221', '241', '254', '294', '334']);
  assert.equal(entries.reduce((n, entry) => n + entry.opponents.length, 0), 10);
  assert.equal(profile('12').technique, 'kick');
  assert.equal(profile('12').opponents[0].defense, 5);
  assert.deepEqual(profile('382').rules.openingCounter, { target: 0, defense: 7, damageDice: 0, damageBonus: 4 });
  assert.deepEqual(profile('162').opponents.map(o => [o.endurance, o.defense, o.damageDice, o.damageBonus]), [[10,6,1,1], [8,5,1,0], [7,5,1,0]]);
  assert.equal(profile('162').rules.openingShuriken, true);
  assert.equal(profile('162').rules.readerDefeatedCount, 2);
  assert.equal(profile('221').rules.readerEnemyThreshold, 12);
  assert.equal(profile('221').rules.readerPlayerBelow, 4);
  assert.equal(profile('241').rules.readerOnSuccessfulThrow, true);
  assert.equal(profile('241').rules.unblockable, true);
  assert.equal(profile('241').playerDefense, 6);
  for (const section of ['254', '294', '334']) {
    const entry = profile(section);
    assert.equal(entry.rules.readerSuccessfulHits, 2);
    assert.equal(entry.rules.maxRounds, 3);
    assert.equal(entry.rules.roundLimitAfterCounters, true);
    assert.equal(entry.rules.readerEnemyThreshold, 0);
    assert.deepEqual([entry.opponents[0].endurance, entry.opponents[0].damageDice, entry.opponents[0].damageBonus], [20,2,2]);
  }
  assert.equal(profile('334').opponents[0].defense, 7);
  assert.equal(profile('334').playerDefense, 9);
});

test('every database profile resolves combat without introducing story progression', () => {
  for (const entry of entries) {
    const fight = createFight({ endurance: 100, punch: 100, kick: 100 }, entry.opponents, { rules: entry.rules, random: () => 0 });
    assert.equal(attack(fight, { target: 0, technique: entry.technique, defense: entry.opponents[0].defense, counters: [] }, () => 0), true, entry.section);
    assert.ok(Number.isFinite(fight.player.endurance));
    assert.ok(fight.opponents.every(enemy => Number.isFinite(enemy.endurance)));
    assert.equal(Object.hasOwn(fight, 'nextSection'), false);
  }
});
