import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MINE_ENCOUNTERS, createMineFight, rollMineRound, settleMineRound, escapeMineFight, finishMineFight } from '../../../public/js/battlesim/engines/skyfall/mine-of-torments.js';

const player = overrides => ({ expertise: 12, vitality: 20, fortune: 10, weaponDamage: 2, ...overrides });
const coins = (...heads) => {
  const values = heads.flatMap(n => Array.from({ length: 4 }, (_, i) => i < n ? 0 : 1));
  let i = 0;
  return () => { assert.ok(i < values.length, 'Unexpected coin toss'); return values[i++]; };
};

test('all Mine encounters use independent health and preserve input characters', () => {
  assert.equal(MINE_ENCOUNTERS.length, 21);
  for (const e of MINE_ENCOUNTERS) {
    const p = player(); const before = structuredClone(p);
    const a = createMineFight(e.section, p); const b = createMineFight(e.section, p);
    a.encounter.foes[0].vitality = 0;
    assert.deepEqual(p, before);
    assert.ok(b.encounter.foes[0].vitality > 0);
    assert.ok(e.foes[0].vitality > 0);
  }
});

test('Yeti fear costs Fortune even when the wound is completely prevented', () => {
  const f = createMineFight(17, player({ expertise: 0, fortune: 3 }));
  rollMineRound(f, 0, coins(0, 0)); settleMineRound(f, { defensePoints: 2 });
  assert.equal(f.player.fortune, 0); assert.equal(f.player.vitality, 20); assert.equal(f.status, 'fighting');
  rollMineRound(f, 0, coins(0, 0)); settleMineRound(f);
  assert.equal(f.status, 'loss'); assert.equal(f.player.vitality, 0);
});

test('underclothes penalty is encounter-only and victory is awarded once', () => {
  const f = createMineFight(167, player({ expertise: 20 }), { underclothes: true });
  f.encounter.foes[0].vitality = 2;
  assert.equal(rollMineRound(f, 0, coins(0, 0)).player.total, 19);
  settleMineRound(f); finishMineFight(f);
  assert.equal(f.player.expertise, 20); assert.equal(f.player.fortune, 12);
});

test('cold applies at the end of each fourth completed round, never on a tie', () => {
  const f = createMineFight(43, player({ expertise: 12 }));
  f.round = 3;
  rollMineRound(f, 0, coins(0, 0)); settleMineRound(f);
  assert.equal(f.round, 3); assert.equal(f.player.vitality, 20);
  rollMineRound(f, 0, coins(1, 0)); settleMineRound(f);
  assert.equal(f.round, 4); assert.equal(f.player.vitality, 19);
});

test('cold death takes priority even if the last enemy is killed that round', () => {
  const f = createMineFight(43, player({ expertise: 20, vitality: 1 }));
  f.round = 3; f.encounter.foes[0].vitality = 1;
  rollMineRound(f, 0, coins(0, 0)); settleMineRound(f);
  assert.equal(f.status, 'loss'); assert.equal(f.player.fortune, 10);
});

test('Mountain Troll needs both attacks beaten and bites instead of two claws', () => {
  const f = createMineFight(36, player());
  const p = rollMineRound(f, 0, coins(0, 0, 4));
  assert.equal(p.hits.length, 0); assert.equal(p.enemyDamage, 1);
  settleMineRound(f);
  f.player.expertise = 0;
  assert.equal(rollMineRound(f, 0, coins(0, 0, 0)).enemyDamage, 3);
});

test('Mountain Troll dies at zero and does not regenerate during this fight', () => {
  const f = createMineFight(36, player({ expertise: 20 }));
  f.encounter.foes[0].vitality = 2;
  rollMineRound(f, 0, coins(0, 0, 0)); settleMineRound(f);
  assert.equal(f.status, 'win'); assert.equal(f.player.fortune, 12);
});

test('five wolves can all be hit but only one gets the +1 Fortune bonus', () => {
  const f = createMineFight(41, player({ expertise: 20 }));
  rollMineRound(f, 0, coins(0, 0, 0, 0, 0, 0));
  settleMineRound(f, { attackBonus: true, bonusHit: 2 });
  assert.deepEqual(f.encounter.foes.map(e => e.vitality), [5, 5, 4, 5, 5]);
  assert.equal(f.player.fortune, 9); assert.equal(escapeMineFight(f), false);
});

test('four-wolf win adds the printed four Fortune and one Expertise once', () => {
  const f = createMineFight(369, player({ expertise: 20, weaponDamage: 7 }));
  rollMineRound(f, 0, coins(0, 0, 0, 0, 0)); settleMineRound(f); finishMineFight(f);
  assert.equal(f.status, 'win'); assert.equal(f.player.fortune, 14); assert.equal(f.player.expertise, 21);
});

test('weaponless Bear encounter suppresses hits and lowers Expertise for two rounds', () => {
  const f = createMineFight(53, player({ expertise: 20 }));
  for (let i = 0; i < 2; i++) {
    const p = rollMineRound(f, 0, coins(0, 0));
    assert.equal(p.player.total, 18); assert.equal(p.hits.length, 0);
    settleMineRound(f);
  }
  const p = rollMineRound(f, 0, coins(0, 0));
  assert.equal(p.player.total, 20); assert.equal(p.hits.length, 1);
});

test('Phantom double embrace costs eight damage, four mandatory Fortune and one Expertise', () => {
  const f = createMineFight(69, player({ expertise: 0, fortune: 6 }));
  rollMineRound(f, 0, coins(0, 0, 0)); settleMineRound(f, { defensePoints: 8 });
  assert.equal(f.player.vitality, 14); assert.equal(f.player.expertise, -1); assert.equal(f.player.fortune, 0);
});

test('Phantom single arm causes two damage without mandatory Fortune', () => {
  const f = createMineFight(69, player({ expertise: 14 }));
  const p = rollMineRound(f, 0, coins(2, 0, 4));
  assert.equal(p.hits.length, 0); assert.equal(p.enemyDamage, 2); assert.equal(p.mandatoryFortune, 0);
});

test('iron mace changes only this Phantom encounter damage and Expertise', () => {
  const f = createMineFight(101, player({ expertise: 20 }));
  assert.equal(f.encounter.foes[0].expertise, 10);
  rollMineRound(f, 0, coins(0, 0, 0)); settleMineRound(f);
  assert.equal(f.encounter.foes[0].vitality, 4); assert.equal(f.player.weaponDamage, 2);
});

test('Goat stops combat on its first successful butt rather than requiring its death', () => {
  const f = createMineFight(116, player());
  rollMineRound(f, 0, coins(0, 0)); settleMineRound(f);
  assert.equal(f.status, 'knocked'); assert.equal(f.player.vitality, 17);
  assert.equal(rollMineRound(f), null);
});

test('failed landing surprise lasts until the player lands a hit', () => {
  const f = createMineFight(123, player(), { failedLanding: true });
  const p = rollMineRound(f, 0, () => 1);
  assert.equal(p.player.total, 9); settleMineRound(f); assert.equal(f.landingActive, true);
  f.player.expertise = 20;
  rollMineRound(f, 0, () => 1); settleMineRound(f);
  assert.equal(f.landingActive, false); assert.equal(f.player.expertise, 20);
});

test('feeding Bear surprise requires one Fortune and lasts one completed round', () => {
  assert.throws(() => createMineFight(189, player({ fortune: 0 }), { ambush: true }));
  const f = createMineFight(189, player(), { ambush: true });
  assert.equal(f.player.fortune, 9);
  assert.equal(rollMineRound(f, 0, () => 1).rolls[0].total, 7);
  settleMineRound(f); assert.equal(f.surpriseActive, false);
});

test('Yeti ambush lasts two completed rounds without permanent enemy Expertise changes', () => {
  const f = createMineFight(207, player());
  for (let i = 0; i < 2; i++) {
    assert.equal(rollMineRound(f, 0, () => 1).rolls[0].total, 9); settleMineRound(f);
  }
  assert.equal(f.surpriseActive, false); assert.equal(f.encounter.foes[0].expertise, 12);
});

test('Timberling fatal attack margin cannot be bought away with Fortune', () => {
  const f = createMineFight(361, player({ expertise: 8, fortune: 50 }));
  rollMineRound(f, 0, coins(0, 0)); settleMineRound(f, { defensePoints: 2 });
  assert.equal(f.status, 'loss'); assert.equal(f.player.vitality, 0);
});

test('second Timberling requires one round before withdrawal; first does not', () => {
  const f = createMineFight(361, player({ expertise: 20 }));
  assert.equal(escapeMineFight(f), false);
  rollMineRound(f, 0, coins(0, 0)); settleMineRound(f);
  assert.equal(escapeMineFight(f), true); assert.equal(f.player.vitality, 18);
  assert.equal(escapeMineFight(createMineFight(196, player())), true);
});

test('normal weapons cannot harm Spectres, with correct later escape costs', () => {
  const f = createMineFight(324, player({ expertise: 20, fortune: 1 }));
  assert.equal(escapeMineFight(f, true), false);
  for (let i = 0; i < 2; i++) {
    const p = rollMineRound(f, 0, coins(0, 0)); assert.equal(p.hits.length, 0); settleMineRound(f);
  }
  assert.equal(f.encounter.foes[0].vitality, 20); assert.equal(escapeMineFight(f), false);
  assert.equal(escapeMineFight(f, true), true); assert.equal(f.player.fortune, 0);
});

test('Mace against Spectres does one base damage without changing global weapon', () => {
  const f = createMineFight(270, player({ expertise: 20 }));
  rollMineRound(f, 0, coins(0, 0)); settleMineRound(f);
  assert.equal(f.encounter.foes[0].vitality, 19); assert.equal(f.player.weaponDamage, 2);
});

test('Vretch must both be beaten to hit both; Fedusar destroys each on a hit', () => {
  const f = createMineFight(294, player({ expertise: 13 }), { fedusar: true });
  const p = rollMineRound(f, 0, coins(2, 0, 4)); assert.equal(p.hits.length, 0);
  settleMineRound(f); f.player.expertise = 20;
  rollMineRound(f, 0, coins(0, 0, 0)); settleMineRound(f);
  assert.equal(f.status, 'win'); assert.equal(f.player.expertise, 21); assert.equal(f.player.fortune, 14);
});

test('pending rounds are stable and invalid Fortune choices do not mutate them', () => {
  const f = createMineFight(72, player()); const pending = rollMineRound(f, 0, coins(4, 0));
  assert.equal(rollMineRound(f), null); assert.equal(f.pending, pending);
  assert.throws(() => settleMineRound(f, { defensePoints: -1 })); assert.equal(f.pending, pending);
  assert.throws(() => createMineFight(72, player({ vitality: 0 })));
});
