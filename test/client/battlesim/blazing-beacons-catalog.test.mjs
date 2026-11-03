import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {loadRosterDataset} from '../../../public/js/battlesim/roster-data.js';
import {validateRealLifeCatalog} from '../../../public/js/battlesim/engines/real-life/catalog.js';
import {startRealLifeFight, realLifeStep, realLifeActive, realLifeTurn} from '../../../public/js/battlesim/engines/real-life/core.js';

const {getRosterRows} = createRequire(import.meta.url)('../../helpers/roster-db.cjs');
const rows = getRosterRows(1539);
const entries = await loadRosterDataset(1539, 'CATALOG', async () => ({ok: true, json: async () => rows}));

test('Blazing Beacons keeps its 19 encounters and 21 opponents in the database', () => {
  validateRealLifeCatalog(entries);
  assert.equal(entries.length, 19); assert.equal(rows.length, 21);
  const boarding = entries.find(e => e.section === '20');
  assert.deepEqual(boarding.opponents.map(e => [e.skill, e.wounds]), [[6, 3], [7, 3], [8, 4]]);
  assert.equal(boarding.openingTargetIndex, 2); assert.equal(boarding.splitSkillAttacks, true);
  assert.deepEqual(entries.filter(e => e.opponentFirst).map(e => e.section), ['90', '291']);
  assert.ok(entries.every(e => e.weapon === 'sword' && e.lossTarget === null && !e.mountedCombat));
});

test('each source encounter resolves across saved actions while preserving its roster and printed victory', () => {
  for (const entry of entries) {
    const before = JSON.stringify(entry);
    let fight = startRealLifeFight({strength: 12, sword: 12, firearm: 12, wounds: 1000}, entry);
    let actions = 0;
    while (realLifeActive(fight)) {
      assert.ok(actions++ < 100, 'Stalled ' + entry.section);
      const own = realLifeTurn(fight).attacker === 'hero';
      fight = realLifeStep(JSON.parse(JSON.stringify(fight)), {}, () => own ? 1 : 6);
    }
    assert.equal(fight.status, 'win', entry.section);
    assert.equal(fight.destination, entry.winTarget);
    assert.equal(JSON.stringify(entry), before);
  }
});
