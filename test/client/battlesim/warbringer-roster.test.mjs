import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRosterRows } from '../../helpers/roster-db.cjs';
import { loadRosterDataset } from '../../../public/js/battlesim/roster-data.js';
import { createFight, attack } from '../../../public/js/battlesim/engines/way-of-the-tiger/combat.js';

const entries = await loadRosterDataset(314, 'TIGER_ENCOUNTERS', async () => ({ ok: true, json: async () => getRosterRows(314) }));
const profile = section => entries.find(entry => entry.section === section);

test('Warbringer retains all seventeen printed combat profiles and their distinct rules', () => {
  assert.equal(entries.length, 17);
  for (const section of ['60', '168', '264']) {
    assert.equal(profile(section).opponents[0].endurance, 22);
    assert.equal(profile(section).rules.readerAfterCounterHit, true);
  }
  for (const section of ['70', '178', '274']) {
    assert.equal(profile(section).rules.attackDamageBonus, 3);
    assert.equal(profile(section).rules.innerForceForbidden, true);
    assert.equal(profile(section).rules.techniqueLabels.punch, 'Sceptre');
  }
  assert.equal(profile('173').opponents[0].defense, 4);
  assert.equal(profile('337').opponents[0].defense, 6);
  assert.equal(profile('337').opponents[0].damageBonus, 1);
  assert.equal(profile('347').opponents[0].damageBonus, 0);
  assert.equal(profile('357').playerDefense, 5);
  for (const section of ['213', '263', '283']) assert.equal(profile(section).rules.unblockable, true);
  assert.equal(profile('263').rules.yubiJutsuReturnsToReader, true);
  for (const section of ['360', '370']) {
    assert.equal(profile(section).rules.readerEnemyThreshold, 6);
    assert.equal(profile(section).rules.yubiJutsuDamageBonus, 2);
    assert.equal(profile(section).rules.yubiJutsuCannotCombineWithInnerForce, true);
  }
  for (const section of ['80', '155', '223', '284', '317', '327', '323', '380']) assert.equal(profile(section), undefined);
});

test('every database profile resolves an individual combat attack without campaign state', () => {
  for (const entry of entries) {
    const fight = createFight({ endurance: 100, punch: 100, kick: 100 }, entry.opponents, { rules: entry.rules });
    assert.equal(attack(fight, { target: 0, technique: entry.technique, defense: entry.opponents[0].defense,
      counters: [{ target: 0, defense: entry.playerDefense, damageDice: entry.opponents[0].damageDice,
        damageBonus: entry.opponents[0].damageBonus }] }, () => 0), true, entry.section);
    assert.ok(Number.isFinite(fight.player.endurance));
    assert.ok(fight.opponents.every(enemy => Number.isFinite(enemy.endurance)));
    assert.equal(Object.hasOwn(fight, 'nextSection'), false);
  }
});
