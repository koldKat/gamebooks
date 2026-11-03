import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {loadRosterDataset} from '../../../public/js/battlesim/roster-data.js';
import {validateRealLifeCatalog, realLifeEditorRows} from '../../../public/js/battlesim/engines/real-life/catalog.js';
import {startRealLifeFight, realLifeStep, realLifeActive, realLifeTurn} from '../../../public/js/battlesim/engines/real-life/core.js';
const {getRosterRows} = createRequire(import.meta.url)('../../helpers/roster-db.cjs');
const rows = getRosterRows(1533);
const entries = await loadRosterDataset(1533, 'CATALOG', async () => ({ok: true, json: async () => rows}));

test('Madame Guillotine loads 20 complete encounter groups with 35 opponents and 2 allies from the database', () => {
  validateRealLifeCatalog(entries);
  assert.equal(entries.length, 20); assert.equal(rows.length, 35);
  assert.equal(entries.reduce((n, entry) => n + (entry.allies?.length ?? 0), 0), 2);
  assert.equal(new Set(entries.map(entry => entry.section)).size, 20);
  assert.ok(rows.every(row => row.stats.roster.family === 'real-life'));
  const unprinted = entries.flatMap(entry => entry.opponents).filter(enemy => enemy.unprintedSkill);
  assert.equal(unprinted.length, 1); assert.equal(unprinted[0].skill, null);
});

test('each installed source preset completes with saved intermediate turns and no source mutation', () => {
  for (const entry of entries) for (const weapon of entry.weaponChoices ?? [entry.weapon]) {
    const before = JSON.stringify(entry);
    const opponents = realLifeEditorRows(entry.opponents, weapon).map(enemy => ({...enemy, skill: enemy.skill === '' ? 7 : enemy.skill}));
    // Seven is an explicit test-only choice for the one unprinted skill.
    let fight = startRealLifeFight({strength: 99, sword: 99, firearm: 99, horsemanship: 99, wounds: 1000}, entry, {weapon, opponents});
    let actions = 0;
    while (realLifeActive(fight)) {
      assert.ok(actions++ < 100, 'Stalled source encounter ' + entry.section);
      const turn = realLifeTurn(fight), own = turn?.attacker === 'hero' || turn?.attacker.startsWith('ally');
      fight = realLifeStep(JSON.parse(JSON.stringify(fight)), {}, () => own ? 1 : 6);
    }
    assert.equal(fight.status, 'win', entry.section);
    assert.equal(JSON.stringify(entry), before, 'Source metadata unchanged');
  }
});
