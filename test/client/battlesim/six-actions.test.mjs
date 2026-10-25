import { loadFixtureRoster } from './roster-fixtures.mjs';
await loadFixtureRoster(658);
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from './simulator-source.mjs';
import { runInNewContext } from 'node:vm';
import { newSixActionsCharacter, sixActionsBonus, sixActionsCheck, startSixActionsFight,
  sixActionsRound, sixActionsPostCheck } from '../../../public/js/battlesim/engines/six-actions/core.js';
import { SIX_ACTIONS_FIGHTS, SIX_ACTIONS_CHECKS, SIX_ACTIONS_RULES } from '../../../public/js/battlesim/engines/six-actions/roster.js';

const character = changes => newSixActionsCharacter(changes);
const dice = (...values) => () => {
  assert.ok(values.length, 'Unexpected extra die');
  return values.shift();
};
const constant = value => () => value;

test('backend awards simulator outcomes once and ignores cancelled/check results', () => {
  const events = [];
  const db = { exec() {}, transaction: fn => () => fn(), prepare: () => ({
    run() {}, all: () => [], get: () => ({ id: 658, total_sections: 150, is_container: 0 }),
  }) };
  const context = { module: { exports: {} }, events, require(name) {
    if (name === './connection') return { db };
    if (name === './auth') return { generateToken: () => 'test-only' };
    if (name === '../impersonation-context') return { isImpersonatingContext: () => false };
    if (name === '../clean-run') return { isCleanRun: () => false };
    if (name === './diamonds') return { diamondInfoForUser: () => ({}) };
    if (name === './rubies') return { rubyInfoForUser: () => ({}), createRubyCompletionChecker: () => () => 0 };
    if (name === './heartbeat-coins') return { advanceHeartbeatCoins: () => 0 };
    if (name === './job-xp') return { getJobTitle: () => 'test' };
    throw new Error('Unexpected real dependency: ' + name);
  } };
  const source = readFileSync(new URL('../../../server/db/xp.js', import.meta.url), 'utf8');
  runInNewContext(source + '\nawardXp = (...args) => events.push(args);', context);
  assert.ok(context.module.exports.SIM_HISTORY_KEYS.includes('sim658'));
  const state = history => ({ graph: {}, playthroughs: [{ startedAt: 123, path: [1], sim658: { history } }] });
  const previous = state([]), updated = state([{ outcome: 'win', ts: 10 }, { outcome: 'loss', ts: 11 },
    { outcome: 'cancelled', ts: 12 }, { outcome: 'escaped', ts: 13 }]);
  context.module.exports.processStateXp(1, 658, previous, updated);
  assert.deepEqual(events.filter(e => e[1].startsWith('battlesim_')).map(e => [...e]),
    [[1, 'battlesim_win', 'sim658:10'], [1, 'battlesim_loss', 'sim658:11']]);
  events.length = 0;
  context.module.exports.processStateXp(1, 658, updated, structuredClone(updated));
  assert.equal(events.filter(e => e[1].startsWith('battlesim_')).length, 0);
});

test('source health, stealth and equipment values are independent modifiers', () => {
  for (const [wounds, health, stealth] of [[0, 5, 4], [1, 3, 2], [2, 1, 0]]) {
    const c = character({ wounds });
    assert.equal(sixActionsBonus(c, ['health']), health);
    assert.equal(sixActionsBonus(c, ['stealth']), stealth);
    assert.equal(sixActionsBonus(c, ['weapon', 'marks']), 5);
    assert.equal(sixActionsBonus(c, ['weapon', 'melee'], 'knife'), 4);
    assert.equal(sixActionsBonus(c, ['weapon', 'throw'], 'grenade'), 3);
  }
  for (const changes of [{ wounds: -1 }, { wounds: 4 }, { bombs: -1 }, { grenades: .5 },
    { weapon: 'constructor' }, { weapon: '__proto__' }, { weapon: 'invented' }]) {
    assert.throws(() => character(changes), RangeError);
  }
  assert.throws(() => sixActionsBonus(character({ wounds: 3 }), ['health']), RangeError);
  assert.throws(() => sixActionsBonus(character(), ['invented']), RangeError);
});

test('all printed checks retain their own modifiers and low/high destinations', () => {
  assert.equal(SIX_ACTIONS_CHECKS.length, 29);
  for (const check of SIX_ACTIONS_CHECKS) {
    for (const wounds of [0, 1, 2]) for (let first = 1; first <= 6; first++) for (let second = 1; second <= 6; second++) {
      const c = character({ wounds }), before = structuredClone(c);
      const result = sixActionsCheck(c, check.section, dice(first, second));
      assert.equal(result.total, first + second + sixActionsBonus(c, check.modifiers, check.weapon));
      assert.equal(result.section, result.total <= check.lower ? check.lowSection : check.highSection);
      assert.deepEqual(c, before);
    }
  }
  assert.equal(sixActionsCheck(character(), 106, dice(1, 1)).section, 67);
  assert.equal(sixActionsCheck(character(), 106, dice(1, 2)).section, 15);
  assert.equal(sixActionsCheck(character(), 139, dice(1, 1)).total, 11);
  assert.throws(() => sixActionsCheck(character(), 120, constant(1)), RangeError);
});

test('all encounter starts preserve current wounds and ammunition', () => {
  assert.equal(SIX_ACTIONS_FIGHTS.length, 23);
  const c = character({ wounds: 2, bombs: 3, grenades: 4, weapon: 'pistol' });
  for (const entry of SIX_ACTIONS_FIGHTS) {
    const fight = startSixActionsFight(c, entry.section, { secondThreshold: 7, remainingEnemies: 1 });
    assert.deepEqual(fight.character, c);
    assert.notEqual(fight.character, c);
    assert.equal(fight.round, 1);
    assert.equal(fight.status, 'fighting');
  }
  assert.throws(() => startSixActionsFight(c, 92), RangeError);
  assert.throws(() => startSixActionsFight(c, 116), RangeError);
  assert.throws(() => startSixActionsFight(c, 1), RangeError);
});

test('knife encounter has an unopposed opening, then the second enemy joins in round four', () => {
  const initial = startSixActionsFight(character(), 9);
  let result = sixActionsRound(initial, {}, dice(1, 1));
  assert.equal(result.enemy.length, 0);
  assert.equal(result.player.total, 6);
  assert.equal(result.fight.round, 2);
  assert.equal(initial.round, 1);
  result = sixActionsRound(result.fight, {}, dice(1, 1, 1, 1));
  assert.equal(result.enemy.length, 1);
  result = sixActionsRound(result.fight, {}, dice(1, 1, 1, 1));
  assert.equal(result.enemy.length, 1);
  result = sixActionsRound(result.fight, {}, dice(1, 1, 1, 1, 1, 1));
  assert.deepEqual(result.enemy.map(e => e.threshold), [8, 7]);
});

test('knife hits remove one opponent, not the whole pair', () => {
  let result = sixActionsRound(startSixActionsFight(character(), 9), {}, dice(6, 6));
  assert.equal(result.fight.remaining, 1);
  assert.deepEqual(result.fight.targetAlive, [false, true]);
  assert.equal(result.fight.status, 'fighting');
  result = sixActionsRound(result.fight, {}, dice(6, 6));
  assert.equal(result.fight.status, 'win');
  assert.equal(result.fight.section, 43);
});

test('section92 requires an explicit second-enemy threshold instead of borrowing section9', () => {
  const f = startSixActionsFight(character(), 92, { secondThreshold: 11 });
  f.round = 4;
  const result = sixActionsRound(f, {}, dice(1, 1, 1, 1, 5, 5));
  assert.deepEqual(result.enemy.map(e => e.threshold), [9, 11]);
  assert.equal(result.fight.character.wounds, 0);
});

test('collective fire uses one enemy roll while an automatic hit kills two soldiers', () => {
  const result = sixActionsRound(startSixActionsFight(character(), 12), {}, dice(6, 6, 1, 1));
  assert.equal(result.player.kills, 2);
  assert.equal(result.enemy.length, 1);
  assert.equal(result.fight.remaining, 8);
});

test('fixed volleys remain fixed after player kills', () => {
  for (const [section, shots] of [[45, 3], [66, 2], [72, 4], [94, 3], [144, 4]]) {
    const result = sixActionsRound(startSixActionsFight(character(), section), {}, constant(1));
    assert.equal(result.enemy.length, shots, String(section));
  }
});

test('four casualties end the six-soldier ambush and six end the ten-soldier encounter', () => {
  let f = startSixActionsFight(character(), 38);
  let result = sixActionsRound(f, {}, dice(6, 6));
  assert.equal(result.player.kills, 2);
  assert.equal(result.enemy.length, 0);
  f = result.fight;
  result = sixActionsRound(f, {}, dice(6, 6, 1, 1, 1, 1, 1, 1, 1, 1));
  assert.equal(result.enemy.length, 4);
  assert.equal(result.player.kills, 1);
  result = sixActionsRound(result.fight, {}, dice(6, 6));
  assert.equal(result.fight.status, 'win');
  assert.equal(result.fight.section, 111);
  let killed = startSixActionsFight(character(), 72);
  for (let n = 0; n < 3; n++) {
    result = sixActionsRound(killed, {}, dice(6, 6, 1, 1, 1, 1, 1, 1, 1, 1));
    killed = result.fight;
  }
  assert.equal(killed.killed, 6);
  assert.equal(killed.remaining, 4);
  assert.equal(killed.section, 41);
});

test('reinforcements arrive only on each encounter’s printed rounds', () => {
  for (const [section, counts] of [[40, [5, 6, 7]], [48, [2, 3, 3]], [81, [1, 1, 2]]]) {
    let f = startSixActionsFight(character(), section);
    for (const count of counts) {
      const result = sixActionsRound(f, {}, constant(1));
      assert.equal(result.fight.remaining, count, String(section));
      f = result.fight;
    }
  }
});

test('enemy-only and enemy-first openings really precede the player', () => {
  const result = sixActionsRound(startSixActionsFight(character(), 81), {}, dice(6, 6));
  assert.equal(result.player, null);
  assert.equal(result.enemy.length, 1);
  assert.equal(result.fight.character.wounds, 1);
  const second = sixActionsRound(startSixActionsFight(character({ wounds: 2 }), 52), {}, dice(6, 6));
  assert.equal(second.player, null);
  assert.equal(second.fight.status, 'loss');
  assert.equal(second.fight.section, 8);
});

test('section52 receives both waves and health modifies only the player', () => {
  let f = startSixActionsFight(character({ wounds: 2 }), 52);
  const counts = [2, 8, 8, 8, 8, 8, 14];
  for (const count of counts) {
    const result = sixActionsRound(f, {}, constant(1));
    assert.equal(result.enemy.length, count);
    assert.equal(result.player.bonus, 6);
    f = result.fight;
  }
});

test('survival fights last the printed number of rounds despite kills', () => {
  for (const [section, rounds, destination] of [[45, 3, 131], [66, 4, 76], [94, 3, 131], [115, 7, 122]]) {
    let f = startSixActionsFight(character(), section);
    for (let r = 1; r <= rounds; r++) {
      const result = sixActionsRound(f, {}, constant(1));
      assert.equal(result.fight.status, r === rounds ? 'win' : 'fighting');
      f = result.fight;
    }
    assert.equal(f.section, destination);
  }
});

test('third wound defeats the player immediately without additional rolls', () => {
  const c = character({ wounds: 2 });
  const result = sixActionsRound(startSixActionsFight(c, 12), {}, dice(1, 1, 6, 6));
  assert.equal(result.fight.character.wounds, 3);
  assert.equal(result.fight.status, 'loss');
  assert.deepEqual(c, character({ wounds: 2 }));
});

test('grenade uses only weapon and throwing points and consumes one grenade', () => {
  const f = startSixActionsFight(character({ grenades: 1, wounds: 1 }), 115);
  const result = sixActionsRound(f, { grenade: true }, dice(3, 3));
  assert.equal(result.player.total, 9);
  assert.equal(result.player.kills, 2);
  assert.equal(result.fight.character.grenades, 0);
  assert.equal(f.character.grenades, 1);
  assert.throws(() => sixActionsRound(result.fight, { grenade: true }, constant(1)), RangeError);
});

test('ambiguous firing sequences require an explicit manual count', () => {
  for (const section of [114, 127]) {
    const f = startSixActionsFight(character(), section);
    const before = structuredClone(f);
    assert.throws(() => sixActionsRound(f, { group: 'jeep' }, constant(1)), RangeError);
    assert.deepEqual(f, before);
    const result = sixActionsRound(f, { group: 'jeep', enemyShots: 2 }, constant(1));
    assert.equal(result.enemy.length, 2);
  }
});

test('section90 carries its actual survivors to the next combat', () => {
  let f = startSixActionsFight(character(), 90);
  for (let r = 1; r <= 3; r++) {
    const result = sixActionsRound(f, {}, constant(1));
    assert.equal(result.enemy.length, r === 1 ? 1 : 2);
    f = result.fight;
  }
  assert.equal(f.status, 'escaped');
  assert.equal(f.section, 79);
  const continued = startSixActionsFight(f.character, 116, { remainingEnemies: f.remaining });
  assert.equal(continued.remaining, 2);
});

test('vehicle damage does not become wounds and vehicle attacks get no health bonus', () => {
  const c = character({ wounds: 2 });
  let raft = startSixActionsFight(c, 123);
  for (let r = 0; r < 4; r++) {
    const result = sixActionsRound(raft, {}, constant(6));
    assert.equal(result.player, null);
    raft = result.fight;
  }
  assert.equal(raft.vehicleHits, 4);
  assert.equal(raft.character.wounds, 2);
  assert.equal(raft.section, 135);
  let jeep = startSixActionsFight(c, 144);
  for (let r = 0; r < 4; r++) jeep = sixActionsRound(jeep, {}, constant(6)).fight;
  assert.equal(jeep.vehicleHits, 16);
  assert.equal(jeep.character.wounds, 2);
  assert.equal(jeep.section, 57);
});

test('printed section44 post-combat total remains a separate explicit roll', () => {
  const initial = startSixActionsFight(character(), 44);
  const result = sixActionsRound(initial, {}, dice(6, 6));
  assert.equal(result.fight.status, 'post-check');
  assert.equal(result.fight.section, null);
  assert.equal(sixActionsPostCheck(result.fight, dice(1, 1)).fight.section, 8);
  assert.equal(sixActionsPostCheck(result.fight, dice(6, 6)).fight.section, 56);
  assert.throws(() => sixActionsPostCheck(initial, constant(1)), RangeError);
});

test('invalid dice and finished encounters cannot mutate saved state', () => {
  const f = startSixActionsFight(character(), 9), before = structuredClone(f);
  for (const value of [0, 7, 1.5, NaN]) assert.throws(() => sixActionsRound(f, {}, constant(value)), RangeError);
  assert.deepEqual(f, before);
  const ended = { ...f, status: 'win' };
  assert.throws(() => sixActionsRound(ended, {}, constant(1)), RangeError);
});

test('database settings control initial groups, second opponent timing and the post-combat threshold', () => {
  const saved=structuredClone(SIX_ACTIONS_RULES);
  try {
    SIX_ACTIONS_RULES.groups={armour:1,jeep:2};SIX_ACTIONS_RULES.knifeSecondRound=2;
    assert.deepEqual(startSixActionsFight(character(),114).groups,{armour:1,jeep:2});
    const knife=startSixActionsFight(character(),9);knife.round=2;
    assert.deepEqual(sixActionsRound(knife,{},constant(1)).enemy.map(e=>e.target),[0,1]);
    const check=startSixActionsFight(character(),44);check.status='post-check';
    SIX_ACTIONS_RULES.postCheckLower=6;
    assert.equal(sixActionsPostCheck(check,constant(1)).fight.section,56);
    SIX_ACTIONS_RULES.postCheckLower=7;
    assert.equal(sixActionsPostCheck(check,constant(1)).fight.section,8);
  } finally {Object.assign(SIX_ACTIONS_RULES,saved);}
});

test('serialized group combat preserves existing counts, wounds, ammunition and extension fields', () => {
  const original=startSixActionsFight(character({wounds:1,bombs:3,grenades:4}),114);
  original.groups={armour:1,jeep:1};original.remaining=2;original.killed=5;original.round=6;
  original.extension={keep:['saved']};const saved=JSON.stringify(original),rules=structuredClone(SIX_ACTIONS_RULES);
  try {
    SIX_ACTIONS_RULES.groups={armour:99,jeep:99};
    const restored=JSON.parse(saved),result=sixActionsRound(restored,{group:'armour',enemyShots:0},constant(6)).fight;
    assert.deepEqual(result.groups,{armour:0,jeep:1});assert.equal(result.remaining,1);
    assert.equal(result.killed,6);assert.equal(result.round,7);
    assert.deepEqual(result.character,original.character);assert.deepEqual(result.extension,original.extension);
    assert.equal(JSON.stringify(restored),saved);
  } finally {Object.assign(SIX_ACTIONS_RULES,rules);}
});
