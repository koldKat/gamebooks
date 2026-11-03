import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareBlackSunEncounter, validateBlackSunCatalog} from '../../../../public/js/battlesim/engines/black-sun/catalog.js';

const entry = () => ({section: 'custom', label: 'Custom', sourcePages: [1], combat: {
  section: 'custom', label: 'Custom', attack: 0, defense: 16, separatePartAttacks: true,
  opponents: [{key: 'left', attack: 13, resistance: 3}, {key: 'right', attack: 15, resistance: 3}],
  variants: [{key: 'right', partAttackModifiers: {right: -3}}, {key: 'both', partAttackModifiers: {left: -3, right: -3}}],
}});

test('explicit part modifiers preserve source presets and affect only their named parts', () => {
  const source = entry(), before = structuredClone(source);
  const right = prepareBlackSunEncounter(source, {variants: ['right']});
  assert.deepEqual(right.opponents.map(p => p.attack), [13, 12]); assert.deepEqual(source, before);
  const both = prepareBlackSunEncounter(source, {variants: ['both']});
  assert.deepEqual(both.opponents.map(p => p.attack), [10, 12]);
  assert.throws(() => prepareBlackSunEncounter(source, {variants: ['missing']}), RangeError);
});

test('catalog validation rejects missing, duplicated and contradictory source identity', () => {
  assert.doesNotThrow(() => validateBlackSunCatalog([entry()]));
  assert.throws(() => validateBlackSunCatalog([]), RangeError);
  assert.throws(() => validateBlackSunCatalog([entry(), entry()]), RangeError);
  const wrong = entry(); wrong.combat.section = 'other'; assert.throws(() => validateBlackSunCatalog([wrong]), RangeError);
});

test('an opening Rage attack uses explicit current Rage rather than a campaign-derived value', () => {
  const source = entry(); source.combat.openingDamageFrom = 'rage';
  assert.throws(() => prepareBlackSunEncounter(source), RangeError);
  assert.equal(prepareBlackSunEncounter(source, {rage: 2}).openingDamage, 2);
});

test('selected combat gifts merge player overrides and preserve the encounter’s own timed damage', () => {
  const source = entry(); source.combat.periodicDamage = {rounds: [3, 5], amount: 1};
  const support = {passives: [{id: 'one', player: {kesrani: true}}, {id: 'two', player: {fullMoonPower: true}},
    {id: 'coil', periodicEffect: {every: 1, amount: 1, target: 'selected'}}]};
  const result = prepareBlackSunEncounter(source, {passives: ['one', 'two', 'coil']}, support);
  assert.deepEqual(result.playerOverrides, {kesrani: true, fullMoonPower: true});
  assert.deepEqual(result.periodicDamage, source.combat.periodicDamage); assert.equal(result.periodicEffects.length, 1);
});

test('exclusive gifts and effects from another encounter cannot be silently combined', () => {
  const support = {passives: [{id: 'one', group: 'mask'}, {id: 'two', group: 'mask'}],
    effects: [{id: 'other', sections: ['other']} ]};
  assert.throws(() => prepareBlackSunEncounter(entry(), {passives: ['one', 'two']}, support), RangeError);
  assert.throws(() => prepareBlackSunEncounter(entry(), {effects: ['other']}, support), RangeError);
  assert.throws(() => prepareBlackSunEncounter(entry(), {passives: ['missing']}, support), RangeError);
});
