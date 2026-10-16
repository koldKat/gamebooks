import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chance, strikeCount, manoeuvreValues, normalStrike, simpleStrike,
  magicCost, openingSide, actionAllowance,
  startFight, prepareStrike, resolveStrike, castMagic, amendFighter, setBattleCode, finishFight,
} from '../../../public/js/battlesim/books/768/combat.js';
import {IRON_DRAGON, NECROMOR, CHARACTER_FIELDS} from '../../../public/js/battlesim/books/768/definition.js';
import {createState} from '../../../public/js/battlesim/books/768/state.js';
import en from '../../../public/js/i18n/en/battlesim/battlesim768.js';
import bg from '../../../public/js/i18n/bg/battlesim/battlesim768.js';

test('768: chance ranges retain the printed non-six-sided tables', () => {
  for (const sides of [6, 8, 12, 16]) {
    assert.equal(chance(sides, () => 0), 1);
    assert.equal(chance(sides, () => 0.999999), sides);
  }
  assert.throws(() => chance(20));
  assert.throws(() => chance(6, () => 1));
  assert.throws(() => chance(6, () => NaN));
});

test('768: manoeuvres consume a strike and use distinct attack and defence rolls', () => {
  assert.equal(strikeCount(2, 2), 2);
  assert.equal(strikeCount(2, 2, 'attack'), 1);
  assert.throws(() => strikeCount(1, 1, 'defence'));
  assert.throws(() => strikeCount(2, 3));
  assert.deepEqual(manoeuvreValues(10, 4, 'attack', {bonus: 12, penalty: 6}), {attack: 22, defence: -2});
  assert.deepEqual(manoeuvreValues(4, 10, 'defence', {bonus: 12, penalty: 6}), {attack: -2, defence: 22});
  assert.throws(() => manoeuvreValues(10, 10, 'attack', {bonus: 13, penalty: 1}));
});

test('768: normal damage subtracts rolled defence from the actual matrix result', () => {
  const input = {attack: 12, defence: 4, attackRoll: 3, defenceRoll: 2, tableDamage: 12};
  assert.deepEqual(normalStrike(input), {attackValue: 15, defenceValue: 6, tableDamage: 12, damage: 6});
  assert.equal(normalStrike({...input, tableDamage: 2}).damage, 0);
  assert.equal(normalStrike({...input, damageBonus: 12}).damage, 18);
  assert.throws(() => normalStrike({...input, tableDamage: undefined}));
  assert.throws(() => normalStrike({...input, defenceRoll: 7}));
  assert.deepEqual(simpleStrike(7), {tableDamage: 7, damage: 7, battleCode: 4});
});

test('768: magic consumes energy only when strength and energy are sufficient', () => {
  const input = {strength: 8, energy: 12, requiredStrength: 8, energyCost: 12};
  assert.deepEqual(magicCost(input), {strength: 8, energy: 0});
  assert.equal(input.energy, 12);
  assert.throws(() => magicCost({...input, strength: 7}));
  assert.throws(() => magicCost({...input, energy: 11}));
});

test('768: game levels retain their asymmetric action allowances', () => {
  assert.equal(openingSide('easy'), 'player');
  assert.equal(openingSide('fanatic'), 'enemy');
  assert.equal(openingSide('normal', 2), 'player');
  assert.equal(openingSide('hard', 3), 'enemy');
  assert.deepEqual(actionAllowance('easy', 3, 6), {player: 1, enemy: 1});
  assert.deepEqual(actionAllowance('normal', 3, 6), {player: 3, enemy: 6});
  assert.deepEqual(actionAllowance('fanatic', 3, 6), {player: 1, enemy: 6});
  assert.throws(() => openingSide('normal', 0));
});

test('768: bosses retain their actual values and separate dragon attacks', () => {
  assert.deepEqual(IRON_DRAGON.attacks.map(attack => attack.attack), [50, 120, 60]);
  assert.equal(IRON_DRAGON.life, 90);
  assert.equal(IRON_DRAGON.spellImmune, true);
  assert.equal(IRON_DRAGON.canEscape, false);
  assert.equal(NECROMOR.magicEnergy, 1000);
  assert.equal(NECROMOR.life, 120);
  assert.ok(CHARACTER_FIELDS.includes('mastery'));
});

test('768: state changes preserve unrelated data and cannot cross a run switch', () => {
  const first = {notes: 'keep', sim757: {character: {stamina: 13}}}, second = {notes: 'other'};
  let run = first, bookId = 768, saves = 0;
  const store = createState(() => ({currentBookId: bookId, currentPlaythrough: () => run, saveState: () => saves++}));
  store.ensure();
  assert.equal(saves, 1);
  const original = JSON.stringify(first);
  assert.throws(() => store.change(data => {data.character = {}; throw Error('Invalid');}));
  assert.equal(JSON.stringify(first), original);
  assert.equal(store.change(data => {data.character = {life: 24}; run = second;}), false);
  assert.equal(JSON.stringify(first), original);
  assert.deepEqual(second, {notes: 'other'});
  run = first;
  bookId = 769;
  assert.equal(store.read(), null);
  assert.equal(store.change(() => {}), false);
  assert.equal(saves, 1);
  assert.deepEqual(first.sim757, {character: {stamina: 13}});
});

test('768: history records a completed fight once without clearing character values', () => {
  const run = {};
  const store = createState(() => ({currentBookId: 768, currentPlaythrough: () => run, saveState() {}}));
  store.change(data => {
    data.character = {life: 7, magicEnergy: 3};
    data.fight = {name: 'Див орк', outcome: 'win'};
  });
  store.change(() => {});
  assert.equal(store.read().history.length, 1);
  assert.deepEqual(store.read().character, {life: 7, magicEnergy: 3});
});

const hero = {displayName: 'Hero', attack: 12, defence: 4, shooting: 8, life: 24, speed: 3, mastery: 2,
  magicStrength: 8, magicEnergy: 12, magicResistance: 2};
const enemy = {displayName: 'Enemy', attack: 10, defence: 2, life: 16};
const fresh = options => startFight([hero], [enemy], {system: 'normal', level: 'normal', openingRoll: 2, ...options});

test('768: table-assisted attacks preserve original actors and require fresh results', () => {
  const original = fresh(), before = JSON.stringify(original);
  const pending = prepareStrike(original, {side: 'player', actorIndex: 0, targetIndex: 0, requested: 2}, () => 0);
  assert.equal(pending.pending.attackValue, 13);
  assert.equal(pending.pending.defenceValue, 3);
  assert.equal(JSON.stringify(original), before);
  assert.throws(() => resolveStrike(pending));
  const result = resolveStrike(pending, 12);
  assert.equal(result.enemies[0].life, 7);
  assert.equal(result.pending, null);
  assert.equal(result.actions.length, 1);
  assert.throws(() => resolveStrike(result, 12));
  const counter = prepareStrike(result, {side: 'enemy', actorIndex: 0, targetIndex: 0, requested: 2}, () => 0);
  assert.equal(counter.pending.strikes, 2, 'printed enemy strikes do not invent mastery');
  assert.equal(resolveStrike(counter, 10).players[0].life, 19);
});

test('768: groups target individual figures, and simple damage is already final', () => {
  assert.equal(startFight([{...hero, life: 0}], [enemy], {level: 'easy'}).players[0].life, 0,
    'passage-specific outcomes do not invent a zero-LIFE death rule');
  const fight = startFight([hero, {...enemy, displayName: 'Ally'}], [enemy, {...enemy}], {system: 'simple', level: 'easy'});
  const pending = prepareStrike(fight, {side: 'enemy', actorIndex: 1, targetIndex: 1, requested: 1}, () => 0);
  const result = resolveStrike(pending, 5);
  assert.equal(result.players[0].life, 24);
  assert.equal(result.players[1].life, 11);
  assert.equal(result.battleCode, 4);
  assert.throws(() => setBattleCode(result, 0));
});

test('768: dragon attacks and immunity remain distinct in live combat', () => {
  const fight = startFight([hero], [IRON_DRAGON], {level: 'easy'});
  for (const [attackIndex, attack] of [50, 120, 60].entries()) {
    const pending = prepareStrike(fight, {side: 'enemy', actorIndex: 0, targetIndex: 0, requested: 1, attackIndex}, () => 0);
    assert.equal(pending.pending.attackValue, attack + 1);
  }
  assert.throws(() => finishFight(fight, 'escape'));
  assert.throws(() => castMagic(fight, {side: 'player', actorIndex: 0, targetIndex: 0,
    requiredStrength: 1, energyCost: 1, damage: 20}));
});

test('768: spell energy, explicit effects and passage outcomes are saved without invented healing', () => {
  const fight = castMagic(fresh(), {side: 'player', actorIndex: 0, targetIndex: 0,
    requiredStrength: 8, energyCost: 5, damage: 8, spell: 'Printed spell'});
  assert.equal(fight.players[0].magicEnergy, 7);
  assert.equal(fight.enemies[0].life, 8);
  const amended = amendFighter(fight, 'player', 0, {life: 17, magicEnergy: 3});
  assert.equal(amended.players[0].life, 17);
  assert.equal(amended.players[0].magicEnergy, 3);
  const finished = finishFight(amended, 'win');
  assert.equal(finished.players[0].life, 17);
  assert.throws(() => finishFight(finished, 'win'));
  assert.throws(() => amendFighter(fight, 'player', 0, {unrelated: 20}));
  assert.equal(setBattleCode(fight, -1).battleCode, -1);
});

test('768: translated interfaces have matching keys and explicit manual-table instructions', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(bg).sort());
  assert.ok(bg['battlesim768.tableNote'].includes('не я приспадай повторно'));
  assert.ok(en['battlesim768.tableNote'].includes('do not subtract it twice'));
});
