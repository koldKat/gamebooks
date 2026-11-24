import assert from 'node:assert/strict';
import test from 'node:test';
import { attackTurn, createFight, nextRound } from '../../../public/js/battlesim/engines/cthulhu-solo/combat.js';
import { retreat } from '../../../public/js/battlesim/engines/cthulhu-solo/effects.js';

const investigator = { name: 'Investigator', hp: 16, maxHp: 16, dex: 70, dodge: 40, con: 40,
  brawl: 40, skill: 40, db: '0', damage: '1D4+DB', weaponKind: 'knife' };
const opponent = { name: 'Opponent', hp: 20, maxHp: 20, dex: 58, dodge: 15, brawl: 35,
  moves: [{ name: 'First move', skill: 35, damage: '3D6' }, { name: 'Second move', skill: 25, damage: '1D8' }] };
const rolls = (...values) => () => values.shift() ?? 0.55;
const player = { side: 'party', index: 0, target: 0, defense: 'none' };
const enemy = { side: 'enemies', index: 0, target: 0, defense: 'none' };

test('an undefended ambush resolves two independent blows and tracks major wounds', () => {
  const fight = createFight({ allowPartyAttack: false, requireFullRound: true, singleRound: true,
    simultaneous: true, majorWounds: 'track' }, [investigator], [{ ...opponent, attacks: 2 }]);
  assert.equal(nextRound(fight), false);
  assert.throws(() => attackTurn(fight, player), /phase/);
  const first = attackTurn(fight, enemy, rolls(.25, .25, .40, .40, .40));
  assert.equal(first.wound.amount, 9);
  assert.equal(fight.party[0].majorWound, true);
  assert.equal(fight.party[0].hp, 16);
  assert.equal(nextRound(fight), false);
  assert.equal(attackTurn(fight, enemy, rolls()).wound, undefined);
  assert.equal(nextRound(fight), true);
  assert.equal(fight.status, 'round-complete');
  assert.equal(fight.party[0].hp, 7);
});

test('scripted opponent moves and cumulative armor reset after each complete round', () => {
  const fight = createFight({ requireFullRound: true, order: 'dex' }, [investigator],
    [{ ...opponent, attacks: 2, armorPerRound: 3, roundMoves: [[0, 0], [0, 1]] }]);
  assert.throws(() => attackTurn(fight, enemy), /initiative/);
  assert.equal(attackTurn(fight, player, rolls(.25, .25, .95)).wound.amount, 1);
  assert.equal(fight.enemies[0].armorRemaining, 0);
  const response = attackTurn(fight, { ...enemy, defense: 'fight' }, rolls(.55, .55, .25, .25, .95));
  assert.equal(response.counter.amount, 4);
  assert.equal(attackTurn(fight, enemy, rolls()).moveIndex, 0);
  assert.equal(nextRound(fight), true);
  assert.equal(fight.enemies[0].armorRemaining, 3);
  attackTurn(fight, player, rolls());
  assert.equal(attackTurn(fight, enemy, rolls()).moveIndex, 0);
  assert.equal(attackTurn(fight, enemy, rolls()).moveIndex, 1);
});

test('the even-odd stance controls both the opponent turn and its defense', () => {
  const fight = createFight({ requireFullRound: true, playerForcedDefense: 'fight' }, [investigator],
    [{ ...opponent, dodgeOnEven: true }], { random: rolls(.25) });
  assert.equal(fight.enemies[0].stanceRoll, 2);
  assert.throws(() => attackTurn(fight, enemy), /dodging/);
  assert.equal(attackTurn(fight, player, rolls()).defenseMode, 'dodge');
  assert.equal(nextRound(fight, rolls(.1)), true);
  assert.equal(fight.enemies[0].stanceRoll, 1);
  assert.equal(attackTurn(fight, player, rolls()).defenseMode, 'fight');
  assert.equal(nextRound(fight), false);
  attackTurn(fight, enemy, rolls());
  assert.equal(nextRound(fight, rolls(.25)), true);
});

test('a full survival round and failed major-wound check give distinct outcomes', () => {
  const fight = createFight({ requireFullRound: true, surviveRounds: 3, majorWounds: 'constitution' }, [investigator], [opponent]);
  for (let i = 0; i < 3; i++) {
    attackTurn(fight, player, rolls());
    attackTurn(fight, enemy, rolls());
    assert.equal(nextRound(fight), true);
  }
  assert.equal(fight.status, 'win');
  const wounded = createFight({ majorWounds: 'constitution' }, [investigator], [opponent]);
  const hit = attackTurn(wounded, enemy, rolls(.25, .25, .50, .50, .50, .55, .55));
  assert.equal(hit.wound.constitution.level, 1);
  assert.equal(wounded.party[0].hp, 4);
  assert.equal(wounded.status, 'loss');
});

test('extreme knife damage rolls the damage bonus once and a failed hard escape allows a counter', () => {
  const fight = createFight({ quickstartDamage: true, retreat: { skill: 'dodge', fromRound: 4, level: 3, failureCounter: true } },
    [{ ...investigator, db: '1D4' }], [opponent]);
  const strike = attackTurn(fight, player, rolls(.35, .05, .5, .25));
  assert.equal(strike.wound.amount, 9);
  assert.throws(() => retreat(fight, rolls()), /Too early/);
  fight.round = 4;
  assert.equal(retreat(fight, rolls(.25, .25, .55, .55))[0].level, 2);
  assert.equal(fight.status, 'fighting');
  assert.equal(fight.log.at(-1).retreatCounter, true);
  assert.throws(() => retreat(fight, rolls()), /Already attempted/);
  fight.round = 5;
  assert.equal(retreat(fight, rolls(.85, .15))[0].level, 3);
  assert.equal(fight.status, 'retreated');
});
