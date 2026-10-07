import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PYRAMID_ENCOUNTERS, createPyramidFight, rollPyramidRound, settlePyramidRound, escapePyramidFight, treatPyramidBites } from '../../../public/js/battlesim/engines/skyfall/black-pyramid.js';

const player = overrides => ({ expertise: 12, vitality: 20, fortune: 10, weaponDamage: 2, ...overrides });
const sequence = (...values) => { let i = 0; return () => { assert.ok(i < values.length, 'Unexpected coin toss'); return values[i++]; }; };
const coins = (...heads) => sequence(...heads.flatMap(n => Array.from({ length: 4 }, (_, i) => i < n ? 0 : 1)));

test('all encounters create independent enemy health without changing the character', () => {
  for (const e of PYRAMID_ENCOUNTERS) {
    const p = player(); const before = structuredClone(p);
    const a = createPyramidFight(e.section, p); const b = createPyramidFight(e.section, p);
    assert.deepEqual(p, before);
    a.encounter.foes[0].vitality = -10;
    assert.notEqual(b.encounter.foes[0].vitality, -10);
    assert.notEqual(e.foes[0].vitality, -10);
  }
});

test('hyenas each compare to the same player roll and can both be hit', () => {
  const f = createPyramidFight(88, player({ expertise: 20 }));
  rollPyramidRound(f, 0, coins(0, 0, 0));
  settlePyramidRound(f, { attackBonus: true, bonusHit: 1 });
  assert.deepEqual(f.encounter.foes.map(e => e.vitality), [5, 4]);
  assert.equal(f.player.fortune, 9);
});

test('Fortune prevents hyena wounds and avoids bite counting', () => {
  const f = createPyramidFight(88, player({ expertise: 0 }));
  rollPyramidRound(f, 0, coins(0, 0, 0));
  settlePyramidRound(f, { defensePoints: 2 });
  assert.equal(f.player.vitality, 20); assert.equal(f.bites, 0);
});

test('rabies counts every damaging bite and treatment cannot be applied twice', () => {
  const f = createPyramidFight(88, player({ expertise: 0 }));
  rollPyramidRound(f, 0, coins(0, 0, 0)); settlePyramidRound(f);
  assert.equal(f.bites, 2);
  f.status = 'win';
  assert.equal(treatPyramidBites(f, 'cauterize'), true);
  assert.equal(f.player.vitality, 12);
  assert.equal(treatPyramidBites(f, 'cauterize'), false);
});

test('scorpion double hit stings only once, then costs four not six', () => {
  const f = createPyramidFight(241, player({ expertise: 0 }));
  rollPyramidRound(f, 0, coins(0, 0, 0)); settlePyramidRound(f);
  assert.equal(f.player.vitality, 14); assert.equal(f.poisoned, true);
  rollPyramidRound(f, 0, coins(0, 0, 0)); settlePyramidRound(f);
  assert.equal(f.player.vitality, 10);
});

test('lion requires beating both attacks; mixed results cause no player hit', () => {
  const f = createPyramidFight(310, player());
  const p = rollPyramidRound(f, 0, coins(2, 0, 4));
  assert.equal(p.hits.length, 0); assert.equal(p.enemyDamage, 1);
  settlePyramidRound(f);
  assert.equal(f.encounter.foes[0].vitality, 10);
});

test('lion double hit combines bite and hind paws into six damage', () => {
  const f = createPyramidFight(310, player({ expertise: 0 }));
  assert.equal(rollPyramidRound(f, 0, coins(0, 0, 0)).enemyDamage, 6);
});

test('entangler starts with three active tendrils and adds one per completed round', () => {
  const f = createPyramidFight(250, player({ expertise: 20 }));
  assert.equal(rollPyramidRound(f, 2, coins(0, 0, 0, 0)).rolls.length, 3);
  settlePyramidRound(f, { attackBonus: true });
  assert.equal(f.encounter.foes.filter(e => e.vitality <= 0).length, 1);
  assert.equal(f.player.fortune, 10);
  assert.equal(rollPyramidRound(f, 3, coins(0, 0, 0, 0)).rolls.length, 3);
});

test('entangler rejects blunt weapons', () => {
  assert.throws(() => createPyramidFight(250, player(), { cuttingWeapon: false }));
});

test('chained first hound bonus begins only after the first round', () => {
  const f = createPyramidFight(272, player());
  assert.equal(rollPyramidRound(f, 0, coins(1, 0)).player.total, 13);
  settlePyramidRound(f);
  assert.equal(rollPyramidRound(f, 0, coins(1, 0)).player.total, 14);
  assert.equal(f.player.expertise, 12);
});

test('second chained hound has its bonus from the first round', () => {
  const f = createPyramidFight(304, player());
  assert.equal(rollPyramidRound(f, 0, coins(1, 0)).player.total, 14);
});

test('troll remains alive at zero and regenerates before the next round', () => {
  const f = createPyramidFight(386, player({ expertise: 30 }));
  f.encounter.foes[0].vitality = 2;
  rollPyramidRound(f, 0, coins(0, 0)); settlePyramidRound(f);
  assert.equal(f.status, 'fighting'); assert.equal(f.encounter.foes[0].vitality, 0);
  rollPyramidRound(f, 0, coins(0, 0));
  assert.equal(f.encounter.foes[0].vitality, 1);
  settlePyramidRound(f);
  assert.equal(f.status, 'win'); assert.equal(f.player.fortune, 15);
});

test('troll regeneration is not repeated on tied retries', () => {
  const f = createPyramidFight(386, player({ expertise: 15 }));
  f.encounter.foes[0].vitality = 0; f.regenerating = true;
  rollPyramidRound(f, 0, coins(0, 0)); settlePyramidRound(f);
  assert.equal(f.round, 0); assert.equal(f.encounter.foes[0].vitality, 1);
  rollPyramidRound(f, 0, coins(0, 0)); settlePyramidRound(f);
  assert.equal(f.encounter.foes[0].vitality, 1);
});

test('troll switches to stunning below four but lethal initial wounds stay fatal', () => {
  const f = createPyramidFight(281, player({ expertise: 0, vitality: 5 }));
  rollPyramidRound(f, 0, coins(0, 0)); settlePyramidRound(f);
  assert.equal(f.player.vitality, 2); assert.equal(f.encounter.stunning, true);
  rollPyramidRound(f, 0, coins(0, 0)); settlePyramidRound(f, { defensePoints: 10 });
  assert.equal(f.status, 'captured'); assert.equal(f.player.vitality, 2); assert.equal(f.player.fortune, 10);
  const g = createPyramidFight(281, player({ expertise: 0, vitality: 4 }));
  rollPyramidRound(g, 0, coins(0, 0)); settlePyramidRound(g);
  assert.equal(g.status, 'fighting');
});

test('Cheetah escape wounds first, spends Fortune only if affordable, and cannot revive', () => {
  const f = createPyramidFight(183, player({ fortune: 1 }));
  assert.equal(escapePyramidFight(f), false); assert.equal(f.player.vitality, 17); assert.equal(f.status, 'fighting');
  f.player.fortune = 2;
  assert.equal(escapePyramidFight(f), true); assert.equal(f.player.vitality, 14); assert.equal(f.player.fortune, 0); assert.equal(f.status, 'escaped');
  const dead = createPyramidFight(183, player({ vitality: 3 })); escapePyramidFight(dead);
  assert.equal(dead.status, 'loss');
});

test('opening Ogre blow and Fortune apply once without changing saved input', () => {
  const p = player(); const f = createPyramidFight(214, p, { openingBonus: true });
  assert.equal(f.encounter.foes[0].vitality, 13); assert.equal(f.player.fortune, 9); assert.equal(p.fortune, 10);
});

test('two-round Ogre surprise ends after completed rounds but survives ties', () => {
  const f = createPyramidFight(214, player({ expertise: 30 }));
  rollPyramidRound(f, 0, sequence(0, 0, 0, ...Array(8).fill(1))); settlePyramidRound(f);
  assert.equal(f.surpriseActive, true);
  rollPyramidRound(f, 0, sequence(0, 0, 0, ...Array(8).fill(1))); settlePyramidRound(f);
  assert.equal(f.surpriseActive, false);
});

test('pending Fortune choices survive serialization and refuse a second roll', () => {
  const f = createPyramidFight(172, player()); rollPyramidRound(f, 0, coins(0, 0));
  f.pending.selection = { defensePoints: 2 };
  const reopened = JSON.parse(JSON.stringify(f));
  assert.equal(rollPyramidRound(reopened), null);
  settlePyramidRound(reopened, reopened.pending.selection);
  assert.equal(reopened.player.vitality, 20);
});
