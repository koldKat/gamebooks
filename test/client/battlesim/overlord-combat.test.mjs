import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFight, attack, setRoundProfile } from '../../../public/js/battlesim/engines/way-of-the-tiger/combat.js';

const low = () => 0;
const enemy = { name: 'Opponent', endurance: 30, defense: 7, damageDice: 1, damageBonus: 1 };
const action = (defense = 1, technique = 'kick') => ({ target: 0, technique, defense,
  counters: [{ target: 0, defense: 1, damageDice: 1, damageBonus: 1 }] });

test('Yubi-Jutsu applies only the printed bonus and combines with Inner Force', () => {
  for (const [enabled, bonus, inner, expected] of [[false, 2, false, 3], [true, 1, false, 4], [true, 2, true, 10]]) {
    const fight = createFight({ yubiJutsu: enabled }, [enemy], { rules: { yubiJutsuDamageBonus: bonus, skipCounters: true } });
    attack(fight, { ...action(), innerForce: inner }, low);
    assert.equal(fight.opponents[0].endurance, 30 - expected);
  }
  const ordinary = createFight({ yubiJutsu: true }, [enemy]);
  attack(ordinary, { ...action(), counters: [] }, low);
  assert.equal(ordinary.opponents[0].endurance, 27);
});

test('missed kicks cause their fixed injury without an extra counter, including lethal injury', () => {
  for (const endurance of [20, 4]) {
    const fight = createFight({ endurance }, [enemy], { rules: { missDamage: 4, skipCountersOnMiss: true } });
    attack(fight, action(12), low);
    assert.equal(fight.player.endurance, Math.max(0, endurance - 4));
    assert.equal(fight.pendingHits.length, 0);
    assert.equal(fight.outcome, endurance === 4 ? 'loss' : null);
  }
  const sentinel = createFight({}, [enemy], { rules: { missDamage: 4, skipCountersOnMiss: true, skipCountersOnHit: true } });
  attack(sentinel, action(), low);
  assert.equal(sentinel.player.endurance, 20);
  assert.equal(sentinel.pendingHits.length, 0);
  const chainNinja = createFight({}, [enemy], { rules: { missDamage: 4, skipCountersOnMiss: true } });
  attack(chainNinja, action(), low);
  assert.equal(chainNinja.pendingHits.length, 1);
});

test('disarming changes the counter roll rather than its damage or blocking defense', () => {
  const fight = createFight({}, [enemy], { rules: { counterRollModifier: -1 } });
  attack(fight, action(12), low);
  assert.equal(fight.pendingHits.length, 0); // 2 - 1 does not exceed defense 1.
  assert.deepEqual(fight.log.at(-1), { type: 'counter', target: 0, roll: 2, modifier: -1, defense: 1 });
});

test('only the second Sentinel throw uses its higher defense and attempts survive profile changes', () => {
  const rules = { repeatThrowDefense: 8, repeatThrowDefenseAtAttempt: 2, skipCounters: true };
  const fight = createFight({}, [enemy], { rules });
  for (let attempt = 1; attempt <= 3; attempt++) {
    attack(fight, { ...action(7, 'throw'), counters: [] }, low);
    assert.equal(fight.log.at(-1).defense, attempt === 2 ? 8 : 7);
    setRoundProfile(fight, { opponents: [enemy], rules });
  }
  assert.equal(fight.opponents[0].throwAttempts, 3);
});

test('temporary fatigue affects the attack and clears when the printed profile changes', () => {
  const fight = createFight({ kick: 3 }, [enemy], { rules: { attackModifier: -2, skipCounters: true } });
  attack(fight, { ...action(3), counters: [] }, low);
  assert.equal(fight.opponents[0].endurance, 30); // 2 + 3 - 2 equals defense.
  setRoundProfile(fight, { opponents: [enemy], rules: { skipCounters: true } });
  attack(fight, { ...action(3), counters: [] }, low);
  assert.equal(fight.opponents[0].endurance, 27);
  assert.equal(fight.player.kick, 3);
});
