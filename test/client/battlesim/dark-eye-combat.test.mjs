import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceFight, createFight } from '../../../public/js/battlesim/engines/dark-eye/combat.js';

const rogue = { life: 29, attack: 13, parry: 9, dodge: 9, protection: 1, damageDice: 1, damageBonus: 4 };
const opponent = { life: 31, attack: 12, parry: 7, dodge: 7, protection: 1, damageDice: 1, damageBonus: 1 };

function rolls(...values) {
  return sides => {
    const value = values.shift();
    assert.ok(value >= 1 && value <= sides, `Unscripted or invalid D${sides} roll: ${value}`);
    return value;
  };
}

test('resolves the Thorwaler round with a threshold parry and net damage, then stops', () => {
  const start = createFight({ hero: rogue, opponent, rules: { opponentFirst: true, roundLimit: 1 } });
  const { fight, events } = advanceFight(start, { roll: rolls(12, 9, 13, 20, 6) });
  assert.deepEqual(events.map(e => [e.attacker, e.result]), [['opponent', 'defended'], ['hero', 'hit']]);
  assert.equal(events[1].damage, 9);
  assert.equal(fight.opponent.life, 22);
  assert.equal(fight.hero.life, 29);
  assert.equal(fight.status, 'survived');
  assert.equal(start.opponent.life, 31);
  assert.deepEqual(advanceFight(fight, { roll: rolls() }), { fight, events: [] });
});

test('a shark attacks twice, allows only dodge, halves odd attack scores upward and retreats after net damage', () => {
  const shark = { ...opponent, life: 35, attack: 14, parry: 0, damageBonus: 4 };
  const rules = { opponentFirst: true, opponentAttacks: 2, halveHeroAttack: true, noHeroParry: true, retreatDamage: 12 };
  const start = createFight({ hero: rogue, opponent: shark, rules });
  const first = advanceFight(start, { defense: 'parry', roll: rolls(10, 9, 16, 7, 19, 6) });
  assert.equal(first.events[0].defense.kind, 'dodge');
  assert.deepEqual(first.events.map(e => e.attacker), ['opponent', 'opponent', 'hero']);
  assert.equal(first.events[2].attackTarget, 7);
  assert.equal(first.fight.damageDealt, 9);
  assert.equal(first.fight.status, 'fighting');
  const second = advanceFight(first.fight, { roll: rolls(20, 20, 7, 20, 1) });
  assert.equal(second.fight.damageDealt, 13);
  assert.equal(second.fight.opponent.life, 22);
  assert.equal(second.fight.status, 'retreated');
});

test('Rogobald openings resolve before a normal round and skip only the forbidden defenses', () => {
  const freeHeroAttack = { attacker: 'hero', noParry: true, noDodge: true };
  const setup = createFight({ hero: rogue, opponent, rules: { opening: [freeHeroAttack, freeHeroAttack] } });
  const opening = advanceFight(setup, { roll: rolls(1, 1, 20) });
  assert.equal(opening.fight.round, 0);
  assert.equal(opening.fight.openingPending, false);
  assert.deepEqual(opening.events.map(e => [e.opening, e.result]), [[true, 'hit'], [true, 'miss']]);
  assert.equal(opening.events[0].defense, undefined);
  const firstRound = advanceFight(opening.fight, { roll: rolls(20, 20) });
  assert.equal(firstRound.fight.round, 1);
  assert.deepEqual(firstRound.events.map(e => e.attacker), ['hero', 'opponent']);

  const blockedParry = { attacker: 'opponent', noParry: true };
  const forcedOpening = createFight({ hero: rogue, opponent, rules: { opening: [blockedParry] } });
  const response = advanceFight(forcedOpening, { defense: 'parry', roll: rolls(8, 9) });
  assert.equal(response.events[0].defense.kind, 'dodge');
});

test('protection can absorb all damage and lethal attacks end the round immediately', () => {
  const start = createFight({
    hero: { ...rogue, life: 3 },
    opponent: { ...opponent, protection: 20 },
    rules: { roundLimit: 1 },
  });
  const { fight, events } = advanceFight(start, { roll: rolls(1, 20, 6, 1, 20, 4) });
  assert.deepEqual(events.map(e => e.damage), [0, 4]);
  assert.equal(fight.hero.life, 0);
  assert.equal(fight.status, 'loss');
  const other = createFight({ hero: rogue, opponent: { ...opponent, life: 1 } });
  const won = advanceFight(other, { roll: rolls(1, 20, 1) });
  assert.equal(won.fight.status, 'win');
  assert.equal(won.events.length, 1);
});

test('transformed animals roll the printed small damage dice', () => {
  const cat = { ...rogue, life: 5, parry: 0, dodge: 7, protection: 0, damageSides: 2, damageBonus: 0 };
  const rat = { ...opponent, life: 5, parry: 0, dodge: 7, protection: 0, damageSides: 3, damageBonus: 0 };
  const start = createFight({ hero: cat, opponent: rat, rules: { opponentFirst: true } });
  const trace = [];
  const scripted = rolls(1, 20, 3, 1, 20, 2);
  const { fight, events } = advanceFight(start, { roll: sides => { trace.push(sides); return scripted(sides); } });
  assert.deepEqual(trace, [20, 20, 3, 20, 20, 2]);
  assert.deepEqual(events.map(event => event.damage), [3, 2]);
  assert.equal(fight.hero.life, 2);
  assert.equal(fight.opponent.life, 3);
});

test('Moonhair stops at the opponent life threshold or after six rounds, whichever comes first', () => {
  const rules = { opponentFirst: true, roundLimit: 6, damageStopLife: 10 };
  const start = createFight({ hero: rogue, opponent: { ...opponent, life: 15 }, rules });
  const result = advanceFight(start, { roll: rolls(20, 1, 20, 2) });
  assert.equal(result.fight.opponent.life, 10);
  assert.equal(result.fight.status, 'threshold');
  let fight = start;
  for (let round = 1; round <= 6; round++) {
    ({ fight } = advanceFight(fight, { roll: rolls(20, 20) }));
    assert.equal(fight.round, round);
    assert.equal(fight.status, round === 6 ? 'survived' : 'fighting');
  }
});
