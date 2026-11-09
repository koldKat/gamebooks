import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readRosterDocument} from '../../helpers/roster-db.cjs';
import {definition, loadRoster, getRules} from '../../../public/js/battlesim/books/281/definition.js';
import {greyStarFixture} from './grey-star-fixture.mjs';

const rows = readRosterDocument(281).enemies;
const entries = [...new Map(rows.map(row => [row.stats.entryIndex, row.stats.entry])).values()];
await loadRoster(async () => ({ok: true, json: async () => rows}));
function combat(section = 0) {
  const f = greyStarFixture(definition, entries, getRules().COMBAT_TABLE);
  Object.assign(f.data, {rolled: true, combatSkill: 20, combatSkillInitial: 20,
    endurance: 100, enduranceInitial: 100, willpower: 30, willpowerInitial: 30});
  Object.assign(f.data.enemy, {name: `Enemy §${section}`, skill: 20, endurance: 100, enduranceMax: 100});
  f.sim.capture(f.data);
  return f;
}
test('English source loads all 26 encounters and 34 profiles from the database', () => {
  assert.equal(entries.length, 26); assert.equal(rows.length, 34);
  assert.equal(getRules().NEIJJIN.length, 9);
  assert.deepEqual(getRules().COMBAT_TABLE[3][2], [2, 6]);
  assert.deepEqual(getRules().COMBAT_TABLE[5][12], [16, 1]);
});
test('custom fights work and staff spending can change each round', () => {
  const {sim, data} = combat(); data.nextWillSpend = 3;
  sim.round(); assert.equal(data.willpower, 27); assert.equal(data.enemy.endurance, 88);
  data.nextWillSpend = 2; sim.round();
  assert.equal(data.willpower, 25); assert.equal(data.enemy.endurance, 80);
});
test('zero Willpower uses an ordinary staff and does not spend points', () => {
  const {sim, data} = combat(); data.willpower = 0;
  assert.equal(sim.skill(data), 14); sim.round(); assert.equal(data.willpower, 0);
});
test('one-round Quoku leaves the printed exactly-ten gap unresolved', () => {
  for (const [will, routes] of [[9, [32]], [10, []], [11, [331]]]) {
    const {sim, data} = combat(281); data.nextWeapon = 'other'; data.willpower = will; sim.capture(data);
    sim.round(); assert.deepEqual(data.combatEffects.routes, routes); assert.equal(data.history.length, 0);
    if (will === 10) assert.ok(data.log.includes('battlesim281.log.source_gap'));
  }
});
test('three-round Mantiz victory takes precedence over the deadline', () => {
  const {sim, data} = combat(272); data.roundsThisBattle = 2; data.enemy.endurance = 1;
  sim.round(); assert.equal(data.history[0].outcome, 'win'); assert.deepEqual(data.combatEffects.routes, [322]);
});
test('Najin share a five-round limit and preserve player resources between opponents', () => {
  const {sim, data} = combat(101); data.enemy.endurance = 1; sim.round();
  assert.equal(data.enemy.skill, 9); assert.equal(data.roundsThisBattle, 1);
  assert.equal(data.endurance, 96); assert.equal(data.willpower, 29);
  for (let i = 0; i < 4; i++) sim.round();
  assert.deepEqual(data.combatEffects.routes, [130]); assert.equal(data.history.length, 0);
});
test('Kleasa shield reduces its drain but not ordinary enemy damage', () => {
  for (const [shield, end] of [[false, 94], [true, 95]]) {
    const {sim, data} = combat(149); data.nextShield = shield; sim.capture(data); sim.round();
    assert.equal(data.endurance, end); assert.equal(data.willpower, 28);
  }
});
test('mental combat follows the disclosed convention without spending staff power', () => {
  const {sim, data} = combat(259); assert.equal(sim.skill(data), 130);
  sim.round(); assert.equal(data.willpower, 30);
});
test('escape consumes the enemy round while ignoring staff damage to the enemy', () => {
  const {sim, data} = combat(205); data.nextWillSpend = 3; sim.round(true);
  assert.equal(data.enemy.endurance, 100); assert.deepEqual(data.combatEffects.routes, [163]);
  assert.equal(data.history.length, 0); assert.equal(data.willpower, 27);
});
test('stale book context cannot create or change another book state', () => {
  const {sim, context, pt} = combat(); const saved = JSON.stringify(pt);
  context.currentBookId = 999; assert.equal(sim.data(), null); sim.round();
  assert.equal(JSON.stringify(pt), saved);
});
