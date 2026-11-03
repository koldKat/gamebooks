import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {loadRosterDataset} from '../../../public/js/battlesim/roster-data.js';
import {validateRealLifeCatalog, realLifeEditorRows} from '../../../public/js/battlesim/engines/real-life/catalog.js';
import {startRealLifeFight, realLifeStep, realLifeActive, realLifeTurn} from '../../../public/js/battlesim/engines/real-life/core.js';

const {getRosterRows} = createRequire(import.meta.url)('../../helpers/roster-db.cjs');
const rows = getRosterRows(1534);
const entries = await loadRosterDataset(1534, 'CATALOG', async () => ({ok: true, json: async () => rows}));

test('The Last Invasion loads all 36 encounter groups and 63 database-owned opponents', () => {
  validateRealLifeCatalog(entries); assert.equal(entries.length, 36); assert.equal(rows.length, 63);
  assert.equal(new Set(entries.map(entry => entry.section)).size, 36);
  const unknown = entries.flatMap(e => e.opponents).filter(e => e.unprintedSkill);
  const noSkill = entries.flatMap(e => e.opponents).filter(e => e.noSkillPrinted);
  assert.equal(unknown.length, 1); assert.equal(unknown[0].skill, null);
  assert.equal(noSkill.length, 1); assert.equal(noSkill[0].name, 'Wild Boar'); assert.equal(noSkill[0].skill, null);
  const find = section => entries.find(e => e.section === section);
  assert.equal(find('120').optionalRoundLuckTarget, '264'); assert.equal(find('199').optionalRoundLuckTarget, '135');
  assert.equal(find('25').horseRule, 'hero-before-round-fall'); assert.equal(find('162').horseRule, 'hero-before-round-fall');
  assert.equal(find('242').horseRule, 'hero-after-round-bonus'); assert.equal(find('260').enemyAttackMode, 'agility-avoidance');
  assert.equal(find('251').simultaneousAttack, true); assert.equal(find('275').requireUnharmed, true);
});

test('every source encounter completes across saved intermediate actions without mutating the catalog', () => {
  for (const entry of entries) {
    const before = JSON.stringify(entry);
    const opponents = realLifeEditorRows(entry.opponents).map(e => ({...e,
      skill: e.noSkillPrinted ? null : e.skill === '' ? 7 : e.skill}));
    // Seven is a test-only manual choice for the printed Axe?, never a catalog default.
    let fight = startRealLifeFight({strength: 99, sword: 99, javelin: 99, agility: 99, luck: 99, horsemanship: 99, wounds: 1000},
      entry, {opponents, charge: Boolean(entry.optionalCharge)});
    let actions = 0;
    while (realLifeActive(fight)) {
      assert.ok(actions++ < 100, 'Stalled source encounter ' + entry.section);
      const turn = realLifeTurn(fight), own = turn.attacker === 'hero';
      fight = realLifeStep(JSON.parse(JSON.stringify(fight)), {}, () => own ? 1 : 6);
    }
    assert.equal(fight.status, 'win', entry.section);
    assert.equal(JSON.stringify(entry), before, 'Source metadata unchanged');
  }
});
