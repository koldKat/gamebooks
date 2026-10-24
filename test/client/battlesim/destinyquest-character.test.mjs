import test from 'node:test';
import assert from 'node:assert/strict';
import { createDestinyFight, startDestinyRound, rollDestinySpeed, resolveDestinySpeed,
  rollDestinyDamage, resolveDestinyDamage, endDestinyRound } from '../../../public/js/battlesim/engines/destinyquest/core.js';
import { configureDestinyAbilities, useDestinyAbility as use, resolveDestinyGambit } from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import { resolveDestinyAbilityRoll as resolve } from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';
import { createDestinyCharacter, cureDestinyCharacter, attachDestinyCharacter, recordDestinyOutcome,
  resolveDestinyRingLoss } from '../../../public/js/battlesim/engines/destinyquest/character.js';
import { winterChallenge, configureWinterEncounter, winterSalePrice } from '../../../public/js/battlesim/engines/destinyquest/winters-fury.js';
import { destinyStat } from '../../../public/js/battlesim/engines/destinyquest/effects.js';

const rolls = (...values) => () => { assert.ok(values.length, 'Unexpected roll'); return values.shift(); };
const foes = count => Array.from({ length: count }, (_, i) => ({ name: 'Foe ' + i, speed: 2, brawn: 4, armour: 3, health: 80 }));
const setup = (abilities = {}, equipment = {}, enemies = foes(1), hero = {}) => configureDestinyAbilities(
  createDestinyFight({ speed: 2, brawn: 4, magic: 3, armour: 2, health: 20, maxHealth: 30, ...hero }, enemies), abilities, equipment);
const win = fight => resolveDestinySpeed(rollDestinySpeed(fight, rolls(6, 6, 1, 1)));
const lose = fight => resolveDestinySpeed(rollDestinySpeed(fight, rolls(1, 1, 6, 6)));
const hit = (fight, value = 1) => resolveDestinyDamage(rollDestinyDamage(fight, rolls(value)));

test('each outcome is recorded once even if an old finished fight is submitted again', () => {
  const original = { defeats: 4, penalties: [], notes: { untouched: 'yes' }, equipment: { ring1: { brawn: 2 } } };
  const before = structuredClone(original);
  const result = recordDestinyOutcome(original, { status: 'loss' }, 'fight-a', rolls(3));
  assert.equal(result.character.defeats, 5);
  assert.equal(result.character.nextPenaltyAt, 10);
  assert.deepEqual(result.character.penalties, ['head-blow']);
  assert.deepEqual(original, before);
  const duplicate = recordDestinyOutcome(result.character, { status: 'loss' }, 'fight-a', rolls());
  assert.equal(duplicate.recorded, false);
  assert.deepEqual(duplicate.character, result.character);
  assert.deepEqual(result.character.notes, original.notes);
});

test('Cure lowers the defeat tally without removing penalties or re-awarding an old threshold', () => {
  const result = recordDestinyOutcome({ defeats: 4 }, { status: 'loss' }, 'fifth', rolls(1));
  let character = cureDestinyCharacter(result.character);
  assert.equal(character.defeats, 3);
  assert.equal(character.nextPenaltyAt, 10);
  for (let i = 0; i < 6; i++) character = recordDestinyOutcome(character, { status: 'loss' }, 'later-' + i, rolls()).character;
  assert.equal(character.defeats, 9);
  assert.deepEqual(character.penalties, ['weeping-wounds']);
  character = recordDestinyOutcome(character, { status: 'loss' }, 'tenth', rolls(2)).character;
  assert.deepEqual(character.penalties, ['weeping-wounds', 'crippled']);
});

test('duplicate death penalties are rerolled and invalid dice cannot mutate a character', () => {
  const character = createDestinyCharacter({ defeats: 4, penalties: ['weeping-wounds', 'head-blow'] });
  const result = recordDestinyOutcome(character, { status: 'loss' }, 'loss', rolls(1, 3, 2));
  assert.equal(result.penalty, 'crippled');
  const before = structuredClone(character);
  assert.throws(() => recordDestinyOutcome(character, { status: 'loss' }, 'invalid', rolls(7)), /1-6/);
  assert.deepEqual(character, before);
});

test('Getaway checks all six results and avoids both the defeat and penalty on five or six', () => {
  for (const face of [1, 2, 3, 4, 5, 6]) {
    const result = recordDestinyOutcome({ defeats: 4 }, { status: 'loss', abilities: { getaway: 1 } }, 'getaway-' + face,
      face >= 5 ? rolls(face) : rolls(face, 2));
    assert.equal(result.escaped, face >= 5);
    assert.equal(result.character.defeats, face >= 5 ? 4 : 5);
    assert.equal(result.penalty, face >= 5 ? null : 'crippled');
  }
});

test('Fingerless requires an explicit equipped-ring choice and changes only that ring and its represented bonuses', () => {
  const character = { defeats: 4, attributes: { brawn: 8, magic: 3 }, abilities: { heal: 2 },
    equipment: { ring1: { name: 'A', brawn: 2, abilities: ['heal'] }, ring2: { name: 'B', magic: 1 } },
    notes: ['keep me'] };
  const penalized = recordDestinyOutcome(character, { status: 'loss' }, 'ring-loss', rolls(4)).character;
  assert.equal(penalized.pendingRingDestruction, true);
  assert.deepEqual(penalized.penalties, []);
  assert.throws(() => resolveDestinyRingLoss(penalized, 'feet'), /ring/);
  const result = resolveDestinyRingLoss(penalized, 'ring1');
  assert.equal(result.character.equipment.ring1, null);
  assert.equal(result.character.equipment.ring2.name, 'B');
  assert.equal(result.character.attributes.brawn, 6);
  assert.equal(result.character.abilities.heal, 1);
  assert.deepEqual(result.character.notes, ['keep me']);
  assert.equal(character.equipment.ring1.name, 'A');
  assert.throws(() => attachDestinyCharacter(setup(), penalized), /ring/);
});

test('Fingerless without equipped rings expires without inventing or destroying an item', () => {
  const profile = recordDestinyOutcome({ defeats: 4 }, { status: 'loss' }, 'empty-ring', rolls(4)).character;
  const result = resolveDestinyRingLoss(profile, null);
  assert.equal(result.removedRing, null);
  assert.equal(result.character.pendingRingDestruction, undefined);
});

test('crippled and nervous twitch disable only abilities from their associated items', () => {
  const fight = setup({ haste: 2, heal: 2, frenzy: 1 }, {
    feet: { abilities: ['haste'] }, mainHand: { abilities: ['heal'] }, leftHand: { abilities: ['frenzy'] },
  });
  const attached = attachDestinyCharacter(fight, { penalties: ['crippled', 'nervous-twitch'] });
  assert.deepEqual(attached.abilities, { haste: 1, heal: 1, frenzy: 1 });
  assert.equal(attached.hero.brawn, fight.hero.brawn);
  assert.equal(fight.abilities.haste, 2);
  assert.throws(() => attachDestinyCharacter(attached, attached.character), /already attached/);
  assert.throws(() => configureDestinyAbilities(attached, { haste: 2 }), /before combat/);
  assert.equal(attached.abilities.haste, 1);
});

test('Head Blow failure spends only the round speed slot; a successful check permits the chosen ability', () => {
  let fight = startDestinyRound(attachDestinyCharacter(setup({ haste: 1, frenzy: 1, charm: 1, 'wind-chill': 1 }),
    { penalties: ['head-blow'] }), 0);
  const failed = resolve(use(fight, 'haste', {}, rolls(1)));
  assert.equal(failed.turn.used.sp, true);
  assert.equal(failed.used.haste, undefined);
  assert.equal(failed.opponents[0].health, 80);
  assert.throws(() => use(failed, 'frenzy'), /one ability/);
  fight = use(fight, 'haste', {}, rolls(1));
  fight = resolve(use(fight, 'charm', { die: 0 }, rolls(6)));
  assert.throws(() => use(fight, 'frenzy'), /checked/);
  fight = use(JSON.parse(JSON.stringify(fight)), 'haste', {}, rolls());
  assert.equal(fight.turn.heroSpeedCount, 3);
  assert.equal(fight.opponents[0].health, 78);
  assert.equal(fight.used.haste, 1);
});

test('chronic convulsions persists after healing; weeping wounds applies end-of-round damage', () => {
  let fight = startDestinyRound(attachDestinyCharacter(setup({ heal: 1 }, {}, foes(1), { health: 12 }),
    { penalties: ['chronic-convulsions', 'weeping-wounds'] }), 0);
  fight = hit(lose(fight), 1);
  assert.equal(fight.hero.health, 9);
  assert.equal(destinyStat(fight, 'hero', 'speed'), 1);
  fight = use(fight, 'heal');
  assert.equal(fight.hero.health, 13);
  assert.equal(destinyStat(fight, 'hero', 'speed'), 1);
  assert.equal(endDestinyRound(fight).hero.health, 12);
});

test('Cure in combat consumes a potion use and preserves assessed death penalties', () => {
  let fight = startDestinyRound(attachDestinyCharacter(setup({ cure: 2, 'pick-n-mix': 1 }),
    { defeats: 7, penalties: ['head-blow'] }), 0);
  fight = use(fight, 'cure');
  assert.equal(fight.character.defeats, 5);
  assert.equal(fight.character.nextPenaltyAt, 10);
  assert.deepEqual(fight.character.penalties, ['head-blow']);
  assert.throws(() => use(fight, 'pick-n-mix', {}, rolls()), /backpack/);
});

test('Gambit preserves nested death-move damage while Charm changes its trigger and can itself be regained', () => {
  const enemies = foes(2); enemies[0].health = 1;
  let fight = startDestinyRound(setup({ gambit: 1, 'shadow-thorns': 1, charm: 1, piercing: 1 }, {}, enemies), 0);
  fight = hit(use(win(fight), 'piercing'));
  fight = use(fight, 'shadow-thorns', { deferDamage: true }, rolls(1, 1));
  assert.equal(fight.turn.pendingAbility.name, 'gambit');
  assert.equal(fight.turn.pendingAbility.suspendedAbility.name, 'shadow-thorns');
  fight = resolve(use(fight, 'charm', { die: 0 }, rolls(6)));
  assert.equal(fight.phase, 'ability-choice');
  assert.throws(() => resolveDestinyGambit(fight, 'piercing'), /speed or modifier/);
  fight = resolveDestinyGambit(JSON.parse(JSON.stringify(fight)), 'charm');
  assert.equal(fight.used.charm, 0);
  fight = resolve(use(fight, 'charm', { die: 0 }, rolls(4)));
  assert.equal(fight.opponents[1].health, 76);
  assert.equal(fight.used['shadow-thorns'], 1);
  assert.equal(fight.turn.used.dm, true);
});

test('a missed Gambit trigger resumes its suspended damage without consuming another use', () => {
  const enemies = foes(2); enemies[0].health = 1;
  let fight = hit(win(startDestinyRound(setup({ gambit: 1, 'shadow-thorns': 1 }, {}, enemies), 0)));
  fight = use(fight, 'shadow-thorns', { deferDamage: true }, rolls(2, 1));
  fight = resolve(fight);
  assert.equal(fight.turn.pendingAbility.name, 'shadow-thorns');
  fight = resolve(fight);
  assert.equal(fight.opponents[1].health, 78);
  assert.equal(fight.used['shadow-thorns'], 1);
});

test('Gambit restoration is optional even when no eligible ability has been spent', () => {
  const enemies = foes(2); enemies[0].health = 1;
  let fight = hit(win(startDestinyRound(setup({ gambit: 1, murder: 1 }, {}, enemies), 0)));
  fight = use(fight, 'murder', { target: 1 }, rolls(6));
  fight = resolveDestinyGambit(resolve(fight), null);
  assert.equal(fight.phase, 'end');
  assert.equal(fight.turn.used.dm, true);
});

test('Ice Hooks changes only its printed climb duration or challenge threshold', () => {
  const plain = setup(), hooks = setup({ 'ice-hooks': 1 });
  assert.deepEqual(winterChallenge(plain, 35), { turns: 7, threshold: 15, rollBonus: 0 });
  assert.deepEqual(winterChallenge(hooks, 35, { leif: true }), { turns: 5, threshold: 15, rollBonus: 2 });
  assert.equal(winterChallenge(plain, 67).threshold, 14);
  assert.equal(winterChallenge(hooks, 67).threshold, 8);
});

test('Insulated reduces the specified normal damage score, not every damage event', () => {
  for (const [section, reduction] of [[154, 3], [599, 2]]) {
    let fight = configureWinterEncounter(setup({ insulated: 1 }), section);
    fight = hit(lose(startDestinyRound(fight, 0)), 6);
    assert.equal(fight.turn.damageScore, 10 - reduction);
  }
});

test('Insulated changes frost-hound death explosions and per-living-opponent frost damage', () => {
  for (const insulated of [false, true]) {
    const enemies = foes(3); enemies[1].health = 1;
    let fight = configureWinterEncounter(setup(insulated ? { insulated: 1 } : {}, {}, enemies), 292);
    fight = hit(win(startDestinyRound(fight, 1)));
    assert.equal(fight.hero.health, insulated ? 18 : 15);
    fight = configureWinterEncounter(setup(insulated ? { insulated: 1 } : {}, {}, foes(2)), 615);
    fight = endDestinyRound(resolveDestinySpeed(rollDestinySpeed(startDestinyRound(fight, 0), rolls(3, 3, 3, 3))));
    assert.equal(fight.hero.health, insulated ? 18 : 16);
  }
});

test('Insulated ignores mirror bonuses and the snow-joke end damage only where specified', () => {
  for (const insulated of [false, true]) {
    let fight = configureWinterEncounter(setup(insulated ? { insulated: 1 } : {}, {}, foes(4)), 565);
    fight = hit(lose(startDestinyRound(fight, 0)), 1);
    assert.equal(fight.turn.damageScore, insulated ? 5 : 8);
    fight = configureWinterEncounter(setup(insulated ? { insulated: 1 } : {}, {}, foes(3)), 578);
    fight = endDestinyRound(resolveDestinySpeed(rollDestinySpeed(startDestinyRound(fight, 0), rolls(3, 3, 3, 3))));
    assert.equal(fight.hero.health, insulated ? 20 : 17);
  }
});

test('Persuade and the trapper hide bonus apply per item without changing any wallet', () => {
  const fight = attachDestinyCharacter(setup({ persuade: 1 }), { career: 'trapper', gold: 12 });
  assert.equal(winterSalePrice(fight, 100, { quantity: 2, hide: true }), 230);
  assert.equal(winterSalePrice(fight, 100, { quantity: 2, hide: false }), 220);
  assert.equal(fight.character.gold, 12);
});
