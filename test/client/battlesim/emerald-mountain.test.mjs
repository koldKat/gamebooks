import test from 'node:test';
import assert from 'node:assert/strict';
import * as combat from '../../../public/js/battlesim/books/857/combat.js';
import { ENCOUNTERS, encounterPreset } from '../../../public/js/battlesim/books/857/definition.js';
import { createState } from '../../../public/js/battlesim/books/857/state.js';
import bg from '../../../public/js/i18n/bg/battlesim/battlesim857.js';
import en from '../../../public/js/i18n/en/battlesim/battlesim857.js';

test('both dictionaries have matching keys and placeholders', () => {
  assert.deepEqual(Object.keys(bg).sort(), Object.keys(en).sort());
  const fields = value => [...value.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
  for (const key of Object.keys(bg)) assert.deepEqual(fields(bg[key]), fields(en[key]), key);
});

const custom = changes => ({displayName: 'Custom', combat: 0, movement: 0, hp: 30, damage: 1, armour: 1, ...changes});
const start = (changes = {}, opponent = custom(), dice = {playerDie: 6, enemyDie: 1}) => combat.startFight({...combat.newCharacter(), ...changes}, [opponent], dice);

test('source character and both real encounters retain printed stats, not tutorial values', () => {
  assert.deepEqual(combat.newCharacter(), {combat: 2, movement: 0, life: 10, damage: 2, armour: 1, gold: 30});
  assert.deepEqual(ENCOUNTERS.map(e => [e.id,e.combat,e.movement,e.hp,e.damage,e.armour]), [['8',1,0,8,1,0],['16',2,1,12,0,0]]);
  const preset = encounterPreset('8'); preset.hp = 1;
  assert.equal(encounterPreset('8').hp, 8);
});
test('printed worked example uses counterattack difference and armour, then full attack total', () => {
  const fight = start({}, custom({hp: 5, movement: 1}), {playerDie: 3, enemyDie: 3});
  assert.equal(fight.actor, 'enemy');
  const defended = combat.playAttack(fight, {playerDie: 3, enemyDie: 4});
  assert.equal(defended.enemies[0].hp, 3);
  assert.equal(defended.character.life, 10);
  assert.equal(defended.actor, 'player');
  const attack = combat.playAttack(defended, {playerDie: 4, enemyDie: 4});
  assert.equal(attack.outcome, 'win');
  assert.equal(attack.events.find(e => e.kind === 'damage').dealt, 7);
  assert.equal(fight.enemies[0].hp, 5);
});
test('successful enemy attack uses its total, while a defended player attack permits a counterattack', () => {
  const enemy = combat.playAttack(start({}, custom(), {playerDie: 1, enemyDie: 6}), {playerDie: 1, enemyDie: 6});
  assert.equal(enemy.character.life, 4);
  const counter = combat.playAttack(start(), {playerDie: 1, enemyDie: 6});
  assert.equal(counter.character.life, 7);
});
test('unspecified initiative ties wait for an explicit choice', () => {
  const tied = start({}, custom(), {playerDie: 3, enemyDie: 3});
  assert.equal(tied.actor, null);
  assert.throws(() => combat.playAttack(tied));
  assert.equal(combat.chooseInitiative(tied, 'enemy').actor, 'enemy');
  assert.equal(tied.actor, null);
  assert.throws(() => combat.chooseInitiative(tied, 'other'));
});
test('unspecified attack ties require explicit manual resolution and preserve dice', () => {
  const tied = combat.playAttack(start(), {playerDie: 2, enemyDie: 4});
  assert.equal(tied.pendingTie, true);
  assert.equal(tied.attacks, 0);
  assert.throws(() => combat.playAttack(tied));
  const resolved = combat.resolveTie(tied, {dealt: 0, received: 0});
  assert.equal(resolved.attacks, 1);
  assert.equal(resolved.actor, 'enemy');
  assert.equal(resolved.character.life, 10);
  assert.equal(resolved.enemies[0].hp, 30);
  assert.throws(() => combat.resolveTie(resolved));
});
test('armour cannot heal, zero LIFE has death priority and abandonment grants no outcome', () => {
  const armoured = combat.playAttack(start({armour: 100}, custom(), {playerDie: 1, enemyDie: 6}), {playerDie: 1, enemyDie: 6});
  assert.equal(armoured.character.life, 10);
  const tied = combat.playAttack(start({life: 1}), {playerDie: 2, enemyDie: 4});
  const dead = combat.resolveTie(tied, {dealt: 30, received: 1});
  assert.equal(dead.outcome, 'loss');
  assert.equal(dead.character.life, 0);
  assert.throws(() => combat.playAttack(dead));
  assert.equal(combat.abandon(start()).outcome, 'abandoned');
});
test('custom consecutive opponents preserve LIFE and roll a new initiative after a victory', () => {
  const fight = combat.startFight(combat.newCharacter(), [custom({hp: 1}), custom()], {playerDie: 6, enemyDie: 1});
  const next = combat.playAttack(fight, {playerDie: 6, enemyDie: 1}, () => 2);
  assert.equal(next.target, 1);
  assert.equal(next.character.life, 10);
  assert.equal(next.actor, null);
  assert.equal(next.outcome, null);
});
test('validation rejects bad dice, missing opponents and dead characters without mutation', () => {
  const fight = start();
  assert.throws(() => combat.playAttack(fight, {playerDie: 7, enemyDie: 1}));
  assert.throws(() => start({life: 0}));
  assert.throws(() => start({}, custom({displayName: ''})));
  assert.throws(() => combat.startFight(combat.newCharacter(), []));
  assert.equal(fight.attacks, 0);
});
test('saved outcomes are awarded once and stale run writes are rejected', () => {
  const run = {}, other = {};
  let live = run, saves = 0;
  const store = createState(() => ({currentBookId: 857, currentPlaythrough: () => live, saveState: () => saves++}));
  store.change(data => {data.character = combat.newCharacter();});
  store.change(data => {data.fight = combat.playAttack(start({}, custom({hp: 1})), {playerDie: 6, enemyDie: 1});});
  store.change(() => {});
  assert.equal(run.sim857.history.length, 1);
  const before = JSON.stringify(run);
  assert.equal(store.change(data => {data.character.gold = 999; live = other;}), false);
  assert.equal(JSON.stringify(run), before);
  assert.equal(other.sim857, undefined);
  assert.equal(saves, 3);
});
