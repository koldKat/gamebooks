import test from 'node:test';
import assert from 'node:assert/strict';
import {startFight, combatAction} from '../../../public/js/battlesim/engines/dungeons-to-dominions/combat.js';

const profile = (extra = {}) => ({name:'Opponent', av:0, armor:0, damage:2, hp:20, ...extra});
const begin = (rules = {}, player = {}, profiles = [profile()]) => startFight(
  {name:'Player', hp:20, av:0, armor:0, damage:3, ...player},
  {name:'Encounter', profiles, rules});
const act = (fight, options = {}) => combatAction(fight,
  {kind:'round', expectedRevision:fight.revision, ...options}, () => 0);
const latest = (fight, who = 'player') => fight.events.filter(row => row.kind === 'attack' && row.who === who).at(-1);

test('AV uses the printed worked examples in each direction, with separate attack rolls', () => {
  const before = begin({}, {av:2}, [profile({av:3})]);
  const fight = act(before, {dice:{player:[3, 3], enemy:[3, 3]}});
  assert.equal(latest(fight).total, 5); assert.equal(latest(fight).hit, false);
  assert.equal(latest(fight, 'enemy').total, 7); assert.equal(fight.player.hp, 18);
  assert.equal(before.round, 0); assert.equal(before.player.hp, 20, 'input state is never mutated');
});
test('critical weapon damage doubles before armor; a slain foe cannot counterattack', () => {
  const fight = act(begin({}, {}, [profile({hp:4, armor:2})]), {dice:{player:[6, 6]}});
  assert.equal(latest(fight).damage, 4); assert.equal(fight.status, 'win');
  assert.equal(fight.events.filter(e => e.who === 'enemy').length, 0);
});
test('armor, nonhealable shield HP and elemental halving apply in the right order', () => {
  const fight = act(begin({halfIncoming:true}, {shield:2, armor:1}, [profile({damage:8})]), {dice:{enemy:[3, 3]}});
  assert.equal(fight.player.shield, 0); assert.equal(fight.player.hp, 19);
  const mental = act(begin({bypassArmor:true}, {armor:10}), {dice:{enemy:[3, 3]}});
  assert.equal(mental.player.hp, 18);
});
test('section-specific first-round and lasting AV modifiers expire independently', () => {
  let fight = begin({firstAv:2, allAv:-1});
  fight = act(fight, {dice:{player:[2, 3], enemy:[1, 1]}});
  assert.equal(latest(fight).total, 6);
  fight = act(fight, {dice:{player:[2, 3], enemy:[1, 1]}});
  assert.equal(latest(fight).total, 4);
});
test('spider awareness, stealth ambush, missing weapons and silver bonuses are conditional', () => {
  const cases = [
    [{spiderSurprise:true}, {}, -1], [{spiderSurprise:true}, {hunting:true}, 0],
    [{stealthAmbush:true}, {stealth:true}, 2], [{stealthAmbush:true}, {}, 0],
    [{missingWeapon:true}, {}, -2], [{missingWeapon:true}, {spareWeapon:true}, 0],
    [{silverBonus:true, allAv:-2}, {silverWeapon:true}, -1],
  ];
  for (const [rules, player, modifier] of cases) {
    const fight = act(begin(rules, player), {dice:{player:[3, 3]}});
    assert.equal(latest(fight).total, 6 + modifier);
  }
});
test('Arachnifant venom differs between sections 43 and 162, including High Constitution', () => {
  const dice = {enemy:[3, 3], poison:[1, 1]};
  assert.equal(act(begin({venomLowThrough:3, highConVenom:true}), {dice}).status, 'loss');
  assert.equal(act(begin({venomLowThrough:3, highConVenom:true}, {highCon:true}), {dice}).status, 'fighting');
  assert.equal(act(begin({venomLowThrough:4, highConVenom:true}, {highCon:true}), {dice}).status, 'loss');
});
test('poison resistance grants a second fatal-poison save; armor-blocked attacks do not poison', () => {
  const rules = {venomLowThrough:4};
  const saved = act(begin(rules, {resistant:true}), {dice:{enemy:[3, 3], poison:[1, 1], poisonResistance:[3, 3]}});
  assert.equal(saved.status, 'fighting');
  const armored = act(begin(rules, {armor:10}), {dice:{enemy:[3, 3]}});
  assert.equal(armored.events.some(row => row.roll === 'poison'), false);
});
test('female spider antidote is consumed once and never heals unrelated combat wounds', () => {
  let fight = begin({venomHighFrom:11}, {voyberry:true});
  const dice = {enemy:[3, 3], poison:[6, 6]};
  fight = act(fight, {dice});
  assert.equal(fight.player.voyberry, false); assert.equal(fight.player.hp, 18);
  fight = act(fight, {dice}); assert.equal(fight.status, 'loss');
});
test('fungal spores roll even on the killing blow and can kill the attacker', () => {
  const fight = act(begin({spores:true}, {hp:1}, [profile({hp:3})]), {dice:{player:[6, 6], spores:[1, 1]}});
  assert.equal(fight.status, 'loss'); assert.equal(fight.enemies[0].hp, 0);
  const highCon = act(begin({spores:true}, {highCon:true}), {dice:{player:[3, 3], spores:[1, 1]}});
  assert.equal(highCon.player.hp, 19);
});
test('the two nail-floor encounters distinguish damage from a hit; both-side nails happen each round', () => {
  const damageOnly = act(begin({nailsOnHit:2, nailsRequireDamage:true}, {armor:3}), {dice:{enemy:[3, 3]}});
  assert.equal(damageOnly.player.hp, 20);
  const anyHit = act(begin({nailsOnHit:1}, {armor:3}), {dice:{enemy:[3, 3], nails:[1, 2]}});
  assert.equal(anyHit.player.hp, 19);
  const both = act(begin({nailsEachRound:1}), {dice:{player:[1, 1], enemy:[1, 1]}});
  assert.equal(both.player.hp, 19); assert.equal(both.enemies[0].hp, 19);
});
test('sequential opponents do not attack out of turn or gain a free replacement attack', () => {
  let fight = begin({sequential:true}, {}, [profile({name:'First', hp:3}), profile({name:'Second'})]);
  assert.throws(() => act(fight, {target:1}), /target/);
  fight = act(fight, {dice:{player:[6, 6]}});
  assert.equal(fight.status, 'fighting'); assert.equal(fight.player.hp, 20);
  fight = act(fight, {dice:{player:[1, 1], enemy:[3, 3]}});
  assert.equal(latest(fight, 'enemy').target, 1); assert.equal(fight.player.hp, 18);
});
test('custom simultaneous opponents each counterattack, but a defeated one does not', () => {
  const fight = act(begin({}, {}, [profile({hp:3}), profile({name:'Second'})]), {dice:{player:[6, 6], enemy:[3, 3]}});
  assert.equal(fight.player.hp, 18); assert.equal(fight.enemies[0].hp, 0);
});
test('Polymer surprise skips only the first attack and expires its enemy AV bonus', () => {
  let fight = begin({conditionalSurprise:true});
  fight = act(fight, {dice:{enemy:[2, 3]}});
  assert.equal(latest(fight).skipped, true); assert.equal(latest(fight, 'enemy').hit, true);
  fight = act(fight, {dice:{player:[3, 3], enemy:[2, 3]}});
  assert.equal(latest(fight).skipped, false); assert.equal(latest(fight, 'enemy').hit, false);
  const warned = act(begin({conditionalSurprise:true}, {warned:true}), {dice:{player:[3, 3]}});
  assert.equal(latest(warned).skipped, false);
});
test('missiles consume ammunition; maintaining distance uses Athletics +3 at ten', () => {
  let fight = begin({}, {ammo:3, athletics:true});
  fight = act(fight, {mode:'missile', dice:{player:[3, 3]}});
  assert.equal(fight.player.ammo, 2); assert.equal(fight.player.hp, 20);
  fight = act(fight, {mode:'missile', dice:{distance:[3, 4], player:[1, 1]}});
  assert.equal(fight.player.ammo, 1); assert.equal(fight.melee, false);
  fight = act(fight, {mode:'missile', dice:{distance:[3, 3], player:[1, 1], enemy:[1, 1]}});
  assert.equal(fight.player.ammo, 1); assert.equal(fight.melee, true);
  assert.throws(() => act(fight, {mode:'missile'}), /unavailable/);
});
test('missile damage uses ranged AV without melee weapon bonuses', () => {
  const fight = act(begin({}, {av:5, missileAv:1, ammo:1, damage:50}), {mode:'missile', dice:{player:[3, 3]}});
  assert.equal(latest(fight).damage, 4);
});
test('fleeing requires over eight and Athletics adds two; failure gives the foe an attack', () => {
  let fight = act(begin({}, {athletics:true}), {kind:'flee', dice:{flee:[3, 3], enemy:[3, 3]}});
  assert.equal(fight.status, 'fighting'); assert.equal(fight.player.hp, 18);
  fight = act(fight, {kind:'flee', dice:{flee:[3, 4]}}); assert.equal(fight.status, 'fled');
});
test('fire bombs ignore armor and a miss deals fixed enemy and self damage, including forced misses', () => {
  const enemy = profile({armor:100});
  let fight = act(begin({}, {bombs:1}, [enemy]), {mode:'bomb', dice:{player:[1, 1], enemy:[1, 1]}});
  assert.equal(fight.enemies[0].hp, 16); assert.equal(fight.player.hp, 16); assert.equal(fight.player.bombs, 0);
  fight = act(begin({firstAttackMiss:true}, {bombs:1, elementalResistance:true}, [enemy]), {mode:'bomb', dice:{enemy:[1, 1]}});
  assert.equal(fight.enemies[0].hp, 16); assert.equal(fight.player.hp, 18);
});
test('Jackal Brute changes AV below half HP without advancing the story', () => {
  const fight = act(begin({bruteWeakens:true}, {damage:6}, [profile({av:2, hp:10})]), {dice:{player:[4, 4]}});
  assert.equal(fight.enemies[0].hp, 4); assert.equal(fight.enemies[0].av, 1); assert.equal(fight.status, 'fighting');
});
test('Benefactor invulnerability lasts one round, healing reverses damage, and acid removes armor first', () => {
  let fight = begin({benefactor:true}, {}, [profile({damage:0})]);
  fight = act(fight, {dice:{player:[1, 1], enemy:[1, 1], benefactor:[1, 1]}});
  assert.equal(fight.invulnerableNext, true);
  fight = act(fight, {dice:{player:[6, 6], enemy:[1, 1], benefactor:[4, 4]}});
  assert.equal(latest(fight).damage, 0); assert.equal(fight.healingNext, true);
  fight = act(fight, {dice:{player:[6, 6], enemy:[1, 1], benefactor:[6, 6]}});
  assert.equal(fight.enemies[0].hp, 26); assert.equal(fight.player.hp, 18);
  const armored = act(begin({benefactor:true}, {armor:2}), {dice:{benefactor:[6, 6]}});
  assert.equal(armored.player.armor, 1); assert.equal(armored.player.hp, 20);
});
test('Benefactor clone grants +2 AV until three damage are inflicted, without stacking copies', () => {
  let fight = begin({benefactor:true}, {damage:1}, [profile({damage:0})]);
  fight = act(fight, {dice:{benefactor:[3, 3]}}); assert.equal(fight.cloneRemaining, 3);
  fight = act(fight, {dice:{player:[3, 3], enemy:[1, 1], benefactor:[1, 1]}});
  assert.equal(latest(fight).total, 4); assert.equal(fight.cloneRemaining, 3);
  fight = act(fight, {dice:{player:[6, 6], benefactor:[4, 4]}});
  assert.equal(fight.cloneRemaining, 3, 'invulnerability prevents clone damage');
  let wounded = begin({benefactor:true}, {damage:1}, [profile({damage:0})]);
  wounded = act(wounded, {dice:{benefactor:[3, 3]}});
  wounded = act(wounded, {dice:{player:[6, 6], benefactor:[6, 6]}});
  assert.equal(wounded.cloneRemaining, 1);
  wounded = act(wounded, {dice:{player:[4, 4], benefactor:[6, 6]}});
  assert.equal(wounded.cloneRemaining, 0);
  assert.equal(latest(wounded, 'enemy').total, 2, 'the +2 bonus ends as soon as the copy takes its third damage');
});
test('stale callbacks, invalid dice, exhausted ammunition and finished fights cannot mutate combat', () => {
  const fight = begin();
  assert.throws(() => combatAction(fight, {kind:'round', expectedRevision:1}), /Stale/);
  assert.throws(() => act(fight, {dice:{player:[0, 6]}}), /value/);
  assert.throws(() => act(fight, {mode:'missile'}), /unavailable/);
  const ended = act(fight, {kind:'cancel'});
  assert.equal(ended.status, 'cancelled'); assert.throws(() => act(ended), /Stale/);
  assert.equal(fight.status, 'fighting'); assert.equal(fight.events.length, 0);
});
