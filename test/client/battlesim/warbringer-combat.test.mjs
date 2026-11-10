import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFight, attack, resolveHit, setRoundProfile } from '../../../public/js/battlesim/engines/way-of-the-tiger/combat.js';

const low = () => 0;
const enemy = { name: 'Honoric', endurance: 24, defense: 8, damageDice: 1, damageBonus: 5 };
const blow = (technique, innerForce = false) => ({ target: 0, technique, defense: 1, innerForce, counters: [] });

test('Honoric nerve striking adds two damage or Inner Force doubles ordinary damage', () => {
  for (const technique of ['punch', 'kick']) for (const innerForce of [false, true]) {
    const fight = createFight({ yubiJutsu: true }, [enemy], { rules: {
      yubiJutsuDamageBonus: 2, yubiJutsuCannotCombineWithInnerForce: true, skipCounters: true,
    } });
    assert.equal(attack(fight, blow(technique, innerForce), low), true);
    const base = technique === 'kick' ? 3 : 1;
    assert.equal(fight.opponents[0].endurance, 24 - (innerForce ? base * 2 : base + 2));
    assert.equal(fight.player.innerForce, innerForce ? 4 : 5);
  }
});

test('Old One counter injuries return to the reader, while successful blocks continue combat', () => {
  for (const [block, random, outcome] of [[false, low, 'reader'], [true, low, null], [true, () => .99, 'reader']]) {
    const fight = createFight({}, [{ ...enemy, name: 'Old One', endurance: 22 }], {
      rules: { readerAfterCounterHit: true },
    });
    fight.pendingHits.push({ target: 0, defense: 7, damage: 4, blockable: true });
    assert.equal(resolveHit(fight, block, random), true);
    assert.equal(fight.outcome, outcome);
    assert.equal(fight.player.endurance, outcome === 'reader' ? 16 : 20);
    assert.equal(fight.pendingHits.length, 0);
  }
  const lethal = createFight({ endurance: 4 }, [enemy], { rules: { readerAfterCounterHit: true } });
  lethal.pendingHits.push({ target: 0, defense: 7, damage: 4, blockable: true });
  resolveHit(lethal, false, low);
  assert.equal(lethal.outcome, 'loss');
});

test('Sceptre damage is one die plus three and cannot use Inner Force', () => {
  const fight = createFight({}, [{ ...enemy, name: 'Old One', endurance: 22 }], { rules: {
    allowedTechniques: ['punch'], innerForceForbidden: true, attackDamageBonus: 3, skipCounters: true,
  } });
  assert.equal(attack(fight, blow('punch', true), low), false);
  assert.equal(fight.rounds, 0);
  attack(fight, blow('punch'), low);
  assert.equal(fight.opponents[0].endurance, 18);
  assert.equal(fight.player.innerForce, 5);
});

test('Spawn nerve-striking sends the player to the printed scripted result without rolling or awarding a win', () => {
  const fight = createFight({ yubiJutsu: true }, [enemy], { rules: { yubiJutsuReturnsToReader: true } });
  assert.equal(attack(fight, blow('punch'), () => { throw new Error('Scripted result must not roll'); }), true);
  assert.equal(fight.outcome, 'reader');
  assert.equal(fight.rounds, 0);
  assert.equal(fight.opponents[0].endurance, 24);
});

test('Honoric stops at six Endurance without granting a combat win and attack changes preserve injuries', () => {
  const rules = { readerEnemyThreshold: 6, skipCounters: true };
  const fight = createFight({}, [enemy], { rules });
  attack(fight, blow('kick'), () => .99);
  assert.equal(fight.opponents[0].endurance, 16);
  assert.equal(setRoundProfile(fight, { opponents: [enemy], rules }), true);
  assert.equal(fight.opponents[0].endurance, 16);
  attack(fight, blow('kick'), () => .99);
  assert.equal(fight.outcome, null);
  attack(fight, blow('punch'), low);
  attack(fight, blow('punch'), low);
  assert.equal(fight.opponents[0].endurance, 6);
  assert.equal(fight.outcome, 'reader');
});
