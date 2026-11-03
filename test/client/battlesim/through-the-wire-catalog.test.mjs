import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {loadRosterDataset} from '../../../public/js/battlesim/roster-data.js';
import {validateFirearmCatalog} from '../../../public/js/battlesim/engines/real-life-firearms/catalog.js';
import {startFirearmFight, firearmTurn, resolveFirearmTurn} from '../../../public/js/battlesim/engines/real-life-firearms/core.js';

const {getRosterRows} = createRequire(import.meta.url)('../../helpers/roster-db.cjs');
const rows = getRosterRows(1536);
const entries = await loadRosterDataset(1536, 'CATALOG', async () => ({ok: true, json: async () => rows}));

test('Through the Wire loads three database-owned encounters, twelve enemies and six companions without Wounds', () => {
  validateFirearmCatalog(entries); assert.equal(entries.length, 3); assert.equal(rows.length, 12);
  const find = sid => entries.find(e => e.section === sid);
  assert.deepEqual(entries.map(e => e.section), ['42', '107', '300']);
  assert.deepEqual(find('42').opponents.map(e => e.skill), [6, 7]);
  assert.equal(find('42').enemyRollPenalty, 2); assert.equal(find('42').enemyShotsEachLimit, 2);
  assert.equal(find('42').interruptionTarget, '64'); assert.equal(find('42').chainHeroHits, true);
  assert.equal(find('107').mode, 'simultaneous'); assert.equal(find('107').heroRollPenalty, 1);
  assert.equal(find('107').enemyRollPenalty, 1); assert.equal(find('107').lossTarget, '141');
  assert.equal(find('300').allies.length, 6); assert.deepEqual(find('300').allies.map(e => e.skill), [7, 8, 6, 7, 8, 9]);
  assert.deepEqual(find('300').opponents.map(e => e.skill), [8, 7, 7, 6, 6, 5, 5, 6, 8]);
  assert.equal(find('300').resistanceParityKills, true); assert.equal(find('300').overflowEnemyTarget, 'manual');
  assert.ok(entries.every(e => e.opponents.every(row => row.wounds === null)));
});

test('all installed firearm encounters resolve through saved actions without changing their catalogs', () => {
  for (const entry of entries) {
    const original = JSON.stringify(entry); let f = startFirearmFight(12, entry), turns = 0;
    while (f.status === 'fighting') {
      assert.ok(turns++ < 100, 'Stalled ' + entry.section);
      const turn = firearmTurn(f);
      const rolls = turn.kind === 'simultaneous' ? {hero: [1, 1], enemy: [6, 6]}
        : turn.attackerId.startsWith('enemy') ? [6, 6] : [1, 1];
      f = resolveFirearmTurn(JSON.parse(JSON.stringify(f)), rolls, {target: turn.targetId ?? turn.targets?.[0]});
    }
    assert.equal(f.status, 'win', entry.section); assert.equal(JSON.stringify(entry), original);
  }
});
