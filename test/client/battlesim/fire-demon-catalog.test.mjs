import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {loadRosterDataset} from '../../../public/js/battlesim/roster-data.js';
import {validateSagardCatalog} from '../../../public/js/battlesim/engines/sagard/catalog.js';
import {startSagardEncounter, sagardEncounterTurn, resolveSagardEncounter} from '../../../public/js/battlesim/engines/sagard/encounter.js';
import {emptySagardState, rememberSagardFight} from '../../../public/js/battlesim/engines/sagard/state.js';
const require = createRequire(import.meta.url), {getRosterRows} = require('../../helpers/roster-db.cjs');
const entries = await loadRosterDataset(1544, 'CATALOG', async () => ({ok: true, json: async () => getRosterRows(1544)}));
const entry = section => entries.find(e => e.section === String(section));

test('reviewed catalog retains all 29 encounters and unknown values without invented statistics', () => {
  assert.equal(validateSagardCatalog(entries), entries);
  assert.equal(entries.length, 29); assert.equal(entries.reduce((n,e) => n + e.opponents.length, 0), 67);
  assert.equal(entries.reduce((n,e) => n + e.allies.length, 0), 2);
  assert.equal(entry(91).mode, 'manual'); assert.equal(entry(91).opponents[1].chart, null);
  assert.throws(() => startSagardEncounter({level: 4, hp: 25}, entry(91), entry(91).rules), /omits/);
  for (const section of [70,72,80]) for (const row of entry(section).opponents) {
    assert.equal(row.level, null); assert.equal(row.chart, null);
  }
  assert.equal(entry(90).opponents[0].level, null); assert.equal(entry(92).opponents[0].hp, null);
  assert.equal(entry(87).opponents[1].level, null); assert.equal(entry(87).opponents[1].hp, null);
});

test('all automatic presets resolve and survive every serialized action without story automation', () => {
  for (const e of entries.filter(e => e.mode !== 'manual')) {
    const spec = e.openings ? {...e, ...e.openings[0], section:e.section, name:e.name} : e;
    const state = emptySagardState(); state.setup = {sentinel:'keep'};
    state.fight = startSagardEncounter({level: 6, hp: 25, damageReduction: 2}, spec, e.rules);
    for (let n = 0; state.fight.status === 'fighting'; n++) {
      assert.ok(n < 1800, 'stalled ' + e.section);
      const turn = sagardEncounterTurn(state.fight), options = {target:turn.targets[0]};
      if (turn.kind === 'chooseDuel') options.decision = 'volley';
      const die = ['interferenceActivate','enemyEscape'].includes(turn.kind) ? 1
        : turn.kind === 'interferenceTarget' ? 4 : turn.kind === 'initiative' ? 2
          : turn.attackerId?.startsWith('enemy') || turn.kind === 'enemyVolley' ? 1 : 4;
      state.fight = JSON.parse(JSON.stringify(resolveSagardEncounter(state.fight, die, options)));
      rememberSagardFight(state, n + 1);
    }
    assert.equal(state.fight.status, 'win', 'section ' + e.section);
    assert.equal(state.history.length, 1); rememberSagardFight(state, 5000); assert.equal(state.history.length, 1);
    assert.equal(state.setup.sentinel, 'keep');
  }
});
