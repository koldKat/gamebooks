import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {loadRosterDataset} from '../../../public/js/battlesim/roster-data.js';
import {validateSagardCatalog} from '../../../public/js/battlesim/engines/sagard/catalog.js';
import {startSagardEncounter, sagardEncounterTurn, resolveSagardEncounter} from '../../../public/js/battlesim/engines/sagard/encounter.js';
import {emptySagardState, rememberSagardFight} from '../../../public/js/battlesim/engines/sagard/state.js';
import {healSagardEncounter, useSagardEncounterStone} from '../../../public/js/battlesim/engines/sagard/actions.js';
const require = createRequire(import.meta.url);
const {getRosterRows} = require('../../helpers/roster-db.cjs');
const entries = await loadRosterDataset(1543, 'CATALOG', async () => ({ok: true, json: async () => getRosterRows(1543)}));
const entry = section => entries.find(e => e.section === String(section));
const start = (section, options = {}, hero = {}) => startSagardEncounter({hp: 20, level: 5,
  damageReduction: 2, ...hero}, entry(section), entry(section).rules, options);

test('the database retains all reviewed ships, force templates and crew without invented stats', () => {
  assert.equal(validateSagardCatalog(entries), entries); assert.equal(entries.length, 30);
  assert.equal(entries.reduce((n, e) => n + e.opponents.length, 0), 62);
  assert.equal(entries.reduce((n, e) => n + e.allies.length, 0), 10);
  assert.equal(entry(70).mode, 'manual'); assert.ok(entry(70).opponents.every(row => row.hp === null));
  assert.throws(() => start(70), /no opponent HP/);
  assert.equal(entry(56).opponents[0].level, null); assert.equal(entry(56).opponents[0].chart, null);
  assert.ok(entry(52).opponents.every(row => row.level === null && row.hp === null));
  assert.ok(entry(69).opponents.every(row => row.hp === 15));
  assert.ok(entry(74).opponents.every(row => row.chart.join() === '0,0,1,1'));
  assert.equal(entry(10).opponents[0].level, 3); assert.deepEqual(entry(10).opponents[0].chart, [2, 3, 3, 4]);
  assert.equal(entry(11).forces.enemies, 12); assert.equal(entry(11).opponents.length, 4);
  assert.equal(entry(34).forces.enemies, 18); assert.equal(entry(34).opponents.length, 3);
});

test('all 29 automatic encounters resolve through serialized choices and once-only histories', () => {
  for (const source of entries.filter(e => e.mode !== 'manual')) {
    const state = emptySagardState(); state.setup = {hp: 17};
    state.fight = start(source.section);
    for (let n = 0; state.fight.status === 'fighting'; n++) {
      assert.ok(n < 1200, 'stalled section ' + source.section);
      const fight = state.fight, turn = sagardEncounterTurn(fight);
      const options = {target: turn.targets[0]};
      if (turn.kind === 'chooseAction') options.decision = 'ram';
      if (turn.kind === 'chooseDuel') options.decision = 'volley';
      if (turn.kind === 'allocate') {
        const target = fight.opponents.find(row => row.id === options.target);
        options.amount = Math.min(target.hp, turn.pendingDamage);
      }
      const die = turn.kind === 'initiative' ? 2 : ['swallow', 'crewCasualties', 'enemyAttack', 'enemyVolley'].includes(turn.kind)
        || turn.attackerId?.startsWith('enemy') ? 1 : 4;
      state.fight = JSON.parse(JSON.stringify(resolveSagardEncounter(fight, die, options)));
      rememberSagardFight(state, n + 1);
    }
    assert.equal(state.fight.status, source.section === '45' ? 'fled' : 'win', 'section ' + source.section);
    const count = state.history.length; rememberSagardFight(state, 2000);
    assert.equal(state.history.length, count); assert.equal(count, source.section === '45' ? 0 : 1);
    if (source.naval) assert.equal(state.setup.hp, 17, 'ship fight overwrote character HP');
  }
});

test('removing all mutineers requires no battle and awards no simulated victory', () => {
  const state = emptySagardState(); state.fight = start(69, {plundered: 4});
  rememberSagardFight(state, 100); assert.equal(state.fight.status, 'withdrawn');
  assert.equal(state.fight.destination, '39'); assert.equal(state.history.length, 0);
  assert.equal(start(69, {plundered: 2}).opponents.length, 2);
  assert.throws(() => start(69, {plundered: 5}));
});

test('group duels retain a shattered stone across subsequent duels and allow fatal-hit recovery', () => {
  let fight = start(11, {stunStone: true, spiritLuck: true}, {hp: 1, damageReduction: 0});
  fight = resolveSagardEncounter(fight, null, {decision: 'duel'});
  fight = useSagardEncounterStone(fight, 4); fight = resolveSagardEncounter(fight, 4);
  assert.equal(fight.stunStone.broken, true);
  fight = resolveSagardEncounter(fight, 1); fight = resolveSagardEncounter(fight, 4);
  assert.equal(fight.duel.phase, 'recovery'); assert.equal(fight.status, 'fighting');
  fight = healSagardEncounter(fight, 'spiritLuck'); assert.equal(fight.hero.hp, 20);
  assert.equal(fight.healing.spiritLuck, false); assert.equal(fight.stunStone.broken, true);
  assert.throws(() => useSagardEncounterStone(fight, 1));
});

test('the monster accepts held stone attacks and healing while preserving the continuing swallowed condition', () => {
  let fight = start(56, {stunStone: true, spiritLuck: true}, {hp: 1, damageReduction: 0});
  fight = resolveSagardEncounter(fight, 4); fight = resolveSagardEncounter(fight, 4);
  assert.equal(fight.phase, 'recovery'); assert.equal(fight.status, 'fighting');
  fight = healSagardEncounter(fight, 'spiritLuck'); assert.equal(fight.hero.hp, 20); assert.equal(fight.swallowed, true);
  fight = useSagardEncounterStone(fight, 1); assert.equal(fight.phase, 'stoneAttack');
  fight = resolveSagardEncounter(fight, 1); fight = resolveSagardEncounter(fight, 1);
  assert.equal(fight.phase, 'heroAttack'); assert.equal(fight.crewRemaining, 10);
});
