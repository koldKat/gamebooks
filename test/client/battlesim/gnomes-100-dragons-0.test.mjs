import test from 'node:test';
import assert from 'node:assert/strict';
import { combatAction, startArmyBattle, startEncounter } from '../../../public/js/battlesim/books/1686/combat.js';

const foe = (extra = {}) => ({ name: 'Metal warrior', hp: 40, hit: 6, damage: 3, ...extra });
const fightWith = (profiles, player = { hp: 10, armor: 40 }) =>
  startEncounter(player, { name: 'Encounter', section: '28', profiles });
const round = (fight, dice, effects = {}) =>
  combatAction(fight, { kind: 'round', revision: fight.revision, dice, ...effects });

test('Rye attacks first and armor damage scales from five to seven to ten', () => {
  let fight = fightWith([foe()]);
  for (const damage of [5, 7, 10]) {
    const previous = fight.enemies[0].hp;
    fight = round(fight, { player: 8, enemy: 6 });
    assert.equal(fight.enemies[0].hp, previous - damage);
  }
  assert.equal(fight.player.armor, 31);
  assert.equal(fight.player.hp, 10);
});

test('Steam armor takes the initial damage and loss of armor changes the next attack', () => {
  let fight = fightWith([foe()], { hp: 10, armor: 1 });
  fight = round(fight, { player: 9, enemy: 6 });
  assert.deepEqual(fight.player, { hp: 8, armor: 0 });
  fight = round(fight, { player: 3, enemy: 7 });
  assert.equal(fight.enemies[0].hp, 39);
  assert.equal(fight.player.hp, 8);
});

test('Ordered foes do not counterattack after being defeated', () => {
  let fight = fightWith([foe({ hp: 4 }), foe({ hp: 9 })]);
  fight = round(fight, { player: 1, enemy: 1 });
  assert.equal(fight.currentEnemy, 1);
  assert.equal(fight.player.armor, 40);
  fight = round(fight, { player: 1, enemy: 12 });
  assert.equal(fight.enemies[1].hp, 4);
  fight = round(fight, { player: 1, enemy: 1 });
  assert.equal(fight.status, 'win');
});

test('General poison bypasses armor and ends with the enemy', () => {
  let fight = fightWith([foe({ hp: 5, poisonOnHit: true })]);
  fight = round(fight, { player: 12, enemy: 1 });
  assert.deepEqual(fight.player, { hp: 9, armor: 37 });
  fight = round(fight, { player: 1, enemy: 1 });
  assert.equal(fight.status, 'win');
  assert.equal(fight.player.hp, 9);
  assert.equal(fight.poisoned, false);
});

test('Imp tail outcomes and throwing damage follow the printed tactics', () => {
  const close = fightWith([foe({ impTactic: 'close' })]);
  assert.deepEqual(round(close, { player: 12, enemy: 1, tail: 8 }).player, { hp: 10, armor: 40 });
  assert.deepEqual(round(close, { player: 12, enemy: 1, tail: 9 }).player, { hp: 6, armor: 40 });
  const throwing = round(fightWith([foe({ impTactic: 'throw' })]), { player: 1, enemy: 1, tail: 11 });
  assert.equal(throwing.enemies[0].hp, 37);
  assert.deepEqual(throwing.player, { hp: 5, armor: 37 });
});

test('An enemy with a hit limit defeats Rye regardless of remaining armor', () => {
  let fight = fightWith([foe({ damage: 0, hitsToWin: 3 })]);
  for (let i = 0; i < 3; i++) fight = round(fight, { player: 12, enemy: 1 });
  assert.equal(fight.status, 'loss');
  assert.equal(fight.player.armor, 40);
  assert.throws(() => round(fight, { player: 1 }), /Inactive combat action/);
});

test('The final battle has a free first hit followed by the printed opposed thresholds', () => {
  const dragonarmy = { name: 'Dragonarmy', offense: 45, defense: 30 };
  let fight = startArmyBattle({ offense: 60, defense: 20 }, dragonarmy);
  fight = round(fight, {});
  assert.equal(fight.enemies[0].hp, 170);
  assert.equal(fight.player.hp, 100);
  fight = round(fight, { player: 8, enemy: 7 });
  assert.equal(fight.enemies[0].hp, 140);
  assert.equal(fight.player.hp, 75);
  assert.equal(startArmyBattle({ offense: 60, defense: 46 }, dragonarmy).status, 'win');
  assert.equal(startArmyBattle({ offense: 29, defense: 20 }, dragonarmy).status, 'loss');
});
