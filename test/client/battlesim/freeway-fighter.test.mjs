import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { newFreewayCharacter, validateFreewayCharacter, testFreewayLuck, healFreewayCharacter,
  startFreewayFight, freewayRound, freewayContest, startFreewayRace, freewayRaceStep } from '../../../public/js/battlesim/engines/freeway-fighter/core.js';
import { FREEWAY_FIGHTS, FREEWAY_CONTESTS, FREEWAY_RACES } from '../../../public/js/battlesim/engines/freeway-fighter/roster.js';

const constant = value => () => value;
const dice = (...values) => () => {
  assert.ok(values.length, 'Unexpected die');
  return values.shift();
};
const character = changes => ({ ...newFreewayCharacter(constant(6)), ...changes });

test('backend registers this simulator and awards each completed outcome only once', () => {
  const events = [];
  const db = { exec() {}, transaction: fn => () => fn(), prepare: () => ({
    run() {}, all: () => [], get: () => ({ id: 663, total_sections: 380, is_container: 0 }),
  }) };
  const context = { module: { exports: {} }, events, require(name) {
    if (name === './connection') return { db };
    if (name === './auth') return { generateToken: () => 'test-only' };
    if (name === '../impersonation-context') return { isImpersonatingContext: () => false };
    if (name === '../clean-run') return { isCleanRun: () => false };
    throw new Error('Unexpected dependency: ' + name);
  } };
  const source = readFileSync(new URL('../../../server/db/xp.js', import.meta.url), 'utf8');
  runInNewContext(source + '\nawardXp = (...args) => events.push(args);', context);
  assert.ok(context.module.exports.SIM_HISTORY_KEYS.includes('sim663'));
  const state = history => ({ graph: {}, playthroughs: [{ startedAt: 123, path: [1], sim663: { history } }] });
  const before = state([]), after = state([{ outcome: 'win', ts: 10 }, { outcome: 'loss', ts: 11 }, { outcome: 'cancelled', ts: 12 }]);
  context.module.exports.processStateXp(1, 663, before, after);
  assert.deepEqual(events.filter(event => event[1].startsWith('battlesim_')).map(event => [...event]),
    [[1, 'battlesim_win', 'sim663:10'], [1, 'battlesim_loss', 'sim663:11']]);
  events.length = 0;
  context.module.exports.processStateXp(1, 663, after, structuredClone(after));
  assert.equal(events.filter(event => event[1].startsWith('battlesim_')).length, 0);
});

test('initial rolls and resources follow the complete printed rules', () => {
  const low = newFreewayCharacter(constant(1)), high = character();
  assert.deepEqual([low.skill, low.stamina, low.luck, low.firepower, low.armour], [7, 26, 7, 7, 26]);
  assert.deepEqual([high.skill, high.stamina, high.luck, high.firepower, high.armour], [12, 36, 12, 12, 36]);
  assert.deepEqual([low.medkits, low.rockets, low.spikes, low.oil, low.credits], [10, 4, 3, 2, 200]);
  assert.equal(validateFreewayCharacter(low), low);
});

test('all 32 source stat-block encounters are represented with correct opponents', () => {
  const expected = {
    6: [[6, 15], [7, 17]], 12: [[8, 12]], 17: [[6, 9]], 48: [[7, 10]], 49: [[9, 15]],
    63: [[8, 16]], 83: [[8, 11]], 95: [[6, 9]], 102: [[7, 13], [8, 14]],
    115: [[7, 10], [8, 11]], 116: [[8, 12]], 120: [[8, 7], [8, 8]], 158: [[10, 19]],
    167: [[8, 15]], 178: [[9, 12]], 184: [[7, 13], [8, 14]], 193: [[7, 11]],
    220: [[9, 8]], 227: [[8, 12]], 269: [[11, 16]], 282: [[9, 8]],
    284: [[9, 15], [10, 12], [8, 13]], 290: [[9, 20]], 291: [[9, 9]], 294: [[8, 16]],
    299: [[7, 13], [5, 14]], 328: [[9, 15]], 331: [[9, 14]], 350: [[7, 5]],
    352: [[9, 20]], 368: [[7, 11]], 374: [[7, 5]],
  };
  assert.equal(FREEWAY_FIGHTS.length, 32);
  for (const fight of FREEWAY_FIGHTS) assert.deepEqual(fight.enemies.map(e => [e.attack, e.health]), expected[fight.section]);
  assert.equal(FREEWAY_CONTESTS.length, 4);
  assert.equal(FREEWAY_RACES.length, 2);
});

test('starting fights neither heals nor mutates characters or roster', () => {
  const c = character({ stamina: 15, armour: 16, rockets: 1 });
  const before = structuredClone(c), roster = structuredClone(FREEWAY_FIGHTS);
  const fight = startFreewayFight(c, 284);
  assert.deepEqual(fight.character, before);
  fight.enemies[0].health = 1;
  assert.deepEqual(c, before);
  assert.deepEqual(FREEWAY_FIGHTS, roster);
});

test('ranged and vehicle hits remove only the appropriate health pool', () => {
  for (const [section, pool, untouched] of [[12, 'stamina', 'armour'], [49, 'armour', 'stamina']]) {
    const f = startFreewayFight(character({ skill: 7, firepower: 7 }), section);
    const result = freewayRound(f, {}, dice(6, 6, 1, 1, 3));
    assert.equal(result.fight.character[pool], 33);
    assert.equal(result.fight.character[untouched], 36);
    assert.equal(result.fight.hits, 1);
    assert.equal(f.character[pool], 36);
  }
});

test('ties remain harmless without fabricated tiebreakers', () => {
  let f = startFreewayFight(character({ skill: 7 }), 48);
  for (let i = 0; i < 40; i++) f = freewayRound(f, {}, constant(1)).fight;
  assert.equal(f.character.stamina, 36);
  assert.equal(f.enemies[0].health, 10);
  assert.equal(f.status, 'fighting');
});

test('ordinary hand fights stop at six cumulative damage without healing', () => {
  let f = startFreewayFight(character(), 48);
  for (let i = 0; i < 3; i++) f = freewayRound(f, {}, dice(1, 1, 6, 6)).fight;
  assert.equal(f.enemies[0].health, 4);
  assert.equal(f.status, 'win');
  assert.equal(f.section, 138);
  assert.equal(f.character.stamina, 36);
});

test('knockout defeat and zero-health death have different destinations', () => {
  let f = startFreewayFight(character({ skill: 7 }), 48);
  for (let i = 0; i < 3; i++) f = freewayRound(f, {}, dice(6, 6, 1, 1)).fight;
  assert.equal(f.status, 'loss'); assert.equal(f.section, 100); assert.equal(f.character.stamina, 30);
  f = startFreewayFight(character({ skill: 7, stamina: 1 }), 48);
  f = freewayRound(f, {}, dice(6, 6, 1, 1)).fight;
  assert.equal(f.character.stamina, 0); assert.equal(f.section, null);
});

test('Animal and dog death fights do not end at the knockout threshold', () => {
  let f = startFreewayFight(character(), 269);
  for (let i = 0; i < 6; i++) f = freewayRound(f, {}, dice(1, 1, 6, 6)).fight;
  assert.equal(f.status, 'fighting'); assert.equal(f.enemies[0].health, 10);
  const armed = startFreewayFight(character({ knuckleduster: true }), 269);
  assert.equal(freewayRound(armed, {}, dice(1, 1, 6, 6)).fight.enemies[0].health, 14);
  for (const section of [350, 374]) {
    const dog = startFreewayFight(character({ stamina: 10, skill: 7 }), section);
    assert.equal(freewayRound(dog, {}, dice(6, 6, 1, 1)).fight.character.stamina, 8);
  }
});

test('simultaneous enemies each attack but only the selected target can be hit', () => {
  const f = startFreewayFight(character(), 6);
  const result = freewayRound(f, { target: 1 }, dice(1, 1, 6, 6, 1, 1, 6, 6, 4));
  assert.deepEqual(result.fight.enemies.map(e => e.health), [15, 13]);
  assert.equal(result.attacks.length, 2);
  const hits = freewayRound(startFreewayFight(character({ skill: 7 }), 299), {},
    dice(6, 6, 1, 1, 2, 6, 6, 1, 1, 3));
  assert.equal(hits.fight.character.stamina, 31);
  assert.equal(hits.fight.hits, 2);
});

test('death during a group round stops all remaining attacks', () => {
  const result = freewayRound(startFreewayFight(character({ skill: 7, stamina: 1 }), 6), {}, dice(6, 6, 1, 1, 1));
  assert.equal(result.attacks.length, 1);
  assert.equal(result.fight.status, 'loss');
});

test('sequential enemies require printed order and keep existing damage', () => {
  let f = startFreewayFight(character({ armour: 20 }), 284);
  assert.throws(() => freewayRound(f, { target: 1 }, constant(1)), RangeError);
  f = freewayRound(f, { rocket: true }, () => { throw new Error('Rocket must not roll'); }).fight;
  assert.equal(f.status, 'fighting');
  assert.equal(f.character.armour, 20);
  assert.equal(f.enemies[1].health, 12);
  assert.throws(() => freewayRound(f, { target: 0 }), RangeError);
});

test('rockets destroy one target, consume one rocket and replace the normal round', () => {
  const f = startFreewayFight(character(), 49);
  const result = freewayRound(f, { rocket: true }, () => { throw new Error('No dice for single-target rocket'); });
  assert.equal(result.fight.character.rockets, 3);
  assert.equal(result.fight.round, 1); assert.equal(result.fight.status, 'win');
  assert.equal(result.fight.section, 91); assert.equal(f.character.rockets, 4);
});

test('rocket restrictions and resource limits are enforced', () => {
  for (const section of [63, 158, 294]) {
    const f = startFreewayFight(character(), section, { rounds: 4 });
    assert.throws(() => freewayRound(f, { rocket: true }), RangeError);
  }
  assert.throws(() => freewayRound(startFreewayFight(character({ rockets: 0 }), 49), { rocket: true }), RangeError);
  assert.throws(() => freewayRound(startFreewayFight(character(), 12), { rocket: true }), RangeError);
});

test('group rocket leaves the other vehicle able to attack', () => {
  const result = freewayRound(startFreewayFight(character(), 115), { rocket: true, target: 0 }, dice(6, 6, 1, 1, 3));
  assert.equal(result.fight.enemies[0].health, 0);
  assert.equal(result.fight.enemies[1].health, 11);
  assert.equal(result.fight.character.armour, 33);
  assert.equal(result.fight.status, 'fighting');
});

test('temporary penalties never alter the saved base skill or firepower', () => {
  for (const [section, modifier] of [[12, -1], [116, -2], [193, 1], [17, -2], [83, -2], [352, -2]]) {
    const f = startFreewayFight(character(), section);
    const result = freewayRound(f, {}, constant(1));
    assert.equal(result.attacks[0].playerAttack, 14 + modifier);
    assert.equal(result.fight.character.skill, 12);
    assert.equal(result.fight.character.firepower, 12);
  }
});

test('initiative penalty lasts only the first round', () => {
  let f = startFreewayFight(character({ skill: 7 }), 178);
  let result = freewayRound(f, {}, dice(1, 1, 1, 1, 1));
  assert.equal(result.attacks[0].playerAttack, 7);
  f = result.fight;
  result = freewayRound(f, {}, dice(1, 1, 1, 1, 1));
  assert.equal(result.attacks[0].playerAttack, 9);
});

test('Magnum bonus is restricted to shooting', () => {
  for (const [section, bonus] of [[193, 1], [48, 0], [49, 0]]) {
    const result = freewayRound(startFreewayFight(character({ magnum: true }), section), {}, constant(1));
    assert.equal(result.attacks[0].playerAttack, 14 + bonus + (section === 193 ? 1 : 0));
  }
});

test('multiple gunshot hits cause one permanent skill penalty on completion', () => {
  let f = startFreewayFight(character({ skill: 7 }), 12);
  for (let i = 0; i < 2; i++) f = freewayRound(f, {}, dice(6, 6, 1, 1, 1)).fight;
  assert.equal(f.character.skill, 7);
  f = freewayRound(f, {}, dice(1, 1, 6, 6, 6)).fight;
  f = freewayRound(f, {}, dice(1, 1, 6, 6, 6)).fight;
  assert.equal(f.status, 'win'); assert.equal(f.character.skill, 6);
  assert.equal(f.character.skillInitial, 12);
  assert.throws(() => freewayRound(f), RangeError);
});

test('duel and survival durations count harmless tied rounds', () => {
  const duel = freewayRound(startFreewayFight(character({ skill: 9 }), 291), {}, constant(1)).fight;
  assert.equal(duel.status, 'win'); assert.equal(duel.section, 208);
  let survival = startFreewayFight(character({ firepower: 10 }), 158);
  for (let i = 0; i < 3; i++) survival = freewayRound(survival, {}, constant(1)).fight;
  assert.equal(survival.status, 'win'); assert.equal(survival.section, 67);
});

test('ramming has fixed damage and source63 requires an explicit duration', () => {
  assert.throws(() => startFreewayFight(character(), 63), RangeError);
  assert.throws(() => startFreewayFight(character(), 63, { rounds: 0 }), RangeError);
  const result = freewayRound(startFreewayFight(character(), 63, { rounds: 1 }), {}, dice(1, 1, 6, 6));
  assert.equal(result.fight.enemies[0].health, 14);
  assert.equal(result.fight.status, 'win'); assert.equal(result.fight.section, 334);
  let f = startFreewayFight(character({ firepower: 8 }), 294);
  for (let i = 0; i < 4; i++) f = freewayRound(f, {}, constant(1)).fight;
  assert.equal(f.round, 4); assert.equal(f.status, 'win');
});

test('contests favor the player on ties and retain the wound penalty', () => {
  for (const [section, skill, win] of [[30, 8, 74], [35, 8, 379], [164, 7, 132], [345, 7, 74]]) {
    const result = freewayContest(character({ skill }), section, constant(1));
    assert.equal(result.won, true); assert.equal(result.section, win);
  }
});

test('races roll Jaguar first and never give a player an extra turn after it finishes', () => {
  let race = startFreewayRace(358);
  for (let i = 0; i < 3; i++) race = freewayRaceStep(race, dice(6, 6)).race;
  const result = freewayRaceStep(race, dice(6));
  assert.equal(result.playerDie, null); assert.equal(result.race.status, 'loss'); assert.equal(result.race.section, 322);
});

test('boosted engine adds one to each player race roll', () => {
  let race = startFreewayRace(210);
  for (let i = 0; i < 3; i++) race = freewayRaceStep(race, dice(1, 6)).race;
  assert.equal(race.player, 21);
  const result = freewayRaceStep(race, dice(1, 2));
  assert.equal(result.race.status, 'win'); assert.equal(result.race.section, 54);
  assert.equal(race.player, 21);
});

test('Luck loses one point on both successful and failed tests', () => {
  const c = character({ luck: 5 });
  const good = testFreewayLuck(c, dice(2, 3)), bad = testFreewayLuck(c, dice(3, 3));
  assert.equal(good.lucky, true); assert.equal(bad.lucky, false);
  assert.equal(good.character.luck, 4); assert.equal(bad.character.luck, 4); assert.equal(c.luck, 5);
});

test('medkits heal four only outside active combat, cap initial health and cannot revive', () => {
  const c = character({ stamina: 35 });
  const healed = healFreewayCharacter(c);
  assert.equal(healed.stamina, 36); assert.equal(healed.medkits, 9); assert.equal(c.medkits, 10);
  assert.throws(() => healFreewayCharacter(c, startFreewayFight(c, 49)), RangeError);
  assert.throws(() => healFreewayCharacter(character({ stamina: 0 })), RangeError);
  assert.throws(() => healFreewayCharacter(character({ medkits: 0, stamina: 20 })), RangeError);
});

test('invalid source inputs fail without mutating an active fight', () => {
  for (const value of [0, 7, NaN, 1.5]) {
    const f = startFreewayFight(character(), 49), before = structuredClone(f);
    assert.throws(() => freewayRound(f, {}, constant(value)), RangeError);
    assert.deepEqual(f, before);
  }
  assert.throws(() => startFreewayFight(character(), 999), RangeError);
  assert.throws(() => startFreewayRace(999), RangeError);
  assert.throws(() => validateFreewayCharacter(character({ stamina: 37 })), RangeError);
});
