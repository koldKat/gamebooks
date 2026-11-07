import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFight, attackTurn, nextRound } from '../../../public/js/battlesim/engines/cthulhu-solo/combat.js';
const actor = overrides => ({ name: 'Investigator', hp: 50, maxHp: 50, dex: 60, dodge: 30, brawl: 50,
  pow: 55, str: 50, con: 50, skill: 50, damage: '1', moveSpeed: 7, luck: 50, ...overrides });
const enemy = overrides => actor({ name: 'Enemy', moves: [{ skill: 50, damage: '1' }], ...overrides });
const act = (f, side, index = 0, target = 0, random = () => .1) => attackTurn(f, { side, index, target, defense: 'none' }, random);
const sequence = values => { let i = 0; return () => { assert.ok(i < values.length, 'unexpected die'); return values[i++]; }; };

test('Dark Young tramples each investigator once before its remaining random grab/bite attacks', () => {
  const f = createFight({ enemies: [enemy({ attacks: 5, allocation: 'trample-each', moves: [
    { skill: 50, damage: '1' }, { skill: 50, damage: '2' },
  ] })] }, [actor(), actor({ name: 'Ally' })]);
  const rounds = Array.from({ length: 5 }, () => act(f, 'enemies'));
  assert.deepEqual(rounds.slice(0, 2).map(r => r.target), [0, 1]);
  assert.deepEqual(rounds.map(r => r.wound.amount), [1, 1, 2, 2, 2]);
});

test('Richardson shoots once at each investigator rather than repeatedly targeting one', () => {
  const f = createFight({ enemyAttacks: 'party', enemies: [enemy({ targetRule: 'unique' })] }, [actor(), actor({ name: 'Ally' })]);
  act(f, 'enemies'); const before = structuredClone(f);
  assert.throws(() => act(f, 'enemies')); assert.deepEqual(f, before);
  act(f, 'enemies', 0, 1); assert.equal(f.enemies[0].used, 2);
  nextRound(f); assert.equal(f.enemies[0].attackTargets.length, 0); assert.ok(act(f, 'enemies'));
});

test('lowest MOVE targeting honors the printed lowest LUCK tie-break', () => {
  const f = createFight({ enemies: [enemy({ targetRule: 'lowest:moveSpeed', targetTie: 'luck' })] },
    [actor({ moveSpeed: 6, luck: 70 }), actor({ name: 'Ally', moveSpeed: 6, luck: 20 })]);
  assert.equal(act(f, 'enemies').target, 1);
});

test('Hunting Horror bites the slowest investigator and crushes a different investigator', () => {
  const f = createFight({ enemies: [enemy({ attacks: 2, allocation: 'bite-crush' })] },
    [actor({ moveSpeed: 8 }), actor({ name: 'Slow ally', moveSpeed: 5 })]);
  assert.equal(act(f, 'enemies').target, 1); assert.equal(act(f, 'enemies').target, 0);
});

test('DEX order and the window cultist initiative tie are enforced without consuming invalid actions', () => {
  const f = createFight({ order: 'dex', enemyWinsInitiativeTies: true, enemies: [enemy({ dex: 47 })] }, [actor({ dex: 47 })]);
  const before = structuredClone(f); assert.throws(() => act(f, 'party')); assert.deepEqual(f, before);
  act(f, 'enemies'); assert.ok(act(f, 'party'));
});

test('the cave ambush changes only the printed opening order', () => {
  const spec = { openingOrder: 'ambush', enemies: [enemy()] };
  const surprised = createFight(spec, [actor()]); assert.throws(() => act(surprised, 'party'));
  act(surprised, 'enemies'); assert.ok(act(surprised, 'party'));
  const ambush = createFight(spec, [actor()], undefined, { ambush: true });
  assert.throws(() => act(ambush, 'enemies')); act(ambush, 'party'); assert.ok(act(ambush, 'enemies'));
});

test('a readied gun adds50initiative where the encounter explicitly calls for it', () => {
  const f = createFight({ order: 'dex', firearmInitiative: true, enemies: [enemy({ dex: 70 })] },
    [actor({ dex: 30, weaponKind: 'pistol' })]);
  assert.ok(act(f, 'party')); assert.ok(act(f, 'enemies'));
});

test('dog pack hard hits kill without rolling damage; regular hits use the five-damage threshold', () => {
  const spec = { playerKillAt: 3, playerDamageToKill: 5, enemies: [enemy({ hp: 1, maxHp: 1 })] };
  const hard = createFight(spec, [actor({ damage: '24D100' })]);
  act(hard, 'party', 0, 0, sequence([.1, .1])); assert.equal(hard.status, 'win');
  for (const [damage, remaining] of [['4', 1], ['5', 0]]) {
    const regular = createFight(spec, [actor({ skill: 80, damage })]);
    act(regular, 'party', 0, 0, sequence([0, .6])); assert.equal(regular.enemies[0].hp, remaining);
  }
});

test('the corridor grapple draw costs both combatants oneHP even when both rolls fail', () => {
  const f = createFight({ enemies: [enemy({ moves: [{ skill: 50, damage: '1D3', forcedDefense: 'fight', equalDamage: 1 }] })] }, [actor()]);
  const r = act(f, 'enemies', 0, 0, () => .8);
  assert.equal(r.attack.level, 1); assert.equal(r.defense.level, 1);
  assert.equal(f.party[0].hp, 49); assert.equal(f.enemies[0].hp, 49);
});

test('the vehicle volley allows two shooters and prevents the driver from shooting', () => {
  const f = createFight({ excludeDriver: true, partyActionsLimit: 2, enemies: [enemy()] },
    [actor({ driver: true }), actor({ name: 'Shooter1' }), actor({ name: 'Shooter2' }), actor({ name: 'Shooter3' })]);
  assert.throws(() => act(f, 'party')); act(f, 'party', 1); act(f, 'party', 2);
  assert.throws(() => act(f, 'party', 3));
});
