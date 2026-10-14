import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMURAI_ARTS, SAMURAI_ARROW_DAMAGE, validateSamuraiCharacter, newSamuraiCharacter,
  samuraiDeathDestination, eatSamuraiMeal, drinkSamuraiPotion, testSamuraiLuck, fireSamuraiArrow }
  from '../../../public/js/battlesim/engines/sword-of-samurai/character.js';

const constant = value => () => value;
const character = changes => ({ ...newSamuraiCharacter({}, constant(6)), ...changes });

test('source starting rolls, honour, ten meals, two swords and one chosen potion', () => {
  for (const value of [1, 6]) {
    const c = newSamuraiCharacter({ art: 'nito', potion: 'luck' }, constant(value));
    assert.deepEqual([c.skill, c.stamina, c.luck], [value + 6, value * 2 + 12, value + 6]);
    assert.deepEqual([c.honour, c.provisions, c.swords], [3, 10, 2]);
    assert.equal(c.potion, 'luck');
    assert.equal(c.potionUsed, false);
    assert.equal('gold' in c, false);
    assert.equal(validateSamuraiCharacter(c, true), c);
  }
  assert.throws(() => newSamuraiCharacter({}, constant(7)), RangeError);
  assert.throws(() => newSamuraiCharacter({ art: 'unknown' }), RangeError);
  assert.throws(() => newSamuraiCharacter({ potion: 'unknown' }), RangeError);
  for (const options of [null, true, 0, 'archery', ['archery']]) {
    assert.throws(() => newSamuraiCharacter(options), RangeError);
  }
});

test('only archery grants a bow and three arrows of each of four printed types', () => {
  for (const art of SAMURAI_ARTS) {
    const c = newSamuraiCharacter({ art }, constant(1));
    assert.equal(c.bow, art === 'archery');
    assert.deepEqual(Object.values(c.arrows), [0, 0, 0, 0].map(() => art === 'archery' ? 3 : 0));
  }
  assert.deepEqual(SAMURAI_ARROW_DAMAGE, { leaf: 2, barbed: 3, piercing: 2, blunt: 1 });
});

test('one meal heals four, caps ordinary recovery and does not mutate the saved character', () => {
  const c = character({ stamina: 15 }), before = structuredClone(c);
  const healed = eatSamuraiMeal(c);
  assert.equal(healed.stamina, 19);
  assert.equal(healed.provisions, 9);
  assert.deepEqual(c, before);
  assert.equal(eatSamuraiMeal(character({ stamina: 23 })).stamina, 24);
  assert.throws(() => eatSamuraiMeal(character({ provisions: 0 })), RangeError);
});

test('all three potions are one dose; Luck raises the initial value before restoring it', () => {
  for (const stat of ['skill', 'stamina', 'luck']) {
    const c = character({ potion: stat, [stat]: 1 }), before = structuredClone(c);
    const restored = drinkSamuraiPotion(c);
    assert.equal(restored[stat], c[stat + 'Initial'] + (stat === 'luck' ? 1 : 0));
    assert.equal(restored[stat + 'Initial'], c[stat + 'Initial'] + (stat === 'luck' ? 1 : 0));
    assert.equal(restored.potionUsed, true);
    assert.deepEqual(c, before);
    assert.throws(() => drinkSamuraiPotion(restored), RangeError);
  }
});

test('above-initial passage bonuses remain valid and ordinary recovery never reduces them', () => {
  const c = character({ skill: 14, stamina: 28, luck: 14 });
  validateSamuraiCharacter(c, true);
  assert.equal(eatSamuraiMeal(c).stamina, 28);
  for (const stat of ['skill', 'stamina', 'luck']) {
    const restored = drinkSamuraiPotion({ ...c, potion: stat });
    assert.equal(restored[stat], c[stat]);
  }
});

test('eating and potion use are forbidden in combat or after death, including honour zero', () => {
  for (const action of [eatSamuraiMeal, drinkSamuraiPotion]) {
    assert.throws(() => action(character(), true), RangeError);
    assert.throws(() => action(character(), 'false'), RangeError);
    assert.throws(() => action(character({ stamina: 0 })), RangeError);
    assert.throws(() => action(character({ honour: 0 })), RangeError);
  }
  assert.equal(samuraiDeathDestination(character({ honour: 0 })), 99);
  assert.equal(samuraiDeathDestination(character({ stamina: 0 })), null);
});

test('Luck uses <= current Luck, spends one point, never goes negative and preserves input', () => {
  const c = character({ luck: 6 }), before = structuredClone(c);
  const lucky = testSamuraiLuck(c, constant(3));
  assert.equal(lucky.lucky, true);
  assert.equal(lucky.character.luck, 5);
  assert.equal(testSamuraiLuck(c, constant(4)).lucky, false);
  const depleted = testSamuraiLuck(character({ luck: 0 }), constant(1));
  assert.equal(depleted.lucky, false);
  assert.equal(depleted.character.luck, 0);
  assert.deepEqual(c, before);
});

test('archery is strictly below SKILL, spends the selected arrow even on a miss and preserves input', () => {
  const c = { ...newSamuraiCharacter({ art: 'archery' }, constant(6)), skill: 6 };
  const before = structuredClone(c);
  const miss = fireSamuraiArrow(c, 'barbed', constant(3));
  assert.equal(miss.hit, false);
  assert.equal(miss.damage, 0);
  assert.equal(miss.character.arrows.barbed, 2);
  assert.equal(miss.character.arrows.leaf, 3);
  for (const [type, damage] of Object.entries(SAMURAI_ARROW_DAMAGE)) {
    const hit = fireSamuraiArrow(c, type, constant(1));
    assert.equal(hit.hit, true);
    assert.equal(hit.damage, damage);
  }
  assert.deepEqual(c, before);
  assert.throws(() => fireSamuraiArrow(character(), 'leaf', constant(1)), RangeError);
  assert.throws(() => fireSamuraiArrow({ ...c, bow: false }, 'leaf', constant(1)), RangeError);
  assert.throws(() => fireSamuraiArrow({ ...c, arrows: { ...c.arrows, leaf: 0 } }, 'leaf'), RangeError);
  assert.throws(() => fireSamuraiArrow(c, 'invented'), RangeError);
});

test('invalid saved values are rejected, not clamped or silently rewritten', () => {
  for (const changes of [{ stamina: -1 }, { skill: NaN }, { luck: Infinity }, { provisions: .5 },
    { honour: -1 }, { swords: 3 }, { bow: 1 }, { potionUsed: 0 }, { arrows: null }]) {
    const c = character(changes), before = structuredClone(c);
    assert.throws(() => validateSamuraiCharacter(c), RangeError);
    assert.deepEqual(c, before);
  }
});
