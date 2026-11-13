import test from 'node:test';
import assert from 'node:assert/strict';
import {startFight, combatAction, roundTotals, validateFight, normalizeEncounter} from '../../../public/js/battlesim/books/581/combat.js';

const opponent = (hp = 25, skill = 3, extra = {}) => ({name:'Opponent', hp, skill, ...extra});
const begin = (profiles = [opponent()], rules = {}, setup = {}, player = {}) =>
  startFight({hp:25, skill:3, ...player}, {name:'Encounter', profiles, rules}, setup);
const act = (fight, kind, options = {}) => combatAction(fight, {kind, expectedRevision:fight.revision, ...options}, () => .3);
const round = (fight, player = 6, enemy = 1, die = 6) =>
  act(act(fight, 'roll', {dice:{player, enemy}}), 'resolve', {die});

test('opposed d6 plus skill determines one hit, with a separate d6 damage roll', () => {
  const original = begin(), pending = act(original, 'roll', {dice:{player:6, enemy:1}});
  assert.deepEqual(roundTotals(pending), {player:9, enemy:4});
  const result = act(pending, 'resolve', {die:4});
  assert.equal(result.enemies[0].hp, 21);
  assert.equal(result.player.hp, 25);
  assert.equal(original.round, 0);
  assert.equal(pending.enemies[0].hp, 25);
});
test('ties cause no damage; a losing round records player wounds', () => {
  const tied = round(begin(), 3, 3);
  assert.equal(tied.player.hp, 25); assert.equal(tied.enemies[0].hp, 25);
  assert.equal(tied.round, 1); assert.equal(tied.playerWounded, false);
  const lost = round(tied, 1, 6, 2);
  assert.equal(lost.player.hp, 23); assert.equal(lost.playerWounded, true);
});
test('groups fight sequentially and excess damage never spills onto the next enemy', () => {
  let fight = round(begin([opponent(2), opponent(3)]));
  assert.equal(fight.active, 1); assert.equal(fight.enemies[1].hp, 3);
  assert.equal(fight.result, null);
  fight = round(fight);
  assert.equal(fight.result, 'win'); assert.equal(fight.status, 'fighting');
  fight = act(fight, 'finish'); assert.equal(fight.status, 'win');
  assert.throws(() => act(fight, 'finish'));
});
test('partial encounters end at their printed Life Force threshold without killing the opponent', () => {
  let fight = round(begin([opponent(25, 3, {stopHp:15})]));
  assert.equal(fight.enemies[0].hp, 19); assert.equal(fight.result, null);
  fight = round(fight, 6, 1, 4);
  assert.equal(fight.enemies[0].hp, 15); assert.equal(fight.result, 'win');
  assert.throws(() => act(fight, 'roll'));
});
test('variable skeleton counts require an explicit valid roll result', () => {
  const rules = {variableCount:{min:2, max:6}};
  assert.equal(begin([opponent(7, 2)], rules, {count:2}).enemies.length, 2);
  assert.equal(begin([opponent(7, 2)], rules, {count:6}).enemies.length, 6);
  for (const count of [undefined, 1, 7, 2.5]) assert.throws(() => begin([opponent(7, 2)], rules, {count}));
});
test('underwater modifiers apply only to the sides specified in the encounter', () => {
  const fight = begin([opponent()], {playerDiceModifier:-1},
    {companion:{name:'Companion', hp:25, skill:5, diceModifier:-1}});
  const pending = act(fight, 'roll', {dice:{player:3, enemy:3, companion:3}});
  assert.deepEqual(roundTotals(pending), {player:5, enemy:6, companion:7});
});
test('underwater attack and damage rolls can fall to zero, without inventing minimum damage', () => {
  const fight = begin([opponent()], {playerDiceModifier:-1, enemyDiceModifier:-1});
  const pending = act(fight, 'roll', {dice:{player:1, enemy:6}});
  assert.deepEqual(roundTotals(pending), {player:3, enemy:8});
  const resolved = act(pending, 'resolve', {die:1});
  assert.equal(resolved.player.hp, 25); assert.equal(resolved.playerWounded, false);
});
test('the one-fight potion bonus affects player attack and damage dice', () => {
  const pending = act(begin([opponent()], {}, {playerBonus:1}), 'roll', {dice:{player:3, enemy:3}});
  assert.deepEqual(roundTotals(pending), {player:7, enemy:6});
  const result = act(pending, 'resolve', {die:6});
  assert.equal(result.enemies[0].hp, 18);
});
test('allied rounds show all dice and require explicit hit allocation', () => {
  const fight = begin([opponent()], {}, {companion:{name:'Companion', hp:15, skill:2}});
  const pending = act(fight, 'roll', {dice:{player:2, enemy:4, companion:6}});
  assert.deepEqual(roundTotals(pending), {player:5, enemy:7, companion:8});
  assert.throws(() => act(pending, 'resolve'));
  const result = act(pending, 'resolve', {hits:[{who:'companion', target:'enemy', die:4}, {who:'enemy', target:'player', die:2}]});
  assert.equal(result.enemies[0].hp, 21); assert.equal(result.player.hp, 23);
  assert.equal(result.companion.hp, 15);
  assert.equal(result.events.at(-1).manualAlliedResolution, true);
});
test('manual allied allocation validates sides and duplicate attackers without modifying the original', () => {
  const pending = act(begin([opponent()], {}, {companion:{name:'Companion', hp:15, skill:2}}), 'roll');
  const saved = structuredClone(pending);
  assert.throws(() => act(pending, 'resolve', {hits:[{who:'player', target:'companion', die:2}]}));
  assert.throws(() => act(pending, 'resolve', {hits:[{who:'player', target:'enemy', die:2}, {who:'player', target:'enemy', die:2}]}));
  assert.deepEqual(pending, saved);
});
test('a companion casualty persists and subsequent rounds revert to the normal duel', () => {
  let fight = act(begin([opponent()], {}, {companion:{name:'Companion', hp:1, skill:2}}), 'roll');
  fight = act(fight, 'resolve', {hits:[{who:'enemy', target:'companion', die:1}]});
  assert.equal(fight.companion.hp, 0); assert.equal(fight.playerWounded, false);
  fight = act(fight, 'roll'); assert.equal(fight.pending.companion, undefined);
  assert.doesNotThrow(() => act(fight, 'resolve', {die:1}));
});
test('single-opponent weapons require current Life Force at or below 25', () => {
  for (const power of ['blade', 'deathbringer']) {
    const fight = begin([opponent(26), opponent(5)], {}, {powers:{[power]:1}});
    assert.throws(() => act(fight, 'power', {power})); assert.equal(fight.powers[power], 1);
    const result = act(round(fight, 6, 1, 1), 'power', {power});
    assert.equal(result.enemies[0].hp, 0); assert.equal(result.enemies[1].hp, 5);
    assert.equal(result.powers[power], 0);
    assert.throws(() => act(result, 'power', {power}));
  }
});
test('the fire consumes eligible group members but leaves stronger opponents standing', () => {
  const fight = act(begin([opponent(30), opponent(25), opponent(24)], {}, {powers:{fire:1}}), 'power', {power:'fire'});
  assert.deepEqual(fight.enemies.map(x => x.hp), [30, 0, 0]); assert.equal(fight.result, null);
  assert.throws(() => act(begin([opponent(30)], {}, {powers:{fire:1}}), 'power', {power:'fire'}));
});
test('mirror, shield and horn can each end a whole group regardless of Life Force', () => {
  for (const power of ['mirror', 'shield', 'horn']) {
    const fight = act(begin([opponent(40), opponent(50)], {}, {powers:{[power]:1}}), 'power', {power});
    assert.equal(fight.result, 'win'); assert.deepEqual(fight.enemies.map(x => x.hp), [0, 0]);
    assert.equal(fight.powers[power], 0);
  }
});
test('undead poison causes exactly five fixed damage and never affects a living opponent', () => {
  const living = begin([opponent(12)], {}, {powers:{poison:1}});
  assert.throws(() => act(living, 'power', {power:'poison'})); assert.equal(living.powers.poison, 1);
  const undead = act(begin([opponent(12, 3, {undead:true})], {}, {playerBonus:1, powers:{poison:1}}), 'power', {power:'poison'});
  assert.equal(undead.enemies[0].hp, 7); assert.equal(undead.powers.poison, 0);
});
test('resurrection is explicit, consumes an elixir and preserves the opponent and wounds', () => {
  let fight = round(begin([opponent()], {}, {powers:{resurrection:1}}, {hp:3, maxHp:20}), 1, 6);
  assert.equal(fight.result, 'loss'); assert.equal(fight.status, 'fighting');
  assert.throws(() => act(fight, 'resurrect', {hp:21}));
  fight = act(fight, 'resurrect', {hp:5});
  assert.equal(fight.result, null); assert.equal(fight.player.hp, 5);
  assert.equal(fight.enemies[0].hp, 25); assert.equal(fight.playerWounded, true);
  assert.equal(fight.powers.resurrection, 0);
});
test('healing potions cannot be used during combat; pending dice cannot be bypassed with a weapon', () => {
  const fight = begin([opponent()], {}, {powers:{blade:1}});
  assert.throws(() => act(fight, 'heal', {hp:25}));
  const pending = act(fight, 'roll');
  assert.throws(() => act(pending, 'power', {power:'blade'}));
});
test('invalid dice, stale actions and corrupt saved state are rejected', () => {
  const fight = begin();
  for (const value of [0, 7, 1.5, NaN]) assert.throws(() => act(fight, 'roll', {dice:{player:value}}));
  assert.throws(() => combatAction(fight, {kind:'roll', expectedRevision:10}));
  assert.throws(() => validateFight({...fight, active:1}));
  assert.throws(() => normalizeEncounter({name:'Invalid', profiles:[opponent(25, 3, {stopHp:25})]}));
});
test('long fights keep bounded flat logs and cancellation never confirms a provisional outcome', () => {
  let fight = begin();
  for (let i = 0; i < 500; i++) fight = round(fight, 3, 3);
  assert.equal(fight.events.length, 100); assert(JSON.stringify(fight).length < 30000);
  fight = act(fight, 'cancel'); assert.equal(fight.status, 'cancelled'); assert.equal(fight.result, null);
  assert.throws(() => act(fight, 'finish'));
});
