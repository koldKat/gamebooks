import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as combat from '../../../public/js/battlesim/engines/fighting-fantasy/core.js';

const hero = changes => ({
  skill: 6, skillInitial: 12, stamina: 12, staminaInitial: 24,
  luck: 6, luckInitial: 12, gold: 0, provisions: 0,
  potion: 'skill', potionUses: 0, attackModifier: 0,
  nextFightPenalty: 0, items: {}, ...changes,
});
const entry = changes => ({
  section: 'test', label: 'Test encounter', win: '100',
  enemies: [{name: 'Opponent', skill: 6, stamina: 10}], ...changes,
});
function dice(values) {
  let index = 0;
  return () => {
    assert.ok(index < values.length, 'Unexpected die roll');
    return values[index++];
  };
}

test('fixed starting scores do not roll dice or grant starting supplies', () => {
  const character = combat.newCharacter({
    gold: 0, provisions: 0, noStartingPotion: true,
    fixedScores: {skill: 6, stamina: 12, luck: 6},
  }, () => assert.fail('Fixed scores must not roll dice'));
  assert.deepEqual(
    [character.skill, character.skillInitial, character.stamina,
      character.staminaInitial, character.luck, character.luckInitial,
      character.gold, character.provisions, character.potionUses],
    [6, 6, 12, 12, 6, 6, 0, 0, 0],
  );
});

test('a living player at a printed Stamina threshold is routed, not killed', () => {
  let fight = combat.startFight(hero({stamina: 10}), entry({
    stopAtPlayerStamina: {value: 8, destination: '149'},
  }));
  fight = combat.roundFight(fight, [], dice([6, 6, 1, 1]));
  assert.equal(fight.status, 'active');
  fight = combat.resolveWound(fight);
  assert.equal(fight.character.stamina, 8);
  assert.equal(fight.status, 'routed');
  assert.equal(fight.destination, '149');
});

test('a fatal wound remains a loss even when a withdrawal threshold exists', () => {
  let fight = combat.startFight(hero({stamina: 5}), entry({
    incomingDamage: 6, stopAtPlayerStamina: {value: 4, destination: '272'},
  }));
  fight = combat.resolveWound(combat.roundFight(fight, [], dice([6, 6, 1, 1])));
  assert.equal(fight.character.stamina, 0);
  assert.equal(fight.status, 'loss');
});

test('three-point wounds retain their printed base and optional Luck adjustments', () => {
  for (const [useLuck, rolls, damage] of [
    [false, [], 3], [true, [1, 1], 2], [true, [6, 6], 4],
  ]) {
    let fight = combat.startFight(hero(), entry({incomingDamage: 3}));
    fight = combat.roundFight(fight, [], dice([6, 6, 1, 1]));
    assert.deepEqual(combat.pendingWoundValues(fight), {damage: 3, lucky: 2, unlucky: 4});
    fight = combat.resolveWound(fight, useLuck, dice(rolls));
    assert.equal(fight.character.stamina, 12 - damage);
  }
});

test('independent simultaneous attacks reroll the player against each opponent', () => {
  let fight = combat.startFight(hero(), entry({
    simultaneous: true, independentPlayerAttacks: true,
    enemies: [{name: 'First', skill: 6, stamina: 10}, {name: 'Second', skill: 6, stamina: 10}],
  }));
  fight = combat.roundFight(fight, [], dice([1, 1, 6, 6]));
  fight = combat.resolveWound(fight);
  assert.equal(fight.enemies[0].stamina, 8);
  fight = combat.roundFight(fight, [], dice([6, 6, 1, 1]));
  assert.equal(fight.pending.direction, 'incoming');
  fight = combat.resolveWound(fight);
  assert.equal(fight.character.stamina, 10);
  assert.equal(fight.enemies[1].stamina, 10);
  assert.equal(fight.round, 1);
});

test('existing simultaneous encounters keep their shared player roll by default', () => {
  let fight = combat.startFight(hero(), entry({
    simultaneous: true,
    enemies: [{name: 'First', skill: 6, stamina: 10}, {name: 'Second', skill: 6, stamina: 10}],
  }));
  fight = combat.roundFight(fight, [], dice([6, 6, 1, 1]));
  fight = combat.resolveWound(fight);
  fight = combat.roundFight(fight, [], dice([1, 1]));
  assert.equal(fight.pending, null);
  assert.equal(fight.enemies[1].stamina, 10);
  assert.equal(fight.character.stamina, 12);
});

test('a chosen group target cannot end combat while other opponents remain', () => {
  let fight = combat.startFight(hero(), entry({
    simultaneous: true, independentPlayerAttacks: true, activeOpponents: 2,
    enemies: [
      {name: 'First', skill: 6, stamina: 10},
      {name: 'Second', skill: 6, stamina: 2},
      {name: 'Waiting', skill: 6, stamina: 10},
    ],
  }));
  assert.throws(() => combat.selectFightTarget(fight, 2));
  fight = combat.selectFightTarget(fight, 1);
  fight = combat.roundFight(fight, [], dice([1, 1, 6, 6]));
  assert.equal(fight.enemies[0].stamina, 10);
  assert.throws(() => combat.selectFightTarget(fight, 0));
  fight = combat.roundFight(fight, [], dice([1, 1, 6, 6]));
  fight = combat.resolveWound(fight);
  assert.equal(fight.enemies[1].stamina, 0);
  assert.equal(fight.target, 0);
  assert.equal(fight.status, 'active');
  assert.equal(combat.selectFightTarget(fight, 2).target, 2);
});
