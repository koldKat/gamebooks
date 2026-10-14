import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from './simulator-source.mjs';
import { runInNewContext } from 'node:vm';
import { spaceScoutLoadout, startSpaceScoutDuel, spaceScoutDuelRound,
  spaceScoutDuelMissile, startSpaceScoutFleet, spaceScoutFleetOpening,
  spaceScoutFleetMissiles, spaceScoutFleetManeuver, spaceScoutCruiserAttack,
  spaceScoutTorpedo, spaceScoutPersonalEquipment, startSpaceScoutEncounter
} from '../../../public/js/battlesim/engines/space-scout/core.js';

const setup = () => ({ ship: 'centurion', weapons: ['phaser', 'phaser'],
  shields: ['large', 'small'], utilities: ['targeting'], mounts: ['krotal', 'leech'] });
const character = () => spaceScoutLoadout(setup());
const enemy = (shields = 300, attack = 50) => ({ name: 'Torpedo bomber', shields, attack });
const rolls = (...values) => () => {
  assert.ok(values.length, 'Unexpected extra roll');
  return values.shift();
};

test('backend recognizes sim648 outcomes once without touching a real database', () => {
  const events = [];
  const db = { exec() {}, transaction: fn => () => fn(), prepare: () => ({
    run() {}, all: () => [], get: () => ({ id: 648, total_sections: 105, is_container: 0 }),
  }) };
  const context = { module: { exports: {} }, events, require(name) {
    if (name === './connection') return { db };
    if (name === './auth') return { generateToken: () => 'test-only' };
    if (name === '../impersonation-context') return { isImpersonatingContext: () => false };
    if (name === '../clean-run') return { isCleanRun: () => false };
    throw new Error('Unexpected real dependency: ' + name);
  } };
  const source = readFileSync(new URL('../../../server/db/xp.js', import.meta.url), 'utf8');
  runInNewContext(source + '\nawardXp = (...args) => events.push(args);', context);
  assert.ok(context.module.exports.SIM_HISTORY_KEYS.includes('sim648'));
  const state = history => ({ graph: {}, playthroughs: [{ startedAt: 123, path: [1], sim648: { history } }] });
  const previous = state([]), updated = state([{ outcome: 'win', ts: 10 }, { outcome: 'loss', ts: 11 }]);
  context.module.exports.processStateXp(1, 648, previous, updated);
  assert.deepEqual(events.filter(e => e[1].startsWith('battlesim_')).map(e => [...e]),
    [[1, 'battlesim_win', 'sim648:10'], [1, 'battlesim_loss', 'sim648:11']]);
  events.length = 0;
  context.module.exports.processStateXp(1, 648, updated, structuredClone(updated));
  assert.equal(events.filter(e => e[1].startsWith('battlesim_')).length, 0);
});

test('personal equipment uses spare volume, requires a suit and power supplies', () => {
  const c = character();
  const gear = spaceScoutPersonalEquipment(c, { suit: 1, protection: 1, blaster: 1, battery: 5 });
  assert.equal(gear.volume, 49);
  for (const input of [{}, { suit: 1, protection: 1 }, { suit: 1, blaster: 1 },
    { suit: 1, bazooka: 1 }, { suit: 1, grenade: 10000 }, { suit: 1, invented: 1 },
    { suit: -1 }, { suit: 1, battery: 1.5 }]) {
    assert.throws(() => spaceScoutPersonalEquipment(c, input), RangeError);
  }
  const minimal = spaceScoutPersonalEquipment({ personalVolume: 0 }, {});
  assert.equal(minimal.battery, 5); assert.equal(minimal.suit, 1);
  assert.equal(minimal.blaster, 1); assert.equal(minimal.protection, 1);
});

test('printed encounter roster applies opening attacks and sequential shields', () => {
  const c = character();
  const a = startSpaceScoutEncounter(c, 12, { roll: rolls(6) });
  assert.equal(a.status, 'win'); assert.equal(a.shields, 400);
  const b = startSpaceScoutEncounter(c, 30, { missiles: ['krotal', 'krotal', 'leech'] });
  assert.equal(b.status, 'win'); assert.equal(b.inventory.krotal, 0); assert.equal(b.inventory.leech, 0);
  assert.deepEqual(c.inventory, { krotal: 2, leech: 1, torpedoes: 3 });
  assert.throws(() => startSpaceScoutEncounter(c, 30, { missiles: ['leech', 'leech'] }), RangeError);
  assert.equal(startSpaceScoutEncounter(c, 32, { openingDamage: 200 }).status, 'win');
  assert.throws(() => startSpaceScoutEncounter(c, 32, {}), RangeError);
  const pair = startSpaceScoutEncounter(c, 36);
  assert.equal(pair.shields, 300);
  assert.deepEqual(pair.enemies.map(e => [e.attack, e.shields]), [[50, 120], [30, 150]]);
  assert.deepEqual(startSpaceScoutEncounter(c, 42).enemies.map(e => [e.attack, e.shields]), [[75, 250]]);
  assert.equal(startSpaceScoutEncounter(c, 22).enemies[0].attack, 50);
  assert.equal(startSpaceScoutEncounter(c, 49).stage, 'headon');
  assert.equal(startSpaceScoutEncounter(c, 66).enemies.length, 3);
  assert.throws(() => startSpaceScoutEncounter(c, 46), RangeError);
});

test('printed ships and equipment preserve energy, volume and missile mounts', () => {
  const c = character();
  assert.equal(c.power, 50); assert.equal(c.maxShields, 400);
  assert.equal(c.energy, 91); assert.equal(c.volume, 155);
  assert.equal(c.personalVolume, 1050);
  assert.deepEqual(c.inventory, { krotal: 2, leech: 1, torpedoes: 3 });
  assert.equal(c.speed * c.manoeuvre, 110);
  for (const [ship, product, torpedoes] of [['morningstar', 132, 1], ['ghost', 121, 2]]) {
    const next = spaceScoutLoadout({ ...setup(), ship });
    assert.equal(next.speed * next.manoeuvre, product);
    assert.equal(next.inventory.torpedoes, torpedoes);
  }
});

test('loadout rejects unknown equipment and capacity excess', () => {
  for (const changes of [
    { ship: 'invented' }, { ship: '__proto__' }, { ship: 'constructor' },
    { weapons: ['laser', 'laser', 'laser'] },
    { weapons: ['invented'] }, { shields: ['large', 'large', 'large'] },
    { utilities: ['targeting', 'targeting'] },
    { mounts: Array(7).fill('leech') }, { shields: ['small', 'small', 'small', 'small'] },
  ]) assert.throws(() => spaceScoutLoadout({ ...setup(), ...changes }), RangeError);
  assert.throws(() => spaceScoutLoadout({ ...setup(), ship: 'morningstar', shields: ['large', 'large'] }), RangeError);
});

test('guided missiles may be loaded but cannot be fired without the targeting device', () => {
  const c = spaceScoutLoadout({ ...setup(), utilities: [] });
  assert.equal(c.inventory.krotal, 2); assert.equal(c.targeting, false);
  const f = startSpaceScoutDuel(c, [enemy()]);
  assert.throws(() => spaceScoutDuelMissile(f, 'krotal'), RangeError);
  assert.equal(spaceScoutDuelMissile(f, 'leech').damage, 150);
});

test('lethal beam hit does not give the enemy a retaliation or extra die roll', () => {
  const f = startSpaceScoutDuel(character(), [enemy()]);
  const before = structuredClone(f);
  const result = spaceScoutDuelRound(f, rolls(6));
  assert.equal(result.fight.status, 'win'); assert.equal(result.enemyRoll, null);
  assert.equal(result.fight.shields, 400); assert.equal(result.fight.enemies[0].shields, 0);
  assert.deepEqual(f, before);
});

test('ordinary retaliation multiplies its die by attack and zero shields are fatal', () => {
  const f = startSpaceScoutDuel(character(), [enemy()], { shields: 50 });
  const result = spaceScoutDuelRound(f, rolls(1, 1));
  assert.equal(result.enemyLoss, 50); assert.equal(result.playerLoss, 50);
  assert.equal(result.fight.status, 'loss'); assert.equal(result.fight.shields, 0);
  assert.throws(() => spaceScoutDuelRound(result.fight), RangeError);
});

test('normal start restores shields; explicit opening damage and penalties are separate', () => {
  assert.equal(startSpaceScoutDuel(character(), [enemy()]).shields, 400);
  const f = startSpaceScoutDuel(character(), [enemy()], { shieldPenalty: 100, openingDamage: 50 });
  assert.equal(f.shields, 300); assert.equal(f.enemies[0].shields, 250);
  assert.equal(startSpaceScoutDuel(character(), [enemy()], { openingDamage: 300 }).status, 'win');
  assert.equal(startSpaceScoutDuel(character(), [enemy()], { shields: 0, openingDamage: 300 }).status, 'loss');
  assert.throws(() => startSpaceScoutDuel(character(), [enemy()], { shields: 401 }), RangeError);
});

test('section 36 fights carry shields into the second opponent, without a free attack', () => {
  let f = startSpaceScoutDuel(character(), [enemy(120, 50), enemy(150, 30)], { shieldPenalty: 100 });
  f = spaceScoutDuelRound(f, rolls(1, 2)).fight;
  assert.equal(f.shields, 200);
  const second = spaceScoutDuelRound(f, rolls(2));
  assert.equal(second.fight.status, 'fighting'); assert.equal(second.fight.target, 1);
  assert.equal(second.fight.shields, 200); assert.equal(second.enemyRoll, null);
  f = spaceScoutDuelRound(second.fight, rolls(3)).fight;
  assert.equal(f.status, 'win'); assert.equal(f.shields, 200);
});

test('missiles hit automatically, consume inventory and do not invent a retaliation', () => {
  const f = startSpaceScoutDuel(character(), [enemy()]);
  const before = structuredClone(f);
  const result = spaceScoutDuelMissile(f, 'krotal', 2);
  assert.equal(result.damage, 200); assert.equal(result.fight.enemies[0].shields, 100);
  assert.equal(result.fight.inventory.krotal, 0); assert.equal(result.fight.shields, 400);
  assert.deepEqual(f, before);
  assert.throws(() => spaceScoutDuelMissile(result.fight, 'krotal'), RangeError);
  assert.equal(spaceScoutDuelMissile(result.fight, 'leech').fight.status, 'win');
  assert.throws(() => spaceScoutDuelMissile(f, 'torpedoes'), RangeError);
  assert.throws(() => spaceScoutDuelMissile(f, '__proto__'), RangeError);
  assert.throws(() => spaceScoutDuelMissile(f, 'constructor'), RangeError);
  assert.throws(() => spaceScoutDuelMissile({ ...f, targeting: false }, 'krotal'), RangeError);
});

test('invalid rolls and values fail without changing saved fight state', () => {
  const f = startSpaceScoutDuel(character(), [enemy()]), before = structuredClone(f);
  for (const n of [0, -1, 7, 1.5, NaN, Infinity]) assert.throws(() => spaceScoutDuelRound(f, rolls(n)), RangeError);
  for (const n of [0, -1, 13, 1.5, NaN]) assert.throws(() => spaceScoutDuelMissile(f, 'leech', n), RangeError);
  assert.throws(() => spaceScoutDuelRound({ ...f, rulesVersion: 0 }), RangeError);
  assert.throws(() => spaceScoutDuelRound({ ...f, target: 1 }), RangeError);
  assert.deepEqual(f, before);
});

test('section 73 applies both opening shots even when the first enemy dies', () => {
  const f = startSpaceScoutFleet(character()), before = structuredClone(f);
  const result = spaceScoutFleetOpening(f, rolls(6, 2));
  assert.equal(result.fight.enemies[0].shields, 0);
  assert.equal(result.fight.shields, 280); assert.equal(result.section, 80);
  assert.equal(result.fight.stage, 'missiles-two'); assert.deepEqual(f, before);
  assert.throws(() => spaceScoutDuelRound(f, rolls(6)), RangeError);
  assert.throws(() => spaceScoutDuelMissile(f, 'leech'), RangeError);
  f.shields = 120;
  const dead = spaceScoutFleetOpening(f, rolls(6, 2));
  assert.equal(dead.fight.status, 'loss'); assert.equal(dead.section, null);
});

test('sections 60 and 99 both permit three missiles with player-chosen targets', () => {
  const c = spaceScoutLoadout({ ...setup(), mounts: ['leech', 'leech', 'leech', 'leech'] });
  const initial = startSpaceScoutFleet(c);
  const two = spaceScoutFleetOpening(initial, rolls(6, 1)).fight;
  const result = spaceScoutFleetMissiles(two, [
    { type: 'leech', target: 1 }, { type: 'leech', target: 2 }, { type: 'leech', target: 1 },
  ]);
  assert.equal(result.section, 46); assert.equal(result.fight.target, 2);
  assert.equal(result.fight.enemies[2].shields, 150); assert.equal(result.fight.enemies[2].attack, 50);
  assert.equal(result.fight.shields, 340); assert.equal(result.fight.inventory.leech, 1);
  assert.equal(spaceScoutDuelRound(result.fight, rolls(3)).fight.status, 'win');
  assert.throws(() => spaceScoutFleetMissiles(two, Array(4).fill({ type: 'leech', target: 1 })), RangeError);
  const three = spaceScoutFleetOpening(initial, rolls(1, 1)).fight;
  assert.equal(spaceScoutFleetMissiles(three, []).section, 87);
  assert.equal(spaceScoutFleetMissiles(three, []).fight.status, 'loss');
  const reduced = spaceScoutFleetMissiles(three, [{ type: 'leech', target: 0 }, { type: 'leech', target: 0 }]);
  assert.equal(reduced.section, 56); assert.equal(reduced.fight.stage, 'maneuver');
});

test('section 85 allows one unsplit beam, two missiles and fixed loss of 120 shields', () => {
  const c = spaceScoutLoadout({ ...setup(), mounts: ['leech', 'leech'] });
  const f = spaceScoutFleetMissiles(spaceScoutFleetOpening(startSpaceScoutFleet(c), rolls(6, 1)).fight).fight;
  const result = spaceScoutFleetManeuver(f, [1], [{ type: 'leech', target: 2 }, { type: 'leech', target: 2 }], rolls(2));
  assert.equal(result.fight.shields, 220); assert.deepEqual(result.damage, [100]);
  assert.equal(result.fight.target, 1); assert.equal(result.fight.enemies[1].shields, 200);
  assert.equal(result.fight.enemies[1].attack, 50); assert.equal(result.section, 50);
});

test('section 97 rounds only the second die upward after halving and carries 90 damage', () => {
  const c = spaceScoutLoadout({ ...setup(), ship: 'ghost' });
  const f = spaceScoutFleetMissiles(spaceScoutFleetOpening(startSpaceScoutFleet(c), rolls(6, 1)).fight).fight;
  const result = spaceScoutFleetManeuver(f, [1, 1], [], rolls(3, 5));
  assert.deepEqual(result.damage, [150, 150]); assert.equal(result.fight.enemies[1].shields, 0);
  assert.equal(result.fight.shields, 250); assert.equal(result.fight.status, 'fighting');
  assert.equal(result.fight.target, 2); assert.equal(result.section, 50);
});

test('section 92 gives two unsplit beams and 60 damage; two survivors mean defeat', () => {
  const c = spaceScoutLoadout({ ...setup(), ship: 'morningstar' });
  const f = spaceScoutFleetMissiles(spaceScoutFleetOpening(startSpaceScoutFleet(c), rolls(6, 1)).fight).fight;
  const result = spaceScoutFleetManeuver(f, [1, 2], [], rolls(1, 2));
  assert.deepEqual(result.damage, [50, 100]); assert.equal(result.fight.shields, 280);
  assert.equal(result.fight.status, 'loss'); assert.equal(result.section, 50);
  assert.throws(() => spaceScoutFleetManeuver(f, [1, 2], [
    { type: 'krotal', target: 1 }, { type: 'krotal', target: 2 },
  ], rolls(1, 2)), RangeError);
});

test('fleet allocations reject dead targets, unsupported ship values and corrupt phases without mutations', () => {
  const f = spaceScoutFleetMissiles(spaceScoutFleetOpening(startSpaceScoutFleet(character()), rolls(6, 1)).fight).fight;
  const before = structuredClone(f);
  assert.throws(() => spaceScoutFleetManeuver(f, [0], [], rolls(1)), RangeError);
  assert.throws(() => spaceScoutFleetManeuver({ ...f, speed: 9 }, [1], [], rolls(1)), RangeError);
  assert.throws(() => spaceScoutFleetOpening(f, rolls(1, 1)), RangeError);
  const missilePhase = { ...f, stage: 'missiles-two' };
  assert.throws(() => spaceScoutFleetMissiles(missilePhase, [{ type: 'leech', target: 0 }]), RangeError);
  assert.deepEqual(f, before);
});

test('cruiser attacks use the printed inclusive upper and exclusive lower thresholds', () => {
  const c = character(), before = structuredClone(c);
  for (const [section, power, dice, missiles, damage, destination] of [
    [24,133,[1,2],['krotal','krotal'],599,41], [24,300,[1,1],[],600,17],
    [24,183,[1,2],['leech'],699,17], [24,350,[1,1],[],700,7],
    [28,111,[1,6],[],999,8], [28,250,[1,1],[],1000,37],
    [28,157,[1,4],['krotal'],1199,37], [28,300,[1,1],[],1200,16],
    [34,233,[1,2],['krotal'],799,8], [34,400,[1,1],[],800,37],
    [34,233,[1,2],['krotal','krotal'],899,37], [34,450,[1,1],[],900,16],
  ]) {
    const result = spaceScoutCruiserAttack({ ...c, power }, section, missiles, rolls(...dice));
    assert.equal(result.damage, damage); assert.equal(result.section, destination);
  }
  assert.equal(spaceScoutCruiserAttack(c,24,[],rolls(1,1)).section,41);
  assert.equal(spaceScoutCruiserAttack(c,34,[],rolls(1,1)).section,8);
  assert.deepEqual(c,before);
});

test('section 28 adds two before multiplying and permits six missiles, with inventory consumption', () => {
  const c = spaceScoutLoadout({ ...setup(), mounts: Array(6).fill('leech') });
  const result = spaceScoutCruiserAttack(c,28,Array(6).fill('leech'),rolls(1,3));
  assert.equal(result.damage,1200); assert.equal(result.missileDamage,900);
  assert.equal(result.character.inventory.leech,0); assert.equal(result.section,16);
  assert.equal(c.inventory.leech,6);
  assert.throws(() => spaceScoutCruiserAttack(c,24,Array(5).fill('leech'),rolls(1,1)),RangeError);
  assert.throws(() => spaceScoutCruiserAttack(c,34,Array(5).fill('leech'),rolls(1,1)),RangeError);
});

test('cruiser missile validation cannot overspend or fire guided missiles without a device', () => {
  const c = character(), before = structuredClone(c);
  assert.throws(() => spaceScoutCruiserAttack(c,24,['leech','leech'],rolls(1,1)),RangeError);
  assert.throws(() => spaceScoutCruiserAttack(c,24,['__proto__'],rolls(1,1)),RangeError);
  assert.throws(() => spaceScoutCruiserAttack({ ...c,targeting:false },24,['krotal'],rolls(1,1)),RangeError);
  assert.throws(() => spaceScoutCruiserAttack(c,1,[],rolls(1,1)),RangeError);
  assert.deepEqual(c,before);
});

test('torpedoes consume one only in printed narrative branches, with no fabricated generic damage', () => {
  const c = character(), before = structuredClone(c);
  for (const section of [24,28,34,91]) {
    const result = spaceScoutTorpedo(c,section);
    assert.equal(result.character.inventory.torpedoes,2);
    assert.equal(result.section,section===91?104:31);
    assert.equal('damage' in result,false);
  }
  assert.throws(() => spaceScoutTorpedo(c,22),RangeError);
  assert.throws(() => spaceScoutTorpedo({ ...c,inventory:{...c.inventory,torpedoes:0} },24),RangeError);
  assert.deepEqual(c,before);
});
