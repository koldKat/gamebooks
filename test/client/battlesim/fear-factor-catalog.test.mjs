import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {loadRosterDataset} from '../../../public/js/battlesim/roster-data.js';
import {validateFirearmCatalog} from '../../../public/js/battlesim/engines/real-life-firearms/catalog.js';
import {startFirearmFight, firearmTurn, resolveFirearmTurn} from '../../../public/js/battlesim/engines/real-life-firearms/core.js';

const {getRosterRows} = createRequire(import.meta.url)('../../helpers/roster-db.cjs');
const rows = getRosterRows(1540);
const entries = await loadRosterDataset(1540, 'CATALOG', async () => ({ok: true, json: async () => rows}));
const find = section => entries.find(e => e.section === String(section));

test('Fear Factor loads all sixteen encounters, forty-one opponents and twelve companions from the database', () => {
  validateFirearmCatalog(entries); assert.equal(entries.length, 16); assert.equal(rows.length, 41);
  assert.equal(entries.reduce((n, e) => n + e.allies.length, 0), 12);
  assert.deepEqual(entries.map(e => e.section), ['5','30','37','38','51','54','62','67','90','101','123','146','154','182','282','284']);
  assert.deepEqual(find(5).opponents.map(e => e.skill), [6,7,7,6,9,7,8]);
  assert.deepEqual(find(5).allies.map(e => [e.name,e.skill]), [['Miguel',6],['Franco',5],['Davina',7],['Nomso',7]]);
  assert.deepEqual(find(67).allies.map(e => [e.name,e.weapon,e.skill]), [['Nomso','Ingrams',6],['Franco','Pistol',5],['Miguel','Pistol',7],['Davina','Pistol',7]]);
  assert.equal(find(5).enemyTargetOrder, 'manual'); assert.equal(find(37).enemyTargetOrder, 'allies-first');
  assert.equal(find(67).opponentFirst, true); assert.equal(find(38).opponentFirst, true);
});

test('source branches retain distinct hit thresholds, opening rules, skill penalties and manual gaps', () => {
  assert.equal(find(51).heroTargeting, 'spray'); assert.equal(find(51).openingWoundChoice, true);
  assert.equal(find(51).opponents[2].hitsToKill, 2); assert.equal(find(90).opponents[1].hitsToKill, 2);
  assert.equal(find(54).opponents[1].hitsToKill, 1); assert.equal(find(62).opponents[2].hitsToKill, 1);
  assert.equal(find(62).heroOpeningShots, 2); assert.equal(find(62).targetOrder, 'printed');
  assert.equal(find(123).heroOpeningShots, 2); assert.equal(find(123).allies.length, 0);
  assert.equal(find(101).firstWoundSkillPenalty, 2); assert.equal(find(101).opponents[2].hitDamage, 'lethal');
  assert.equal(find(182).opponentFirst, true); assert.equal(find(282).heroHitsToDeath, 2);
  assert.equal(find(154).heroSkill, 'Combat'); assert.equal(find(154).opponents[0].skill, 7);
  assert.deepEqual(entries.filter(e => e.mode === 'manual').map(e => [e.section,e.opponents[0].wounds]), [['146',4],['284',6]]);
  assert.equal(find(146).playerAttackLimit, 2); assert.equal(find(284).opponents[0].skill, 6);
});

test('all fourteen automatic presets finish across saved actions without mutating source catalogs', () => {
  for (const entry of entries) {
    const before = JSON.stringify(entry);
    if (entry.mode === 'manual') {assert.throws(() => startFirearmFight(12, entry)); continue;}
    let fight = startFirearmFight(12, entry), actions = 0;
    while (fight.status === 'fighting') {
      assert.ok(actions++ < 150, 'Stalled encounter ' + entry.section);
      const turn = firearmTurn(fight);
      const rolls = turn.kind === 'sprayHit' ? null : turn.attackerId.startsWith('enemy') ? [6,6] : [1,1];
      fight = resolveFirearmTurn(JSON.parse(JSON.stringify(fight)), rolls, {target: turn.targetId ?? turn.targets[0]});
    }
    assert.equal(fight.status, 'win', entry.section); assert.equal(JSON.stringify(entry), before);
    assert.equal(fight.destination, entry.winTarget);
  }
});
