import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFight, attack, resolveHit } from '../../../public/js/battlesim/engines/way-of-the-tiger/combat.js';

const low = () => 0;
const enemy = endurance => ({ name: 'Opponent', endurance });
const move = (extra = {}) => ({ target: 0, technique: 'punch', defense: 1, ...extra });
const counters = [{ target: 0, defense: 0, damageDice: 1 }];
const fight = (rules, endurance = 20, player = {}) => createFight(player, [enemy(endurance)], { rules });
const sequence = (...faces) => () => { assert.ok(faces.length, 'unexpected die'); return (faces.shift() - 1) / 6; };

test('printed damage additions double with Inner Force, while Nerve-Striking stays exactly eleven', () => {
  const bonus = fight({ attackDamageBonus: 2 });
  attack(bonus, move({ innerForce: true }), low);
  assert.equal(bonus.opponents[0].endurance, 14);
  const nerve = fight({ nerveStrikeDamage: 11, readerEnemyThreshold: 12 }, 24);
  const before = JSON.stringify(nerve);
  assert.equal(attack(nerve, move({ nerveStrike: true, innerForce: true }), low), false);
  assert.equal(JSON.stringify(nerve), before);
  attack(nerve, move({ nerveStrike: true }), low);
  assert.equal(nerve.opponents[0].endurance, 13);
  attack(nerve, move({ nerveStrike: true, counters }), low);
  assert.equal(nerve.opponents[0].endurance, 2);
  assert.equal(nerve.outcome, 'reader');
  assert.equal(nerve.pendingHits.length, 0);
});

test('printed enemy thresholds return to the reader even when a blow reduces health to zero', () => {
  const f = fight({ readerEnemyThreshold: 4 }, 1);
  attack(f, move({ counters }), low);
  assert.equal(f.outcome, 'reader');
  assert.equal(f.pendingHits.length, 0);
  const wounded = fight({ readerPlayerBelow: 6 }, 20, { endurance: 6 });
  wounded.pendingHits.push({ damage: 2, defense: 7, blockable: true });
  resolveHit(wounded, false, low);
  assert.equal(wounded.outcome, 'reader');
  assert.equal(wounded.player.endurance, 4);
});

test('Golem exhaustion respects its floor; Astaroth can kill before dice or Inner Force are spent', () => {
  for (const [health, remaining] of [[2, 2], [3, 1]]) {
    const f = fight({ attackEnduranceCost: 2, skipCostAtOrBelow: 2 }, 20, { endurance: health });
    attack(f, move(), low);
    assert.equal(f.player.endurance, remaining);
  }
  const burned = fight({ attackEnduranceCost: 4 }, 33, { endurance: 4 });
  attack(burned, move({ innerForce: true }), () => assert.fail('no attack roll after fatal steam'));
  assert.equal(burned.outcome, 'loss');
  assert.equal(burned.player.innerForce, 5);
  assert.equal(burned.opponents[0].endurance, 33);
});

test('holy items reduce demon wounds cumulatively and only the locket reduces fiery recoil', () => {
  for (const [saintLocket, rubyCirclet, recoil] of [[false, true, 2], [true, false, 1], [true, true, 1]]) {
    const f = fight({ holyProtection: true, damageMultiplier: 0.5, contactDamage: 2, contactDamageWithLocket: 1 }, 33,
      { saintLocket, rubyCirclet });
    attack(f, move({ counters: [{ target: 0, defense: 0, damageDice: 3 }] }), low);
    assert.equal(f.opponents[0].endurance, 32.5);
    assert.equal(f.player.endurance, 20 - recoil);
    assert.equal(f.pendingHits[0].damage, 0);
  }
});

test('the Fiend counts three unwounding blows, requires the chosen Inner Force, and never counters a hit', () => {
  const f = fight({ successfulHitsToWin: 3, innerForceRequired: true, skipCountersOnHit: true }, 25);
  const before = JSON.stringify(f);
  assert.equal(attack(f, move(), low), false);
  assert.equal(JSON.stringify(f), before);
  for (let i = 1; i <= 3; i++) {
    attack(f, move({ innerForce: true, counters }), low);
    assert.equal(f.successfulHits, i);
    assert.equal(f.opponents[0].endurance, 25);
    assert.equal(f.pendingHits.length, 0);
  }
  assert.equal(f.outcome, 'win');
  assert.equal(f.player.innerForce, 2);
  const scourge = fight({ innerForceForbidden: true });
  assert.equal(attack(scourge, move({ innerForce: true }), low), false);
  assert.equal(scourge.rounds, 0);
});

test('a Spectral Companion miss returns to the reader without inventing numerical damage', () => {
  const f = fight({ missReturnsToReader: true, skipCounters: true });
  attack(f, move({ defense: 12, counters }), low);
  assert.equal(f.outcome, 'reader');
  assert.equal(f.player.endurance, 20);
  assert.equal(f.pendingHits.length, 0);
});

test('four Halvorcs cause only one Fate roll per attack, including the final attack', () => {
  const rules = { fateWound: { hitScores: [1, 2], damageDice: 1 }, unblockable: true };
  const f = createFight({ endurance: 1 }, [enemy(1), enemy(0), enemy(0), enemy(0)], { rules });
  let calls = 0;
  attack(f, move({ technique: 'kick', counters: [0, 1, 2, 3].map(target => ({ target, defense: 0, damageDice: 1 })) }), () => { calls++; return 0; });
  assert.equal(calls, 5);
  assert.equal(f.pendingHits.length, 1);
  assert.equal(f.outcome, null);
  assert.equal(resolveHit(f, true, low), false);
  resolveHit(f, false, low);
  assert.equal(f.outcome, 'loss');
  const lucky = fight(rules, 20, { fate: 2 });
  attack(lucky, move(), low);
  assert.equal(lucky.pendingHits.length, 0);
});

test('the double copies current values and automatically blocks, with both fighters taking block penalties', () => {
  const f = fight({ mirrorPlayer: true }, 20, { endurance: 9, innerForce: 2, punch: 10 });
  assert.equal(f.opponents[0].endurance, 9);
  assert.equal(f.opponents[0].innerForce, 2);
  attack(f, move(), low);
  assert.equal(f.opponents[0].endurance, 9);
  assert.equal(f.log.find(line => line.type === 'mirror-block').blocked, true);
  assert.equal(f.log.find(line => line.type === 'counter').modifier, 8);
  resolveHit(f, true, low);
  attack(f, move(), low);
  assert.equal(f.log.findLast(line => line.type === 'attack').modifier, 8);
});

test('a double with a failed block takes the normal Inner Force damage', () => {
  const f = fight({ mirrorPlayer: true });
  attack(f, move({ innerForce: true }), sequence(6, 6, 6, 6, 6, 1, 1));
  assert.equal(f.opponents[0].endurance, 8);
  assert.equal(f.player.innerForce, 4);
  assert.equal(f.opponents[0].innerForce, 5);
});

test('a mirrored throw waits for the player follow-up, then uses an unblockable throw and chosen blow', () => {
  const f = fight({ mirrorPlayer: true }, 20, { punch: 10, kick: 10, throw: 10 });
  attack(f, move({ technique: 'throw' }), low);
  assert.equal(f.followup.modifier, 1);
  assert.equal(f.pendingHits.length, 0);
  assert.equal(f.log.some(line => line.type === 'counter'), false);
  attack(f, move({ mirrorFollowupTechnique: 'kick' }), low);
  assert.equal(f.log.findLast(line => line.type === 'attack').modifier, 11);
  assert.deepEqual(f.log.filter(line => line.type === 'counter').map(line => line.technique), ['throw', 'kick']);
  assert.equal(f.pendingHits[0].damage, 5);
  assert.equal(f.pendingHits[0].blockable, true);
  assert.equal(f.rounds, 1);
});

test('a missed player throw still lets the double throw and spend its own Inner Force on the blow', () => {
  const f = fight({ mirrorPlayer: true });
  attack(f, move({ technique: 'throw', mirrorInnerForce: true }), sequence(1, 1, 6, 6, 6, 6, 1));
  assert.equal(f.pendingHits[0].damage, 6);
  assert.equal(f.opponents[0].innerForce, 4);
  const empty = fight({ mirrorPlayer: true }, 20, { innerForce: 0 });
  const before = JSON.stringify(empty);
  assert.equal(attack(empty, move({ mirrorInnerForce: true }), low), false);
  assert.equal(JSON.stringify(empty), before);
});
