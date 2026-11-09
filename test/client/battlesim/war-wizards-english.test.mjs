import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readRosterDocument} from '../../helpers/roster-db.cjs';
import {definition, loadRoster, getRules} from '../../../public/js/battlesim/books/284/definition.js';
import {greyStarFixture} from './grey-star-fixture.mjs';

const rows = readRosterDocument(284).enemies;
const entries = [...new Map(rows.map(row => [row.stats.entryIndex, row.stats.entry])).values()];
await loadRoster(async () => ({ok: true, json: async () => rows}));
function combat(section = 0, patch = {}) {
  const f = greyStarFixture(definition, entries, getRules().COMBAT_TABLE);
  f.context.HEALING_POTION_HEAL = definition.potionHeal;
  Object.assign(f.data, {rolled: true, combatSkill: 20, combatSkillInitial: 20,
    endurance: 100, enduranceInitial: 100, willpower: 50, willpowerInitial: 50}, patch);
  Object.assign(f.data.enemy, {name: `Enemy §${section}`, skill: 20, endurance: 100, enduranceMax: 100});
  f.sim.capture(f.data);
  return f;
}

test('loads all 36 original opponents and the edition table from the database', () => {
  assert.equal(rows.length, 36); assert.equal(entries.length, 36);
  assert.deepEqual(getRules().COMBAT_TABLE[3][2], [2, 6]);
  for (const section of [4, 125, 175, 192, 310, 355]) assert.equal(getRules().ENCOUNTER_RULES[section], undefined);
});

test('the printed combat skill adjustments apply only to their own encounters', () => {
  for (const [section, bonus] of [[51, -1], [87, -2], [128, -2], [235, -2], [256, 3], [33, 0], [0, 0]]) {
    const {sim, data} = combat(section);
    assert.equal(sim.skill(data), 20 + bonus);
  }
});

test('all seven passing attacks compare multiplied Staff damage and stop after one round', () => {
  for (const [section, route] of [[111, 306], [152, 306], [202, 226], [226, 265], [235, 313], [244, 287], [317, 287]]) {
    const {sim, data} = combat(section, {nextWillSpend: 3});
    sim.round();
    assert.equal(data.endurance, 100); assert.equal(data.willpower, 47);
    assert.deepEqual(data.combatEffects.routes, [route]); assert.equal(data.history.length, 0);
    const frozen = structuredClone(data); sim.round(); assert.deepEqual(data, frozen);
  }
});

test('equal passing losses still hurt; ordinary encounters keep their normal damage', () => {
  const equal = combat(111); equal.sim.round();
  assert.equal(equal.data.endurance, 96); assert.equal(equal.data.enemy.endurance, 96);
  const ordinary = combat(33, {nextWillSpend: 3}); ordinary.sim.round();
  assert.equal(ordinary.data.endurance, 96); assert.equal(ordinary.data.enemy.endurance, 88);
  const fatal = combat(111); fatal.data.combatSkill = 1; fatal.data.enemy.skill = 40; fatal.math.random = () => .1;
  fatal.sim.round(); assert.equal(fatal.data.endurance, 0); assert.equal(fatal.data.history[0].outcome, 'loss');
});

test('invulnerability is explicitly selected, captured, and restricted to the three printed fights', () => {
  for (const section of [161, 184, 233, 33, 0]) {
    const {sim, data, math} = combat(section, {nextInvulnerable: true});
    data.nextInvulnerable = false; data.combatSkill = 1; data.enemy.skill = 40; math.random = () => .1;
    sim.round();
    assert.equal(data.endurance, [161, 184, 233].includes(section) ? 100 : 0);
  }
  const unprotected = combat(233); unprotected.sim.round(); assert.equal(unprotected.data.endurance, 96);
});

test('the toad escape requires strictly fewer player losses in the first round', () => {
  const equal = combat(28);
  assert.equal(equal.sim.escapeRoute(equal.data), null); equal.sim.round();
  assert.equal(equal.sim.escapeRoute(equal.data), null);
  const allowed = combat(28, {nextWillSpend: 2}); allowed.sim.round();
  assert.deepEqual(allowed.data.combatEffects.firstRoundLosses, {player: 4, enemy: 8});
  assert.equal(allowed.sim.escapeRoute(allowed.data), 41);
  allowed.data.nextWillSpend = 1; allowed.sim.round();
  assert.equal(allowed.sim.escapeRoute(allowed.data), 41);
  const enemy = allowed.data.enemy.endurance; allowed.sim.round(true);
  assert.equal(allowed.data.enemy.endurance, enemy); assert.equal(allowed.data.roundsThisBattle, 3);
  assert.deepEqual(allowed.data.combatEffects.routes, [41]); assert.equal(allowed.data.history.length, 0);
});

test('three ape demons permit evasion in the second round only', () => {
  const {sim, data} = combat(123);
  assert.equal(sim.escapeRoute(data), null); sim.round(); assert.equal(sim.escapeRoute(data), 155);
  const enemy = data.enemy.endurance; sim.round(true);
  assert.equal(data.roundsThisBattle, 2); assert.equal(data.enemy.endurance, enemy);
  assert.deepEqual(data.combatEffects.routes, [155]);
  const missed = combat(123); missed.sim.round(); missed.sim.round();
  assert.equal(missed.sim.escapeRoute(missed.data), null);
});

test('the Shadakine officer allows immediate evasion with its usual combat-round cost', () => {
  const {sim, data} = combat(216);
  assert.equal(sim.escapeRoute(data), 290); sim.round(true);
  assert.deepEqual(data.combatEffects.routes, [290]); assert.equal(data.endurance, 96);
  assert.equal(data.enemy.endurance, 100); assert.equal(data.willpower, 49); assert.equal(data.history.length, 0);
});

test('victory destinations depend on the actual completed round without changing the win into a story loss', () => {
  for (const [section, early, late] of [[51, 109, 123], [302, 56, 319]]) {
    for (const [completedBefore, route] of [[2, early], [3, late]]) {
      const {sim, data} = combat(section); data.roundsThisBattle = completedBefore; data.enemy.endurance = 1;
      sim.round(); assert.deepEqual(data.combatEffects.routes, [route]); assert.equal(data.history[0].outcome, 'win');
    }
  }
});

test('the winged ape and Demon Master terminal rounds take precedence even over a lethal attack', () => {
  for (const [section, limit, early, timeout] of [[265, 3, 68, 206], [270, 4, 188, 276]]) {
    const late = combat(section); late.data.roundsThisBattle = limit - 1; late.data.enemy.endurance = 1;
    late.sim.round(); assert.deepEqual(late.data.combatEffects.routes, [timeout]); assert.equal(late.data.history.length, 0);
    const won = combat(section); won.data.roundsThisBattle = limit - 2; won.data.enemy.endurance = 1;
    won.sim.round(); assert.deepEqual(won.data.combatEffects.routes, [early]); assert.equal(won.data.history[0].outcome, 'win');
    const fallen = combat(section); fallen.data.roundsThisBattle = limit - 1; fallen.data.endurance = 1; fallen.data.enemy.endurance = 1;
    fallen.sim.round(); assert.equal(fallen.data.history[0].outcome, 'loss'); assert.equal(fallen.data.endurance, 0);
  }
});

test('ordinary deadlines preserve early victory routes and never invent a kill at timeout', () => {
  for (const [section, rounds, route] of [[28, 3, 87], [161, 1, 184], [184, 1, 214], [269, 1, 33]]) {
    const {sim, data} = combat(section);
    for (let i = 0; i < rounds; i++) sim.round();
    assert.deepEqual(data.combatEffects.routes, [route]); assert.equal(data.history.length, 0);
  }
  const horseman = combat(269); horseman.data.enemy.endurance = 1; horseman.sim.round();
  assert.deepEqual(horseman.data.combatEffects.routes, [17]); assert.equal(horseman.data.history[0].outcome, 'win');
});

test('Laumspur restores six, consumes the selected dose, cannot interrupt a fight or revive the dead', () => {
  const {sim, data} = combat(33, {endurance: 80, hasHealingPotion: true});
  sim.potion(); assert.equal(data.endurance, 86); assert.equal(data.hasHealingPotion, false);
  sim.potion(); assert.equal(data.endurance, 86);
  data.hasHealingPotion = true; data.healingPotionUsed = false; sim.round();
  const before = data.endurance; sim.potion(); assert.equal(data.endurance, before); assert.equal(data.hasHealingPotion, true);
  data.combatEffects.finished = true; sim.potion(); assert.equal(data.endurance, Math.min(100, before + 6));
  const dead = combat(33, {endurance: 0, hasHealingPotion: true}); dead.sim.potion(); assert.equal(dead.data.endurance, 0);
});
