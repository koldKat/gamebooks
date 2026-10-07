import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GARDEN_ENCOUNTERS, createGardenFight, rollGardenRound, settleGardenRound,
  escapeGardenFight, finishGardenFight, takeGardenHalberd } from '../../../public/js/battlesim/engines/skyfall/garden-of-madness.js';

const player = extra => ({ expertise: 12, vitality: 20, fortune: 10, weaponDamage: 2, ...extra });
const heads = () => 0;
const tails = () => 1;

test('Garden encounters preserve source data and input characters', () => {
  assert.equal(GARDEN_ENCOUNTERS.length, 26);
  for (const entry of GARDEN_ENCOUNTERS) {
    const p = player(); const before = structuredClone(p);
    const a = createGardenFight(entry.section, p); const b = createGardenFight(entry.section, p);
    a.encounter.foes[0].expertise = 99;
    assert.deepEqual(p, before); assert.notEqual(b.encounter.foes[0].expertise, 99);
    assert.notEqual(entry.foes[0].expertise, 99);
  }
});

test('unprinted Vitality, damage and Expertise remain null, not invented', () => {
  assert.equal(createGardenFight(361, player()).encounter.foes[0].vitality, null);
  assert.equal(createGardenFight(361, player()).encounter.foes[0].damage, null);
  assert.equal(createGardenFight(287, player()).encounter.foes[0].expertise, null);
});

for (const [section, damage] of [[8, 5], [10, 1], [15, 3], [276, 5]]) {
  test(`Wyvern ${section} breathes on a completed player-winning round`, () => {
    const f = createGardenFight(section, player({ expertise: 30 }));
    rollGardenRound(f, 0, heads); settleGardenRound(f);
    assert.equal(f.player.vitality, 20 - damage);
  });
  test(`Wyvern ${section} forgets its breath for one Fortune`, () => {
    const f = createGardenFight(section, player({ expertise: 30 }));
    rollGardenRound(f, 0, heads); settleGardenRound(f, { preventSpecial: true });
    assert.equal(f.player.vitality, 20); assert.equal(f.player.fortune, 9);
  });
}

test('Blue lightning gives the enemy surprise in the next round only if not prevented', () => {
  const f = createGardenFight(15, player({ expertise: 30 }));
  rollGardenRound(f, 0, tails); settleGardenRound(f);
  assert.equal(f.surprise, 'enemy');
  assert.equal(rollGardenRound(f, 0, tails).player.total, 27);
  settleGardenRound(f, { preventSpecial: true }); assert.equal(f.surprise, 'none');
});

test('ties do not consume Fortune, cause breath or advance surprise', () => {
  const f = createGardenFight(8, player({ expertise: 14 }), { surprise: 'player' });
  rollGardenRound(f, 0, heads); settleGardenRound(f, { preventSpecial: true });
  assert.equal(f.round, 0); assert.equal(f.player.vitality, 20);
  assert.equal(f.player.fortune, 10); assert.equal(f.surprise, 'player');
});

test('victory rewards occur once and simultaneous player death takes priority', () => {
  const f = createGardenFight(8, player({ expertise: 30, weaponDamage: 15 }));
  rollGardenRound(f, 0, tails); settleGardenRound(f); finishGardenFight(f);
  assert.equal(f.status, 'win'); assert.equal(f.player.fortune, 15); assert.equal(f.player.expertise, 31);
  const dead = createGardenFight(8, player({ expertise: 30, weaponDamage: 15, vitality: 5 }));
  rollGardenRound(dead, 0, tails); settleGardenRound(dead);
  assert.equal(dead.status, 'loss'); assert.equal(dead.player.fortune, 10);
});

test('pit fight requires four flowers, only then awards two Fortune', () => {
  const f = createGardenFight(60, player({ expertise: 30 }));
  for (let i = 0; i < 4; i++) { rollGardenRound(f, 0, heads); settleGardenRound(f); }
  assert.equal(f.defeated, 4); assert.equal(f.status, 'win'); assert.equal(f.player.fortune, 12);
  assert.equal(f.player.expertise, 30);
});

test('snapdragons inflict the printed minimum ten damage over four rounds', () => {
  for (const section of [141, 173]) {
    const f = createGardenFight(section, player({ expertise: 30 })); const losses = [];
    for (let i = 0; i < 4; i++) { rollGardenRound(f, 0, heads); losses.push(settleGardenRound(f).playerLoss); }
    assert.deepEqual(losses, [4, 3, 2, 1]); assert.equal(f.status, 'survived');
    assert.equal(f.player.vitality, 10); assert.equal(f.player.fortune, 10);
  }
});

test('snapdragon misses leave all remaining flowers biting', () => {
  const f = createGardenFight(141, player({ expertise: 0 }));
  rollGardenRound(f, 0, tails); settleGardenRound(f);
  assert.equal(f.player.vitality, 15); assert.equal(f.flowers, 5);
});

test('first tripodal hit infects even if Fortune prevents the wound', () => {
  const f = createGardenFight(105, player({ expertise: 0 }));
  rollGardenRound(f, 0, heads); settleGardenRound(f, { defensePoints: 4 });
  assert.equal(f.diseased, true); assert.equal(f.status, 'infected'); assert.equal(f.player.vitality, 20);
  const next = createGardenFight(105, f.player, { previous: f });
  rollGardenRound(next, 0, heads); settleGardenRound(next);
  assert.equal(next.status, 'fighting'); assert.equal(next.player.vitality, 16);
});

test('tripodal continuation keeps wounded enemy health and infection', () => {
  const f = createGardenFight(374, player(), { diseased: true }); f.encounter.foes[0].vitality = 11;
  const next = createGardenFight(384, f.player, { previous: f, companions: 8 });
  assert.equal(next.encounter.foes[0].vitality, 11); assert.equal(next.diseased, true);
  assert.equal(next.encounter.rounds, 8); assert.equal(next.encounter.escapeAfter, 8);
  assert.equal(f.encounter.foes[0].vitality, 11);
});

test('sludge encounter cannot escape and does not double-apply manual entry penalties', () => {
  const f = createGardenFight(174, player({ expertise: 10 }));
  assert.equal(f.player.expertise, 10); assert.equal(escapeGardenFight(f), false); assert.equal(f.diseased, true);
});

test('weaponless landing prevents player hits for two rounds', () => {
  const f = createGardenFight(190, player({ expertise: 30 }));
  for (let i = 0; i < 2; i++) { assert.equal(rollGardenRound(f, 0, heads).hits.length, 0); settleGardenRound(f); }
  assert.equal(f.status, 'survived'); assert.equal(f.encounter.foes[0].vitality, 30);
});

test('third Hobgoblin joins after two rounds with its source weapon', () => {
  for (const daggerTaken of [false, true]) {
    const f = createGardenFight(176, player({ expertise: 30, weaponDamage: 7 }), { daggerTaken });
    rollGardenRound(f, 0, heads); settleGardenRound(f); assert.equal(f.status, 'fighting');
    rollGardenRound(f, 0, heads); settleGardenRound(f);
    assert.equal(f.encounter.foes.length, 3); assert.equal(f.encounter.foes[2].expertise, daggerTaken ? 9 : 11);
    rollGardenRound(f, 2, heads); settleGardenRound(f); assert.equal(f.status, 'win');
  }
});

test('guardian gaps cost six damage and do not pretend to be a victory', () => {
  const f = createGardenFight(177, player());
  for (let i = 0; i < 3; i++) { rollGardenRound(f, 0, tails); settleGardenRound(f); }
  assert.equal(f.player.vitality, 14); assert.equal(f.status, 'survived'); assert.equal(f.player.fortune, 10);
});

test('guardian armour is dispelled on the first hit without fabricated health', () => {
  const f = createGardenFight(180, player({ expertise: 30 }));
  rollGardenRound(f, 0, tails); settleGardenRound(f); assert.equal(f.status, 'dispelled');
  assert.equal(f.encounter.foes[0].vitality, null);
});

test('five guards all compare against one player and ringmail only reduces encounter Expertise', () => {
  const f = createGardenFight(191, player({ expertise: 30, weaponDamage: 9 }));
  const p = rollGardenRound(f, 0, tails); assert.equal(p.player.total, 29); assert.equal(p.hits.length, 5);
  settleGardenRound(f); assert.equal(f.status, 'win'); assert.equal(f.player.fortune, 15); assert.equal(f.player.expertise, 31);
});

test('Slug has no attack roll, spittle uses E minus three tails, escape costs four damage', () => {
  const f = createGardenFight(287, player());
  const p = rollGardenRound(f, 0, tails); assert.equal(p.player.total, 9); assert.deepEqual(p.rolls, []);
  assert.equal(p.enemyDamage, 4); settleGardenRound(f); assert.equal(f.player.vitality, 16);
  assert.equal(escapeGardenFight(f), true); assert.equal(f.player.vitality, 12);
});

test('Greater Hobgoblin fight selects only one enemy by coin per round', () => {
  const f = createGardenFight(291, player({ expertise: 30 }));
  const p = rollGardenRound(f, 0, heads); assert.equal(p.rolls.length, 1); assert.equal(p.hits[0].index, 1);
  settleGardenRound(f); assert.deepEqual(f.encounter.foes.map(e => e.vitality), [11, 9]);
});

test('bodyguards permit taking a fallen halberd and fatal reinforcements after ten rounds', () => {
  const f = createGardenFight(297, player({ expertise: 30 }));
  assert.equal(takeGardenHalberd(f), false); f.encounter.foes[0].vitality = 0;
  assert.equal(takeGardenHalberd(f), true); assert.equal(f.player.weaponDamage, 4);
  f.round = 9; rollGardenRound(f, 1, tails); settleGardenRound(f);
  assert.equal(f.status, 'loss'); assert.equal(f.player.vitality, 0);
});

test('last bodyguard may be defeated on round ten before reinforcements', () => {
  const f = createGardenFight(297, player({ expertise: 30, weaponDamage: 13 })); f.round = 9;
  rollGardenRound(f, 0, tails); settleGardenRound(f); assert.equal(f.status, 'win');
});

test('crossbow bolt can be redirected for Fortune, otherwise hits the player', () => {
  const f = createGardenFight(348, player({ expertise: 30 }));
  rollGardenRound(f, 0, tails); settleGardenRound(f, { preventSpecial: true });
  assert.equal(f.player.vitality, 20); assert.equal(f.player.fortune, 9); assert.equal(f.encounter.foes[0].vitality, 3);
  rollGardenRound(f, 0, tails); settleGardenRound(f); assert.equal(f.player.vitality, 18);
});

test('Princess needs only one hit; her poison ends combat on her first hit', () => {
  const f = createGardenFight(361, player({ expertise: 30 }));
  rollGardenRound(f, 0, tails); settleGardenRound(f); assert.equal(f.status, 'stunned');
  const dead = createGardenFight(361, player({ expertise: 0 }));
  rollGardenRound(dead, 0, tails); settleGardenRound(dead); assert.equal(dead.status, 'loss');
});

test('poison tentacles need one Fortune per successful enemy hit or cause death', () => {
  const f = createGardenFight(382, player({ expertise: 0, fortune: 2 }));
  rollGardenRound(f, 0, tails); settleGardenRound(f); assert.equal(f.player.fortune, 0); assert.equal(f.player.vitality, 20);
  rollGardenRound(f, 0, tails); settleGardenRound(f); assert.equal(f.status, 'loss');
});

test('all six tentacles must die, one target at a time, before crossing succeeds', () => {
  const f = createGardenFight(382, player({ expertise: 30, weaponDamage: 5 }));
  for (let i = 0; i < 6; i++) { const p = rollGardenRound(f, i % 2, tails); assert.equal(p.hits.length, 1); settleGardenRound(f); }
  assert.equal(f.defeated, 3); assert.equal(f.status, 'win'); assert.equal(f.player.fortune, 10);
});

test('invalid Fortune selections leave the pending round intact', () => {
  const f = createGardenFight(8, player()); rollGardenRound(f, 0, tails);
  assert.throws(() => settleGardenRound(f, { defensePoints: 1.5 })); assert.ok(f.pending);
  assert.equal(escapeGardenFight(f), false); assert.equal(rollGardenRound(f), null);
});

test('hidden surprise selection cannot leak into unrelated encounters', () => {
  assert.equal(createGardenFight(325, player(), { surprise: 'enemy' }).surprise, 'none');
  assert.equal(createGardenFight(191, player(), { surprise: 'enemy' }).surprise, 'enemy');
});
