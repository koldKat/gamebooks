import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {loadRosterDataset} from '../../../public/js/battlesim/roster-data.js';
import {validateRealLifeCatalog} from '../../../public/js/battlesim/engines/real-life/catalog.js';
import {startRealLifeFight, realLifeStep, realLifeActive, realLifeTurn} from '../../../public/js/battlesim/engines/real-life/core.js';

const {getRosterRows} = createRequire(import.meta.url)('../../helpers/roster-db.cjs');
const rows = getRosterRows(1535);
const entries = await loadRosterDataset(1535, 'CATALOG', async () => ({ok: true, json: async () => rows}));

test('Sword and Flame loads all20 database-owned encounters and39 source opponents', () => {
  validateRealLifeCatalog(entries); assert.equal(entries.length, 20); assert.equal(rows.length, 39);
  const find = sid => entries.find(e => e.section === sid);
  assert.equal(find('9').playerSkillModifier, -1);
  assert.equal(find('62').openingAgilityTest, true);
  assert.equal(find('112').lossTarget, '147'); assert.equal(find('199').lossTarget, '130');
  for (const sid of ['112', '199']) assert.equal(find(sid).criticalLossTarget, '274');
  assert.equal(find('196').knifePossession, true); assert.equal(find('196').opponents[0].wounds, null);
  assert.equal(find('196').opponents[0].skill, 8);
  assert.equal(find('212').openingShots, 2); assert.equal(find('212').openingRemovesTarget, true);
  assert.equal(find('217').openingSkillModifier, -2); assert.equal(find('217').enemyOpeningAgility, true);
  assert.equal(find('249').opponents[2].wounds, 3); assert.equal(find('294').opponents[2].wounds, 4);
  assert.equal(find('277').openingRemovesTarget, true); assert.equal(find('291').enemyFleeAtWounds, 1);
  assert.ok(entries.every(e => !e.mountedCombat && !e.horseRule), 'No invented mounted modifiers');
});

test('every printed encounter resolves across saved actions without altering its source catalog', () => {
  for (const entry of entries) {
    const before = JSON.stringify(entry);
    let fight = startRealLifeFight({strength: 99, sword: 99, firearm: 99, agility: 99, horsemanship: 99, wounds: 1000}, entry);
    let actions = 0;
    while (realLifeActive(fight)) {
      assert.ok(actions++ < 100, 'Stalled ' + entry.section);
      const own = realLifeTurn(fight).attacker === 'hero';
      fight = realLifeStep(JSON.parse(JSON.stringify(fight)), {}, () => own ? 1 : 6);
    }
    assert.equal(fight.status, 'win', entry.section); assert.equal(JSON.stringify(entry), before);
  }
});
