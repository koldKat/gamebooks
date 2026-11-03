import test from 'node:test';
import assert from 'node:assert/strict';
import {blackSunPlayer, blackSunStart, blackSunRound, blackSunCombatValues, blackSunEnemyValues,
  blackSunAcknowledge, blackSunMindOverBody, blackSunRecoveredPlayer, validateBlackSunFight} from '../../../../public/js/battlesim/engines/black-sun/combat.js';

const page = (base = 2, attack = 3, defense = 4, moon = 'half') => ({base, attack, defense, moon});
const opponent = (resistance = 2, attackBonus = 0, defenseBonus = 0) => ({resistance, attackBonus, defenseBonus});
const start = (player = {}, encounter = {}) => blackSunStart(blackSunPlayer(player),
  {attack: 10, defense: 9, opponents: [opponent()], ...encounter});

test('one base die is reused, ties hit and defend, and inputs are immutable', () => {
  const f = start(), before = structuredClone(f), dice = page();
  const r = blackSunRound(f, dice);
  assert.deepEqual(f, before); assert.equal(r.opponents[0].resistance, 1);
  assert.equal(r.player.vitality, 1); assert.equal(r.log[0].attackTotal, 11); assert.equal(r.log[0].defenseTotal, 12);
  const tied = blackSunRound(start(), page(1, 2, 3));
  assert.equal(tied.opponents[0].resistance, 1); assert.equal(tied.player.vitality, 1);
});

test('killing blow ends combat before the enemy can attack', () => {
  const f = start({}, {attack: 100, opponents: [opponent(1)]});
  const r = blackSunRound(f, page());
  assert.equal(r.status, 'win'); assert.equal(r.player.vitality, 1); assert.equal(r.log[0].playerLoss, 0);
});

test('group bonuses depend on the specific surviving enemies and only one return attack occurs', () => {
  const f = start({}, {attack: 11, defense: 12, opponents: [opponent(1, 1, 1), opponent(1, 0, 0), opponent(1, 1, 1)]});
  assert.deepEqual(blackSunEnemyValues(f), {attack: 13, defense: 14});
  const r = blackSunRound(f, page(6, 6, 1), {target: 0});
  assert.equal(r.opponents[0].resistance, 0); assert.deepEqual(blackSunEnemyValues(r), {attack: 12, defense: 13});
  assert.equal(r.player.vitality, 1);
  const hit = blackSunRound(f, page(1, 1, 1), {target: 1});
  assert.equal(hit.player.vitality, 2);
});

test('changing weapons forfeits the attack and uses the enemy return attack', () => {
  const r = blackSunRound(start({}, {attack: 20}), page(), {type: 'change-weapon', weaponBonus: 5});
  assert.equal(r.player.weaponBonus, 5); assert.equal(r.opponents[0].resistance, 2); assert.equal(r.player.vitality, 2);
});

test('expert wound penalties affect both attributes, and Kesrani grants exactly one extra vitality level', () => {
  const f = start({strength: 9, dexterity: 8, weaponBonus: 3, protection: 2, expert: true, vitality: 3});
  assert.deepEqual(blackSunCombatValues(f), {attack: 11, defense: 9});
  const critical = start({expert: true, vitality: 4}, {attack: 100, defense: 100});
  assert.equal(blackSunRound(critical, page()).status, 'loss');
  const extra = start({expert: true, kesrani: true, vitality: 4}, {attack: 100, defense: 100});
  const alive = blackSunRound(extra, page()); assert.equal(alive.status, 'fighting');
  assert.equal(blackSunRound(alive, page()).status, 'loss');
});

test('full moon power succeeds in both halves of the same page only', () => {
  const f = start({fullMoonPower: true}, {attack: 100, defense: 100});
  const r = blackSunRound(f, page(1, 1, 1, 'full'));
  assert.equal(r.opponents[0].resistance, 1); assert.equal(r.player.vitality, 1);
  const other = blackSunRound(f, page(1, 1, 1, 'new'));
  assert.equal(other.opponents[0].resistance, 2); assert.equal(other.player.vitality, 2);
});

test('ordinary Karma cannot automatically win attacks; named combat abilities opt in and spend exact costs', () => {
  const f = start({karma: 3}, {attack: 100, defense: 100});
  assert.throws(() => blackSunRound(f, page(), {autoAttack: true}), RangeError);
  const enabled = start({karma: 3}, {attack: 100, defense: 100, allowKarmaAttack: true, allowKarmaDefense: true, karmaDefenseCost: 2});
  const r = blackSunRound(enabled, page(), {autoAttack: true, autoDefense: true});
  assert.equal(r.player.karma, 0); assert.equal(r.player.vitality, 1); assert.equal(r.opponents[0].resistance, 1);
  assert.throws(() => blackSunRound({...enabled, player: {...enabled.player, karma: 2}}, page(), {autoAttack: true, autoDefense: true}), RangeError);
});

test('round-start reinforcement and instruction run once, without consuming an attack or skipping a round', () => {
  const f = start({}, {events: [{id: 'help', round: 1, phase: 'before-round', section: '901'}],
    reinforcements: [{round: 1, opponent: opponent(3, 2, 1)}]});
  const paused = blackSunRound(f, page());
  assert.equal(paused.status, 'paused'); assert.equal(paused.round, 1); assert.equal(paused.opponents.length, 2);
  assert.equal(paused.log.length, 0); assert.equal(paused.pending.section, '901');
  assert.throws(() => blackSunRound(paused, page()), RangeError);
  const resumed = blackSunRound(blackSunAcknowledge(paused), page());
  assert.equal(resumed.round, 1); assert.equal(resumed.opponents.length, 2); assert.equal(resumed.log.length, 1);
});

test('enemy phases and first-wound instructions interrupt without inventing victory', () => {
  const f = start({}, {attack: 10, defense: 100, phases: [{round: 2, attack: 100}],
    firstWoundEvent: {id: 'wounded', section: '762'}});
  const first = blackSunRound(f, page()); assert.equal(first.status, 'fighting');
  const second = blackSunRound(first, page());
  assert.equal(second.status, 'paused'); assert.equal(second.pending.section, '762'); assert.equal(second.player.vitality, 2);
});

test('survival encounters never invent missing enemy defense or resistance', () => {
  const f = start({}, {attack: 13, defense: null, defenseOnly: true, opponents: [{resistance: null}],
    events: [{id: 'end', round: 4, phase: 'before-round', section: '461'}]});
  let r = f; for (let i = 0; i < 3; i++) r = blackSunRound(r, page(6, 6, 6));
  r = blackSunRound(r, page()); assert.equal(r.pending.section, '461'); assert.equal(r.log.length, 3);
  assert.equal(r.opponents[0].resistance, null); assert.equal(blackSunEnemyValues(r).defense, null);
});

test('partial group victory stops immediately after the required kills', () => {
  let r = start({}, {defense: 1, stopAfterKills: 3, opponents: Array.from({length: 5}, () => opponent(1))});
  for (let i = 0; i < 3; i++) r = blackSunRound(r, page(), {target: i});
  assert.equal(r.status, 'win'); assert.equal(r.opponents.filter(e => e.resistance > 0).length, 2);
});

test('Mind over Body is limited by wounds, removes temporary bonuses after combat and preserves its vitality cost', () => {
  const f = start({vitality: 2}), r = blackSunMindOverBody(f, 1);
  assert.equal(r.player.vitality, 3); assert.equal(r.player.strength, 7); assert.equal(r.player.dexterity, 7);
  assert.throws(() => blackSunMindOverBody(r, 1), RangeError);
  assert.deepEqual(blackSunRecoveredPlayer(r), {...f.player, vitality: 3}); assert.equal(f.player.vitality, 2);
});

test('invalid pages and defeated targets leave the original encounter untouched', () => {
  const f = start(), old = structuredClone(f);
  for (const dice of [{...page(), base: 0}, {...page(), attack: 7}, {...page(), defense: 1.5}, {...page(), moon: 'blue'}]) {
    assert.throws(() => blackSunRound(f, dice), RangeError);
  }
  assert.throws(() => blackSunRound(f, page(), {target: 12}), RangeError); assert.deepEqual(f, old);
  assert.throws(() => blackSunRound(f, page(), {expectedRound: 2}), RangeError);
  assert.throws(() => start({vitality: 5}), RangeError);
  assert.throws(() => start({}, {weaponDivisor: 0}), RangeError);
  assert.throws(() => validateBlackSunFight({...f, opponents: [{...f.opponents[0], resistance: -1}]}), RangeError);
});
