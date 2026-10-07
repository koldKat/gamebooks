import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMarshFight, rollMarshRound, settleMarshRound, escapeMarshTree, escapeMarshCanoe } from '../../../public/js/battlesim/engines/skyfall/marsh-combat.js';

const player = (overrides = {}) => ({ expertise: 12, vitality: 20, fortune: 10, weaponDamage: 2, ...overrides });
const coins = (...heads) => {
  const values = heads.flatMap(count => Array.from({ length: 4 }, (_, i) => i < count ? 0.1 : 0.9));
  let index = 0;
  return () => {
    assert.ok(index < values.length, 'Unexpected coin toss');
    return values[index++];
  };
};

test('a pending roll cannot be rerolled by closing or reopening the panel', () => {
  const fight = createMarshFight(16, player());
  const roll = rollMarshRound(fight, 0, coins(4, 0));
  assert.equal(rollMarshRound(fight, 0, () => { throw Error('Rerolled'); }), null);
  assert.deepEqual(JSON.parse(JSON.stringify(fight)).pending, roll);
});

test('ordinary ties do not advance rounds or spend Fortune', () => {
  const fight = createMarshFight(16, player({ expertise: 13 }));
  rollMarshRound(fight, 0, coins(2, 2));
  assert.equal(settleMarshRound(fight, { attackBonus: true, defensePoints: 3 }).result, 'tie');
  assert.equal(fight.round, 0);
  assert.equal(fight.player.fortune, 10);
  assert.equal(fight.player.vitality, 20);
});

test('sequential enemies cannot attack together or be selected out of order', () => {
  const fight = createMarshFight(41, player({ expertise: 10 }));
  assert.throws(() => rollMarshRound(fight, 1), RangeError);
  rollMarshRound(fight, 0, coins(1, 1));
  settleMarshRound(fight);
  assert.equal(fight.round, 0);
  rollMarshRound(fight, 0, coins(4, 0));
  settleMarshRound(fight);
  assert.deepEqual(fight.encounter.foes.map(foe => foe.vitality), [3, 5]);
});

test('Hydra rolls player once, permits one strike, and resolves every higher head', () => {
  const fight = createMarshFight(14, player());
  const roll = rollMarshRound(fight, 3, coins(2, 0, 1, 2, 3, 4, 2, 1));
  assert.equal(roll.hits.length, 1);
  assert.equal(roll.enemyDamage, 4);
  settleMarshRound(fight, { attackBonus: true, defensePoints: 2 });
  assert.equal(fight.player.vitality, 18);
  assert.equal(fight.player.fortune, 7);
  assert.deepEqual(fight.encounter.foes.map(foe => foe.vitality), [4, 4, 4, 1, 4, 4, 4]);
});

test('only one offensive Fortune point may be added across a group round', () => {
  const fight = createMarshFight(37, player());
  rollMarshRound(fight, 0, coins(4, 0, 0, 0, 0));
  settleMarshRound(fight, { attackBonus: true, bonusHit: 2 });
  assert.deepEqual(fight.encounter.foes.map(foe => foe.vitality), [12, 12, 11, 12]);
  assert.equal(fight.player.fortune, 9);
});

test('underwater breathing replaces every fourth round and counts all survivors', () => {
  const fight = createMarshFight(88, player());
  fight.round = 3;
  fight.encounter.foes[0].vitality = 0;
  const roll = rollMarshRound(fight, 1, () => { throw Error('No combat rolls while surfacing'); });
  assert.equal(roll.enemyDamage, 6);
  assert.deepEqual(roll.hits, []);
  settleMarshRound(fight, { defensePoints: 2 });
  assert.equal(fight.round, 4);
  assert.equal(fight.player.vitality, 16);
  assert.equal(fight.player.fortune, 8);
});

test('Sphinx inflicts eight damage for two successful paws, not four', () => {
  const fight = createMarshFight(94, player());
  fight.round = 2;
  const roll = rollMarshRound(fight, 0, coins(0, 4, 4));
  assert.equal(roll.enemyDamage, 8);
  settleMarshRound(fight);
  assert.equal(fight.player.vitality, 12);
});

test('Zombie all-tails grab still happens when player Expertise beats the Zombie', () => {
  const fight = createMarshFight(149, player());
  const roll = rollMarshRound(fight, 0, coins(0, 0));
  assert.equal(roll.hits.length, 1);
  assert.equal(roll.enemyDamage, 1);
  settleMarshRound(fight);
  assert.equal(fight.player.vitality, 19);
  assert.equal(fight.encounter.foes[0].vitality, 6);
});

test('non-cutting weapons and offensive Fortune cannot damage Zombies', () => {
  const fight = createMarshFight(149, player(), { cuttingWeapon: false });
  rollMarshRound(fight, 0, coins(4, 0));
  settleMarshRound(fight, { attackBonus: true });
  assert.equal(fight.encounter.foes[0].vitality, 8);
  assert.equal(fight.player.fortune, 10);
});

test('Spider poison must be paid even if Fortune cancels all bite damage', () => {
  const fight = createMarshFight(75, player({ expertise: 0, fortune: 2 }));
  rollMarshRound(fight, 0, coins(0, 0));
  settleMarshRound(fight, { defensePoints: 2 });
  assert.equal(fight.player.fortune, 0);
  assert.equal(fight.player.vitality, 19);
  const doomed = createMarshFight(75, player({ expertise: 0, fortune: 0 }));
  rollMarshRound(doomed, 0, coins(0, 0));
  settleMarshRound(doomed);
  assert.equal(doomed.status, 'loss');
});

test('halberd flank protection costs two Fortune for the whole group', () => {
  const fight = createMarshFight(376, player(), { count: 5 });
  rollMarshRound(fight, 0, coins(4, 0));
  settleMarshRound(fight, { blockFlanks: true });
  assert.equal(fight.player.vitality, 20);
  assert.equal(fight.player.fortune, 8);
  const unprotected = createMarshFight(376, player({ fortune: 1 }), { count: 5 });
  rollMarshRound(unprotected, 0, coins(4, 0));
  settleMarshRound(unprotected, { blockFlanks: true });
  assert.equal(unprotected.player.vitality, 8);
  assert.equal(unprotected.player.fortune, 1);
});

test('archers cannot be struck back and run out after fifteen volleys', () => {
  const fight = createMarshFight(217, player({ expertise: 30 }), { count: 2 });
  for (let i = 0; i < 15; i++) {
    rollMarshRound(fight, 0, coins(0, 4, 4));
    settleMarshRound(fight, { attackBonus: true });
  }
  assert.equal(fight.status, 'survived');
  assert.equal(fight.player.fortune, 10);
  assert.deepEqual(fight.encounter.foes.map(foe => foe.vitality), [14, 14]);
});

test('killing an enemy and dying in the same group round is a loss', () => {
  const fight = createMarshFight(14, player({ vitality: 1 }));
  fight.encounter.foes.forEach((foe, i) => { foe.vitality = i < 2 ? 1 : 0; });
  rollMarshRound(fight, 0, coins(2, 0, 4));
  settleMarshRound(fight);
  assert.equal(fight.status, 'loss');
});

test('crocodile escape pays Fortune and applies a free bite from every survivor', () => {
  const fight = createMarshFight(369, player());
  assert.equal(escapeMarshCanoe(fight), false);
  fight.encounter.foes[0].vitality = 0;
  assert.equal(escapeMarshTree(fight), true);
  assert.equal(fight.player.fortune, 7);
  assert.equal(fight.player.vitality, 0);
  assert.equal(fight.status, 'loss');
  const canoe = createMarshFight(369, player());
  canoe.encounter.foes.slice(0, 7).forEach(foe => { foe.vitality = 0; });
  assert.equal(escapeMarshCanoe(canoe), true);
  assert.equal(canoe.status, 'escaped-canoe');
});

test('new encounters do not reset character values or modify the supplied character', () => {
  const input = player({ vitality: 7, fortune: 3 });
  const fight = createMarshFight(16, input);
  rollMarshRound(fight, 0, coins(4, 0));
  settleMarshRound(fight);
  assert.deepEqual(input, player({ vitality: 7, fortune: 3 }));
  assert.equal(fight.player.vitality, 7);
});

test('surprise penalty survives a tied round without another three-coin toss', () => {
  const fight = createMarshFight(27, player({ expertise: 8 }));
  const values = [0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.1, 0.9, 0.9, 0.9, 0.9];
  let index = 0;
  rollMarshRound(fight, 0, () => values[index++]);
  assert.equal(settleMarshRound(fight).result, 'tie');
  assert.equal(fight.round, 0);
  const roll = rollMarshRound(fight, 0, coins(4, 0));
  assert.equal(roll.penalties[0], 2);
  settleMarshRound(fight);
  assert.equal(fight.round, 1);
});

test('Eagle missed attacks spend Fortune and a fall is not falsely recorded as a win', () => {
  const fight = createMarshFight(32, player({ expertise: 10, fortune: 0 }));
  rollMarshRound(fight, 0, coins(0, 0));
  settleMarshRound(fight);
  assert.equal(fight.status, 'fall');
  assert.equal(fight.player.vitality, 15);
});

test('Druid transforms on a tied attack and permits exactly one final blow', () => {
  const fight = createMarshFight(139, player({ expertise: 12 }));
  // Three heads: surprise penalty zero; both attack scores 12.
  rollMarshRound(fight, 0, () => 0.1);
  settleMarshRound(fight);
  assert.equal(fight.transformed, true);
  assert.equal(fight.surpriseActive, false);
  rollMarshRound(fight, 0, coins(4, 0));
  settleMarshRound(fight);
  assert.equal(fight.status, 'loss');
  assert.equal(fight.player.vitality, 0);
});

test('Druid can be killed by the final blow without the spell firing', () => {
  const fight = createMarshFight(139, player());
  fight.transformed = true;
  fight.encounter.foes[0].vitality = 2;
  rollMarshRound(fight, 0, coins(4, 0));
  settleMarshRound(fight);
  assert.equal(fight.status, 'win');
});

test('Hippogriff awards three Fortune immediately after each sequential kill', () => {
  const fight = createMarshFight(201, player({ weaponDamage: 11, fortune: 0 }), { count: 2 });
  rollMarshRound(fight, 0, coins(4, 0));
  settleMarshRound(fight);
  assert.equal(fight.player.fortune, 3);
  assert.equal(fight.status, 'fighting');
  rollMarshRound(fight, 1, coins(4, 0));
  settleMarshRound(fight);
  assert.equal(fight.player.fortune, 6);
  assert.equal(fight.status, 'win');
});

test('Assassin first-round bare hands cannot gain normal sword damage', () => {
  const fight = createMarshFight(28, player({ expertise: 30 }));
  rollMarshRound(fight, 0, () => 0.1);
  settleMarshRound(fight);
  assert.equal(fight.encounter.foes[0].vitality, 6);
  rollMarshRound(fight, 0, coins(0, 0));
  settleMarshRound(fight);
  assert.equal(fight.encounter.foes[0].vitality, 5);
});

test('ambush uses armed companions and never permits a first-round counterattack', () => {
  const fight = createMarshFight(170, player({ expertise: 0 }), { companions: [{ damage: 2 }, { damage: 3 }] });
  rollMarshRound(fight, 0, () => 0.1);
  settleMarshRound(fight);
  assert.equal(fight.encounter.foes[0].vitality, 2);
  assert.equal(fight.player.vitality, 20);
  assert.equal(fight.status, 'round-limit');
});

test('fighting the remaining guards with their seized halberd uses three damage', () => {
  const fight = createMarshFight('274c', player());
  rollMarshRound(fight, 0, coins(4, 0, 0, 0, 0, 0));
  settleMarshRound(fight);
  assert.deepEqual(fight.encounter.foes.map(foe => foe.vitality), [4, 4, 4, 4, 4]);
});

test('sinking during the sixth Beaver round is fatal unless the Beaver dies', () => {
  const fight = createMarshFight(97, player());
  fight.round = 5;
  rollMarshRound(fight, 0, coins(4, 0));
  settleMarshRound(fight);
  assert.equal(fight.status, 'loss');
  assert.equal(fight.player.vitality, 0);
  const victor = createMarshFight(97, player({ weaponDamage: 7 }));
  victor.round = 5;
  rollMarshRound(victor, 0, coins(4, 0));
  settleMarshRound(victor);
  assert.equal(victor.status, 'win');
});
