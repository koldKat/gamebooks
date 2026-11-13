import test from 'node:test';
import assert from 'node:assert/strict';
import {startFight, combatAction} from '../../../public/js/battlesim/books/592/combat.js';

const opponent = (hp = 5, rounds = 6, injury = 2) => ({name:'Guard', hp, rounds, injury});
const encounter = (rules = {}, profiles = [opponent()]) => ({key:'custom', name:'Guards', profiles, rules});
const start = (rules = {}, options = {}, profiles, hp = 12) => startFight({hp}, encounter(rules, profiles), options);
const attack = (fight, target, threshold, ...dice) => combatAction(fight,
  {kind:'attack', target, attack:threshold, expectedRevision:fight.revision}, () => dice.shift());

test('chosen 7+/9+/11+ gives1/3/5CP, including the last permitted round', () => {
  assert.equal(attack(start(), 0, 7, 6, 6).core.enemies[0].hp, 4);
  assert.equal(attack(start(), 0, 9, 6, 6).core.enemies[0].hp, 2);
  assert.equal(attack(start({}, {}, [opponent(5, 1)]), 0, 11, 6, 5).status, 'win');
});
test('living guards damage together, armor is subtracted per guard, and goblins damage only from the target', () => {
  const profiles = [opponent(2, 4, 3), opponent(2, 4, 2), opponent(3, 4, 2)];
  const options = {equipment:{armor:'leather'}};
  assert.equal(attack(start({damageMode:'all'}, options, profiles), 0, 9, 1, 2).player.hp, 8);
  assert.equal(attack(start({}, options, profiles), 0, 9, 1, 2).player.hp, 10);
  let f = attack(start({damageMode:'all'}, options, profiles), 0, 9, 6, 6);
  f = attack(f, 1, 9, 1, 2); assert.equal(f.player.hp, 10);
  assert.deepEqual(f.core.enemies.map(row => row.rounds), [3, 3, 4]);
});
test('chainmail-only and no-defense encounters retain their printed armor exceptions', () => {
  assert.equal(attack(start({armorRule:'chainmail'}, {equipment:{armor:'leather'}}), 0, 9, 1, 2).player.hp, 10);
  assert.equal(attack(start({armorRule:'chainmail'}, {equipment:{armor:'chainmail'}}), 0, 9, 1, 2).player.hp, 11);
  assert.equal(attack(start({armorRule:'none'}, {equipment:{armor:'chainmail'}}), 0, 9, 1, 2).player.hp, 10);
});
test('shadow confirmation consumes a round without inventing enemy damage on a successful attack', () => {
  const f = attack(start({confirmHit:true}), 0, 11, 6, 5, 2);
  assert.equal(f.core.enemies[0].hp, 5); assert.equal(f.player.hp, 12);
  assert.equal(f.core.rounds, 1); assert.equal(f.events[0].confirmation, 2);
  assert.equal(attack(start({confirmHit:true}), 0, 11, 6, 5, 4).status, 'win');
});
test('the staff bypasses armor on doubles and death precedes simultaneous victory', () => {
  const f = attack(start({staffThreat:true}, {equipment:{armor:'chainmail'}}, [opponent()], 1), 0, 11, 6, 6);
  assert.equal(f.core.enemies[0].hp, 0); assert.equal(f.player.hp, 0); assert.equal(f.status, 'loss');
  assert.equal(attack(start({staffThreat:true}, {equipment:{staff:false}}), 0, 7, 4, 4).player.hp, 12);
});
test('Pustula uses a separate failed-round die and doubles damage before armor', () => {
  const options = {equipment:{armor:'chainmail'}};
  assert.equal(attack(start({evenDamageDouble:true}, options), 0, 9, 1, 2, 4).player.hp, 9);
  assert.equal(attack(start({evenDamageDouble:true}, options), 0, 9, 1, 2, 3).player.hp, 11);
  assert.equal(attack(start({doubleOnMiss:true}, options), 0, 9, 2, 2).player.hp, 9);
  assert.equal(attack(start({doubleOnMiss:true}, options), 0, 7, 4, 4).player.hp, 12);
});
test('silver bracelet rescue follows four survived rounds without changing campaign items', () => {
  let f = start({rescueAfter:4, rescueRoute:217}, {equipment:{bracelet:true}}, [opponent(20, 6, 0)]);
  for (let n = 0; n < 4; n++) f = attack(f, 0, 7, 1, 2);
  assert.equal(f.status, 'win'); assert.equal(f.destination, 217); assert.equal(f.core.resolution, 'rescued');
});
test('Gold Ring and weapon penalties affect the combat roll without adding a foreign unarmed health rule', () => {
  assert.equal(attack(start({}, {equipment:{goldRing:true}}), 0, 7, 3, 3).events[0].total, 7);
  const f = attack(start({withoutFlyntPenalty:true}, {equipment:{flynt:false}}), 0, 7, 4, 4);
  assert.equal(f.events[0].total, 7); assert.equal(f.player.hp, 12);
});
test('archery tracks wound halves, spends every arrow, and allows victory with the last arrow', () => {
  const e = {key:'bow', name:'Beasts', mode:'archery', profiles:[opponent()], rules:{arrows:2, skillThreshold:8, win:139, loss:38}};
  let f = startFight({hp:9}, e, {skill:7, equipment:{goldRing:true}});
  const shot = (f, value) => combatAction(f, {kind:'shoot', target:0, expectedRevision:f.revision}, () => value);
  f = shot(f, 4); assert.equal(f.targets[0].hp, 1); assert.equal(f.arrows, 1);
  f = shot(f, 4); assert.equal(f.status, 'win'); assert.equal(f.destination, 139); assert.equal(f.arrows, 0);
  f = shot(startFight({hp:9}, e, {skill:7, equipment:{goldRing:true}}), 3);
  assert.equal(f.targets[0].hp, 2, 'Gold Ring does not change archery');
  assert.equal(shot(startFight({hp:9}, e, {skill:8}), 5).status, 'win');
});
test('Wowl uses only surviving beasts and counts three bites, without rewriting the player sheet', () => {
  const e = {key:'38', name:'Winged beasts', mode:'wowl', rules:{win:139, loss:41}};
  const defend = (f, value) => combatAction(f, {kind:'defend', expectedRevision:f.revision}, () => value);
  assert.equal(defend(startFight({hp:8}, e, {remaining:1}), 2).status, 'win');
  let f = startFight({hp:8}, e);
  for (let n = 0; n < 3; n++) f = defend(f, 1);
  assert.equal(f.status, 'loss'); assert.equal(f.destination, 41); assert.equal(f.player.hp, 8);
});
test('invalid/stale actions do not mutate saved fights', () => {
  const f = start(), before = structuredClone(f);
  assert.throws(() => combatAction(f, {kind:'attack', target:0, attack:7, expectedRevision:1}));
  assert.throws(() => attack(f, 0, 8, 6, 6));
  assert.throws(() => attack(f, 0, 7, 0, 6));
  assert.deepEqual(f, before);
});
