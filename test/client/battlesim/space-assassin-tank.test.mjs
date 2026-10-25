import { loadFixtureRoster } from './roster-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { newCharacter } from '../../../public/js/battlesim/engines/space-assassin/core.js';
import { startTank, moveTank, resolveTankEncounter } from '../../../public/js/battlesim/engines/space-assassin/tank.js';
import { tankRules } from '../../../public/js/battlesim/books/735/tank.js';

await loadFixtureRoster(735);

const rules = {
  statusCycle: 16, playerShields: 5, enemyShields: 4, startSection: 223, winSection: 190,
  positions: {
    223: { routes: [331, 349], encounters: [{ statuses: [3, 4], section: 33 }] },
    331: { routes: [223], encounters: [{ statuses: [2], section: 9 }] },
    349: { routes: [223], encounters: [{ statuses: [2], section: 188 }] },
  },
  effects: { 9: { kind: 'playerShot' }, 33: { kind: 'enemyFirst', missRoll: 1 }, 188: { kind: 'unseenHit' } },
};
const sequence = (...values) => () => {
  assert.ok(values.length, 'Unexpected die roll');
  return values.shift();
};

test('enemy tank miss roll comes from metadata and preserves a saved encounter', () => {
  const definition=structuredClone(tankRules);definition.effects[33].missRoll=6;
  const state={...startTank(newCharacter(()=>1),definition),phase:'encounter',pendingSection:33,status:3,shields:3,enemyShields:2,extension:{keep:true}};
  const saved=JSON.parse(JSON.stringify(state)),snapshot=structuredClone(saved);
  const missed=resolveTankEncounter(saved,definition,sequence(6,6,6));
  assert.equal(missed.shields,3);assert.equal(missed.enemyShields,2);assert.equal(missed.status,4);
  assert.deepEqual(missed.extension,{keep:true});assert.deepEqual(saved,snapshot);
  const hit=resolveTankEncounter(saved,definition,sequence(1,6,6));
  assert.equal(hit.shields,2);assert.equal(hit.events[0].hit,true);
});

test('all printed tank positions have valid moves and disjoint STATUS outcomes', () => {
  assert.equal(Object.keys(tankRules.positions).length, 24);
  const reached = new Set(), queue = [tankRules.startSection];
  while (queue.length) {
    const section = queue.shift();
    if (reached.has(section)) continue;
    reached.add(section);
    const position = tankRules.positions[section], statuses = new Set();
    for (const entry of position.encounters) {
      assert.ok(tankRules.effects[entry.section]);
      for (const value of entry.statuses) {
        assert.ok(value >= 1 && value <= 16);
        assert.ok(!statuses.has(value), `Repeated STATUS ${value} at ${section}`);
        statuses.add(value);
      }
    }
    for (const next of position.routes) {
      assert.ok(tankRules.positions[next], `Missing destination ${next}`);
      queue.push(next);
    }
  }
  assert.equal(reached.size, 24);
  const initial = startTank(newCharacter(() => 1), tankRules);
  const pending = { ...initial, status: 3, phase: 'encounter', pendingSection: 33 };
  const returned = resolveTankEncounter(pending, tankRules, sequence(1, 6, 6));
  assert.equal(returned.status, 4);
  assert.equal(returned.section, 223);
  assert.equal(returned.phase, 'move', 'STATUS 4 also points to 33, but return must not trigger it again');
  assert.equal(returned.pendingSection, null);
});

test('tank movement increments STATUS, rejects illegal moves and preserves current character scores', () => {
  const player = { ...newCharacter(() => 1), stamina: 8, armour: 2 };
  const state = startTank(player, rules), before = structuredClone(state);
  assert.equal(state.status, 1);
  assert.equal(state.player.stamina, 8);
  const moved = moveTank(state, 331, rules);
  assert.equal(moved.status, 2);
  assert.equal(moved.pendingSection, 9);
  assert.deepEqual(state, before);
  assert.throws(() => moveTank(state, 999, rules));
  assert.throws(() => moveTank(moved, 223, rules));
  assert.deepEqual(state.player, player);
});

test('player shot uses strict SKILL and returns without rechecking STATUS or incrementing arrival', () => {
  const state = moveTank(startTank(newCharacter(() => 1), rules), 331, rules);
  const missed = resolveTankEncounter(state, rules, sequence(3, 4));
  assert.equal(missed.enemyShields, 4, 'Equality is a miss');
  assert.equal(missed.status, 3);
  assert.equal(missed.section, 331);
  assert.equal(missed.phase, 'move');
  assert.throws(() => resolveTankEncounter(missed, rules));
  const returned = moveTank(missed, 223, rules);
  assert.equal(returned.status, 4);
  const defended = resolveTankEncounter(returned, rules, sequence(1, 6, 6));
  assert.equal(defended.status, 5);
  assert.equal(defended.phase, 'move', 'Do not recursively re-enter the same encounter');
  assert.equal(defended.pendingSection, null);
});

test('enemy fire and unseen hits affect shields, not ARMOUR or living STAMINA', () => {
  const state = startTank(newCharacter(() => 1), rules);
  const hit = resolveTankEncounter({ ...state, phase: 'encounter', pendingSection: 33 }, rules, sequence(2, 1, 1));
  assert.equal(hit.shields, 4);
  assert.equal(hit.enemyShields, 3);
  assert.equal(hit.status, 2);
  assert.deepEqual(hit.player, state.player);
  const unseen = resolveTankEncounter({ ...state, phase: 'encounter', pendingSection: 188 }, rules);
  assert.equal(unseen.shields, 4);
  assert.equal(unseen.enemyShields, 4);
  assert.equal(unseen.status, 2);
  assert.deepEqual(unseen.player, state.player);
});

test('shield death prevents return fire; victory and cycle rollover are final and immutable', () => {
  const state = startTank(newCharacter(() => 1), rules);
  const dead = resolveTankEncounter({ ...state, shields: 1, phase: 'encounter', pendingSection: 33 }, rules, sequence(2));
  assert.equal(dead.outcome, 'loss');
  assert.equal(dead.player.stamina, 0);
  assert.equal(dead.events.length, 1);
  const won = resolveTankEncounter({ ...state, enemyShields: 1, phase: 'encounter', pendingSection: 9 }, rules, sequence(1, 1));
  assert.equal(won.outcome, 'win');
  assert.equal(won.destination, 190);
  assert.equal(won.status, 1, 'No STATUS increase after destroying the enemy');
  assert.equal(state.enemyShields, 4);
  assert.throws(() => moveTank(won, 331, rules));
  const wrapped = moveTank({ ...state, status: 16 }, 331, rules);
  assert.equal(wrapped.status, 1);
});
