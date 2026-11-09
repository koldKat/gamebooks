import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readRosterDocument} from '../../helpers/roster-db.cjs';
import {definition, loadRoster, getRules} from '../../../public/js/battlesim/books/282/definition.js';
import {greyStarFixture} from './grey-star-fixture.mjs';

const rows = readRosterDocument(282).enemies;
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
test('loads all 18 source encounters and the original combat table from the database', () => {
  assert.equal(rows.length, 18); assert.equal(entries.length, 18);
  assert.deepEqual(getRules().COMBAT_TABLE[3][2], [2, 6]);
  assert.deepEqual(getRules().DEADLINES, {20: [4, 149], 61: [5, 149], 134: [3, 153], 273: [3, 182]});
});
test('the surprise attack ignores first-round damage including automatic death, then ends', () => {
  const {sim, data, math} = combat(99);
  data.combatSkill = 1; data.enemy.skill = 40; math.random = () => .1;
  sim.round(); assert.equal(data.endurance, 100); assert.equal(data.history.length, 0);
  sim.round(); assert.equal(data.endurance, 0); assert.equal(data.history[0].outcome, 'loss');
});
test('Magdi resistance and the wretch surprise apply only their printed skill changes', () => {
  for (const [section, bonus] of [[20, -2], [61, -2], [82, -2], [83, 2], [116, -2], [123, -2], [39, 0]]) {
    const {sim, data} = combat(section); assert.equal(sim.skill(data), 20 + bonus);
  }
});
test('all four printed round limits stop without inventing a combat victory', () => {
  for (const [section, rounds, route] of [[20, 4, 149], [61, 5, 149], [134, 3, 153], [273, 3, 182]]) {
    const {sim, data} = combat(section);
    for (let i = 0; i < rounds; i++) sim.round();
    assert.deepEqual(data.combatEffects.routes, [route]); assert.equal(data.history.length, 0);
    const saved = JSON.stringify(data); sim.round(); assert.equal(JSON.stringify(data), saved);
  }
});
test('killing a Magdi on its last permitted round takes precedence over the time limit', () => {
  const {sim, data} = combat(20); data.roundsThisBattle = 3; data.enemy.endurance = 1;
  sim.round(); assert.deepEqual(data.combatEffects.routes, [97]); assert.equal(data.history[0].outcome, 'win');
});
test('custom combat changes staff spending each round and accepts player-adjusted Karmo scores', () => {
  const {sim, data} = combat(); data.endurance = 200; data.willpower = 60; data.nextWillSpend = 3;
  sim.round(); assert.equal(data.endurance, 196); assert.equal(data.willpower, 57); assert.equal(data.enemy.endurance, 88);
  data.nextWillSpend = 2; sim.round(); assert.equal(data.willpower, 55); assert.equal(data.enemy.endurance, 80);
});
