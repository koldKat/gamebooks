import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFight, attack, resolveHit, setRoundProfile } from '../../../public/js/battlesim/engines/way-of-the-tiger/combat.js';

const low = () => 0;
const setup = options => createFight({}, [{ name: 'Opponent', endurance: 20 }], options);

test('attacks must exceed defense; punch/kick damage uses a separate die', () => {
  for (const [technique, damage] of [['punch', 1], ['kick', 3]]) {
    const fight = setup();
    assert.equal(attack(fight, { target: 0, technique, defense: 2 }, low), true);
    assert.equal(fight.opponents[0].endurance, 20);
    attack(fight, { target: 0, technique, defense: 1 }, low);
    assert.equal(fight.opponents[0].endurance, 20 - damage);
  }
});

test('Inner Force is spent before the roll, even on a miss, and doubles kick damage', () => {
  const fight = setup();
  attack(fight, { target: 0, technique: 'kick', defense: 2, innerForce: true }, low);
  assert.equal(fight.player.innerForce, 4);
  assert.equal(fight.opponents[0].endurance, 20);
  attack(fight, { target: 0, technique: 'kick', defense: 1, innerForce: true }, low);
  assert.equal(fight.opponents[0].endurance, 14);
});

test('throws give no direct damage and restrict the follow-up to the thrown target', () => {
  const fight = setup();
  attack(fight, { target: 0, technique: 'throw', defense: 1 }, low);
  assert.equal(fight.opponents[0].endurance, 20);
  assert.equal(attack(fight, { target: 0, technique: 'throw', defense: 1 }, low), false);
  attack(fight, { target: 0, technique: 'kick', defense: 1 }, low);
  assert.equal(fight.opponents[0].endurance, 15);
  assert.equal(fight.rounds, 1);
});

test('group counters skip defeated opponents, permit only one block, and apply the next-attack penalty', () => {
  const fight = createFight({}, [{ endurance: 1 }, { endurance: 20 }, { endurance: 20 }]);
  const counters = [0, 1, 2].map(target => ({ target, defense: 1, damageDice: 1 }));
  attack(fight, { target: 0, technique: 'punch', defense: 1, counters }, low);
  assert.equal(fight.pendingHits.length, 2);
  assert.equal(resolveHit(fight, true, low), true);
  assert.equal(fight.player.endurance, 19);
  assert.equal(resolveHit(fight, true, low), false);
  resolveHit(fight, false, low);
  attack(fight, { target: 1, technique: 'punch', defense: 0 }, low);
  assert.equal(fight.opponents[1].endurance, 20);
  assert.equal(fight.log.at(-1).modifier, -2);
});

test('blocking requires a roll strictly below defense; nonlethal defeats do not become deaths', () => {
  const fight = setup({ nonlethal: true });
  fight.player.endurance = 1;
  fight.pendingHits = [{ damage: 2, defense: 2, blockable: true }];
  resolveHit(fight, true, low);
  assert.equal(fight.outcome, 'defeat');
  const blocked = setup();
  blocked.pendingHits = [{ damage: 2, defense: 3, blockable: true }];
  resolveHit(blocked, true, low);
  assert.equal(blocked.player.endurance, 20);
});

test('empty shuriken supply and unblockable blows cannot be bypassed', () => {
  const fight = setup();
  fight.player.shurikens = 0;
  assert.equal(attack(fight, { target: 0, technique: 'shuriken', defense: 1 }, low), false);
  fight.pendingHits = [{ damage: 3, defense: 8, blockable: false }];
  assert.equal(resolveHit(fight, true, low), false);
  resolveHit(fight, false, low);
  assert.equal(fight.player.endurance, 17);
});

test('shuriken damage excludes the attack dice, with Inner Force spent on the selected attack', () => {
  const fight = setup();
  attack(fight, { target: 0, technique: 'shuriken', defense: 1, innerForce: true }, low);
  assert.equal(fight.opponents[0].endurance, 18);
  assert.equal(fight.player.innerForce, 4);
  assert.equal(fight.player.shurikens, 4);
});

test('printed damage reduction and contact burns apply without changing the damage die', () => {
  const fight = createFight({}, [{ endurance: 20 }], { rules: { damageReduction: 1, contactDamage: 1 } });
  attack(fight, { target: 0, technique: 'kick', defense: 1, innerForce: true }, low);
  assert.equal(fight.opponents[0].endurance, 15);
  assert.equal(fight.player.endurance, 19);
});

test('a successful sea throw ends the fight; failed throws apply their immediate injury first', () => {
  const win = createFight({}, [{ endurance: 12 }], { rules: { throwVictory: true } });
  attack(win, { target: 0, technique: 'throw', defense: 1 }, low);
  assert.equal(win.outcome, 'win'); assert.equal(win.followup, null);
  const loss = createFight({ endurance: 2 }, [{ endurance: 12 }], { rules: { failedThrowDamage: 2 } });
  attack(loss, { target: 0, technique: 'throw', defense: 2,
    counters: [{ target: 0, defense: 0, damageDice: 1 }] }, low);
  assert.equal(loss.outcome, 'loss'); assert.equal(loss.pendingHits.length, 0);
});

test('surviving group size determines counter defense after a target is defeated', () => {
  const fight = createFight({}, [{ endurance: 1 }, { endurance: 20 }, { endurance: 20 }],
    { rules: { counterDefenseByAlive: { 1: 9, 2: 8, 3: 7 } } });
  attack(fight, { target: 0, technique: 'punch', defense: 1,
    counters: [0, 1, 2].map(target => ({ target, defense: 0, damageDice: 1 })) }, low);
  assert.equal(fight.pendingHits.length, 0);
  assert.deepEqual(fight.log.filter(line => line.type === 'counter').map(line => line.defense), [8, 8]);
});

test('round profiles preserve current Endurance and carry the original throw follow-up bonus', () => {
  const fight = createFight({}, [{ name: 'Monk', endurance: 14 }], { rules: { followupModifier: 1 } });
  attack(fight, { target: 0, technique: 'throw', defense: 1 }, low);
  assert.equal(setRoundProfile(fight, { opponents: [{ name: 'Monk', endurance: 16, defense: 2, damageDice: 1 }] }), true);
  assert.equal(fight.opponents[0].endurance, 14);
  attack(fight, { target: 0, technique: 'punch', defense: 2 }, low);
  assert.equal(fight.opponents[0].endurance, 11);
  assert.equal(fight.log.at(-1).modifier, 1);
  assert.equal(setRoundProfile(fight, { opponents: [{ name: 'Different', endurance: 99 }] }), false);
});

test('repeat throws use the printed higher defense and cannot bypass unblockable counters', () => {
  const fight = createFight({}, [{ endurance: 20 }], { rules: { repeatThrowDefense: 3, unblockable: true } });
  attack(fight, { target: 0, technique: 'throw', defense: 2 }, low);
  attack(fight, { target: 0, technique: 'throw', defense: 1,
    counters: [{ target: 0, defense: 1, damageDice: 1 }] }, low);
  assert.equal(fight.followup, null);
  assert.equal(fight.log.findLast(line => line.type === 'attack').defense, 3);
  assert.equal(resolveHit(fight, true, low), false);
});

test('printed attack limits stop before another counter without inventing a win or loss', () => {
  const fight = createFight({}, [{ endurance: 20 }], { rules: { maxRounds: 4 } });
  for (let i = 0; i < 4; i++) attack(fight, { target: 0, technique: 'punch', defense: 12 }, low);
  assert.equal(fight.outcome, 'reader');
  assert.equal(fight.opponents[0].endurance, 20);
  assert.equal(attack(fight, { target: 0, technique: 'punch', defense: 0 }, low), false);
});
