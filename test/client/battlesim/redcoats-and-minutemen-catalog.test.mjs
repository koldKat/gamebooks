import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {loadRosterDataset} from '../../../public/js/battlesim/roster-data.js';
import {validateRealLifeCatalog} from '../../../public/js/battlesim/engines/real-life/catalog.js';
import {startRealLifeFight, realLifeStep, realLifeActive, realLifeTurn} from '../../../public/js/battlesim/engines/real-life/core.js';

const {getRosterRows} = createRequire(import.meta.url)('../../helpers/roster-db.cjs');
const rows = getRosterRows(1537);
const entries = await loadRosterDataset(1537, 'CATALOG', async () => ({ok: true, json: async () => rows}));

test('Redcoats and Minutemen keeps all18 encounters and25 printed opponents in the database', () => {
 validateRealLifeCatalog(entries); assert.equal(entries.length,18); assert.equal(rows.length,25);
 const find=sid=>entries.find(e=>e.section===sid);
 assert.equal(find('143').weapon,'strength'); assert.equal(find('143').survivalRounds,2);
 assert.equal(find('143').opponents[0].damage,2); assert.equal(find('143').opponents[0].wounds,5);
 for(const id of ['118','290'])assert.equal(find(id).opponentFirst,true);
 assert.equal(find('259').winWithinRounds,2); assert.equal(find('259').lateWinTarget,'184');
 assert.ok(entries.every(e=>!e.mountedCombat&&!e.horseRule));
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
