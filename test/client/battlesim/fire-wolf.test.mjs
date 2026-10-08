import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIRE_WOLF_WEAPONS, FIRE_WOLF_ARMOUR, rollFireWolfCharacter, fireWolfNaturalLife,
  fireWolfHitThreshold, fireWolfProtection, fireWolfDamage, createFireWolfFight,
  resolveFireWolfInitiative, rollFireWolfAttack, resolveFireWolfDeathLuck,
  throwFireWolfOrb, healFireWolfWithStone, tryFireWolfCharm, tryFireWolfLightbringer,
  useFireWolfBluePowder } from '../../../public/js/battlesim/engines/demonspawn/fire-wolf.js';
import { FIRE_WOLF_ROSTER, fireWolfEnemy } from '../../../public/js/battlesim/engines/demonspawn/fire-wolf-roster.js';
import { FIRE_WOLF_ENCOUNTERS, prepareFireWolfEncounter, createFireWolfEncounterDuel } from '../../../public/js/battlesim/engines/demonspawn/fire-wolf-encounters.js';
import { createFireWolfManualGroup, rollFireWolfManualAttack, advanceFireWolfManualRound } from '../../../public/js/battlesim/engines/demonspawn/fire-wolf-groups.js';

const low = () => 0;
const high = () => 0.999;
const character = extra => ({ strength: 48, speed: 48, stamina: 48, courage: 48,
  luck: 48, charm: 48, attraction: 48, skill: 0, lifePoints: 336, maxLife: 336,
  weapon: 'sword', armour: 'none', ...extra });
const fight = (p = {}, e = {}, opts = {}) => createFireWolfFight(character(p), character(e), { first: 'player', ...opts });

test('Fire*Wolf rolls seven 2d6 x 8 attributes, zero Skill, and their total Life', () => {
  const p = rollFireWolfCharacter(low);
  for (const key of ['strength', 'speed', 'stamina', 'courage', 'luck', 'charm', 'attraction']) assert.equal(p[key], 16);
  assert.equal(p.skill, 0); assert.equal(p.lifePoints, 112); assert.equal(p.maxLife, 112);
  assert.equal(rollFireWolfCharacter(high).lifePoints, 672);
  assert.equal(fireWolfNaturalLife(character({ skill: 19 })), 355);
});

test('hit threshold takes full tens of Skill and only one Luck bonus', () => {
  for (const [skill, luck, expected] of [[0, 71, 7], [9, 72, 6], [19, 96, 5], [20, 144, 4]]) {
    assert.equal(fireWolfHitThreshold(character({ skill, luck })), expected);
  }
});

test('standard weapon and armour values match the printed tables', () => {
  assert.deepEqual(Object.values(FIRE_WOLF_ARMOUR), [0, 5, 8, 12]);
  assert.equal(FIRE_WOLF_WEAPONS.axe, 15); assert.equal(FIRE_WOLF_WEAPONS.flail, 7);
  assert.equal(FIRE_WOLF_WEAPONS.halberd, 12); assert.equal(FIRE_WOLF_WEAPONS.mace, 14);
  assert.equal(FIRE_WOLF_WEAPONS.doombringer, 20);
  assert.equal(fireWolfProtection(character({ shield: true })), 7);
  assert.equal(fireWolfProtection(character({ armour: 'plate', shield: true })), 17);
});

test('damage uses excess roll x 10, Strength/8, weapon and protection, with no healing on blocked hits', () => {
  assert.equal(fireWolfDamage(character(), character(), 10), 46);
  assert.equal(fireWolfDamage(character(), character({ armour: 'plate', shield: true }), 10), 29);
  assert.equal(fireWolfDamage(character({ weapon: 'unarmed' }), character({ armour: 'plate' }), 7), 0);
  assert.equal(fireWolfDamage(character(), character(), 6), 0);
});

test('new fights isolate their character, enemy, and option snapshots', () => {
  const p = character(), e = character(); const options = { first: 'player', nested: { value: 1 } };
  const before = structuredClone({ p, e, options }); const f = createFireWolfFight(p, e, options);
  rollFireWolfAttack(f, high); f.options.nested.value = 2;
  assert.deepEqual({ p, e, options }, before);
});

test('initiative ties stay unresolved and do not assign an arbitrary first attacker', () => {
  const f = createFireWolfFight(character(), character());
  assert.equal(resolveFireWolfInitiative(f, low), null);
  assert.equal(f.turn, null); assert.equal(rollFireWolfAttack(f, high), null);
  f.player.speed += 1; assert.equal(resolveFireWolfInitiative(f, low), 'player');
});

test('the player rests for exactly two enemy attacks after their endurance limit', () => {
  const f = fight({ stamina: 10 }, { strength: 0, weapon: 'unarmed' });
  assert.equal(rollFireWolfAttack(f, low).side, 'player');
  assert.equal(rollFireWolfAttack(f, low).side, 'enemy');
  assert.equal(rollFireWolfAttack(f, low).kind, 'rest');
  assert.equal(rollFireWolfAttack(f, low).side, 'enemy');
  assert.equal(rollFireWolfAttack(f, low).kind, 'rest');
  assert.equal(rollFireWolfAttack(f, low).side, 'enemy');
  assert.equal(f.rest, 0); assert.equal(f.attacks, 0);
  assert.equal(rollFireWolfAttack(f, low).side, 'player');
  assert.equal(f.enemyTurns, 3);
});

test('Doombringer charges ten Life even when it misses', () => {
  const f = fight({ weapon: 'doombringer' });
  assert.equal(rollFireWolfAttack(f, low).damage, 0);
  assert.equal(f.player.lifePoints, 326);
});

test('Doombringer can kill its wielder before a hit or lifesteal', () => {
  const f = fight({ weapon: 'doombringer', lifePoints: 10 });
  assert.equal(rollFireWolfAttack(f, high).kind, 'doombringer-cost');
  assert.equal(f.enemy.lifePoints, 336); assert.equal(f.pending, 'death-luck');
});

test('Doombringer heals inflicted damage up to the natural maximum', () => {
  const f = fight({ weapon: 'doombringer', lifePoints: 300 });
  assert.equal(rollFireWolfAttack(f, high).damage, 76);
  assert.equal(f.player.lifePoints, 336);
});

test('death Luck requires strictly less than Luck, resets both combatants, and cannot be repeated', () => {
  const equality = fight({ lifePoints: 1, luck: 16 }, {}, { first: 'enemy' });
  rollFireWolfAttack(equality, high); assert.equal(equality.pending, 'death-luck');
  assert.equal(resolveFireWolfDeathLuck(equality, low), false); assert.equal(equality.outcome, 'loss');
  const f = fight({ lifePoints: 1, luck: 17 }, { lifePoints: 20 }, { first: 'enemy' });
  rollFireWolfAttack(f, high); assert.equal(resolveFireWolfDeathLuck(f, low), true);
  assert.equal(f.player.lifePoints, 336); assert.equal(f.enemy.lifePoints, 336);
  f.player.lifePoints = 1; rollFireWolfAttack(f, high);
  assert.equal(f.outcome, 'loss'); assert.equal(f.pending, null);
  assert.equal(resolveFireWolfDeathLuck(f, low), null);
});

test('Baldar sparring is nonfatal at 50 Life, awards surviving-fight Skill once, and needs no Luck test', () => {
  const f = fight({ lifePoints: 51 }, {}, { sparring: true, first: 'enemy' });
  rollFireWolfAttack(f, high);
  assert.equal(f.outcome, 'defeat'); assert.equal(f.pending, null);
  assert.equal(f.player.skill, 1); assert.equal(f.player.maxLife, 337);
  rollFireWolfAttack(f, high); assert.equal(f.player.skill, 1);
});

test('death Luck resets temporary paralysis and the restarted fight healing boundary', () => {
  const f = fight({ luck: 96, lifePoints: 0, healingStone: 10 });
  f.pending = 'death-luck'; f.paralysedPlayerRounds = 2; f.stoneUsedAt = 1;
  f.enemyTurns = 7; assert.equal(resolveFireWolfDeathLuck(f, low), true);
  assert.equal(f.paralysedPlayerRounds, 0); assert.equal(f.enemyTurns, 0);
  assert.equal(f.stoneUsedAt, null);
  f.enemyTurns = 1; f.player.lifePoints -= 6;
  assert.equal(healFireWolfWithStone(f, high), 6);
});

test('normal victories award one Skill and one Life exactly once', () => {
  const f = fight({}, { lifePoints: 1 }); rollFireWolfAttack(f, high);
  assert.equal(f.outcome, 'win'); assert.equal(f.player.skill, 1); assert.equal(f.player.lifePoints, 337);
  rollFireWolfAttack(f, high); assert.equal(f.player.skill, 1);
});

test('held Orb doubles damage only against Demonspawn', () => {
  for (const [demonspawn, expected] of [[false, 66], [true, 132]]) {
    assert.equal(rollFireWolfAttack(fight({}, {}, { orbHeld: true, demonspawn }), high).damage, expected);
  }
});

test('thrown Orb is consumed on hits, misses, and non-Spawn targets', () => {
  for (const [demonspawn, random, damage] of [[true, high, 336], [true, low, 200], [false, high, 0]]) {
    const f = fight({}, {}, { orbHeld: true, demonspawn });
    assert.equal(throwFireWolfOrb(f, random).damage, damage);
    assert.equal(f.options.orbHeld, false); assert.equal(throwFireWolfOrb(f, random), null);
  }
});

test('Regent sword cycles +10, +20, +20 x 1d6 independently of initiative', () => {
  const f = fight({}, {}, { first: 'enemy', regentSword: true });
  const damages = [];
  for (let n = 0; n < 4; n++) {
    damages.push(rollFireWolfAttack(f, high).damage);
    if (!f.pending) rollFireWolfAttack(f, low);
  }
  assert.deepEqual(damages, [66, 76, 176, 66]);
});

test('healing stone is capped by its remaining pool and cannot revive the dead', () => {
  const f = fight({ healingStone: 5, lifePoints: 332 });
  assert.equal(healFireWolfWithStone(f, high), 0);
  rollFireWolfAttack(f, low); rollFireWolfAttack(f, low);
  assert.equal(healFireWolfWithStone(f, high), 4); assert.equal(f.player.healingStone, 1);
  assert.equal(healFireWolfWithStone(f, high), 0); f.player.lifePoints -= 5;
  assert.equal(healFireWolfWithStone(f, high), 0);
  rollFireWolfAttack(f, low); rollFireWolfAttack(f, low);
  assert.equal(healFireWolfWithStone(f, high), 1); assert.equal(f.player.healingStone, 0);
  f.player.lifePoints = 0; f.player.healingStone = 50;
  assert.equal(healFireWolfWithStone(f, high), 0);
});

test('printed roster totals and separate Tigon Charm/Attraction values are preserved', () => {
  assert.equal(FIRE_WOLF_ROSTER.length, 17);
  assert.equal(fireWolfEnemy('Tigon').charm, 9); assert.equal(fireWolfEnemy('Tigon').attraction, 5);
  assert.equal(fireWolfEnemy('Landlord').lifePoints, 335);
  assert.equal(fireWolfEnemy('Northern Slaver').lifePoints, 283);
  for (const e of FIRE_WOLF_ROSTER.filter(e => !['Landlord', 'Northern Slaver'].includes(e.name))) {
    assert.equal(fireWolfNaturalLife(e), e.lifePoints);
  }
  const enemy = fireWolfEnemy('Baldar'); enemy.lifePoints = 1;
  assert.equal(fireWolfEnemy('Baldar').lifePoints, 412);
  assert.throws(() => fireWolfEnemy('invented'), /Unknown/);
});

test('pantherine Charm escape uses both strict comparisons and cannot be rerolled', () => {
  const f = fight({ charm: 17 }, { charm: 10 }, { charmEscape: true });
  assert.equal(tryFireWolfCharm(f, low), true); assert.equal(f.outcome, 'avoided');
  assert.equal(f.player.skill, 0); assert.equal(tryFireWolfCharm(f, high), null);
  const equal = fight({ charm: 16 }, { charm: 10 }, { charmEscape: true });
  assert.equal(tryFireWolfCharm(equal, low), false); assert.equal(tryFireWolfCharm(equal, low), null);
  assert.equal(tryFireWolfCharm(fight({ charm: 10 }, { charm: 10 }, { charmEscape: true }), low), false);
});

test('lit and dark pantherine pits use the printed one-die failure ranges', () => {
  const rolls = list => () => list.shift();
  const lit = fight({}, { lifePoints: 1 }, { pitThreshold: 1 });
  const r = rollFireWolfAttack(lit, rolls([0.999, 0.999, 0]));
  assert.equal(r.pitRoll, 1); assert.equal(lit.outcome, 'pit'); assert.equal(lit.player.skill, 0);
  const safe = fight({}, { lifePoints: 1 }, { pitThreshold: 1 });
  rollFireWolfAttack(safe, rolls([0.999, 0.999, 0.2])); assert.equal(safe.outcome, 'win');
  const dark = fight({}, {}, { pitThreshold: 3 });
  rollFireWolfAttack(dark, rolls([0, 0, 0.4])); assert.equal(dark.outcome, 'pit');
});

test('Lightbringer requires a strictly lower roll and grants exactly three consecutive blows', () => {
  const f = fight({ skill: 3 }, {}, { lightbringer: true });
  assert.equal(tryFireWolfLightbringer(f, low), true);
  assert.equal(tryFireWolfLightbringer(f, low), null);
  for (let i = 0; i < 3; i++) assert.equal(rollFireWolfAttack(f, low).side, 'player');
  assert.equal(rollFireWolfAttack(f, low).side, 'enemy');
  assert.equal(tryFireWolfLightbringer(fight({ skill: 2 }, {}, { lightbringer: true }), low), false);
});

test('blue powder requires an open flame, consumes one flash, and blinds for exactly two enemy turns', () => {
  const f = fight({ bluePowder: 12 }, {}, { openFlame: true });
  assert.equal(useFireWolfBluePowder(f), true); assert.equal(f.player.bluePowder, 11);
  for (let i = 0; i < 2; i++) {
    assert.equal(rollFireWolfAttack(f, low).side, 'player');
    assert.equal(rollFireWolfAttack(f, high).kind, 'blinded');
  }
  rollFireWolfAttack(f, low); assert.equal(rollFireWolfAttack(f, high).side, 'enemy');
  assert.equal(useFireWolfBluePowder(fight({ bluePowder: 12 })), false);
  assert.equal(useFireWolfBluePowder(fight({ bluePowder: 0 }, {}, { openFlame: true })), false);
});

test('source encounters configure their explicit weapon, first-strike and nonfatal rules', () => {
  assert.equal(FIRE_WOLF_ENCOUNTERS.length, 21);
  const p = character(); const before = structuredClone(p);
  const spar = createFireWolfEncounterDuel(prepareFireWolfEncounter('prologue', p));
  assert.equal(spar.player.weapon, 'club'); assert.equal(spar.enemy.weapon, 'club'); assert.equal(spar.options.sparring, true);
  assert.equal(createFireWolfEncounterDuel(prepareFireWolfEncounter(3, p)).turn, 'enemy');
  assert.equal(createFireWolfEncounterDuel(prepareFireWolfEncounter(127, p)).turn, 'player');
  assert.deepEqual(p, before);
});

test('Baj entry restores current Life and both combatants fight unarmed', () => {
  const f = createFireWolfEncounterDuel(prepareFireWolfEncounter(7, character({ lifePoints: 51 })));
  assert.equal(f.player.lifePoints, 336); assert.equal(f.player.weapon, 'unarmed'); assert.equal(f.enemy.weapon, 'unarmed');
});

test('darkness gives Pantherine first strike unless Lightbringer has been acquired', () => {
  assert.equal(createFireWolfEncounterDuel(prepareFireWolfEncounter(54, character())).turn, 'enemy');
  assert.equal(createFireWolfEncounterDuel(prepareFireWolfEncounter(54, character(), { lightbringer: true })).turn, null);
});

test('hound first strike applies only to the first enemy and sequential enemies do not share mutable snapshots', () => {
  const prepared = prepareFireWolfEncounter(66, character());
  assert.equal(createFireWolfEncounterDuel(prepared, 0).turn, 'enemy');
  assert.equal(createFireWolfEncounterDuel(prepared, 1).turn, null);
  const pack = prepareFireWolfEncounter(62, character());
  assert.equal(pack.enemies.length, 12); pack.enemies[0].lifePoints = 1;
  assert.equal(pack.enemies[1].lifePoints, 394);
});

test('unspecified bandit/slaver group order is not silently treated as sequential duels', () => {
  for (const section of [4, 128, 133, 147]) {
    const p = prepareFireWolfEncounter(section, character());
    assert.equal(p.encounter.manualGroup, true);
    assert.throws(() => createFireWolfEncounterDuel(p), /manual turn/);
  }
  const bandits = prepareFireWolfEncounter(4, character());
  assert.equal(bandits.enemies[0].lifePoints, 252); assert.equal(bandits.enemies[1].lifePoints, 272);
});

test('Doppelganger copies player fighting statistics but not Doombringer magic', () => {
  const f = createFireWolfEncounterDuel(prepareFireWolfEncounter(36, character({ skill: 39, lifePoints: 120 })));
  assert.equal(f.enemy.skill, 39); assert.equal(f.enemy.lifePoints, 120); assert.equal(f.enemy.weapon, 'sword');
  assert.equal(f.enemy.magicArmour, 0); assert.equal(f.player.weapon, 'doombringer');
});

test('Illusion Lizard requires imagined statistics instead of fabricated defaults and keeps printed 384 Life', () => {
  assert.throws(() => prepareFireWolfEncounter(19, character()), /imagined/);
  const f = createFireWolfEncounterDuel(prepareFireWolfEncounter(19, character(), { illusion: character({ strength: 88, stamina: 16 }) }));
  assert.equal(f.enemy.strength, 88); assert.equal(f.enemy.stamina, 16); assert.equal(f.enemy.lifePoints, 384);
});

test('manual groups require every foe to be defeated and award bandit Skill only on completion', () => {
  const f = createFireWolfManualGroup(prepareFireWolfEncounter(4, character()));
  f.enemies[0].lifePoints = 1; f.enemies[1].lifePoints = 1;
  rollFireWolfManualAttack(f, 'player', 0, high);
  assert.equal(f.outcome, null); assert.equal(f.player.skill, 0);
  assert.equal(rollFireWolfManualAttack(f, 'enemy', 0, high), null);
  rollFireWolfManualAttack(f, 'player', 1, high);
  assert.equal(f.outcome, 'win'); assert.equal(f.player.skill, 2);
  assert.equal(rollFireWolfManualAttack(f, 'player', 1, high), null);
});

test('bandit bleeding applies only to explicit round boundaries and only to the wounded bandit', () => {
  const f = createFireWolfManualGroup(prepareFireWolfEncounter(4, character()));
  assert.equal(f.enemies[0].lifePoints, 252);
  rollFireWolfManualAttack(f, 'player', 1, low);
  assert.equal(f.enemies[0].lifePoints, 252);
  advanceFireWolfManualRound(f);
  assert.equal(f.enemies[0].lifePoints, 242); assert.equal(f.enemies[1].lifePoints, 272);
  assert.equal(f.manualRound, 1);
});

test('successful group death Luck restores all opponents without changing source snapshots', () => {
  const prepared = prepareFireWolfEncounter(128, character({ lifePoints: 1, luck: 17 }));
  const f = createFireWolfManualGroup(prepared); f.enemies[0].lifePoints = 1;
  rollFireWolfManualAttack(f, 'enemy', 1, high);
  assert.equal(f.pending, 'death-luck'); assert.equal(resolveFireWolfDeathLuck(f, low), true);
  assert.deepEqual(f.enemies.map(enemy => enemy.lifePoints), [354, 283, 335]);
  assert.equal(prepared.enemies[0].lifePoints, 354);
});
