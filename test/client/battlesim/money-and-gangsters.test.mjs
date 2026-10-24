import { loadFixtureRoster } from './roster-fixtures.mjs';
await loadFixtureRoster(700);
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHECKS, PLAYER_DEFAULTS, UNARMED_RETURNS, SHOOTING_RETURNS, unarmedEncounter, shootingEncounter } from '../../../public/js/battlesim/books/700/definition.js';
import { startUnarmedFight, stepUnarmedFight, unarmedActions, startShootingFight,
  stepShootingFight, shootingActions, convertShootingToUnarmed, evaluateCheck } from '../../../public/js/battlesim/books/700/combat.js';
import { createState } from '../../../public/js/battlesim/books/700/state.js';
import en from '../../../public/js/i18n/en/battlesim/battlesim700.js';
import bg from '../../../public/js/i18n/bg/battlesim/battlesim700.js';

const player = (changes = {}) => ({ ...PLAYER_DEFAULTS, strength: 10, dexterity: 9, speed: 8, ...changes });

test('700: simplified checks preserve strict boundaries, styles and the shooting-plus-speed formula', () => {
  const values = { strength: 8, speed: 8, dexterity: 8, combatSkill: 8, shooting: 8, primaryPower: 5, strikingStyle: true, douglas: false };
  for (const [id, changes, destination] of [
    [42, {}, 13], [42, { strength: 9 }, 23],
    [101, {}, 131], [101, { strikingStyle: false }, 121], [101, { strength: 7 }, 141],
    [111, { strength: 10 }, 141], [111, { strength: 11 }, 131], [111, { strength: 11, strikingStyle: false }, 121],
    [175, {}, 167], [175, { douglas: true }, 157], [175, { strength: 16 }, 167],
    [210, {}, 240], [210, { speed: 7 }, 230],
    [230, {}, 260], [230, { strength: 5 }, 250],
    [252, {}, 262], [252, { primaryPower: 0, shooting: 5 }, null],
    [256, { combatSkill: 4 }, 286], [256, { combatSkill: 5 }, 296],
    ['83-smg', { shooting: 2, speed: 6, combatSkill: 0 }, 124],
    ['83-smg', { shooting: 2, speed: 3, combatSkill: 100 }, 114],
    ['83-pistol', {}, 104], ['83-pistol', { speed: 7 }, 114],
  ]) assert.equal(evaluateCheck(id, { ...values, ...changes }).destination, destination, String(id));
  assert.equal(evaluateCheck(252, { ...values, primaryPower: 0, shooting: 6 }).reason, 'overlap');
  for (const speed of [4, 5]) assert.equal(evaluateCheck('83-smg', { ...values, speed, shooting: 2 }).reason, 'gap');
  assert.equal(evaluateCheck(257, { strength: 6, dexterity: 6 }).result, 'success');
  assert.equal(evaluateCheck(257, { strength: 5, dexterity: 6 }).result, 'injury');
  assert.equal(evaluateCheck(228, { shooting: 8, primaryPower: 19 }).result, 'death');
  assert.equal(evaluateCheck(228, { shooting: 8, primaryPower: 20 }).destination, 209);
});

test('700: squad calculations preserve casualty bands and do not invent half-person rounding', () => {
  for (const [power, losses] of [[30, 6], [31, 4], [59, 4], [60, 2]]) {
    const result = evaluateCheck(216, { fighters: 20, primaryPower: power });
    assert.equal(result.losses, losses); assert.equal(result.remaining, 20 - losses); assert.equal(result.destination, 207);
  }
  assert.equal(evaluateCheck(226, { fighters: 8, primaryPower: 15 }).destination, 216);
  assert.equal(evaluateCheck(226, { fighters: 8, primaryPower: 16 }).losses, 4);
  assert.equal(evaluateCheck(226, { fighters: 7, primaryPower: 19 }).reason, 'half');
  assert.equal(evaluateCheck(226, { fighters: 8, primaryPower: 20 }).losses, 1);
  for (const [id, field, losses] of [[242, 'labDamage', [6, 4, 2, 0]], [243, 'barracksDamage', [4, 3, 0]],
    [273, 'barracksDamage', [2, 1]], [282, 'labDamage', [3, 2, 1]]]) {
    losses.forEach((count, damage) => assert.equal(evaluateCheck(id, { fighters: 24, [field]: damage }).losses, count));
  }
  assert.equal(evaluateCheck(261, { fighters: 24, squads: 3, attackHelis: false }).remaining, 8);
  assert.equal(evaluateCheck(261, { fighters: 16, squads: 2, attackHelis: false }).result, 'death');
  assert.equal(evaluateCheck(261, { fighters: 8, squads: 1, attackHelis: true }).losses, 0);
  assert.equal(evaluateCheck(220, { fighters: 10 }).remaining, 0);
  assert.equal(evaluateCheck(220, { fighters: 10 }).destination, 210);
  assert.equal(evaluateCheck(220, { fighters: 9 }).result, 'death');
  assert.equal(evaluateCheck(242, { fighters: 6, labDamage: 0 }).result, 'death');
  assert.equal(evaluateCheck(243, { fighters: 3, barracksDamage: 1 }).result, 'death');
  assert.equal(evaluateCheck(284, { fighters: 2, guardPosted: false, day: 15 }).result, 'casualties');
});

test('700: split attacks and calendar checks use the actual assigned force and day parity', () => {
  assert.equal(evaluateCheck(283, { fighters: 12, groups: 3, groupSize: 4 }).losses, 0);
  assert.equal(evaluateCheck(292, { fighters: 12, groups: 3, groupSize: 4 }).losses, 1);
  for (const id of [283, 292]) {
    assert.equal(evaluateCheck(id, { fighters: 9, groups: 3, groupSize: 3 }).losses, 3);
    assert.equal(evaluateCheck(id, { fighters: 6, groups: 3, groupSize: 2 }).losses, 3);
    assert.equal(evaluateCheck(id, { fighters: 6, groups: 3, groupSize: 2 }).destination, id === 283 ? 273 : 282);
  }
  for (const sequential of [false, true]) for (const day of [14, 15]) {
    const result = evaluateCheck(268, { fighters: 12, sequential, day });
    assert.equal(result.losses, sequential ? 2 : day % 2);
    assert.equal(result.destination, sequential && day % 2 ? 298 : 288);
  }
  for (const guardPosted of [false, true]) for (const day of [14, 15]) {
    const result = evaluateCheck(284, { fighters: 12, guardPosted, day });
    assert.equal(result.losses, !guardPosted && day % 2 ? 2 : 0); assert.equal(result.destination, 269);
  }
});

test('700: advisory helpers reject incomplete values and never mutate their inputs', () => {
  const fixture = { ...player(), primaryPower: 40, fighters: 24, groups: 6, groupSize: 4, squads: 3,
    day: 15, labDamage: 1, barracksDamage: 1, strikingStyle: false, douglas: false, attackHelis: false, sequential: false, guardPosted: false };
  for (const [id, fields] of Object.entries(CHECKS)) {
    const before = structuredClone(fixture); evaluateCheck(id, fixture); assert.deepEqual(fixture, before);
    assert.ok(en['battlesim700.helper.check.' + id]); assert.ok(bg['battlesim700.helper.check.' + id]);
    for (const key of fields) { const incomplete = { ...fixture }; delete incomplete[key]; assert.throws(() => evaluateCheck(id, incomplete), RangeError); }
  }
  for (const [id, changes] of [[268, { day: 0 }], [284, { day: 32 }], [283, { fighters: 11 }],
    [261, { fighters: 23 }], [273, { barracksDamage: 2 }], [282, { labDamage: 3 }], [216, { fighters: 1.5 }]]) {
    assert.throws(() => evaluateCheck(id, { ...fixture, ...changes }), RangeError);
  }
});

test('700: printed melee roster preserves groups, separate enemies and optional wounds', () => {
  assert.equal(unarmedEncounter(6).length, 1);
  assert.equal(unarmedEncounter(277).length, 1);
  assert.equal(unarmedEncounter(102, { count: 2 }).length, 2);
  assert.equal(unarmedEncounter(133).length, 4);
  assert.deepEqual(unarmedEncounter(266).map(e => [e.strength, e.dexterity, e.speed]),
    [[8, 4, 6], [6, 10, 8], [6, 10, 8]]);
  assert.equal(unarmedEncounter(193)[0].strength, 16);
  assert.equal(unarmedEncounter(193, { wounded: true })[0].strength, 8);
  assert.deepEqual(UNARMED_RETURNS[6], { win: 23, loss: 13 });
});

test('700: all three attack formulas use the printed tactic-specific opponent totals', () => {
  for (const [kind, total, totals] of [['force', 26, [16, 16, 12]],
    ['fast', 24, [16, 16, 10]], ['throw', 23, [10, 14, 14]]]) {
    for (let tactic = 1; tactic <= 3; tactic++) {
      const fight = startUnarmedFight(player({ damageCode: 1 }), 6);
      stepUnarmedFight(fight, 'begin');
      fight.tactics = tactic;
      fight.enemy.endurance = 100;
      stepUnarmedFight(fight, kind);
      const result = fight.events.find(e => e.type === 'attack');
      assert.equal(result.playerTotal, total, `${kind}/${tactic}`);
      assert.equal(result.enemyTotal, totals[tactic - 1], `${kind}/${tactic}`);
    }
  }
});

test('700: victory restores only this fight’s losses, not pre-existing injuries', () => {
  const original = player({ endurance: 20, damageCode: 20 });
  const before = structuredClone(original);
  const fight = startUnarmedFight(original, 6);
  stepUnarmedFight(fight, 'begin');
  fight.player.endurance = 12;
  fight.player.speed = 3;
  stepUnarmedFight(fight, 'force');
  assert.equal(fight.outcome, 'win');
  assert.equal(fight.destination, 23);
  assert.equal(fight.player.endurance, 20);
  assert.equal(fight.player.speed, 8);
  assert.equal(fight.player.combatSkill, original.combatSkill + 1);
  assert.deepEqual(original, before, 'Creating and resolving a fight must not mutate the supplied character');
});

test('700: three bodyguards scale damage16/10/4 and award one skill per defeated opponent', () => {
  const fight = startUnarmedFight(player({ strength: 30, damageCode: 30 }), 177);
  for (const damage of [16, 10, 4]) {
    assert.equal(fight.enemy.damageCode, damage);
    stepUnarmedFight(fight, 'begin');
    stepUnarmedFight(fight, 'force');
  }
  assert.equal(fight.defeated, 3);
  assert.equal(fight.player.combatSkill, 9);
  assert.equal(fight.outcome, 'win');
  assert.equal(fight.destination, 157);
});

test('700: park pursuers retain separate endurance and scale damage after the first defeat', () => {
  const fight = startUnarmedFight(player({ damageCode: 30 }), 102, { count: 2 });
  assert.equal(fight.enemy.damageCode, 12);
  stepUnarmedFight(fight, 'begin');
  stepUnarmedFight(fight, 'force');
  assert.equal(fight.outcome, null);
  assert.equal(fight.enemy.endurance, 25);
  assert.equal(fight.enemy.damageCode, 8);
  assert.equal(fight.phase, 'entry');
});

test('700: equal defence totals need an explicit decision without mutating the fight', () => {
  const fight = startUnarmedFight(player({ damageCode: 20 }), 6);
  stepUnarmedFight(fight, 'begin');
  const before = structuredClone(fight);
  assert.equal(stepUnarmedFight(fight, 'block').needsDecision.reason, 'defence-equality');
  assert.deepEqual(fight, before);
  stepUnarmedFight(fight, 'block', { defenceTie: 'success' });
  assert.equal(fight.outcome, 'win');
});

test('700: half-damage and half-recovery retain fractional endurance', () => {
  const fight = startUnarmedFight(player({ strength: 0, speed: 1, combatSkill: 1, endurance: 5 }), 6);
  stepUnarmedFight(fight, 'begin');
  fight.enemy.damageCode = 5;
  stepUnarmedFight(fight, 'fast');
  assert.equal(fight.player.endurance, 2.5);
  stepUnarmedFight(fight, 'fast');
  assert.equal(fight.outcome, 'loss');
  assert.equal(fight.player.endurance, 2.5);
  assert.equal(fight.player.speed, 1);
  assert.equal(fight.destination, 13);
});

test('700: exhausting player strength is not an invented instant-death condition', () => {
  const fight = startUnarmedFight(player({ strength: 1, combatSkill: 1 }), 6);
  stepUnarmedFight(fight, 'begin');
  stepUnarmedFight(fight, 'force');
  assert.equal(fight.player.strength, 0);
  assert.equal(fight.player.endurance, 21);
  assert.equal(fight.outcome, null);
});

test('700: an exhausting attack cannot heal the opponent through negative damage', () => {
  const fight = startUnarmedFight(player({ damageCode: 1 }), 6);
  stepUnarmedFight(fight, 'begin');
  stepUnarmedFight(fight, 'fast');
  assert.equal(fight.enemy.strength, 8);
  assert.equal(fight.enemy.speed, 6);
  assert.equal(fight.enemy.endurance, 10);
});

test('700: kick disarm removes the weapon contribution once, without killing the gunman', () => {
  const fight = startUnarmedFight(player({ speed: 15, dexterity: 15 }), 133);
  stepUnarmedFight(fight, 'kick');
  assert.equal(fight.enemy.damageCode, 8);
  assert.equal(fight.enemy.weaponCode, 0);
  assert.equal(fight.outcome, null);
  assert.ok(!unarmedActions(fight).includes('kick'));
});

test('700: a failed grab takes double damage; a fatal return remains distinct from recovery', () => {
  const fight = startUnarmedFight(player(), 266);
  stepUnarmedFight(fight, 'grab');
  assert.equal(fight.outcome, 'loss');
  assert.equal(fight.fatal, true);
  assert.equal(fight.player.endurance, 12.5);
  assert.equal(fight.enemy.weaponCode, 40);
});

test('700: fleeing is not falsely recorded as a win, healing or a skill reward', () => {
  const fight = startUnarmedFight(player({ endurance: 17 }), 6);
  stepUnarmedFight(fight, 'begin');
  stepUnarmedFight(fight, 'flee');
  assert.equal(fight.outcome, 'escape');
  assert.equal(fight.destination, null, 'Source100 gives only win/loss columns; escape needs a manual narrative choice');
  assert.equal(fight.player.endurance, 17);
  assert.equal(fight.player.combatSkill, 6);
  assert.equal(fight.defeated, 0);
  assert.deepEqual(unarmedActions(fight), []);
});

test('700: invalid actions, dead characters and unsupported saved rules cannot advance', () => {
  assert.throws(() => startUnarmedFight(player({ endurance: 0 }), 6));
  const fight = startUnarmedFight(player(), 6);
  const before = structuredClone(fight);
  assert.throws(() => stepUnarmedFight(fight, 'force'));
  assert.deepEqual(fight, before);
  fight.ruleVersion = 99;
  assert.throws(() => stepUnarmedFight(fight, 'begin'));
});

test('700: shooting roster retains distinct enemies and does not invent missing statistics', () => {
  for (const origin of Object.keys(SHOOTING_RETURNS)) assert.equal(shootingEncounter(origin).origin, Number(origin));
  assert.deepEqual(shootingEncounter(272).opponents.map(e => e.effectiveFire), [6, 8]);
  assert.deepEqual(shootingEncounter(278).opponents.map(e => e.effectiveFire), [4, 4, 6, 6]);
  const barracks = shootingEncounter(293);
  assert.equal(barracks.opponents.length, 4);
  assert.equal(barracks.opponents[3].effectiveFire, null, 'The fourth fire value is absent in the source');
  assert.equal(barracks.opponents[0].weaponPower, null, 'Weapon power is not the effective-fire code');
  assert.equal(barracks.opponents[0].cover, null, 'Map-dependent cover must be entered from the map');
  assert.deepEqual(shootingEncounter(192).opponents[0].coverOptions, [4, 8]);
});

test('700: map simplification uses the source-permitted distance4 and returns independent profiles', () => {
  const first = shootingEncounter(236);
  assert.equal(first.simplifiedMap, true);
  assert.equal(first.opponents[0].distance, 4);
  assert.equal(shootingEncounter(236, { simplifiedMap: false }).opponents[0].distance, null);
  first.opponents[0].effectiveFire = 99;
  assert.equal(first.opponents[1].effectiveFire, 6);
  assert.equal(shootingEncounter(236).opponents[0].effectiveFire, 6);
});

function gunFight(origin, stats = {}, options = {}) {
  const source = shootingEncounter(origin, { simplifiedMap: options.simplifiedMap ?? false });
  return startShootingFight(player(stats), origin, {
    ...options, simplifiedMap: options.simplifiedMap ?? false,
    playerCover: options.playerCover ?? source.playerCover ?? 2,
    weapon: { power: 3, range: 5, weight: 1, ...options.weapon },
    opponents: source.opponents.map((e, i) => ({ ...e, cover: e.cover ?? 4,
      distance: e.distance ?? 4, weaponPower: 3, ...options.opponents?.[i] })),
  });
}

test('700: quickdraw kills only one foe and neither heals nor awards melee skill', () => {
  const fight = gunFight(143, { shooting: 8, speed: 10, endurance: 18 });
  for (let n = 1; n <= 4; n++) {
    stepShootingFight(fight, 107);
    assert.equal(fight.defeated, n);
    assert.equal(fight.player.endurance, 18);
    assert.equal(fight.player.combatSkill, 6);
  }
  assert.equal(fight.outcome, 'win');
  assert.equal(fight.destination, 134);
});

test('700: tied quickdraw totals lose rather than credit a simultaneous win', () => {
  const fight = gunFight(143, { shooting: 8, speed: 9 });
  stepShootingFight(fight, 107);
  assert.equal(fight.events.find(e => e.type === 'calculation').score, 16);
  assert.equal(fight.outcome, 'loss');
  assert.equal(fight.player.endurance, 0);
  assert.equal(fight.defeated, 0);
});

test('700: source94 overlap2 waits for a decision and applies its temporary bonus once', () => {
  const fight = gunFight(272);
  stepShootingFight(fight, 94);
  assert.equal(fight.pending.score, 2);
  assert.deepEqual(shootingActions(fight), [108, 85]);
  assert.equal(fight.outcome, null);
  stepShootingFight(fight, 85);
  assert.equal(fight.temporaryShooting, 2);
  assert.equal(fight.player.shooting, 6);
  assert.equal(fight.rounds, 1);
  assert.equal(fight.node, 85);
});

test('700: source84 low result subtracts real shooting points without inventing a temporary label', () => {
  const fight = gunFight(272, { shooting: 8 }, { weapon: { power: 8 } });
  stepShootingFight(fight, 84);
  assert.equal(fight.player.shooting, 6);
  assert.equal(fight.temporaryShooting, 0);
  assert.equal(fight.node, 85);
});

test('700: source95 wounds only an open attacker when other enemies remain', () => {
  const attack = gunFight(272, { shooting: 8 }, { weapon: { power: 7 } });
  stepShootingFight(attack, 94);
  assert.deepEqual([attack.player.strength, attack.player.dexterity, attack.player.speed], [9, 8, 7]);
  assert.equal(attack.defeated, 1);
  assert.equal(attack.opponents[attack.enemyIndex].effectiveFire, 8);
  const covered = gunFight(272, { shooting: 8 }, { weapon: { power: 12 } });
  stepShootingFight(covered, 84);
  assert.deepEqual([covered.player.strength, covered.player.dexterity, covered.player.speed], [10, 9, 8]);
  assert.equal(covered.defeated, 1);
});

test('700: a grenade kills everyone but records a loss if the player’s cover is insufficient', () => {
  for (const [cover, outcome] of [[4, 'loss'], [5, 'win']]) {
    const fight = gunFight(272, { shooting: 8 }, { playerCover: cover, weapon: { power: 20 } });
    stepShootingFight(fight, 84);
    assert.equal(fight.node, 75);
    stepShootingFight(fight, 150);
    assert.equal(fight.outcome, outcome);
    assert.equal(fight.defeated, 2);
    assert.ok(fight.opponents.every(e => e.defeated));
  }
});

test('700: pending enemy weapon power preserves source148’s single-shot penalty', () => {
  const fight = gunFight(192, { shooting: 20 }, { weapon: { power: 5 }, opponents: [{ weaponPower: null }] });
  assert.equal(fight.node, 148);
  assert.equal(fight.opponents[0].distance, 2);
  stepShootingFight(fight, 110);
  assert.equal(fight.pending.kind, 'weapon-power');
  stepShootingFight(fight, 'update', { weaponPower: 3 });
  assert.equal(fight.events.find(e => e.type === 'calculation' && e.source === 110).score, 21);
  assert.equal(fight.defeated, 1);
  assert.equal(fight.player.shooting, 20);
});

test('700: source110’s exact16 gap does not silently choose damage or victory', () => {
  const fight = gunFight(192, { shooting: 15 }, { weapon: { power: 5 } });
  stepShootingFight(fight, 110);
  assert.equal(fight.pending.score, 16);
  stepShootingFight(fight, 119);
  assert.equal(fight.opponents[0].weaponPower, 5);
  assert.equal(fight.opponents[0].distance, 2);
  assert.equal(fight.node, 119);
  assert.equal(fight.defeated, 0);
});

test('700: source130’s exact12 gap retains both printed neighbouring outcomes', () => {
  const fight = gunFight(192, {}, { weapon: { weight: 3 } });
  stepShootingFight(fight, 130);
  assert.equal(fight.pending.score, 12);
  assert.deepEqual(shootingActions(fight), [107, 159]);
  stepShootingFight(fight, 159);
  assert.equal(fight.defeated, 1);
});

test('700: source180’s gap resumes without subtracting distance a second time', () => {
  const fight = gunFight(236, { shooting: 7 });
  stepShootingFight(fight, 169);
  stepShootingFight(fight, 180);
  assert.equal(fight.pending.score, 8);
  assert.equal(fight.opponents[0].distance, 1);
  stepShootingFight(fight, 200);
  assert.equal(fight.opponents[0].distance, 1);
  assert.equal(fight.node, 188);
  assert.equal(fight.outcome, null);
});

test('700: the printed fixed-distance option stays4 throughout movement and return fire', () => {
  const fight = gunFight(278, {}, { simplifiedMap: true });
  stepShootingFight(fight, 189, { occupiedCover: false });
  assert.equal(fight.opponents[0].distance, 4);
  assert.equal(fight.node, 188);
  stepShootingFight(fight, 199);
  assert.equal(fight.player.shooting, 6);
  assert.equal(fight.opponents[0].distance, 4);
});

test('700: detailed-map mode requires fresh positions between opponents', () => {
  const fight = gunFight(278, { shooting: 8 }, { weapon: { power: 20 } });
  stepShootingFight(fight, 199);
  assert.equal(fight.defeated, 1);
  assert.equal(fight.pending.kind, 'position');
  const before = structuredClone(fight);
  assert.throws(() => stepShootingFight(fight, 'update', { position: { distance: 2 } }));
  assert.deepEqual(fight, before);
  stepShootingFight(fight, 'update', { position: { distance: 4, cover: 3, playerCover: 2 } });
  assert.equal(fight.pending, null);
  assert.equal(fight.node, 188);
});

test('700: stealth and waiting execute their entry calculations rather than skip straight to choices', () => {
  const stealth = gunFight(192);
  stepShootingFight(stealth, 120);
  assert.equal(stealth.opponents[0].distance, 1);
  stepShootingFight(stealth, 160);
  assert.equal(stealth.outcome, 'loss');
  const wait = gunFight(215);
  stepShootingFight(wait, 129);
  assert.equal(wait.opponents[0].distance, 1);
  stepShootingFight(wait, 109);
  stepShootingFight(wait, 129);
  assert.equal(wait.outcome, 'loss');
});

test('700: disarming and changing to melee preserve remaining opponents and the actual return routes', () => {
  const fight = gunFight(143, { speed: 20, dexterity: 20, shooting: 8, combatSkill: 8, damageCode: 20 });
  stepShootingFight(fight, 107);
  stepShootingFight(fight, 107);
  stepShootingFight(fight, 147);
  assert.equal(fight.node, 138);
  assert.equal(fight.opponents[fight.enemyIndex].disarmed, true);
  stepShootingFight(fight, 140);
  const converted = convertShootingToUnarmed(fight);
  assert.equal(converted.origin, 143);
  assert.equal(converted.shootingDefeated, 2);
  assert.equal(converted.opponents.length, 2);
  assert.equal(converted.enemy.damageCode, 8);
  assert.equal(converted.enemy.weaponCode, 0);
  for (let i = 0; i < 2; i++) {
    stepUnarmedFight(converted, 'begin');
    stepUnarmedFight(converted, 'force');
  }
  assert.equal(converted.destination, 134);
  assert.equal(converted.player.combatSkill, 10);
  assert.equal(fight.outcome, null, 'Conversion returns new state and cannot mutate the pending saved fight');
});

test('700: clear-exit and Speed6/8 ambiguities require explicit choices without granting a win', () => {
  const fight = gunFight(272, { speed: 7 });
  stepShootingFight(fight, 55);
  assert.equal(fight.pending.kind, 'exit');
  stepShootingFight(fight, 'update', { clearExit: true });
  assert.equal(fight.pending.reason, 'source-speed-inconsistency');
  stepShootingFight(fight, 'escape');
  assert.equal(fight.outcome, 'escape');
  assert.equal(fight.destination, 262);
  assert.equal(fight.player.endurance, 25);
  assert.equal(fight.defeated, 0);
});

test('700: a missing fourth fire value cannot be silently replaced when starting a fight', () => {
  assert.throws(() => gunFight(293), /effectiveFire/);
});

test('700: reading state is inert and explicit initialization preserves the rest of the run', () => {
  const run = { nodes: [{ id: 11 }], otherSimulator: { history: [1] } };
  let saved = 0;
  const store = createState(() => ({ currentBookId: 700, currentPlaythrough: () => run, saveState() { saved++; } }));
  assert.equal(store.read(), null);
  assert.equal(saved, 0);
  store.ensure();
  assert.equal(saved, 1);
  store.ensure();
  assert.equal(saved, 1);
  assert.deepEqual(run.nodes, [{ id: 11 }]);
  assert.deepEqual(run.otherSimulator, { history: [1] });
});

test('700: state changes discard stale book, run and simulator references', () => {
  for (const changed of ['book', 'run', 'state']) {
    const originalRun = { sim700: { schemaVersion: 1, history: [], character: player(), fight: null } };
    let book = 700, run = originalRun, saved = 0;
    const original = originalRun.sim700;
    const store = createState(() => ({ currentBookId: book, currentPlaythrough: () => run, saveState() { saved++; } }));
    const committed = store.change(d => {
      d.character.strength = 99;
      if (changed === 'book') book = 701;
      if (changed === 'run') run = {};
      if (changed === 'state') originalRun.sim700 = { ...original, character: player({ strength: 12 }) };
    });
    assert.equal(committed, false);
    assert.equal(saved, 0);
    assert.equal(original.character.strength, 10);
  }
});

test('700: a completed fight records once without overwriting later manual character edits', () => {
  const run = {};
  const store = createState(() => ({ currentBookId: 700, currentPlaythrough: () => run, saveState() {} }));
  store.change(d => {
    d.character = player({ damageCode: 20 });
    d.encounterName = 'Clinic orderlies';
    d.fight = startUnarmedFight(d.character, 6);
    stepUnarmedFight(d.fight, 'begin');
    stepUnarmedFight(d.fight, 'force');
    d.character = { ...d.fight.player };
  });
  assert.equal(store.read().history.length, 1);
  store.change(d => { d.character.strength = 17; });
  assert.equal(store.read().history.length, 1);
  assert.equal(store.read().character.strength, 17);
  store.change(d => { d.fight = { ...d.fight, outcome: 'escape', recorded: false }; });
  assert.equal(store.read().history.length, 1);
});

test('700: malformed future state and failed updates preserve the original saved object', () => {
  const run = { sim700: { schemaVersion: 2, history: [], character: player() } };
  const original = run.sim700;
  const store = createState(() => ({ currentBookId: 700, currentPlaythrough: () => run,
    saveState() { throw new Error('Must not save'); } }));
  assert.throws(() => store.change(() => {}), /Unsupported/);
  assert.equal(run.sim700, original);
  run.sim700.schemaVersion = 1;
  assert.throws(() => store.change(d => { d.character.strength = 90; throw new Error('Invalid input'); }));
  assert.equal(run.sim700, original);
  assert.equal(original.character.strength, 10);
});

test('700: per-book English and Bulgarian strings have identical keys and placeholders', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(bg).sort());
  for (const key of Object.keys(en)) {
    assert.ok(en[key] && bg[key], key);
    const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
    assert.deepEqual(placeholders(en[key]), placeholders(bg[key]), key);
  }
});
