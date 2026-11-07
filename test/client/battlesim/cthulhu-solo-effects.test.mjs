import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combatCheck } from '../../../public/js/battlesim/engines/cthulhu-solo/checks.js';
import { createFight, attackTurn, nextRound } from '../../../public/js/battlesim/engines/cthulhu-solo/combat.js';
import { changePhase, hypnosis, recoverWeapon, retreat, useBrawl } from '../../../public/js/battlesim/engines/cthulhu-solo/effects.js';
const actor = overrides => ({ name: 'Investigator', hp: 12, maxHp: 12, dex: 60, dodge: 30, brawl: 40,
  pow: 55, str: 50, con: 50, skill: 80, damage: '6', ...overrides });
const enemy = overrides => actor({ name: 'Enemy', moves: [{ skill: 80, damage: '6' }], ...overrides });
const create = (spec = {}, party = [actor()], opponents = [enemy()]) => createFight({ enemies: opponents, ...spec }, party);
const sequence = values => { let i = 0; return () => { assert.ok(i < values.length); return values[i++]; }; };

test('minimalist coin mode uses one repeat for high skill/advantage and the second result is final', () => {
  assert.equal(combatCheck(61, 0, sequence([0, .9]), 'coin').level, 2);
  assert.equal(combatCheck(60, 0, sequence([0]), 'coin').level, 1);
  assert.equal(combatCheck(20, 1, sequence([0, .9]), 'coin').level, 2);
  assert.equal(combatCheck(80, -1, sequence([.9, 0]), 'coin').level, 1);
  assert.throws(() => combatCheck(50, 0, Math.random, 'invalid'));
});

test('destroyed weapons cannot attack; switching to Brawl retains current wounds and DB', () => {
  const f = create(); f.party[0].hp = 3; f.party[0].db = '1D4'; f.party[0].weaponDestroyed = true;
  assert.throws(() => attackTurn(f, { side: 'party', index: 0, target: 0 }));
  useBrawl(f, 0); assert.equal(f.party[0].hp, 3); assert.equal(f.party[0].damage, '1D3+DB');
  assert.equal(f.party[0].db, '1D4'); assert.equal(f.party[0].skill, 40);
  assert.ok(attackTurn(f, { side: 'party', index: 0, target: 0, defense: 'none' }, () => .1));
});

test('recovering a dropped weapon spends the action rather than granting a free attack', () => {
  const f = create(); f.party[0].weaponDropped = true; recoverWeapon(f, 0);
  assert.equal(f.party[0].weaponDropped, false); assert.equal(f.party[0].used, 1);
  assert.throws(() => attackTurn(f, { side: 'party', index: 0, target: 0 }));
  nextRound(f); assert.ok(attackTurn(f, { side: 'party', index: 0, target: 0 }, () => .1));
});

test('vampire hypnosis preserves the main investigator and resolves only once', () => {
  const f = create({ hypnosis: true }, [actor(), actor({ name: 'Ally' })]);
  assert.throws(() => attackTurn(f, { side: 'party', index: 0, target: 0 }));
  hypnosis(f, 0, () => .99);
  assert.equal(f.party[0].hypnotized, undefined); assert.equal(f.party[1].hypnotized, true); assert.equal(f.enemies[0].actLast, true);
  assert.throws(() => hypnosis(f, 0));
  assert.throws(() => attackTurn(f, { side: 'party', index: 1, target: 0 }));
});

test('optional pulpy mode spends exactly35LUCK to prevent all fatal injury and preserves earned stats', () => {
  const f = createFight({ enemies: [enemy({ moves: [{ skill: 80, damage: '20' }] })] }, [actor({ luck: 35 })], undefined, { pulpy: true });
  const r = attackTurn(f, { side: 'enemies', index: 0, target: 0, defense: 'none' }, () => .1);
  assert.equal(r.wound.amount, 0); assert.equal(f.party[0].luck, 0); assert.equal(f.party[0].hp, 12);
  nextRound(f); attackTurn(f, { side: 'enemies', index: 0, target: 0, defense: 'none' }, () => .1);
  assert.equal(f.status, 'loss');
});

test('simultaneous injuries preserve earlier nonfatal wounds when luck prevents a later fatal hit', () => {
  const f = createFight({ simultaneous: true, enemies: [enemy({ attacks: 2, moves: [{ skill: 80, damage: '8' }] })] }, [actor({ luck: 70 })], undefined, { pulpy: true });
  for (let i = 0; i < 2; i++) attackTurn(f, { side: 'enemies', index: 0, target: 0, defense: 'none' }, () => .1);
  nextRound(f); assert.equal(f.party[0].hp, 4); assert.equal(f.party[0].luck, 35);
});

test('optional luck can prevent a fatal crow injury without granting protection from later rounds', () => {
  const f = createFight({ roundDamageTarget: 20, failedRoundDamage: 1, enemies: [enemy()] }, [actor({ hp: 1, luck: 35 })], undefined, { pulpy: true });
  nextRound(f); assert.equal(f.party[0].hp, 1); assert.equal(f.party[0].luck, 0);
  nextRound(f); assert.equal(f.status, 'loss');
});

test('Dark Young retreat starts on round2, retains failures, and becomes automatic on round4', () => {
  const f = create({ retreat: { fromRound: 2, automaticRound: 4 } });
  assert.throws(() => retreat(f)); nextRound(f); retreat(f, () => .99);
  assert.equal(f.status, 'fighting'); assert.notEqual(f.party[0].fled, true);
  nextRound(f); nextRound(f); retreat(f);
  assert.equal(f.status, 'retreated'); assert.equal(f.party[0].fled, true);
});

test('a source phase switch preserves current enemyHP and investigator conditions', () => {
  const f = create({ group: 'horror' }); f.enemies[0].hp = 5; f.party[0].immobilized = true;
  changePhase(f, { group: 'horror', enemies: [enemy({ moves: [{ skill: 35, damage: '1D6' }] })] });
  assert.equal(f.enemies[0].hp, 5); assert.equal(f.party[0].immobilized, true);
  assert.equal(f.enemies[0].moves[0].skill, 35);
  assert.throws(() => changePhase(f, { group: 'different', enemies: [enemy()] }));
});

test('Mummy throat-grab requires a Brawl defense and equal success avoids a crushing death', () => {
  const f = create({}, [actor({ brawl: 70 })], [enemy({ moves: [{ skill: 70, damage: '0', effect: 'throttle', forcedDefense: 'fight', tie: 'defender', noCounter: true }] })]);
  const r = attackTurn(f, { side: 'enemies', index: 0, target: 0, defense: 'none' }, () => .1);
  assert.equal(r.defenseMode, 'fight'); assert.equal(r.wound, undefined); assert.equal(r.counter, undefined);
  assert.equal(f.party[0].hp, 12); assert.equal(f.enemies[0].hp, 12);
});

test('Hunting Horror pistols require Hard success at range while rifles hit on regular success', () => {
  for (const [weaponKind, expected] of [['pistol', 0], ['rifle', 6]]) {
    const f = create({ playerWeaponThresholds: { pistol: 3 } }, [actor({ weaponKind })]);
    const r = attackTurn(f, { side: 'party', index: 0, target: 0, defense: 'none' }, sequence([0, .6]));
    assert.equal(r.attack.level, 2); assert.equal(12 - f.enemies[0].hp, expected);
  }
});

test('Smuggler weapon selection follows the1D6table rather than the chosen dropdown move', () => {
  const f = create({}, [actor()], [enemy({ randomMoves: [2, 4], moves: [
    { skill: 45, damage: '3' }, { skill: 40, damage: '7' },
  ] })]);
  const r = attackTurn(f, { side: 'enemies', index: 0, target: 0, move: 0, defense: 'none' }, sequence([.9, .1, .1]));
  assert.equal(r.moveIndex, 1); assert.equal(r.wound.amount, 7);
});

test('unprinted defense remains unavailable and a rejected attempt preserves all state', () => {
  const f = create({}, [actor()], [enemy({ dodge: null })]), before = structuredClone(f);
  assert.throws(() => attackTurn(f, { side: 'party', index: 0, target: 0, defense: 'dodge' }, () => .1));
  assert.deepEqual(f, before);
});

test('a player-only printed phase rejects enemy turns without consuming one', () => {
  const f = create({ allowEnemyAttack: false }), before = structuredClone(f);
  assert.throws(() => attackTurn(f, { side: 'enemies', index: 0, target: 0 }));
  assert.deepEqual(f, before);
});

test('the Mummy player weapon-destruction rule is not applied to enemy fumbles', () => {
  const f = create({ playerFumble: 'destroy' });
  const r = attackTurn(f, { side: 'enemies', index: 0, target: 0, defense: 'none' }, () => .99);
  assert.equal(r.fumble, 'skip'); assert.equal(f.enemies[0].weaponDestroyed, undefined);
});
