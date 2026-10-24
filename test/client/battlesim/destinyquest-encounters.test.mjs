import test from 'node:test';
import assert from 'node:assert/strict';
import { WINTER_ENCOUNTERS, winterRosterFor } from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
import { createWinterFight, configureWinterEncounter, useWinterAction, WINTER_IMPLEMENTED_ENCOUNTERS } from '../../../public/js/battlesim/engines/destinyquest/winters-fury.js';
import { createDestinyFight, startDestinyRound, rollDestinySpeed, resolveDestinySpeed,
  rollDestinyDamage, resolveDestinyDamage, endDestinyRound, skipDestinyDeathMove } from '../../../public/js/battlesim/engines/destinyquest/core.js';
import { configureDestinyAbilities, useDestinyAbility as use } from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import { resolveDestinyAbilityRoll as resolve } from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';
import { destinyStat } from '../../../public/js/battlesim/engines/destinyquest/effects.js';

const rolls = (...values) => () => { assert.ok(values.length, 'Unexpected roll'); return values.shift(); };
const hero = extra => ({ speed: 20, brawn: 4, magic: 3, armour: 2, health: 20, maxHealth: 30, ...extra });
const preset = (section, extra = {}, options = {}) => createWinterFight(hero(extra), section, options);
const win = fight => resolveDestinySpeed(rollDestinySpeed(fight, rolls(6, 6, 2, 2)));
const hit = (fight, value = 1) => resolveDestinyDamage(rollDestinyDamage(fight, rolls(value)));
const end = fight => endDestinyRound(fight.phase === 'death-move' ? skipDestinyDeathMove(fight) : fight);
const tie = fight => resolveDestinySpeed(rollDestinySpeed(fight, rolls(3, 3, 3, 3)));

test('the roster preserves all 99 encounters, 218 printed parts and explicit noncombat resources', () => {
  assert.equal(WINTER_ENCOUNTERS.length, 99);
  assert.equal(new Set(WINTER_ENCOUNTERS.map(e => e.section)).size, 99);
  assert.equal(WINTER_ENCOUNTERS.reduce((sum, e) => sum + e.parts.length, 0), 218);
  assert.equal(winterRosterFor(118).parts[3].speed, null);
  assert.equal(winterRosterFor(118).parts[3].role, 'resource');
  assert.equal(winterRosterFor(468).parts[0].health, null);
  assert.equal(winterRosterFor(468).parts[0].role, 'indestructible');
  assert.throws(() => preset(468), /complete rules adapter/);
});

test('roster copies cannot alter future presets, and alternate stats retain their source values', () => {
  const entry = winterRosterFor(135);
  entry.parts[0].armour = 900;
  assert.equal(winterRosterFor(135).parts[0].armour, 2);
  assert.deepEqual(winterRosterFor(135).parts[0].variants.armour, [2, 5]);
  assert.equal(winterRosterFor(135).parts[0].sourceValues.Armour, '2/5(*)');
  const keeper = winterRosterFor(590).parts[0];
  assert.equal(keeper.brawn, 5);
  assert.equal(keeper.magic, 3);
  assert.equal(keeper.damageStat, 'brawn');
  assert.equal(Object.isFrozen(WINTER_ENCOUNTERS[0].parts[0]), true);
});

test('every currently automated preset creates the exact printed combat group without mutating setup', () => {
  const player = hero();
  const before = structuredClone(player);
  for (const section of WINTER_IMPLEMENTED_ENCOUNTERS) {
    const fight = createWinterFight(player, section);
    const expected = winterRosterFor(section).parts.filter(part => part.role === 'opponent');
    assert.equal(fight.opponents.length, expected.length, section);
    assert.deepEqual(fight.opponents.map(e => e.name), expected.map(e => e.name), section);
  }
  assert.deepEqual(player, before);
});

test('pack leader rerolls original ones once, accepts a second one, and also affects damage dice', () => {
  let fight = startDestinyRound(preset(37), 0);
  fight = rollDestinySpeed(fight, rolls(6, 6, 1, 1, 1, 6));
  assert.deepEqual(fight.turn.opponentSpeedDice, [1, 6]);
  fight = hit(resolveDestinySpeed(fight));
  const health = fight.opponents[0].health;
  fight = end(fight);
  assert.equal(fight.opponents[0].health, health - 1);
  fight = startDestinyRound(preset(54, { speed: 0 }), 0);
  fight = resolveDestinySpeed(rollDestinySpeed(fight, rolls(1, 1, 6, 6)));
  fight = rollDestinyDamage(fight, rolls(1, 6));
  assert.deepEqual(fight.turn.damageDice, [6]);
});

test('the sabre cub flees at ten health instead of being falsely recorded as killed', () => {
  let fight = preset(70, { brawn: 20 }, { abilities: { 'malefic-runes': 1 } });
  fight = hit(win(startDestinyRound(fight, 0)));
  assert.equal(fight.status, 'win');
  assert.ok(fight.opponents[0].health > 0 && fight.opponents[0].health <= 10);
  assert.equal(fight.defeated, undefined);
});

test('blood brothers raises only the surviving zombie stats after its brother dies', () => {
  let fight = hit(win(startDestinyRound(preset(76, { brawn: 30 }), 0)));
  assert.equal(fight.opponents[0].health, 0);
  assert.equal(destinyStat(fight, 1, 'speed'), 3);
  assert.equal(destinyStat(fight, 1, 'brawn'), 3);
});

test('spore clouds and the hunter ambush expire after precisely two rounds', () => {
  for (const section of ['91', '166']) {
    let fight = preset(section, { brawn: 0, magic: 0 });
    for (let round = 1; round <= 3; round++) {
      fight = startDestinyRound(fight, 0);
      assert.equal(destinyStat(fight, section === '91' ? 'hero' : 0, 'speed'),
        section === '91' ? round <= 2 ? 19 : 20 : round <= 2 ? 0 : 2);
      fight = end(hit(win(fight)));
    }
  }
});

test('outnumbered stops as soon as only one opponent survives', () => {
  let fight = hit(win(startDestinyRound(preset(100, { brawn: 30 }), 0)));
  fight = end(fight);
  assert.equal(fight.hero.health, 18);
  fight = end(hit(win(startDestinyRound(fight, 1))));
  assert.equal(fight.hero.health, 18);
});

test('smashing ice replaces normal damage, lowers armour four and tracks the achievement condition', () => {
  let fight = win(startDestinyRound(preset(49), 0));
  fight = useWinterAction(fight, 'smash-ice');
  assert.equal(destinyStat(fight, 0, 'armour'), 12);
  assert.equal(fight.opponents[0].health, 30);
  assert.equal(fight.encounter.smashedIce, true);
  assert.equal(fight.turn.used.co, false);
  assert.throws(() => rollDestinyDamage(fight), /stage/);
  assert.equal(end(fight).hero.health, 15);
});

test('the geomancer gains stone shield at the start of round three, not earlier', () => {
  let fight = preset(135, { brawn: 0, magic: 0 });
  for (let round = 1; round <= 3; round++) {
    fight = startDestinyRound(fight, 0);
    assert.equal(destinyStat(fight, 0, 'armour'), round < 3 ? 2 : 5);
    assert.equal(destinyStat(fight, 0, 'speed'), round < 3 ? 4 : 3);
    fight = end(hit(win(fight)));
  }
});

test('Gargax legs lower both upper-part speeds; tar barrels are counted separately from backpack limits', () => {
  let fight = preset(141, { brawn: 30 }, { abilities: { haste: 1, focus: 1 }, character: { tarBarrels: 3 } });
  fight = startDestinyRound(fight, 2);
  assert.throws(() => use(fight, 'haste'), /blocking/);
  fight = use(fight, 'focus');
  fight = hit(win(fight));
  assert.equal(destinyStat(fight, 0, 'speed'), 3);
  assert.equal(destinyStat(fight, 1, 'speed'), 3);
  fight = skipDestinyDeathMove(fight);
  fight = useWinterAction(fight, 'tar-barrels', { count: 2 });
  assert.equal(fight.character.tarBarrels, 1);
  assert.equal(fight.opponents[0].health, 18);
  assert.equal(fight.opponents[1].health, 18);
  assert.throws(() => useWinterAction(fight, 'tar-barrels', { count: 3 }), /four/);
  assert.equal(fight.turn.used.backpack, false);
});

test('ember-wild explosions can defeat the hero and are never reduced by armour', () => {
  let fight = hit(win(startDestinyRound(preset(152, { brawn: 30, armour: 100, health: 4 }), 0)));
  assert.equal(fight.hero.health, 0);
  assert.equal(fight.status, 'loss');
});

test('helping hands stop reducing hero speed when defeated while Pandora still deals her end damage', () => {
  let fight = startDestinyRound(preset(167, { brawn: 30 }), 1);
  assert.equal(destinyStat(fight, 'hero', 'speed'), 19);
  fight = hit(win(fight));
  assert.equal(destinyStat(fight, 'hero', 'speed'), 20);
  assert.equal(end(fight).hero.health, 18);
});

test('Nisse regeneration heals only surviving trolls and stone coating grows to its printed cap', () => {
  let fight = preset(184);
  for (let round = 1; round <= 4; round++) {
    fight = end(hit(win(startDestinyRound(fight, 0))));
    assert.equal(fight.opponents[0].health, 20);
    assert.equal(destinyStat(fight, 1, 'armour'), Math.min(5, 2 + round));
  }
});

test('matriarch wards block modifiers until she dies, while acolytes retain regeneration', () => {
  let fight = startDestinyRound(preset(187, { brawn: 50 }, { abilities: { focus: 1 } }), 0);
  assert.throws(() => use(fight, 'focus'), /blocking/);
  fight = end(hit(win(fight)));
  fight = startDestinyRound(fight, 1);
  assert.doesNotThrow(() => use(fight, 'focus'));
  assert.equal(fight.opponents[1].health, 30);
});

test('snuffing candles uses an editable counter roll, never invents an enemy attack stat', () => {
  let fight = preset(118, {}, { abilities: { charm: 1 } });
  assert.equal(fight.opponents.length, 3);
  fight = useWinterAction(win(startDestinyRound(fight, 0)), 'snuff-candles', {}, rolls(6, 6));
  fight = end(resolve(fight));
  assert.equal(fight.encounter.resources.candles, 4);
  assert.equal(fight.hero.health, 17);
  fight = useWinterAction(win(startDestinyRound(fight, 0)), 'snuff-candles', {}, rolls(1, 1));
  fight = resolve(use(fight, 'charm', { die: 0 }, rolls(6)));
  assert.equal(fight.encounter.resources.candles, 0);
  assert.equal(destinyStat(fight, 0, 'magic'), 1);
  assert.equal(destinyStat(fight, 0, 'armour'), 1);
  assert.equal(end(fight).hero.health, 17);
});

test('all three printed frost hounds receive their insulated death explosion rule', () => {
  const parts = winterRosterFor(292).parts;
  const enemies = parts.map(part => ({ name: part.name, speed: part.speed, magic: part.magic, armour: part.armour, health: part.health }));
  assert.equal(enemies.length, 4);
  let fight = configureWinterEncounter(configureDestinyAbilities(createDestinyFight(hero({ brawn: 30 }), enemies), { insulated: 1 }), 292);
  for (const index of [1, 2, 3]) fight = end(hit(win(startDestinyRound(fight, index))));
  assert.equal(fight.hero.health, 14);
  assert.equal(fight.opponents[0].health, 80);
});
