import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFight, attack, resolveHit, setRoundProfile } from '../../../public/js/battlesim/engines/way-of-the-tiger/combat.js';

const low = () => 0, high = () => .99;
const enemy = { name: 'Opponent', endurance: 20, defense: 8, damageDice: 1, damageBonus: 3 };
const blow = (technique = 'punch', extra = {}) => ({ target: 0, technique, defense: 8, counters: [], ...extra });
const sequence = (...values) => () => { assert.ok(values.length, 'unexpected random roll'); return values.shift(); };

test('Lord Sile makes his fixed four-point opening attack before the player spends an action', () => {
  const rules = { openingCounter: { target: 0, defense: 7, damageDice: 0, damageBonus: 4 } };
  const fight = createFight({}, [enemy], { rules, random: high });
  assert.equal(fight.rounds, 0);
  assert.equal(fight.pendingHits.length, 1);
  assert.equal(fight.pendingHits[0].damage, 4);
  assert.equal(attack(fight, blow(), low), false);
  assert.equal(resolveHit(fight, true, low), true);
  assert.equal(fight.player.endurance, 20);
  assert.equal(fight.blockPenalty, true);
  const miss = createFight({}, [enemy], { rules, random: low });
  assert.equal(miss.pendingHits.length, 0);
  assert.equal(miss.player.endurance, 20);
  fight.opponents[0].endurance = 13;
  assert.equal(setRoundProfile(fight, { opponents: [enemy], rules }, high), true);
  assert.equal(fight.opponents[0].endurance, 13);
  resolveHit(fight, false, low);
  assert.equal(fight.player.endurance, 16);
});

test('the optional opening Shuriken hits once without a combat round or counterattack', () => {
  const fight = createFight({}, [enemy], { rules: { openingShuriken: true } });
  const shot = blow('shuriken', { counters: [{ target: 0, defense: 0, damageDice: 10 }] });
  assert.equal(attack(fight, { ...shot, innerForce: true }, high), false);
  assert.equal(attack(fight, shot, sequence(.99)), true);
  assert.equal(fight.opponents[0].endurance, 14);
  assert.equal(fight.player.shurikens, 4);
  assert.equal(fight.player.innerForce, 5);
  assert.equal(fight.rounds, 0);
  assert.equal(fight.pendingHits.length, 0);
  assert.equal(attack(fight, shot, () => { throw Error('no second opening shot'); }), false);
  const skipped = createFight({}, [enemy], { rules: { openingShuriken: true } });
  attack(skipped, blow(), low);
  assert.equal(attack(skipped, shot, high), false);
});

test('defeating two Orcs returns to the reader while the third remains alive', () => {
  const fight = createFight({ punch: 20 }, [10, 8, 7].map((endurance, n) => ({ ...enemy, name: `Orc ${n}`, endurance })), {
    rules: { readerDefeatedCount: 2 },
  });
  fight.opponents[0].endurance = 1;
  attack(fight, blow(), low);
  assert.equal(fight.outcome, null);
  fight.opponents[1].endurance = 1;
  attack(fight, blow('punch', { target: 1, counters: [{ target: 2, defense: 0, damageDice: 20 }] }), sequence(0, 0, 0));
  assert.equal(fight.outcome, 'reader');
  assert.equal(fight.opponents[2].endurance, 7);
  assert.equal(fight.pendingHits.length, 0);
});

test('all three living Orcs counter, but only one attack can be blocked in a round', () => {
  const fight = createFight({ endurance: 30, punch: 20 }, [0, 1, 2].map(n => ({ ...enemy, name: `Orc ${n}` })));
  const counters = [0, 1, 2].map(target => ({ target, defense: 8, damageDice: 1, damageBonus: 0 }));
  attack(fight, blow('punch', { counters }), high);
  assert.equal(fight.pendingHits.length, 3);
  assert.equal(resolveHit(fight, true, low), true);
  assert.equal(resolveHit(fight, true, low), false);
  resolveHit(fight, false, low); resolveHit(fight, false, low);
  assert.equal(fight.player.endurance, 18);
});

test('Cassandra disarming throws return immediately without damage, follow-up, or a victory', () => {
  const rules = { readerOnSuccessfulThrow: true, readerPlayerBelow: 4, unblockable: true };
  const fight = createFight({}, [enemy], { rules });
  assert.equal(attack(fight, blow('throw'), high), true);
  assert.equal(fight.outcome, 'reader');
  assert.equal(fight.opponents[0].endurance, 20);
  assert.equal(fight.followup, null);
  const failed = createFight({}, [enemy], { rules });
  attack(failed, blow('throw', { counters: [{ target: 0, defense: 6, damageDice: 1, damageBonus: 3 }] }), sequence(0, 0, .99, .99, .99));
  assert.equal(failed.pendingHits[0].damage, 9);
  assert.equal(resolveHit(failed, true, low), false);
  resolveHit(failed, false, low);
  assert.equal(failed.player.endurance, 11);
});

test('Cassandra stops at twelve Endurance or three player Endurance, with lethal damage taking priority', () => {
  const rules = { readerEnemyThreshold: 12, readerPlayerBelow: 4 };
  const fight = createFight({}, [{ ...enemy, endurance: 18 }], { rules });
  attack(fight, blow(), high);
  assert.equal(fight.opponents[0].endurance, 12);
  assert.equal(fight.outcome, 'reader');
  for (const [damage, outcome] of [[17, 'reader'], [20, 'loss']]) {
    const hurt = createFight({}, [enemy], { rules });
    hurt.pendingHits.push({ target: 0, defense: 8, damage, blockable: true });
    resolveHit(hurt, false, low);
    assert.equal(hurt.outcome, outcome);
  }
});

test('Tyutchev takes actual damage and returns after two wounds before another counterattack', () => {
  const fight = createFight({ punch: 20 }, [enemy], { rules: { readerSuccessfulHits: 2, readerEnemyThreshold: 0 } });
  attack(fight, blow(), low);
  assert.equal(fight.opponents[0].endurance, 19);
  assert.equal(fight.successfulHits, 1);
  attack(fight, blow('punch', { counters: [{ target: 0, defense: 0, damageDice: 20 }] }), sequence(0, 0, 0));
  assert.equal(fight.opponents[0].endurance, 18);
  assert.equal(fight.successfulHits, 2);
  assert.equal(fight.outcome, 'reader');
  assert.equal(fight.pendingHits.length, 0);
});

test('Tyutchev survival requires all three rounds, including the last counterattack', () => {
  const fight = createFight({ endurance: 100 }, [enemy], { rules: {
    maxRounds: 3, roundLimitAfterCounters: true, readerSuccessfulHits: 2, readerEnemyThreshold: 0,
  } });
  for (let round = 1; round <= 3; round++) {
    attack(fight, blow('punch', { counters: [{ target: 0, defense: 8, damageDice: 2, damageBonus: 2 }] }), sequence(0, 0, .99, .99, .99, .99));
    assert.equal(fight.outcome, null);
    resolveHit(fight, false, low);
    assert.equal(fight.outcome, round === 3 ? 'reader' : null);
  }
  assert.equal(fight.player.endurance, 58);
  assert.equal(fight.opponents[0].endurance, 20);
});
