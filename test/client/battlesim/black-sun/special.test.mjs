import test from 'node:test';
import assert from 'node:assert/strict';
import {blackSunPlayer, blackSunStart, blackSunRound, blackSunAcknowledge, blackSunEnemyValues, blackSunSelectSpecial, blackSunTransition} from '../../../../public/js/battlesim/engines/black-sun/combat.js';

const page = (base = 1, attack = 1, defense = 1) => ({base, attack, defense, moon: 'new'});
const start = (rules, player = {}) => blackSunStart(blackSunPlayer(player), rules);

test('guardian parts require both arms before the head; two attacks reuse one defense total', () => {
  const f = start({attack: 0, defense: 16, separatePartAttacks: true, opponents: [
    {key: 'left', name: 'Left arm', attack: 13, resistance: 3},
    {key: 'right', name: 'Right arm', attack: 15, resistance: 3},
    {key: 'head', name: 'Head', resistance: 2, protectedBy: ['left', 'right']},
  ], partsDisabledEvent: {id: 'arms', section: 'C46'}});
  assert.throws(() => blackSunRound(f, page(), {target: 2}), RangeError);
  const r = blackSunRound(f, page());
  assert.equal(r.player.vitality, 3); assert.equal(r.log[0].incomingAttacks.length, 2);
  const partial = blackSunRound(f, page(3, 1, 4));
  assert.equal(partial.log[0].defenseTotal, 13); assert.equal(partial.player.vitality, 2);
  const hit = blackSunRound(f, page(6, 6, 6), {target: 0});
  assert.equal(hit.opponents[0].resistance, 2);
  let finish = hit;
  for (const target of [0, 0, 1, 1, 1]) finish = blackSunRound(finish, page(6, 6, 6), {target});
  assert.equal(finish.status, 'paused'); assert.equal(finish.pending.section, 'C46'); assert.equal(finish.opponents[2].resistance, 2);
});

test('guardian does not strike a player again after a fatal left-arm blow', () => {
  const f = start({attack: 0, defense: 100, separatePartAttacks: true,
    opponents: [{attack: 30, resistance: 3}, {attack: 30, resistance: 3}]}, {vitality: 4});
  const r = blackSunRound(f, page()); assert.equal(r.player.vitality, 5); assert.equal(r.status, 'loss');
  assert.equal(r.log[0].incomingAttacks.length, 1);
});

test('mental combat uses Strength without equipment and can ignore exactly one mental hit without a vitality cost', () => {
  const f = start({attack: 12, defense: null, defenseOnly: true, defendWithStrength: true,
    mentalCombat: true, ignoreFirstMentalHit: true, opponents: [{resistance: null}],
    earlyMentalHitEvent: {id: 'early', section: '868', endEncounter: true},
    lateMentalHitEvent: {id: 'late', section: '871', endEncounter: true}}, {strength: 6, dexterity: 30, protection: 30});
  const first = blackSunRound(f, page());
  assert.equal(first.player.vitality, 1); assert.equal(first.status, 'fighting'); assert.equal(first.log[0].defenseTotal, 8);
  const second = blackSunRound(first, page());
  assert.equal(second.pending.section, '868'); assert.equal(second.player.vitality, 1);
  const done = blackSunAcknowledge(second); assert.equal(done.status, 'ended');
});

test('protected ally loses vitality only on a successful incoming strike and low shared base die', () => {
  const e = {attack: 20, defense: 17, playerAttackModifier: -2, opponents: [{resistance: 5}],
    ally: {name: 'Young Kathum', vitality: 3, lowBaseMax: 2}, winTarget: '963', allyLostWinTarget: '912'};
  const f = start(e), low = blackSunRound(f, page());
  assert.equal(low.ally.vitality, 2); assert.equal(low.player.vitality, 2);
  const high = blackSunRound(f, page(3)); assert.equal(high.ally.vitality, 3);
  const defended = blackSunRound(start(e, {dexterity: 30}), page()); assert.equal(defended.ally.vitality, 3);
  let r = start({...e, defense: 100}, {kesrani: true});
  for (let i = 0; i < 3; i++) r = blackSunRound(r, page());
  assert.equal(r.ally.vitality, 0); assert.equal(r.status, 'fighting');
  r.encounter.defense = 1; r.encounter.damagePerHit = 5;
  r = blackSunRound(r, page(6, 6, 6)); assert.equal(r.status, 'win'); assert.equal(r.continuation, '912');
});

test('harpoon prevents the enemy reply as soon as its first damaging hit lands', () => {
  const f = start({attack: 100, defense: 10, harpoon: true, opponents: [{resistance: 5}]}, {weaponBonus: 4});
  const r = blackSunRound(f, page());
  assert.equal(r.harpooned, true); assert.equal(r.player.vitality, 1); assert.equal(r.log[0].incomingAttacks.length, 0);
});

test('lodged harpoon pulls test Strength with shared base and attack dice; release restores the reply', () => {
  const f = start({attack: 100, defense: 1, harpoon: true, harpoonPull: {threshold: 18, damage: 1},
    opponents: [{resistance: 3}]}, {strength: 6, weaponBonus: 4});
  const lodged = blackSunRound(f, page());
  assert.equal(lodged.harpoonTarget, 0);
  const failed = blackSunRound(lodged, page(5, 6), {type: 'pull-harpoon'});
  assert.equal(failed.log.at(-1).strengthTotal, 17);
  assert.equal(failed.opponents[0].resistance, 2);
  assert.equal(failed.player.vitality, 1);
  const pulled = blackSunRound(failed, page(6, 6), {type: 'pull-harpoon'});
  assert.equal(pulled.opponents[0].resistance, 1);
  assert.equal(pulled.log.at(-1).strengthTotal, 18);
  const won = blackSunRound(pulled, page(6, 6), {type: 'pull-harpoon'});
  assert.equal(won.status, 'win');
  const released = blackSunRound(lodged, page(), {type: 'release-harpoon'});
  assert.equal(released.harpooned, false); assert.equal(released.player.vitality, 2);
  assert.throws(() => blackSunRound(released, page(), {type: 'pull-harpoon'}), RangeError);
  assert.equal(lodged.opponents[0].resistance, 2);
});

test('Morning Star splits damage across different opponents even when the first is killed', () => {
  const f = start({attack: 1, defense: 1, splitHitDamage: 1,
    opponents: [{resistance: 1}, {resistance: 2}]});
  const hit = blackSunRound(f, page(), {target: 0, secondaryTarget: 1});
  assert.deepEqual(hit.opponents.map(e => e.resistance), [0, 1]);
  assert.equal(hit.log[0].enemyLoss, 2);
  assert.throws(() => blackSunRound(f, page(), {target: 0, secondaryTarget: 0}), RangeError);
  const last = blackSunRound(hit, page(), {target: 1});
  assert.equal(last.status, 'win');
  assert.deepEqual(f.opponents.map(e => e.resistance), [1, 2]);
});

test('Moon Thorn doubles only the first successful weapon hit, not the first missed round', () => {
  const f = start({attack: 1, defense: 10, firstHitExtraDamage: 1, opponents: [{resistance: 5}]});
  const miss = blackSunRound(f, page());
  assert.equal(miss.opponents[0].resistance, 5);
  const first = blackSunRound(miss, page(6, 6, 6));
  assert.equal(first.opponents[0].resistance, 3);
  const next = blackSunRound(first, page(6, 6, 6));
  assert.equal(next.opponents[0].resistance, 2);
});

test('Nergal’s Spine follows the printed 24/22 example and rejects a two-handed main weapon', () => {
  const rules = {attack: 1, defense: 23, spineBonus: 2, opponents: [{resistance: 5}]};
  const f = start(rules, {strength: 10, fighterBonus: 2, weaponBonus: 4});
  const hit = blackSunRound(f, page(4, 4, 4), {spine: 'separate'});
  assert.equal(hit.log[0].attackTotal, 24); assert.equal(hit.log[0].spineAttackTotal, 22);
  assert.equal(hit.opponents[0].resistance, 4);
  const both = blackSunRound(start({...rules, defense: 22}, f.player), page(4, 4, 4), {spine: 'separate'});
  assert.equal(both.opponents[0].resistance, 3);
  const combined = blackSunRound(f, page(4, 4, 4), {spine: 'combined'});
  assert.equal(combined.log[0].attackTotal, 26); assert.equal(combined.opponents[0].resistance, 4);
  const twoHanded = start(rules, {...f.player, twoHandedWeapon: true});
  assert.throws(() => blackSunRound(twoHanded, page(), {spine: 'combined'}), RangeError);
});

test('special moon attacks cannot repeat or bypass their printed moon route', () => {
  const f = start({attack: 1, defense: 100, opponents: [{resistance: 5}],
    events: [{id: 'special', round: 1, phase: 'before-round', requiresUnusedMoonAttack: true}],
    specialMoonRoutes: {half: 'double'}, specialAttacks: [{section: 'double', extraIncoming: true}]});
  const paused = blackSunRound(f, page());
  assert.throws(() => blackSunAcknowledge(paused), RangeError);
  const draw = {section: 'double', page: {...page(), moon: 'half'}};
  const selected = blackSunSelectSpecial(paused, draw);
  assert.deepEqual(selected.specialAttacksUsed, ['double']);
  assert.equal(selected.extraIncomingRound, 1);
  assert.equal(selected.pending.requiresUnusedMoonAttack, false);
  assert.deepEqual(paused.specialAttacksUsed, undefined);
  assert.throws(() => blackSunSelectSpecial(selected, draw), RangeError);
  assert.throws(() => blackSunSelectSpecial(paused, {...draw, page: page()}), RangeError);
  const continued = blackSunAcknowledge(selected);
  assert.throws(() => blackSunRound(continued, page()), RangeError);
  const result = blackSunRound(continued, page(), {extraDefensePage: {...page(6, 1, 6), moon: 'full'}});
  assert.equal(result.log[0].incomingAttacks.length, 2);
  assert.equal(result.log[0].incomingAttacks[1].defenseTotal, 18);
});

test('special combat tests use the printed stat, dice and optional Rage', () => {
  const rules = {attack: 1, defense: 100, opponents: [{resistance: 5}], rage: 3,
    events: [{id: 'special', round: 1, phase: 'before-round', requiresUnusedMoonAttack: true}],
    specialMoonRoutes: {new: 'counter'}, specialAttacks: [{section: 'counter', test: {stat: 'strength', threshold: 20, addRage: true},
      onSuccess: {id: 'counter', attackBoost: {amount: 3, rounds: 1}, defenseBoost: {amount: 3, rounds: 1}}}]};
  const f = blackSunRound(start(rules), page());
  const selected = blackSunSelectSpecial(f, {section: 'counter', page: page()}, page(6, 5, 1));
  assert.equal(selected.lastSpecialAttack.total, 20); assert.equal(selected.lastSpecialAttack.success, true);
  const result = blackSunRound(blackSunAcknowledge(selected), page());
  assert.equal(result.log[0].attackTotal, 11); assert.equal(result.log[0].defenseTotal, 11);
  const next = blackSunRound(result, page()); assert.equal(next.log[1].attackTotal, 8);
});

test('the two once-only tactics require the defense surplus or Warfare, and waiting still reaches timed instructions', () => {
  const rules = {attack: 23, defense: 24, opponents: [{resistance: 8}],
    tactics: {defenseThreshold: 26, skip: {section: 'wait', rounds: 2}, trade: {section: 'force', playerLoss: 1, enemyDamage: 3}},
    events: [{id: 'timed', section: 'manual', round: 2, phase: 'before-round'}]};
  const f = start(rules, {dexterity: 14});
  assert.throws(() => blackSunRound(f, page(), {type: 'tactic', tactic: 'skip'}), RangeError);
  const wait = blackSunRound(f, page(6, 6, 6), {type: 'tactic', tactic: 'skip'});
  assert.equal(wait.opponents[0].resistance, 8); assert.equal(wait.player.vitality, 1);
  const paused = blackSunRound(wait, page()); assert.equal(paused.pending.id, 'timed');
  const second = blackSunRound(blackSunAcknowledge(paused), page());
  assert.equal(second.round, 2); assert.equal(second.player.vitality, 1); assert.equal(second.opponents[0].resistance, 8);
  assert.throws(() => blackSunRound(second, page(6, 6, 6), {type: 'tactic', tactic: 'skip'}), RangeError);
  const trade = blackSunRound(second, page(6, 6, 6), {type: 'tactic', tactic: 'trade'});
  assert.equal(trade.opponents[0].resistance, 5); assert.equal(trade.player.vitality, 2);
  const warfare = blackSunRound(start({...rules, warfare: true}), page(), {type: 'tactic', tactic: 'trade'});
  assert.equal(warfare.opponents[0].resistance, 5); assert.equal(warfare.player.vitality, 2);
});

test('a combat phase change carries only real resistance damage, preserves wounds and spent effects, and restarts round one', () => {
  let f = start({section: 'armored', attack: 1, defense: 1, damagePerHit: 3,
    opponents: [{resistance: 5, track: ['normal', 'shield', 'normal', 'normal', 'normal']}],
    events: [{id: 'change', round: 2, phase: 'before-round', transitionTarget: 'unarmored', carryResistanceDamage: true}]});
  f = blackSunRound(f, page());
  assert.equal(f.opponents[0].resistance, 3); assert.equal(f.opponents[0].trueResistanceDamage, 1);
  f.effectUses = {potion: 1}; f.woundsTaken = 2;
  f = blackSunRound(f, page());
  assert.throws(() => blackSunAcknowledge(f), RangeError);
  assert.throws(() => blackSunTransition(f, {section: 'wrong'}), RangeError);
  const next = blackSunTransition(f, {section: 'unarmored', attack: 1, defense: 100, opponents: [{resistance: 10}]});
  assert.equal(next.round, 0); assert.equal(next.roundStarted, false); assert.equal(next.opponents[0].resistance, 9);
  assert.equal(next.woundsTaken, 2); assert.equal(next.effectUses.potion, 1); assert.equal(next.phaseHistory[0].rounds, 1);
  assert.equal(blackSunRound(next, page()).round, 1);
  assert.equal(f.status, 'paused');
});

test('shields occupy resistance positions, require two damage in one round and never accumulate partial hits', () => {
  const f = start({attack: 1, defense: 1, opponents: [{resistance: 3, track: ['normal', 'shield', 'normal']}]});
  let r = blackSunRound(f, page()); assert.equal(r.opponents[0].resistance, 2);
  for (let i = 0; i < 3; i++) r = blackSunRound(r, page());
  assert.equal(r.opponents[0].resistance, 2); assert.equal(r.opponents[0].trueResistanceDamage, 1);
  r.encounter.damagePerHit = 2; r = blackSunRound(r, page());
  assert.equal(r.opponents[0].resistance, 1); assert.equal(r.opponents[0].shieldsRemoved, 1);
  assert.equal(r.opponents[0].trueResistanceDamage, 1);
  r = blackSunRound(r, page()); assert.equal(r.status, 'win'); assert.equal(r.opponents[0].trueResistanceDamage, 2);
});

test('the mirror monster uses the literal player ATTACK and DEFENSE offsets', () => {
  const f = start({attack: 0, defense: 0, relativeAttack: 5, relativeDefense: 5, opponents: [{resistance: 7}]},
    {strength: 8, dexterity: 7, weaponBonus: 3, protection: 2});
  assert.deepEqual(blackSunEnemyValues(f), {attack: 16, defense: 14});
});

test('first-hit and critical instructions stop combat without inventing a terminal win', () => {
  const rules = {attack: 16, defense: 14, opponents: [{resistance: 2}],
    firstHitEvent: {id: 'first-hit', section: 'C53', endEncounter: true},
    criticalEvent: {id: 'critical', section: 'C63', endEncounter: true}};
  const hit = blackSunRound(start(rules), page(6, 6, 1));
  assert.equal(hit.pending.section, 'C53'); assert.equal(hit.player.vitality, 1); assert.equal(hit.log[0].playerLoss, 0);
  assert.equal(blackSunAcknowledge(hit).status, 'ended');
  const hurt = blackSunRound(start(rules, {vitality: 3}), page());
  assert.equal(hurt.pending.section, 'C63'); assert.equal(hurt.player.vitality, 4);
});

test('opening damage preserves the original resistance track and timed damage occurs once per marked round', () => {
  const f = start({attack: 1, defense: 100, opponents: [{resistance: 6}], openingDamage: 1,
    periodicDamage: {rounds: [3, 5], amount: 1}});
  assert.equal(f.opponents[0].initialResistance, 6); assert.equal(f.opponents[0].resistance, 5);
  let r = f; for (let i = 0; i < 5; i++) r = blackSunRound(r, page());
  assert.equal(r.opponents[0].resistance, 3); assert.equal(r.round, 5);
});

test('conditional round instructions respect Karma and the explicitly selected talisman', () => {
  const rules = {attack: 1, defense: 100, opponents: [{resistance: 6}], events: [
    {id: 'karma', section: 'F158', round: 1, phase: 'before-round', minKarma: 1},
    {id: 'talisman', section: 'C87', round: 2, phase: 'before-round', withoutTalisman: true}]};
  const r = blackSunRound(start(rules), page()); assert.equal(r.status, 'fighting');
  assert.equal(blackSunRound(r, page()).pending.section, 'C87');
  assert.equal(blackSunRound(start(rules, {karma: 1}), page()).pending.section, 'F158');
  let protectedFight = start({...rules, raminTalisman: true});
  protectedFight = blackSunRound(blackSunRound(protectedFight, page()), page());
  assert.equal(protectedFight.status, 'fighting');
});

test('Halret can only be wounded by named moon weapons or the printed exact +5 weapon bonus', () => {
  const rules = {attack: 1, defense: 1, opponents: [{resistance: 6}],
    weaponRequirement: {names: ['Moon Sickle', 'Moon Thorn'], exactBonus: 5}, firstHitInstruction: 'F161'};
  const invalid = blackSunRound(start(rules, {weaponBonus: 6}), page());
  assert.equal(invalid.opponents[0].resistance, 6); assert.equal(invalid.log[0].instruction, 'F161');
  const named = blackSunRound(start(rules, {weaponName: 'Moon Thorn', weaponBonus: 2}), page());
  assert.equal(named.opponents[0].resistance, 5);
  const exact = blackSunRound(start(rules, {weaponBonus: 5}), page()); assert.equal(exact.opponents[0].resistance, 5);
});

test('captain disarm uses the printed defense threshold and does not replace an earlier killing blow', () => {
  const rules = {attack: 15, defense: 17, opponents: [{resistance: 3}],
    defenseThresholdEvent: {threshold: 17, section: 'C41', endEncounter: true}};
  const r = blackSunRound(start(rules, {dexterity: 10}), page(3, 1, 4));
  assert.equal(r.pending.section, 'C41'); assert.equal(blackSunAcknowledge(r).status, 'ended');
  const win = blackSunRound(start({...rules, opponents: [{resistance: 1}]}, {strength: 20, dexterity: 20}), page());
  assert.equal(win.status, 'win'); assert.equal(win.pending, undefined);
});
