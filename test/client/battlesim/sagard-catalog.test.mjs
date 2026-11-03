import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {loadRosterDataset} from '../../../public/js/battlesim/roster-data.js';
import {validateSagardCatalog} from '../../../public/js/battlesim/engines/sagard/catalog.js';
import {startSagardFight, sagardTurn, resolveSagardTurn} from '../../../public/js/battlesim/engines/sagard/core.js';
const require = createRequire(import.meta.url);
const {getRosterRows} = require('../../helpers/roster-db.cjs');
const entries = await loadRosterDataset(1541, 'CATALOG', async () => ({ok: true, json: async () => getRosterRows(1541)}));
const entry = section => entries.find(e => e.section === String(section));

test('the installed database catalog retains every encounter, opponent, ally and source-owned chart', () => {
  assert.equal(validateSagardCatalog(entries), entries); assert.equal(entries.length, 26);
  assert.equal(entries.reduce((n, e) => n + e.opponents.length, 0), 62);
  assert.equal(entries.reduce((n, e) => n + e.allies.length, 0), 10);
  assert.deepEqual(entries[0].rules.damageByLevel[0], [0, 0, 0, 4]);
  assert.equal(entry(48).opponents.length, 15);
  assert.ok(entry(48).opponents.every(row => row.hp === 1 && row.chart.join() === '0,0,0,1'));
  assert.equal(entry(84).mode, 'manual'); assert.equal(entry(84).opponents[0].hp, null);
  assert.throws(() => startSagardFight({level: 2, hp: 20}, entry(84), entry(84).rules), /faint/);
});

test('printed group, opening, armor, sword, escape, sleep and melting exceptions survive database loading', () => {
  assert.equal(entry(5).heroOpeningAttacks, 5); assert.equal(entry(6).enemyMode, 'serial');
  assert.equal(entry(13).heroOpeningAttacks, 2); assert.equal(entry(13).breakOffTarget, '16');
  assert.equal(entry(28).openings.length, 2); assert.equal(entry(28).openings[1].heroOpeningAttacks, 5);
  assert.equal(entry(36).opponents[1].retaliationStartsRound, 4);
  assert.equal(entry(55).defaultArmor, true); assert.equal(entry(60).defaultWeapon, true);
  assert.equal(entry(63).defaultWeapon, false); assert.equal(entry(63).opponents[0].damageBonus, 1);
  assert.equal(entry(67).initiative, 'random');
  assert.equal(entry(73).escape, 'four'); assert.equal(entry(96).escape, 'four');
  assert.equal(entry(105).enemyMeltBeforeAttack, 2); assert.equal(entry(109).enemyMeltBeforeAttack, 2);
  assert.equal(entry(109).alliesFirst, true); assert.equal(entry(109).allies.length, 6);
  assert.ok(entry(109).allies.every(row => row.hp === 5));
});

test('every automatic source encounter resolves and resumes through serialized actions without campaign changes', () => {
  let completed = 0;
  for (const source of entries.filter(e => e.mode !== 'manual')) {
    const spec = {...source, ...(source.openings?.[0] ?? {})};
    let fight = startSagardFight({level: 5, hp: 20, damageBonus: 1, damageReduction: 1}, spec, spec.rules,
      {fang: true, moss: true});
    for (let n = 0; fight.status === 'fighting'; n++) {
      assert.ok(n < 1000, 'Stalled section ' + source.section);
      const turn = sagardTurn(fight);
      fight = resolveSagardTurn(JSON.parse(JSON.stringify(fight)), turn.kind === 'melt' ? null
        : turn.attackerId?.startsWith('enemy') ? 1 : 4,
      {target: turn.targets[0], decision: 'continue'});
    }
    assert.equal(fight.status, 'win', source.section); assert.equal(fight.destination, source.winTarget);
    assert.equal(Object.hasOwn(fight, 'trophies'), false); assert.equal(Object.hasOwn(fight, 'experienceMarks'), false);
    assert.equal(Object.hasOwn(fight, 'inventory'), false); completed++;
  }
  assert.equal(completed, 25);
});
