import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readRosterDocument} from '../../helpers/roster-db.cjs';
import {validateTwoFistedCatalog, validateTwoFistedSupport,
  prepareTwoFistedEncounter} from '../../../public/js/battlesim/engines/two-fisted/catalog.js';
import {groundPlayer, startGroundFight} from '../../../public/js/battlesim/engines/two-fisted/ground.js';
import {spacePlayer, startSpaceFight} from '../../../public/js/battlesim/engines/two-fisted/space.js';

const rows = readRosterDocument(1527).enemies;
const entries = [...new Map(rows.map(row => [row.stats.entryIndex, row.stats.entry])).values()];
const support = entries.find(entry => entry.support).support;

test('the installed database catalog contains all 43 encounters, 72 opponents and original support tables', () => {
  assert.equal(entries.length, 43); assert.equal(rows.length, 72);
  validateTwoFistedCatalog(entries); validateTwoFistedSupport(support);
  assert.equal(support.coPilots.length, 8); assert.equal(support.items.length, 42);
  assert.equal(support.shipUpgrades.length, 8); assert.equal(support.heavyHits.length, 6);
});

test('every database encounter starts with its printed stats, retaining manually supplied missing FISTS', () => {
  for (const entry of entries) {
    const current = entry.combat.opponents.map(enemy => ({...enemy,
      ...(enemy.requiresManualFists ? {fists: 2} : {})}));
    const prepared = prepareTwoFistedEncounter(entry, current, support);
    const fight = prepared.mode === 'space' ? startSpaceFight(spacePlayer(), prepared)
      : startGroundFight(groundPlayer(), prepared, () => 5);
    assert.equal(fight.opponents.length, entry.combat.opponents.length);
    assert.equal(fight.status, 'fighting');
  }
});

test('unknown FISTS remain unknown in the preset and are required from the player', () => {
  const entry = entries.find(entry => entry.section === '140');
  assert.ok(entry.combat.opponents.every(enemy => enemy.fists === null));
  assert.throws(() => prepareTwoFistedEncounter(entry, null, support));
  assert.ok(entry.combat.opponents.every(enemy => enemy.fists === null));
});

test('explicit zero FISTS, distinct alien weapons and source combat modes are not homogenized', () => {
  const at = section => entries.find(entry => entry.section === section).combat;
  assert.equal(at('163').opponents[0].fists, 0);
  assert.equal(at('389').opponents[3].fists, 0);
  assert.equal(at('271').opponents[0].weapons, 5); assert.equal(at('328').opponents[0].weapons, 6);
  assert.equal(at('385').mode, 'melee'); assert.equal(at('386').mode, 'ranged');
});

test('encounter exceptions are declarative database fields rather than runtime book-ID branches', () => {
  const at = section => entries.find(entry => entry.section === section).combat;
  assert.equal(at('9').roundLimit, 3); assert.equal(at('163').roundLimit, 2);
  assert.equal(at('220').strayFire, true); assert.equal(at('271').noSurrenderAfterKill, true);
  assert.equal(at('297').retreatPowerCost, 5); assert.equal(at('115').opponents[0].heavyEachHit, true);
  assert.equal(at('251').opponents[2].lethalOnHit, true); assert.equal(at('393').opponents[0].lethalOnLostRound, true);
});

test('catalog preparation rejects duplicate identity and a changed preset group size', () => {
  assert.throws(() => validateTwoFistedCatalog([entries[0], entries[0]]));
  assert.throws(() => prepareTwoFistedEncounter(entries[0], [], support));
});
