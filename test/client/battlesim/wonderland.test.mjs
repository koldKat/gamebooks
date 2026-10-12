import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wonderlandDraw, wonderlandTest, createWonderlandCharacter } from '../../../public/js/battlesim/engines/wonderland/random.js';
import { startWonderlandFight, wonderlandRound, resolveWonderlandInitiative } from '../../../public/js/battlesim/engines/wonderland/core.js';
import { WONDERLAND_ENCOUNTERS } from '../../../public/js/battlesim/engines/wonderland/roster.js';

const rolls = (...values) => () => { assert.ok(values.length, 'Unexpected roll'); return values.shift(); };
const cards = (...indices) => () => { assert.ok(indices.length, 'Unexpected draw'); return (indices.shift() + .1) / 52; };
const player = { combat: 8, endurance: 20 };
const enemy = { name: 'Opponent', combat: 8, endurance: 12 };
const encounter = (extra = {}) => ({ section: 1, initiative: 'none', enemies: [enemy], ...extra });
const start = (extra = {}, options = {}, actor = player) => startWonderlandFight(actor, encounter(extra), options);

test('initial attributes allocate all ten points, at most five to each', () => {
  assert.deepEqual(createWonderlandCharacter({ agility: 2, logic: 4, combat: 2, endurance: 2 }),
    { agility: 8, logic: 10, combat: 8, endurance: 22, insanity: 0, curiouser: 3, pen: 3 });
  for (const points of [null, {}, { agility: 6, logic: 0, combat: 2, endurance: 2 },
    { agility: 1, logic: 1, combat: 1, endurance: 1 }]) assert.throws(() => createWonderlandCharacter(points), RangeError);
});

test('cards use all 52 ranks, face cards 11, Ace 12, independent reshuffles', () => {
  for (let i = 0; i < 52; i++) {
    const result = wonderlandDraw('cards', undefined, cards(i));
    const rank = i % 13 + 1;
    assert.equal(result.value, rank === 1 ? 12 : Math.min(rank, 11));
    assert.equal(result.cards[0].red, i >= 13 && i < 39);
  }
  assert.deepEqual(wonderlandDraw('cards', undefined, cards(0, 0), 4).cards.map(c => c.rank), [1, 1]);
  assert.throws(() => wonderlandDraw('cards', undefined, () => 1), RangeError);
  assert.throws(() => wonderlandDraw('dice', rolls(7)), RangeError);
  assert.throws(() => wonderlandDraw('cards', undefined, cards(0), 3), RangeError);
});

test('attribute tests use inclusive thresholds and inverted Insanity; any Ace passes', () => {
  assert.equal(wonderlandTest('agility', 6, 'dice', rolls(3, 3)).passed, true);
  assert.equal(wonderlandTest('logic', 5, 'dice', rolls(3, 3)).passed, false);
  assert.equal(wonderlandTest('insanity', 6, 'dice', rolls(3, 3)).passed, true);
  assert.equal(wonderlandTest('insanity', 7, 'dice', rolls(3, 3)).passed, false);
  assert.equal(wonderlandTest('endurance', 8, 'dice', rolls(2, 2, 2, 2)).passed, true);
  for (const key of ['agility', 'logic', 'combat', 'endurance', 'insanity']) {
    assert.equal(wonderlandTest(key, key === 'insanity' ? 999 : 0, 'cards', undefined,
      key === 'endurance' ? cards(0, 7) : cards(0)).passed, true);
  }
});

test('opening initiative applies to the rating; a winner keeps next initiative', () => {
  const f = start({ initiative: 'player' });
  const r = wonderlandRound(f, { roll: rolls(3, 3, 3, 3) });
  assert.equal(r.playerRating, 15);
  assert.equal(r.results[0].enemyRating, 14);
  assert.equal(r.fight.enemies[0].endurance, 10);
  assert.equal(r.fight.initiative, 'player');
  assert.deepEqual(f.player, player);
  assert.equal(f.round, 0);
  assert.equal(startWonderlandFight(player, encounter({ initiative: 'enemy' })).initiative, 'enemy');
  assert.throws(() => start({ initiative: null }), RangeError);
});

test('odd ties do nothing, even ties injure both, and ties remove initiative', () => {
  const odd = wonderlandRound(start(), { roll: rolls(3, 3, 3, 3, 3) }).fight;
  assert.equal(odd.player.endurance, 20); assert.equal(odd.enemies[0].endurance, 12);
  assert.equal(odd.initiative, 'none');
  const even = wonderlandRound(start(), { roll: rolls(3, 3, 3, 3, 2) }).fight;
  assert.equal(even.player.endurance, 19); assert.equal(even.enemies[0].endurance, 11);
  const dead = wonderlandRound(start({ enemies: [{ ...enemy, endurance: 1 }] }, {}, { combat: 8, endurance: 1 }),
    { roll: rolls(3, 3, 3, 3, 2) }).fight;
  assert.equal(dead.status, 'loss');
});

test('groups compare every opponent against the same Alice roll; mixed initiative is explicit', () => {
  const f = start({ enemies: [{ ...enemy, combat: 5 }, { ...enemy, combat: 10 }] });
  const result = wonderlandRound(f, { roll: rolls(3, 3, 3, 3, 3, 3) });
  assert.deepEqual(result.results.map(r => r.outcome), ['player', 'enemy']);
  assert.equal(result.fight.player.endurance, 18);
  assert.deepEqual(result.fight.enemies.map(e => e.endurance), [10, 12]);
  assert.equal(result.fight.pendingInitiative, true);
  assert.throws(() => wonderlandRound(result.fight), RangeError);
  assert.equal(resolveWonderlandInitiative(result.fight, 'none').pendingInitiative, false);
  assert.throws(() => resolveWonderlandInitiative(result.fight, 'automatic'), RangeError);
});

test('Alice can damage every simultaneous opponent, not just a chosen target', () => {
  const f = start({ enemies: [{ ...enemy, combat: 1 }, { ...enemy, combat: 1 }, { ...enemy, combat: 1 }] });
  const result = wonderlandRound(f, { roll: rolls(6, 6, 1, 1, 1, 1, 1, 1) });
  assert.deepEqual(result.fight.enemies.map(e => e.endurance), [10, 10, 10]);
  assert.equal(result.fight.initiative, 'player');
});

test('sequential opponents retain current Endurance and restore printed opening initiative', () => {
  const f = start({ sequential: true, initiative: 'player', enemies: [{ ...enemy, endurance: 2 }, enemy] });
  const result = wonderlandRound(f, { roll: rolls(6, 6, 1, 1) }).fight;
  assert.deepEqual(result.active, [1]); assert.equal(result.player.endurance, 20);
  assert.equal(result.enemies[1].endurance, 12); assert.equal(result.initiative, 'player');
  assert.equal(result.status, 'fighting');
});

test('gardeners bring in the third after one defeat and flee after two', () => {
  const f = start({ gardeners: true, enemies: [{ ...enemy, endurance: 2 }, enemy, enemy] }, { weapon: 'knife' });
  let result = wonderlandRound(f, { roll: rolls(6, 6, 1, 1, 1, 1) }).fight;
  assert.deepEqual(result.active, [1, 2]); assert.equal(result.defeated, 1);
  result.enemies[1].endurance = 1;
  result = wonderlandRound(result, { roll: rolls(6, 6, 1, 1, 1, 1) }).fight;
  assert.equal(result.status, 'win'); assert.ok(result.enemies[2].endurance > 0);
});

test('Spinebacks advance together to two guards with Alice initiative', () => {
  const spec = WONDERLAND_ENCOUNTERS.find(e => e.section === 97);
  const f = startWonderlandFight({ combat: 100, endurance: 20 }, spec, { weapon: 'vorpal' });
  f.enemies[0].endurance = f.enemies[1].endurance = 1;
  const result = wonderlandRound(f, { roll: rolls(1, 1, 1, 1, 1, 1) }).fight;
  assert.deepEqual(result.active, [2, 3]); assert.equal(result.initiative, 'player');
  assert.equal(result.stage, 1); assert.equal(result.player.endurance, 20);
});

test('weapons and local combat modifiers do not rewrite saved character Combat', () => {
  for (const [weapon, bonus, damage] of [['unarmed', 0, 2], ['knife', 0, 3], ['scissors', 0, 3], ['axe', -1, 3], ['vorpal', 1, 4]]) {
    const result = wonderlandRound(start({}, { weapon }), { roll: rolls(6, 6, 1, 1) });
    assert.equal(result.playerRating, 20 + bonus);
    assert.equal(result.results[0].enemyLoss, damage); assert.equal(result.fight.player.combat, 8);
  }
  const scales = wonderlandRound(start({ ironScales: true }, { weapon: 'vorpal' }), { roll: rolls(6, 6, 1, 1) });
  assert.equal(scales.results[0].enemyLoss, 3);
  assert.equal(start({ combatPenalty: 2 }).combatModifier, -2);
  assert.equal(start({ section: 271 }, { teapotInjury: true }).combatModifier, -1);
  assert.equal(start({ section: 271 }, { teapotInjury: true }).initiative, 'enemy');
});

test('club and mallet knock out on dice 11/12, but card Ace does not', () => {
  const dice = wonderlandRound(start({}, { weapon: 'club' }), { roll: rolls(6, 6, 1, 1, 5, 6) }).fight;
  assert.equal(dice.status, 'win');
  const queen = wonderlandRound(start({}, { weapon: 'mallet', mode: 'cards' }), { random: cards(9, 1, 11) }).fight;
  assert.equal(queen.status, 'win');
  const ace = wonderlandRound(start({}, { weapon: 'club', mode: 'cards' }), { random: cards(9, 1, 0) }).fight;
  assert.equal(ace.enemies[0].endurance, 9); assert.equal(ace.status, 'fighting');
});

test('Grandfather Clock uses die parity or card colour for two/three damage', () => {
  for (const [extra, expected] of [[1, 2], [2, 3]]) {
    const result = wonderlandRound(start({ section: 27 }), { roll: rolls(1, 1, 6, 6, extra) });
    assert.equal(result.playerLoss, expected);
  }
  for (const [index, expected] of [[13, 2], [39, 3]]) {
    const result = wonderlandRound(start({ section: 171 }, { mode: 'cards' }), { random: cards(1, 9, index) });
    assert.equal(result.playerLoss, expected);
  }
});

test('Ogre deals three damage; Lobster only loses one to ordinary weapons', () => {
  assert.equal(wonderlandRound(start({ section: 192 }), { roll: rolls(1, 1, 6, 6) }).playerLoss, 3);
  assert.equal(wonderlandRound(start({ section: 195 }, { weapon: 'scissors' }), { roll: rolls(6, 6, 1, 1) }).results[0].enemyLoss, 1);
});

test('Frog successive hits bite for four, bypassing the shield; ties reset the streak', () => {
  let f = start({ section: 279 }, { protection: 'shell' });
  let r = wonderlandRound(f, { roll: rolls(1, 1, 6, 6) });
  assert.equal(r.playerLoss, 1);
  r = wonderlandRound(r.fight, { roll: rolls(1, 1, 6, 6) });
  assert.equal(r.playerLoss, 4);
  f = resolveTieForEnemyInitiative(r.fight);
  assert.equal(f.enemyStreaks[0], 0);
});
function resolveTieForEnemyInitiative(f) {
  return wonderlandRound(f, { roll: rolls(4, 3, 3, 3, 1) }).fight;
}

test('Automaton steam uses ten+ dice or picture cards, not Ace', () => {
  assert.equal(wonderlandRound(start({ section: 372 }), { roll: rolls(1, 1, 6, 6, 5, 5) }).playerLoss, 4);
  assert.equal(wonderlandRound(start({ section: 372 }, { mode: 'cards' }), { random: cards(1, 9, 10) }).playerLoss, 4);
  assert.equal(wonderlandRound(start({ section: 372 }, { mode: 'cards' }), { random: cards(1, 9, 0) }).playerLoss, 2);
});

test('Queen third consecutive won round drains Combat and extra Endurance', () => {
  let f = start({ section: 496 });
  for (let i = 1; i <= 3; i++) {
    const r = wonderlandRound(f, { roll: rolls(1, 1, 6, 6) });
    assert.equal(r.playerLoss, i === 3 ? 4 : 2); f = r.fight;
  }
  assert.equal(f.player.combat, 7); assert.equal(f.player.endurance, 12);
});

test('Paper Tiger scissors weaken Combat and imaginary battles restore Endurance', () => {
  const r = wonderlandRound(start({ section: 492 }, { weapon: 'scissors' }), { roll: rolls(6, 6, 1, 1) });
  assert.equal(r.results[0].enemyLoss, 2); assert.equal(r.fight.enemies[0].combat, 7);
  const f = start({ section: 492 }, {}, { combat: 1, endurance: 2 });
  const lost = wonderlandRound(f, { roll: rolls(1, 1, 6, 6) }).fight;
  assert.equal(lost.status, 'loss'); assert.equal(lost.player.endurance, 2);
  const dream = start({ section: 199 }, {}, { combat: 1, endurance: 5 });
  dream.player.endurance = 2;
  const recovered = wonderlandRound(dream, { roll: rolls(1, 1, 6, 6) }).fight;
  assert.equal(recovered.status, 'loss'); assert.equal(recovered.player.endurance, 2.5);
});

test('cake and pepper require available supplies; pepper cannot affect clockwork', () => {
  assert.throws(() => start({}, { cake: true, cakeUses: 0 }), RangeError);
  const cake = start({}, { cake: true, cakeUses: 1 });
  assert.equal(cake.player.endurance, 24); assert.equal(cake.combatModifier, 1); assert.equal(cake.cakeSpent, 1);
  assert.throws(() => start({ inanimate: true }, { pepper: true, pepperUses: 1 }), RangeError);
  const pepper = start({}, { pepper: true, pepperUses: 1 });
  assert.equal(pepper.enemies[0].combat, 7); assert.equal(pepper.pepperSpent, 1);
});

test('finished or unresolved fights cannot roll; saved input and random failures are isolated', () => {
  const f = start(); const snapshot = structuredClone(f);
  assert.throws(() => wonderlandRound(f, { roll: rolls(1, 7) }), RangeError);
  assert.deepEqual(f, snapshot);
  f.status = 'win'; assert.throws(() => wonderlandRound(f), RangeError);
  assert.throws(() => start({}, { weapon: 'laser' }), RangeError);
});

test('roster includes all 52 encounter variants and 71 printed enemies', () => {
  assert.equal(WONDERLAND_ENCOUNTERS.length, 52);
  assert.equal(WONDERLAND_ENCOUNTERS.reduce((sum, e) => sum + e.enemies.length, 0), 71);
  assert.equal(new Set(WONDERLAND_ENCOUNTERS.map(e => e.section)).size, 52);
  for (const spec of WONDERLAND_ENCOUNTERS) {
    const f = startWonderlandFight(player, spec, { initiative: spec.initiative ?? 'none' });
    assert.equal(f.enemies.length, spec.enemies.length);
    assert.ok(f.active.length > 0);
  }
});
