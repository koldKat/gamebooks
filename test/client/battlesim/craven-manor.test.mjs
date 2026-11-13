import test from 'node:test';
import assert from 'node:assert/strict';
import {startFight, combatAction, normalizeEncounter} from '../../../public/js/battlesim/books/567/combat.js';

const begin = (rules = {}, player = {}, rounds = 24) => startFight(player, {name:'Opponent', rounds, rules});
const act = (fight, kind, options = {}) => combatAction(fight, {kind, expectedRevision:fight.revision, ...options}, () => .3);
const round = (fight, player = [3, 4], enemy = [2, 3], options = {}, extra = {}) =>
  act(act(fight, 'roll', {dice:{player, enemy, ...extra}}), 'resolve', options);

test('rows last six rounds; the row bonus lasts exactly the following row', () => {
  let f = begin();
  for (let i = 0; i < 6; i++) f = round(f);
  assert.equal(f.playerHits, 6); assert.equal(f.playerAdvantage, 1);
  // The advantage converts six raw ties into player hits.
  for (let i = 0; i < 6; i++) f = round(f, [3, 3], [3, 3]);
  assert.equal(f.playerHits, 12); assert.equal(f.playerAdvantage, 1);
  // Six boosted ties give neither side a point, and expire that advantage.
  for (let i = 0; i < 6; i++) f = round(f, [2, 3], [3, 3]);
  assert.equal(f.playerAdvantage, 0); assert.equal(f.enemyAdvantage, 0);
});
test('time slowing is chosen after seeing dice, capped at two and paid only on a valid immutable action', () => {
  const initial = begin(), pending = act(initial, 'roll', {dice:{player:[2, 3], enemy:[3, 3]}});
  const after = act(pending, 'resolve', {boost:2});
  assert.equal(after.playerHits, 1); assert.equal(after.player.ttp, 8);
  assert.equal(initial.round, 0); assert.equal(pending.player.ttp, 10);
  assert.throws(() => act(pending, 'resolve', {boost:3}));
  assert.throws(() => act(begin({}, {ttp:0}), 'resolve', {boost:1}));
});
test('six-round fights produce a provisional result before one explicit history confirmation', () => {
  let f = begin({}, {}, 6);
  for (let i = 0; i < 6; i++) f = round(f);
  assert.equal(f.result, 'win'); assert.equal(f.status, 'fighting');
  assert.throws(() => act(f, 'roll'));
  f = act(f, 'finish'); assert.equal(f.status, 'win');
  assert.throws(() => act(f, 'finish'));
});
test('final points can draw; the engine does not invent a tiebreak victory', () => {
  let f = begin({}, {}, 6);
  for (let i = 0; i < 6; i++) f = round(f, [3, 3], [3, 3]);
  assert.equal(f.result, 'draw');
});
test('row, roll and fight rewinds undo hits but retain spent time points', () => {
  let f = round(begin(), [2, 3], [4, 5], {boost:1});
  f = act(f, 'rewind', {scope:'roll'});
  assert.equal(f.round, 0); assert.equal(f.enemyHits, 0); assert.equal(f.player.ttp, 7);
  f = round(f); f = act(f, 'rewind', {scope:'row'});
  assert.equal(f.round, 0); assert.equal(f.playerHits, 0); assert.equal(f.player.ttp, 2);
  assert.throws(() => act(f, 'rewind', {scope:'fight'}));
  const reset = act(round(begin()), 'rewind', {scope:'fight'});
  assert.equal(reset.round, 0); assert.equal(reset.player.ttp, 2);
});
test('the reducer makes every combat rewind cost one; the absorber caps recovery at maximum', () => {
  let f = begin({}, {ttp:5, maxTtp:6, reducer:true, absorber:true});
  for (let i = 0; i < 6; i++) f = round(f);
  assert.equal(f.player.ttp, 6);
  f = act(f, 'rewind', {scope:'row'}); assert.equal(f.player.ttp, 5); assert.equal(f.round, 0);
  f = act(f, 'rewind', {scope:'fight'}); assert.equal(f.player.ttp, 4);
});
test('two thugs attack separately until a won row removes the additional attack', () => {
  let f = begin({pair:true});
  f = round(f, [2, 3], [4, 5], {}, {enemy2:[3, 4]}); assert.equal(f.enemyHits, 2);
  f = round(f, [3, 4], [2, 3], {}, {enemy2:[4, 5]});
  assert.equal(f.enemyHits, 3); assert.equal(f.playerHits, 0);
  for (let i = 0; i < 4; i++) f = round(f, [5, 6], [2, 3], {}, {enemy2:[3, 4]});
  assert.equal(f.enemies, 1);
  const pending = act(f, 'roll'); assert.equal(pending.pending.enemy2, undefined);
});
test('second self has two attacks for three rounds, with no counterhit after one success', () => {
  let f = act(begin({}, {secondSelf:true}), 'secondSelf');
  f = round(f, [3, 4], [2, 3], {}, {player2:[4, 5]}); assert.equal(f.playerHits, 2);
  f = round(f, [1, 2], [3, 4], {}, {player2:[4, 5]}); assert.equal(f.playerHits, 3); assert.equal(f.enemyHits, 0);
  f = round(f, [1, 2], [3, 4], {}, {player2:[1, 3]}); assert.equal(f.enemyHits, 1); assert.equal(f.cloneLeft, 0);
  assert.throws(() => act(f, 'secondSelf'));
  f = act(begin({pair:true}, {secondSelf:true}), 'secondSelf');
  const pending = act(f, 'roll'); assert.equal(pending.pending.player2, undefined); assert.equal(pending.pending.enemy2, undefined);
});
test('forward time skips dice-selected rounds; freeze wins two without combat dice', () => {
  let f = act(begin({}, {forward:true, freeze:true}), 'forward', {die:6});
  assert.equal(f.round, 6); assert.equal(f.playerHits, 0); assert.equal(f.enemyHits, 0);
  assert.throws(() => act(f, 'forward'));
  f = act(f, 'freeze'); assert.equal(f.round, 8); assert.equal(f.playerHits, 2);
  assert.throws(() => act(f, 'freeze'));
});
test('escape and disarm qualification uses raw dice, never an eleven created by time slowing', () => {
  let f = round(begin({escape:true}), [4, 5], [2, 3], {boost:2, choice:'escape'});
  assert.equal(f.result, null); assert.equal(f.playerHits, 1);
  f = round(begin({escape:true}), [2, 2], [5, 6], {choice:'escape'});
  assert.equal(f.result, 'fled');
  f = round(begin({disarm:true}), [2, 2], [5, 6], {choice:'disarm', dice:{disarm:[5, 6]}});
  assert.equal(f.result, 'fled');
});
test('a failed disarm costs two hits; choosing the double hit suppresses the normal exchange', () => {
  let f = round(begin({disarm:true}), [2, 2], [5, 6], {choice:'disarm', dice:{disarm:[1, 2]}});
  assert.equal(f.enemyHits, 2); assert.equal(f.playerHits, 0);
  f = round(begin({disarm:true}), [2, 2], [5, 6], {choice:'hit'});
  assert.equal(f.playerHits, 2); assert.equal(f.enemyHits, 0);
  assert.throws(() => round(begin({disarm:true}), [2, 2], [5, 6]));
});
test('armour and butcher modifiers affect comparisons and hit weights independently', () => {
  const armour = round(begin({enemyBonus:2}), [3, 4], [3, 3]); assert.equal(armour.enemyHits, 1);
  let butcher = round(begin({playerBonus:1, enemyHit:2}), [3, 3], [3, 3]); assert.equal(butcher.playerHits, 1);
  butcher = round(butcher, [1, 2], [4, 5]); assert.equal(butcher.enemyHits, 2);
});
test('phantom baby climbs after round three, cannot attack from the ceiling and drops on six', () => {
  let f = begin({phantom:true});
  for (let i = 0; i < 3; i++) f = round(f);
  assert.equal(f.phantom.phase, 'ceiling');
  f = round(f, [3, 4], [2, 3]); assert.equal(f.enemyHits, 0); assert.equal(f.playerHits, 3);
  f = round(f, [3, 4], [2, 3]); assert.equal(f.phantom.phase, 'drop');
  f = round(f, [1, 2], [4, 5]); assert.equal(f.enemyHits, 2); assert.equal(f.phantom.phase, 'feeding');
  f = round(f, [1, 2], [4, 5]); assert.equal(f.player.ttp, 8);
  f = round(f, [2, 2], [4, 5]); assert.equal(f.phantom.phase, 'ceiling'); assert.equal(f.player.ttp, 8);
});
test('three feeding rounds return the phantom baby to the ceiling', () => {
  let f = begin({phantom:true});
  for (let i = 0; i < 6; i++) f = round(f, [1, 2], [4, 5]);
  for (let i = 0; i < 3; i++) f = round(f, [1, 2], [4, 5]);
  assert.equal(f.player.ttp, 4); assert.equal(f.phantom.phase, 'ceiling'); assert.equal(f.phantom.left, 2);
});
test('a successful phantom drop on round twenty-four scores two hits without feeding', () => {
  let f = begin({phantom:true}, {ttp:100, maxTtp:100});
  for (let i = 0; i < 23; i++) f = round(f, [1, 2], [4, 5]);
  const before = {ttp:f.player.ttp, hits:f.enemyHits};
  f = round(f, [1, 2], [4, 5]);
  assert.equal(f.enemyHits, before.hits + 2); assert.equal(f.player.ttp, before.ttp);
  assert.notEqual(f.phantom.phase, 'feeding');
});
test('two automatically won Freeze Time rounds can knock out the boxer', () => {
  const f = act(begin({boxing:true}, {freeze:true}), 'freeze');
  assert.equal(f.round, 2); assert.equal(f.result, 'win');
});
test('boxing uses TTP to lower the enemy roll, and two consecutive scoring rounds knock out', () => {
  let f = round(begin({boxing:true, enemyBonus:3}), [4, 5], [3, 4], {boost:2});
  assert.equal(f.playerHits, 1); assert.equal(f.player.ttp, 8); assert.equal(f.result, null);
  f = round(f, [4, 5], [2, 3]); assert.equal(f.result, 'win');
  const simultaneous = round(begin({boxing:true}), [2, 2], [3, 3]);
  assert.equal(simultaneous.result, 'draw', 'simultaneous knockouts do not fabricate a victory');
});
test('gunfight keeps independent wounds and prevents incapacitated enemies from firing', () => {
  let f = begin({gunfight:true});
  const shot = (pair, options = {}) => act(act(f, 'roll', {dice:{shot:pair, dodge:[4, 5]}}), 'resolve', options);
  f = shot([2, 2]); assert.equal(f.gun.wounds[0], 2);
  f = shot([6, 1]); f = shot([1, 2]); f = shot([1, 2]);
  assert.equal(f.gun.phase, 'enemy'); assert.equal(f.gun.index, 1);
  f = shot([6, 3]); assert.equal(f.gun.playerWounds, 0, 'equal dodge succeeds');
  assert.equal(f.gun.wounds[1], 1);
});
test('gunfight dodges can be boosted after seeing dice; two wounds or one double incapacitate', () => {
  let f = begin({gunfight:true});
  for (let i = 0; i < 4; i++) f = act(act(f, 'roll', {dice:{shot:[1, 2]}}), 'resolve');
  f = act(act(f, 'roll', {dice:{shot:[6, 3], dodge:[3, 4]}}), 'resolve', {boost:2});
  assert.equal(f.gun.playerWounds, 0); assert.equal(f.player.ttp, 8);
  f = act(act(f, 'roll', {dice:{shot:[2, 2], dodge:[1, 2]}}), 'resolve');
  assert.equal(f.result, 'loss');
  let win = begin({gunfight:true});
  for (let i = 0; i < 4; i++) win = act(act(win, 'roll', {dice:{shot:[2, 2]}}), 'resolve');
  assert.equal(win.result, 'win');
});
test('stale actions, invalid dice and oversized custom fights cannot modify state', () => {
  const f = begin();
  assert.throws(() => combatAction(f, {kind:'roll', expectedRevision:2}));
  assert.throws(() => act(f, 'roll', {dice:{player:[0, 7]}}));
  assert.throws(() => normalizeEncounter({name:'X', rounds:7}));
  assert.equal(f.revision, 0);
});
test('rewind checkpoints remain flat and bounded through repeated roll rewinds', () => {
  let f = begin({}, {ttp:1000, maxTtp:1000, reducer:true});
  for (let i = 0; i < 150; i++) {f = round(f); f = act(f, 'rewind', {scope:'roll'});}
  assert.equal(f.player.ttp, 850); assert.equal(f.round, 0);
  assert.ok(JSON.stringify(f).length < 12000);
  for (const checkpoint of Object.values(f.checkpoints)) assert.equal(checkpoint.state.checkpoints, undefined);
});
