import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFight, attack, resolveHit, setRoundProfile } from '../../../public/js/battlesim/engines/way-of-the-tiger/combat.js';

const low = () => 0;
const action = (technique = 'punch', defense = 1, counters = []) => ({ target: 0, technique, defense, counters });
const enemy = (name = 'Opponent', endurance = 20) => ({ name, endurance, defense: 1, damageDice: 1, damageBonus: 0 });

test('counter-only foes cannot be attacked or prevent victory and retain their individual defenses', () => {
  const fight = createFight({}, [enemy('King', 1), { name: 'Sword', counterOnly: true, endurance: null, counterDefense: 6 }]);
  assert.equal(attack(fight, { ...action(), target: 1 }, low), false);
  assert.equal(attack(fight, action('punch', 12, [{ target: 1, defense: 0, damageDice: 1 }]), low), true);
  assert.equal(fight.pendingHits.length, 0);
  assert.equal(fight.log.at(-1).defense, 6);
  attack(fight, action(), low);
  assert.equal(fight.outcome, 'win');
  assert.equal(fight.opponents[1].endurance, null);
});

test('halved damage retains fractional Endurance and a doubled throw follow-up survives profile switching', () => {
  const fight = createFight({}, [enemy('Warlord', 14)], { rules: { damageMultiplier: 0.5, followupDamageMultiplier: 2 } });
  attack(fight, action(), low);
  assert.equal(fight.opponents[0].endurance, 13.5);
  attack(fight, action('throw'), low);
  setRoundProfile(fight, { opponents: [enemy('Warlord', 14)], rules: { damageMultiplier: 0.5 } });
  attack(fight, action(), low);
  assert.equal(fight.opponents[0].endurance, 10.5);
});

test('the agile throw follow-up has its printed attack bonus without the usual extra damage', () => {
  const fight = createFight({}, [enemy('Ninja', 19)], { rules: { followupModifier: 1, followupDamageBonus: 0 } });
  attack(fight, action('throw'), low);
  setRoundProfile(fight, { opponents: [enemy('Ninja', 19)] });
  attack(fight, action('punch', 2), low);
  assert.equal(fight.opponents[0].endurance, 18);
  assert.equal(fight.log.at(-1).modifier, 1);
  const failed = createFight({}, [enemy()], { rules: { failedThrowReturnsToReader: true } });
  attack(failed, action('throw', 12, [{ target: 0, defense: 0, damageDice: 20 }]), low);
  assert.equal(failed.outcome, 'reader');
  assert.equal(failed.player.endurance, 20);
  assert.equal(failed.pendingHits.length, 0);
});

test('the brigand throw deals fixed damage or immediate injury, without a follow-up or extra counter', () => {
  for (const [defense, health, player] of [[1, 12, 20], [12, 15, 16]]) {
    const fight = createFight({}, [enemy('Leader', 15)], { rules: { throwNoFollowup: true, throwDamage: 3, failedThrowDamage: 4, skipCounters: true } });
    attack(fight, action('throw', defense, [{ target: 0, defense: 0, damageDice: 10 }]), low);
    assert.equal(fight.opponents[0].endurance, health);
    assert.equal(fight.player.endurance, player);
    assert.equal(fight.followup, null);
    assert.equal(fight.pendingHits.length, 0);
  }
});

test('a printed final counterattack resolves before returning to the reader', () => {
  const fight = createFight({}, [enemy()], { rules: { maxRounds: 1, roundLimitAfterCounters: true } });
  attack(fight, action('punch', 12, [{ target: 0, defense: 0, damageDice: 1 }]), low);
  assert.equal(fight.outcome, null);
  assert.equal(fight.pendingHits.length, 1);
  resolveHit(fight, false, low);
  assert.equal(fight.player.endurance, 19);
  assert.equal(fight.outcome, 'reader');
});

test('the guard uses the hit-specific counter defense only after a successful punch', () => {
  for (const [targetDefense, counterDefense] of [[1, 9], [12, 8]]) {
    const fight = createFight({}, [enemy()], { rules: { counterDefenseOnHit: 9 } });
    attack(fight, action('punch', targetDefense, [{ target: 0, defense: 8, damageDice: 1 }]), low);
    assert.equal(fight.log.at(-1).defense, counterDefense);
  }
});

test('Hannya suppression does not double-charge the initial Shuriken and stops damage when the beast dies', () => {
  const fight = createFight({ shurikens: 1 }, [enemy()], { rules: {
    suppressionShurikenEachRound: true, suppressionFirstRoundAlreadySpent: true, unsuppressedRoundDamage: 3,
  } });
  attack(fight, action('kick', 12), low);
  assert.equal(fight.player.shurikens, 1);
  attack(fight, action('kick', 12), low);
  assert.equal(fight.player.shurikens, 0);
  assert.equal(fight.player.endurance, 20);
  attack(fight, action('kick', 12), low);
  assert.equal(fight.player.endurance, 17);
  fight.opponents[0].endurance = 1;
  attack(fight, action('kick'), low);
  assert.equal(fight.outcome, 'win');
  assert.equal(fight.player.endurance, 17);
});

test('a gripping wardog replaces further bites with automatic damage and releases on death', () => {
  const fight = createFight({}, [enemy('First'), enemy('Second')], { rules: {
    grippingOpponent: 1, gripRoundDamage: 2, grippedCounterDefense: 6,
  } });
  const counters = [{ target: 0, defense: 8, damageDice: 1 }, { target: 1, defense: 0, damageDice: 1 }];
  attack(fight, action('kick', 12, counters), low);
  resolveHit(fight, false, low);
  assert.equal(fight.gripActive, true);
  const before = fight.player.endurance;
  attack(fight, action('kick', 12, counters), low);
  assert.equal(fight.player.endurance, before - 2);
  assert.equal(fight.pendingHits.length, 0);
  assert.equal(fight.log.at(-1).target, 0);
  assert.equal(fight.log.at(-1).defense, 6);
  fight.opponents[1].endurance = 1;
  attack(fight, { ...action('kick', 1, counters), target: 1 }, low);
  assert.equal(fight.player.endurance, before - 2);
  assert.equal(fight.gripActive, false);
});

test('a blocked chill attack causes no penalty; an actual wound penalizes the next two attacks', () => {
  const fight = createFight({}, [enemy()]);
  fight.pendingHits = [{ damage: 1, defense: 3, blockable: true, chill: { penalty: 2, rolls: 2 } }];
  resolveHit(fight, true, low);
  assert.equal(fight.attackPenalty, undefined);
  fight.blockPenalty = false;
  fight.pendingHits = [{ damage: 1, defense: 3, blockable: true, chill: { penalty: 2, rolls: 2 } }];
  resolveHit(fight, false, low);
  for (const expected of [-2, -2, 0]) {
    attack(fight, action('punch', 12), low);
    assert.equal(fight.log.at(-1).modifier, expected);
  }
});

test('printed attack restrictions do not restrict custom fights or mutate rejected actions', () => {
  const fight = createFight({}, [enemy()], { rules: { allowedTechniques: ['kick'] } });
  const before = JSON.stringify(fight);
  assert.equal(attack(fight, action('throw'), low), false);
  assert.equal(JSON.stringify(fight), before);
  assert.equal(attack(createFight({}, [enemy()]), action('throw'), low), true);
});
