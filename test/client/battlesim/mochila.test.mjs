import test from 'node:test';
import assert from 'node:assert/strict';
import {startFight, combatAction as act, parseRange} from '../../../public/js/battlesim/books/1307/combat.js';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {getRosterRows} = require('../../helpers/roster-db.cjs');
const roster = getRosterRows(1307).map(row => row.stats.entry);
const enemy = key => roster.find(row => row.key === key);
const player = overrides => ({hp:15, attackMin:7, ammo:6, reserve:2, weapon:'gun', ...overrides});
const dice = (...values) => () => {assert.ok(values.length, 'Unexpected extra roll'); return values.shift();};
const attack = (fight, values, enemyValues = []) => act(act(fight, 'attack', dice(...values)), 'resolve', dice(...enemyValues));

test('Mochila installed roster matches all ten photographed encounter variants', () => {
  assert.equal(roster.length, 10);
  assert.deepEqual(parseRange(enemy('snake-69').range), [3,4,5,9,10,11]);
  assert.equal(enemy('bear-42').damage, 4);
  assert.equal(enemy('rider-77').damage, 5);
  assert.equal(enemy('rider-p117').damage, 6);
  assert.equal(enemy('rider-p125').noInstant, true);
  assert.throws(() => parseRange('1-13'));
  assert.throws(() => parseRange('7-2'));
});
test('Mochila firearm instant victory prevents retaliation; knife twelve is ordinary damage', () => {
  let f = attack(startFight(player(), enemy('bear-42')), [6,6]);
  assert.equal(f.status, 'win'); assert.equal(f.player.hp, 15); assert.equal(f.player.ammo, 5);
  f = attack(startFight(player({weapon:'knife'}), enemy('bear-42')), [6,6], [3,3]);
  assert.equal(f.opponent.hp, 13); assert.equal(f.player.hp, 11); assert.equal(f.player.ammo, 6);
});
test('Mochila marksman cannot bypass rider immunity and necklace reduces supernatural hits only', () => {
  let f = attack(startFight(player({marksman:true,necklace:true}), enemy('rider-77')), [5,6], [3,3]);
  assert.equal(f.status, 'fighting'); assert.equal(f.opponent.hp, 13); assert.equal(f.player.hp, 11);
  f = attack(startFight(player({marksman:true}), enemy('bear-42')), [5,6]);
  assert.equal(f.status, 'win');
});
test('Mochila fanning narrows each shot and allows stopping without spending another round', () => {
  let f = startFight(player({fanning:true}), enemy('rider-p125'));
  f = attack(f, [3,4]); assert.equal(f.phase, 'fan'); assert.equal(f.opponent.hp, 13);
  f = act(f, 'attack', dice(3,4)); assert.equal(f.pending.hit, false);
  f = act(f, 'resolve'); assert.equal(f.phase, 'fan');
  f = act(f, 'endTurn', dice(1,1));
  assert.equal(f.round, 2); assert.equal(f.player.ammo, 4); assert.equal(f.opponent.hp, 13);
});
test('Mochila bandana rerolls once without consuming another bullet', () => {
  let f = act(startFight(player({bandana:true}), enemy('bear-42')), 'attack', dice(1,1));
  f = act(f, 'reroll', dice(6,6));
  assert.equal(f.player.ammo, 5); assert.equal(f.player.bandanaUsed, true);
  assert.throws(() => act(f, 'reroll', dice(1,1)));
  f = act(f, 'resolve'); assert.equal(f.status, 'win');
});
test('Mochila silver revolver deals nine damage and consumes only silver bullets', () => {
  let f = startFight(player({weapon:'silverGun', silverAmmo:6}), enemy('rider-p125'));
  f = attack(f, [4,4], [1,1]);
  assert.equal(f.opponent.hp, enemy('rider-p125').hp - 9);
  assert.equal(f.player.silverAmmo, 5);
  assert.equal(f.player.ammo, 6);
  assert.equal(f.player.reserve, 2);
  assert.equal(f.player.weapon, 'silverGun');
  assert.throws(() => startFight(player({weapon:'silverGun',silverAmmo:7}), enemy('bear-42')));
  f = startFight(player({weapon:'silverGun',silverAmmo:0}), enemy('bear-42'));
  assert.equal(f.player.weapon, 'knife');
});
test('Mochila last silver bullet ends fanning and switches to knife without spending normal ammunition', () => {
  let f = startFight(player({weapon:'silverGun',silverAmmo:1,fanning:true}), enemy('rider-p125'));
  f = attack(f, [4,4], [1,1]);
  assert.equal(f.opponent.hp, enemy('rider-p125').hp - 9);
  assert.equal(f.player.silverAmmo, 0);
  assert.equal(f.player.ammo, 6);
  assert.equal(f.player.weapon, 'knife');
  assert.equal(f.phase, 'attack');
  f = attack(f, [4,4], [1,1]);
  assert.equal(f.opponent.hp, enemy('rider-p125').hp - 11);
});
test('Mochila silver revolver supports bandana, fanning and instant victory', () => {
  let f = startFight(player({weapon:'silverGun',silverAmmo:6,fanning:true,bandana:true}), enemy('bear-42'));
  f = act(f, 'attack', dice(1,1));
  f = act(f, 'reroll', dice(4,4));
  assert.equal(f.player.silverAmmo, 5);
  f = act(f, 'resolve');
  assert.equal(f.phase, 'fan'); assert.equal(f.opponent.hp, 6);
  f = attack(f, [6,6]);
  assert.equal(f.status, 'win'); assert.equal(f.player.silverAmmo, 4);
  assert.equal(f.player.ammo, 6);
});
test('Mochila third fanning shot exhausts the cylinder and finishes the round', () => {
  let f = startFight(player({ammo:3,fanning:true}), enemy('rider-p125'));
  f = attack(f, [1,1]); f = attack(f, [1,1]);
  f = attack(f, [4,4], [1,1]);
  assert.equal(f.opponent.hp, 18); assert.equal(f.phase, 'attack');
  assert.equal(f.player.ammo, 0); assert.equal(f.player.weapon, 'knife');
  assert.equal(f.round, 2);
});
test('Mochila empty revolver switches to knife and never reloads during a fight', () => {
  let f = attack(startFight(player({ammo:1}), enemy('rider-p125')), [1,1], [1,1]);
  assert.equal(f.player.weapon, 'knife'); assert.equal(f.player.reserve, 2);
  assert.throws(() => act(f, 'reload'));
  f = attack(f, [6,6], [1,1]); assert.equal(f.opponent.hp, 16);
});
test('Mochila nonlethal Ben and retreating cougar stop at their printed thresholds', () => {
  let f = startFight(player(), enemy('ben'));
  assert.equal(f.player.weapon, 'knife');
  for (let n = 0; n < 4; n++) f = attack(f, [4,4], n === 3 ? [] : [1,1]);
  assert.equal(f.status, 'win'); assert.equal(f.opponent.hp, 1);
  f = startFight(player({weapon:'knife'}), enemy('cougar-61'));
  for (let n = 0; n < 8; n++) f = attack(f, [1,1], [1,1]);
  assert.equal(f.status, 'win'); assert.equal(f.round, 8); assert.equal(f.opponent.hp, 12);
});
test('Mochila sheriff uses five rounds then waits for missing printed melee values', () => {
  let f = startFight(player({weapon:'knife'}), enemy('sheriff-40'));
  for (let n = 0; n < 5; n++) f = attack(f, [1,1], [6,6]);
  assert.equal(f.opponent.ammo, 0);
  f = attack(f, [1,1]); assert.equal(f.phase, 'enemySetup'); assert.equal(f.status, 'fighting');
  f = act(f, 'setEnemyMelee', dice(3,3), {range:'5-7',damage:2});
  assert.equal(f.player.hp, 13); assert.equal(f.phase, 'attack');
});
test('Mochila lethal retaliation stops combat and source inputs are never mutated', () => {
  const p = player({hp:1}), e = enemy('bear-42'), before = JSON.stringify([p,e]);
  const f = attack(startFight(p,e), [1,1], [3,3]);
  assert.equal(f.status, 'loss'); assert.equal(f.player.hp, 0);
  assert.throws(() => act(f, 'attack'));
  assert.equal(JSON.stringify([p,e]), before);
});
