import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readRosterDocument} from '../../helpers/roster-db.cjs';
import {definition, loadRoster, getRules} from '../../../public/js/battlesim/books/283/definition.js';
import {greyStarFixture} from './grey-star-fixture.mjs';

const rows = readRosterDocument(283).enemies;
const entries = [...new Map(rows.map(row => [row.stats.entryIndex, row.stats.entry])).values()];
await loadRoster(async () => ({ok: true, json: async () => rows}));
function combat(section = 0, patch = {}) {
  const f = greyStarFixture(definition, entries, getRules().COMBAT_TABLE);
  Object.assign(f.data, {rolled: true, combatSkill: 20, combatSkillInitial: 20,
    endurance: 100, enduranceInitial: 100, willpower: 30, willpowerInitial: 30}, patch);
  Object.assign(f.data.enemy, {name: `Enemy §${section}`, skill: 20, endurance: 100, enduranceMax: 100});
  f.sim.capture(f.data);
  return f;
}
test('loads all 14 original encounters and the edition combat table from the database', () => {
  assert.equal(rows.length, 14); assert.equal(entries.length, 14);
  assert.deepEqual(getRules().COMBAT_TABLE[3][2], [2, 6]);
  assert.deepEqual(getRules().DEADLINES, {87: [3, 150], 123: [3, 117], 194: [2, 51], 296: [3, 287]});
});
test('forced wrestling ignores staff selection and uses the printed dagger alternative', () => {
  for (const [dagger, skill] of [[false, 12], [true, 14]]) {
    const {sim, data} = combat(57, {nextWeapon: 'staff', nextDagger: dagger});
    assert.equal(sim.skill(data), skill); sim.round(); assert.equal(data.willpower, 30);
  }
});
test('the later Elessi encounter allows the staff or its explicit non-staff penalties', () => {
  for (const [weapon, dagger, skill] of [['staff', false, 20], ['none', false, 12], ['other', false, 12], ['none', true, 14]]) {
    const {sim, data} = combat(322, {nextWeapon: weapon, nextDagger: dagger});
    assert.equal(sim.skill(data), skill); sim.round();
    assert.equal(data.willpower, weapon === 'staff' ? 29 : 30);
  }
});
test('the door cannot wound the player even on a K result; stopping spends no round', () => {
  const {sim, data, math} = combat(97); data.combatSkill = 1; data.enemy.skill = 40; math.random = () => .1;
  sim.round(); assert.equal(data.endurance, 100); assert.equal(data.willpower, 29);
  const before = [data.endurance, data.willpower, data.roundsThisBattle, data.enemy.endurance];
  assert.equal(sim.ceaseRoute(data), 61); sim.cease();
  assert.deepEqual([data.endurance, data.willpower, data.roundsThisBattle, data.enemy.endurance], before);
  assert.deepEqual(data.combatEffects.routes, [61]); assert.equal(data.history.length, 0);
});
test('wrestling may cease only after three rounds with strictly greater Endurance', () => {
  for (const section of [57, 322]) {
    const {sim, data} = combat(section); data.roundsThisBattle = 2; data.enemy.endurance = 50;
    assert.equal(sim.ceaseRoute(data), null); data.roundsThisBattle = 3; data.endurance = 50;
    assert.equal(sim.ceaseRoute(data), null); data.endurance = 51; assert.equal(sim.ceaseRoute(data), 99);
    sim.cease(); assert.deepEqual(data.combatEffects.routes, [99]); assert.equal(data.history.length, 0);
  }
});
test('Tanith adds two only to the later Chaos-bird fight when explicitly selected', () => {
  for (const section of [64, 108, 188]) {
    const {sim, data} = combat(section, {nextCompanion: true});
    assert.equal(sim.skill(data), section === 188 ? 22 : 20);
    data.nextCompanion = false; assert.equal(sim.skill(data), section === 188 ? 22 : 20);
  }
  const {sim, data} = combat(188); assert.equal(sim.skill(data), 20);
});
test('all timed fights stop at the printed round without inventing a kill', () => {
  for (const [section, rounds, route] of [[87, 3, 150], [123, 3, 117], [194, 2, 51], [296, 3, 287]]) {
    const {sim, data} = combat(section);
    for (let i = 0; i < rounds; i++) sim.round();
    assert.deepEqual(data.combatEffects.routes, [route]); assert.equal(data.history.length, 0);
  }
});
test('the final double keeps its printed continuations without reversing combat outcomes', () => {
  const lost = combat(243); lost.data.endurance = 1; lost.sim.round();
  assert.equal(lost.data.history[0].outcome, 'loss'); assert.deepEqual(lost.data.combatEffects.routes, [350]);
  const won = combat(243); won.data.enemy.endurance = 1; won.sim.round();
  assert.equal(won.data.history[0].outcome, 'win'); assert.deepEqual(won.data.combatEffects.routes, [286]);
  const stopped = combat(243); stopped.sim.cease();
  assert.deepEqual(stopped.data.combatEffects.routes, [218]); assert.equal(stopped.data.roundsThisBattle, 0);
  assert.equal(stopped.data.history.length, 0);
});
