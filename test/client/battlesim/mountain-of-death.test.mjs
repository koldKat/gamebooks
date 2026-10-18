import test from 'node:test';
import assert from 'node:assert/strict';
import {ABILITIES, DEFAULT_CHARACTER, ENCOUNTERS} from '../../../public/js/battlesim/books/895/definition.js';
import {startFight, exchange, castMagic, abandon, character} from '../../../public/js/battlesim/books/895/combat.js';
import {recover} from '../../../public/js/battlesim/books/895/effects.js';
import {createState} from '../../../public/js/battlesim/books/895/state.js';
import bg from '../../../public/js/i18n/bg/battlesim/battlesim895.js';
import en from '../../../public/js/i18n/en/battlesim/battlesim895.js';

const player = patch => ({...structuredClone(DEFAULT_CHARACTER), ...patch});
const enemy = patch => ({displayName: 'Противник', skill: 8, stamina: 12, ...patch});
const preset = id => ENCOUNTERS.find(row => row.id === String(id));
const fight = (id, patch = {}, rules = {}) => startFight(player(patch), preset(id).enemies, {enemyDamage: 3, ...preset(id).rules, ...rules});

test('895 uses subtraction, harmless ties, immutable exchanges and configurable loss damage', () => {
  const original = startFight(player({skill: 8}), [enemy()], {enemyDamage: 4});
  const copy = structuredClone(original);
  const tie = exchange(original, {player: 2, enemy: 2});
  assert.equal(tie.player.stamina, 30); assert.equal(tie.enemies[0].stamina, 12);
  const won = exchange(tie, {player: 1, enemy: 6});
  assert.equal(won.enemies[0].stamina, 9); assert.equal(won.events[0].playerStrength, 7);
  const lost = exchange(won, {player: 6, enemy: 1});
  assert.equal(lost.player.stamina, 26); assert.equal(lost.enemies[0].stamina, 9);
  assert.deepEqual(original, copy);
  assert.throws(() => startFight(player(), [enemy()], {}), RangeError);
  for (const roll of [0, 7, 1.5, NaN]) assert.throws(() => exchange(original, {player: roll, enemy: 1}), RangeError);
});

test('895 resolves groups sequentially and stops first-wound encounters without killing', () => {
  const original = startFight(player({skill: 20}), [enemy({stamina: 3}), enemy()], {enemyDamage: 3});
  const next = exchange(original, {player: 1, enemy: 6});
  assert.equal(next.index, 1); assert.equal(next.enemies[1].stamina, 12); assert.equal(next.outcome, null);
  const wound = exchange(fight(63, {skill: 20}), {player: 1, enemy: 6});
  assert.equal(wound.outcome, 'win'); assert.equal(wound.finishReason, 'firstWound');
  assert.equal(wound.enemies[0].stamina, 9);
  assert.throws(() => exchange(wound, {player: 1, enemy: 1}), RangeError);
});

test('895 spell charges and group damage follow each encounter permission', () => {
  const original = fight(172, {abilities: ['magic']});
  const next = castMagic(original);
  assert.equal(next.player.magicUses, 5); assert(next.enemies.every(row => row.stamina === 3));
  assert.equal(original.player.magicUses, 6);
  assert.equal(castMagic(next).outcome, 'win');
  assert.equal(castMagic(fight(161, {abilities: ['magic']})).enemies[0].stamina, 15);
  assert.equal(castMagic(fight(182, {abilities: ['magic']})).enemies[0].stamina, 12);
  assert.equal(castMagic(fight(264, {abilities: ['magic']})).enemies[0].stamina, 7);
  assert.throws(() => castMagic(fight(38, {abilities: ['magic']})), RangeError);
  assert.throws(() => castMagic(fight(193, {abilities: ['magic']})), RangeError);
  assert.throws(() => castMagic(fight(172)), RangeError);
  assert.throws(() => castMagic(fight(172, {abilities: ['magic'], magicUses: 0})), RangeError);
});

test('895 invisibility and leaves are consumed once and apply only to the fight', () => {
  const original = fight(35, {abilities: ['invisibility'], leafUses: 3}, {invisibility: true, leaf: true});
  assert.equal(original.player.invisibilityUses, 4); assert.equal(original.player.leafUses, 2);
  const next = exchange(original, {player: 1, enemy: 6});
  assert.equal(next.events[0].playerStrength, 7); assert.equal(next.events[0].playerDamage, 4);
  const lost = exchange(original, {player: 6, enemy: 1});
  assert.equal(lost.player.stamina, 29); assert.equal(lost.player.skill, 6);
  const ended = abandon(next);
  const plain = startFight(ended.player, [enemy()], {enemyDamage: 3});
  assert.equal(plain.player.skill, 6); assert.equal(plain.rules.invisibility, undefined);
  assert.throws(() => fight(35, {}, {invisibility: true}), RangeError);
  assert.throws(() => fight(35, {}, {leaf: true}), RangeError);
});

test('895 weapon exceptions preserve vampire reduction and Mikul shield variants', () => {
  const hit = id => exchange(fight(id, {skill: 20, scimitar: true}), {player: 1, enemy: 6});
  assert.equal(hit(35).events[0].playerDamage, 4);
  assert.equal(hit(61).events[0].playerDamage, 3);
  assert.equal(hit(181).events[0].playerDamage, 3);
  assert.equal(hit(210).events[0].playerDamage, 2);
  assert.equal(castMagic(fight(181, {abilities: ['magic']})).enemies[0].stamina, 7);
  assert.equal(fight(182).enemies[0].stamina, 19);
});

test('895 passage injuries are opt-in and death blocks combat and recovery', () => {
  assert.equal(fight(8).player.stamina, 30);
  assert.equal(fight(8, {}, {applyInjuries: true}).player.stamina, 24);
  const next = fight(210, {stamina: 6}, {applyInjuries: true});
  assert.equal(next.player.skill, 5); assert.equal(next.player.courage, 2);
  assert.equal(next.player.stamina, 0); assert.equal(next.outcome, 'loss');
  assert.throws(() => castMagic(next), RangeError);
  assert.throws(() => recover(player({stamina: 0, abilities: ['healing']}), 'healing'), RangeError);
  assert.throws(() => fight(8, {stamina: 0}), RangeError);
  const fatal = fight(210, {stamina: 6, abilities: ['invisibility'], leafUses: 3}, {applyInjuries: true, invisibility: true, leaf: true});
  assert.equal(fatal.outcome, 'loss'); assert.equal(fatal.player.invisibilityUses, 5); assert.equal(fatal.player.leafUses, 3);
});

test('895 bat stench lowers skill once after six completed rounds only if still fighting', () => {
  let next = fight(200, {skill: 9});
  for (let round = 0; round < 6; round++) next = exchange(next, {player: 1, enemy: 1});
  assert.equal(next.player.skill, 8); assert.equal(next.skillPenaltyApplied, true);
  next = exchange(next, {player: 1, enemy: 2});
  assert.equal(next.player.skill, 8);
  const short = exchange(fight(200, {skill: 30}), {player: 1, enemy: 6});
  assert.equal(short.player.skill, 30);
});

test('895 archery spends one arrow per orc with no invented hit test', () => {
  const next = fight(95, {arrows: 6}, {archeryKills: 6});
  assert.equal(next.player.arrows, 0); assert.equal(next.index, 6);
  assert.equal(next.enemies.filter(row => row.stamina > 0).length, 4);
  const all = fight(95, {arrows: 10}, {archeryKills: 10});
  assert.equal(all.outcome, 'win'); assert.equal(all.round, 0);
  assert.throws(() => fight(95, {arrows: 2}, {archeryKills: 3}), RangeError);
  assert.throws(() => fight(93, {arrows: 10}, {archeryKills: 1}), RangeError);
});

test('895 recovery respects initial endurance and distinct limited-use items', () => {
  const source = player({stamina: 28, abilities: ['healing'], ointmentUses: 3, balmUses: 2});
  const healed = recover(source, 'healing');
  assert.equal(healed.stamina, 30); assert.equal(healed.healingUses, 4); assert.equal(source.healingUses, 5);
  const ointment = recover({...source, stamina: 10}, 'ointment');
  assert.equal(ointment.stamina, 14); assert.equal(ointment.ointmentUses, 2);
  const balm = recover({...source, stamina: 1}, 'balm');
  assert.equal(balm.stamina, 30); assert.equal(balm.balmUses, 1);
  assert.throws(() => recover(player({stamina: 1}), 'healing'), RangeError);
  assert.throws(() => recover(source, 'unknown'), RangeError);
  assert.throws(() => character(player({abilities: ABILITIES.slice(0, 4)})), RangeError);
  assert.throws(() => character(player({abilities: ['invented']})), RangeError);
});

test('895 roster preserves route variants, sequential groups and BG/EN key parity', () => {
  assert.equal(ENCOUNTERS.length, 47); assert.equal(new Set(ENCOUNTERS.map(row => row.id)).size, 47);
  assert.deepEqual(preset(65).enemies.map(row => [row.skill, row.stamina]), [[8, 12], [7, 11], [7, 11], [7, 11]]);
  assert.equal(preset(83).enemies.length, 9); assert.equal(preset(93).enemies[0].stamina, 10);
  assert.equal(preset(106).enemies[0].stamina, 13); assert.equal(preset(98).enemies[0].stamina, 14);
  assert.equal(preset(127).enemies[0].stamina, 16); assert.equal(preset(241).enemies.length, 4);
  assert.equal(preset(262).enemies[0].skill, 8); assert.equal(preset(264).enemies[0].stamina, 17);
  assert.deepEqual(Object.keys(bg).sort(), Object.keys(en).sort());
});

test('895 atomic state updates preserve other runs and record each outcome exactly once', () => {
  let run = {sim891: {preserved: true}}, bookId = 895, saves = 0;
  const store = createState(() => ({currentBookId: bookId, currentPlaythrough: () => run, saveState: () => saves++}));
  store.change(data => {data.fight = exchange(startFight(player({skill: 20}), [enemy({stamina: 1})], {enemyDamage: 3}), {player: 1, enemy: 6});});
  assert.equal(run.sim895.history.length, 1); assert.equal(run.sim891.preserved, true);
  store.change(() => {}); assert.equal(run.sim895.history.length, 1);
  const before = structuredClone(run), old = run;
  assert.throws(() => store.change(data => {data.character.stamina = 0; throw Error('abort');}));
  assert.deepEqual(run, before);
  assert.equal(store.change(() => {run = {};}), false); assert.deepEqual(old, before);
  bookId = 891; assert.equal(store.read(), null); assert.equal(store.change(() => {}), false);
  assert.equal(saves, 2);
});
