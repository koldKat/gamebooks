import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attackTurn, createFight, nextRound, prepareSkillRoll, resolveSkillRoll,
} from '../../../public/js/battlesim/engines/cthulhu-solo/combat.js';
import { retreat } from '../../../public/js/battlesim/engines/cthulhu-solo/effects.js';

const sequence = (...values) => {
  let index = 0;
  return () => {
    assert.ok(index < values.length, 'unexpected die roll');
    return values[index++];
  };
};
const investigator = { name: 'Investigator', hp: 9, maxHp: 9, dex: 60, skill: 50,
  brawl: 50, dodge: 30, luck: 55, damage: '1D3' };
const opponent = { name: 'Opponent', hp: 10, maxHp: 10, dex: 60, dodge: 30,
  moves: [{ name: 'Knife', skill: 50, damage: '1D6' }] };
const enemyTurn = { side: 'enemies', index: 0, target: 0, defense: 'fight' };
const attack = { side: 'party', index: 0, target: 0, defense: 'none' };

test('the printed Luck example reuses the original roll and spends Luck before damage', () => {
  const fight = createFight({ spendSkillLuck: true }, [investigator], [opponent]);
  const pending = prepareSkillRoll(fight, enemyTurn, sequence(0.12, 0.42, 0.92, 0.42));
  assert.equal(pending.entry.playerRoll, 49);
  assert.equal(fight.enemies[0].used, 0);
  assert.throws(() => resolveSkillRoll(fight, pending, 49), RangeError);
  assert.equal(fight.party[0].luck, 55);
  const round = resolveSkillRoll(fight, pending, 24, sequence(0.42));
  assert.equal(round.defense.originalRoll, 49);
  assert.equal(round.defense.roll, 25);
  assert.equal(round.defense.level, 3);
  assert.equal(fight.party[0].luck, 31);
  assert.equal(fight.party[0].hp, 9);
  assert.equal(fight.enemies[0].hp, 8);
});

test('a ghast flees as soon as the printed wound threshold is reached', () => {
  const foe = { ...opponent, fleeImmediatelyAt: 5, attacks: 2 };
  const fight = createFight({ enemyFleeIsWin: true }, [{ ...investigator, damage: '5' }], [foe, foe]);
  attackTurn(fight, attack, sequence(0.12, 0.12));
  assert.equal(fight.enemies[0].fled, true);
  assert.equal(fight.status, 'fighting');
  nextRound(fight);
  attackTurn(fight, { ...attack, target: 1 }, sequence(0.12, 0.12));
  assert.equal(fight.status, 'win');
});

test('the final escape roll is available once per attack in the two-attack encounter', () => {
  const fight = createFight({ totalEnemyActions: 2, retreat: { skill: 'dodge',
    onceAfterEnemyAction: true, failAfterEnemyActions: 2 } }, [investigator], [opponent]);
  const turn = { ...enemyTurn, defense: 'none' };
  attackTurn(fight, turn, sequence(0.12, 0.42, 0));
  retreat(fight, sequence(0.12, 0.72));
  assert.equal(fight.status, 'fighting');
  assert.throws(() => retreat(fight), /next attack/);
  nextRound(fight);
  attackTurn(fight, turn, sequence(0.12, 0.42, 0));
  assert.throws(() => attackTurn(fight, turn), /phase complete/);
  retreat(fight, sequence(0.12, 0.72));
  assert.equal(fight.status, 'loss');
});
