import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRosterRows } from '../../helpers/roster-db.cjs';
import { loadRosterDataset } from '../../../public/js/battlesim/roster-data.js';
import { createFight, attack } from '../../../public/js/battlesim/engines/way-of-the-tiger/combat.js';

const entries = await loadRosterDataset(313, 'TIGER_ENCOUNTERS', async () => ({ ok: true, json: async () => getRosterRows(313) }));
const profile = id => entries.find(entry => entry.section === id);

test('Overlord preserves its distinct printed enemies, attack profiles and exceptions', () => {
  assert.equal(entries.length, 25);
  assert.equal(entries.reduce((n, e) => n + e.opponents.length, 0), 28);
  assert.deepEqual(profile('50').opponents.map(e => [e.endurance, e.defense]), [[9, 6], [8, 7]]);
  assert.deepEqual(profile('66').opponents.map(e => e.defense), [7, 6]);
  assert.equal(profile('114').rules.followupDefense, 4);
  assert.equal(profile('52').rules.repeatThrowDefenseAtAttempt, 2);
  assert.equal(profile('52-disarmed').opponents[0].defense, 6);
  assert.equal(profile('52-disarmed').rules.repeatThrowDefense, 7);
  assert.equal(profile('76-disarmed').rules.counterRollModifier, -1);
  assert.equal(profile('104-fatigued').rules.attackModifier, -2);
  assert.equal(profile('116').playerDefense, 6);
  assert.equal(profile('250').opponents[0].damageDice, 2);
  assert.equal(profile('322').opponents[0].damageDice, 1);
  assert.equal(profile('322').opponents[0].damageBonus, 3);
  assert.equal(profile('268').rules.missDamage, 4);
  assert.equal(profile('268').rules.skipCountersOnHit, undefined);
  assert.equal(profile('314').rules.readerEnemyThreshold, 4);
  assert.deepEqual(profile('324').rules.followupTechniques, ['kick']);
  assert.equal(profile('354').opponents[0].endurance, 10);
  for (const id of ['8', '128', '160', '184', '280', '346', '366', '412']) assert.equal(profile(id), undefined);
});

test('every installed Overlord profile resolves a legal attack without inventing story progression', () => {
  for (const entry of entries) {
    assert.equal(entry.sourceStatsCompared, true);
    const fight = createFight({ endurance: 100, punch: 100, kick: 100, throw: 100, yubiJutsu: true }, entry.opponents, { rules: entry.rules });
    assert.equal(attack(fight, { target: 0, technique: entry.technique, defense: entry.opponents[0].defense,
      counters: entry.opponents.map((e, target) => ({ target, defense: entry.playerDefense, damageDice: e.damageDice, damageBonus: e.damageBonus })) }, () => 0), true, entry.section);
    assert.ok(Number.isFinite(fight.player.endurance), entry.section);
    assert.ok(fight.opponents.every(e => Number.isFinite(e.endurance)), entry.section);
    assert.equal(Object.hasOwn(fight, 'nextSection'), false);
  }
});
