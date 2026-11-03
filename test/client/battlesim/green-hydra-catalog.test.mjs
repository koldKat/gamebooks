import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {loadRosterDataset} from '../../../public/js/battlesim/roster-data.js';
import {validateSagardCatalog} from '../../../public/js/battlesim/engines/sagard/catalog.js';
import {startSagardFight} from '../../../public/js/battlesim/engines/sagard/core.js';
const require = createRequire(import.meta.url);
const {getRosterRows} = require('../../helpers/roster-db.cjs');
const entries = await loadRosterDataset(1542, 'CATALOG', async () => ({ok: true, json: async () => getRosterRows(1542)}));
const entry = section => entries.find(row => row.section === String(section));

test('database catalog retains all reviewed Green Hydra encounters, source charts and honest source gaps', () => {
  assert.equal(validateSagardCatalog(entries), entries); assert.equal(entries.length, 29);
  assert.equal(entries.reduce((n, e) => n + e.opponents.length, 0), 89);
  assert.equal(entries.reduce((n, e) => n + e.allies.length, 0), 2);
  assert.equal(entries[0].rules.initialHeroLevel, 3);
  assert.deepEqual(entries[0].rules.damageByLevel[0], [0, 0, 0, 1]);
  assert.equal(entry(54).mode, 'manual'); assert.match(entry(54).manualReason, /clip/);
  assert.throws(() => startSagardFight({level: 3, hp: 20}, entry(54), entry(54).rules), /clip/);
  assert.equal(entry(38).opponents[0].hp, null); assert.equal(entry(38).opponents[0].immortal, true);
});

test('source-specific attack, escape, threshold, temporary level and reinforcement rules survive database loading', () => {
  assert.equal(entry(14).escapeAfterRounds, 1); assert.equal(entry(14).escapeVolley, 3);
  assert.equal(entry(22).escape, 'automatic'); assert.equal(entry(25).escape, 'one');
  assert.equal(entry(35).heroAttacksPerRound, 2); assert.equal(entry(35).escapeAttack, true);
  assert.equal(entry(36).openings.length, 3); assert.equal(entry(36).opponents[0].hpBands.length, 5);
  assert.equal(entry(38).mapRetrieval, 1); assert.equal(entry(49).firstDamageTarget, '65');
  assert.equal(entry(62).maxHeroHp, 25); assert.equal(entry(74).opponents.length, 10);
  assert.ok(entry(74).opponents.every(row => row.damageIgnoresArmor && row.chart.join() === '0,0,0,1'));
  assert.deepEqual(entry(85).heroInitiativeDice, [1, 2]); assert.equal(entry(85).escape, 'jump');
  assert.equal(entry(89).withdrawTarget, '100'); assert.equal(entry(94).escapeTarget, '96');
  assert.equal(entry(95).temporaryHeroLevel, 2);
  assert.deepEqual(entry(96).opponents.map(row => row.attackTarget), ['hero', 'hero', 'hero', 'ally0', 'ally0', 'ally1', 'ally1']);
  assert.equal(entry(101).opponents[2].joinsRound, 7); assert.equal(entry(101).opponents[2].joinsFirst, true);
});

test('held missiles and recovery are opt-in and the two printed Hydra arrow rules remain distinct', () => {
  const fight = startSagardFight({level: 3, hp: 20}, entry(1), entry(1).rules);
  assert.deepEqual(fight.ammo, {poisonDaggers: 0, fireDarts: 0, arrows: 0});
  assert.equal(fight.healing.spiritLuck, false);
  assert.deepEqual(entry(77).projectileOverrides.arrows.hitDice, [2, 4]);
  assert.deepEqual(entry(96).projectileOverrides.arrows.hitDice, [1, 2, 3]);
  assert.equal(entry(77).projectileOverrides.arrows.requiresOil, true);
  assert.equal(entry(77).rules.projectiles.find(row => row.id === 'fireDarts').shotsPerRound, 2);
});
