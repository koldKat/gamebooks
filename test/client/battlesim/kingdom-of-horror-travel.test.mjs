import test from 'node:test';
import assert from 'node:assert/strict';
import { createKingdomCharacter } from '../../../public/js/battlesim/engines/grailquest/kingdom-of-horror.js';
import { kingdomMerlin, kingdomTakeEquipment, kingdomTakeMagic, kingdomDream,
  kingdomFinishLimerick, kingdomSleep, kingdomInvisibility, kingdomBookExperience,
  kingdomCityPatrol, kingdomPayFine }
  from '../../../public/js/battlesim/engines/grailquest/kingdom-of-horror-travel.js';

const character = extra => ({ ...createKingdomCharacter(), life: 40, maxLife: 48, ...extra });
const rolls = (...values) => {
  let index = 0;
  return () => { assert.ok(index < values.length, 'Unexpected random roll'); return (values[index++] - 1) / 6; };
};

test('Merlin rooms preserve the source risks and safe sleep does not roll Dreamtime', () => {
  assert.equal(kingdomMerlin(character(), rolls(1)).player.life, 0);
  assert.equal(kingdomMerlin(character(), rolls(6)).player.life, 20);
  assert.equal(kingdomMerlin(character(), rolls(4, 6, 6)).player.life, 48);
  assert.equal(kingdomMerlin(character(), rolls(5)).player.life, 40);
});

test('Merlin equipment allows two distinct items and never duplicates exhausted stock', () => {
  const original = character();
  const visit = kingdomMerlin(original, rolls(2));
  assert.equal(kingdomTakeEquipment(visit, 'healingPotion'), true);
  assert.equal(visit.player.potions, 6);
  assert.equal(kingdomTakeEquipment(visit, 'healingPotion'), false);
  assert.equal(kingdomTakeEquipment(visit, 'breastplate'), true);
  assert.equal(visit.player.armour, 2);
  assert.equal(kingdomTakeEquipment(visit, 'quartz'), false);
  assert.equal(original.equipment.length, 0);
});

test('Magic selection is one per visit and charges and reserve counts stay source-specific', () => {
  let visit = kingdomMerlin(character(), rolls(3));
  assert.equal(kingdomTakeMagic(visit, 'lightningWand', rolls()), true);
  assert.equal(visit.player.magic.lightningWand, 8);
  assert.equal(kingdomTakeMagic(visit, 'fireball', rolls()), false);
  visit = kingdomMerlin(visit.player, rolls(3));
  assert.equal(kingdomTakeMagic(visit, 'pointingBone', rolls(4)), true);
  assert.equal(visit.player.magic.pointingBone, 4);
  assert.equal(visit.player.magicStock.pointingBone, 0);
  visit = kingdomMerlin(visit.player, rolls(3));
  assert.equal(kingdomTakeMagic(visit, 'speedBoots', rolls()), true);
  assert.equal(visit.player.speedCombats, 3);
  assert.equal(visit.player.magicStock.speedBoots, 1);
});

test('Dreamtime 2 preserves both death and safe return', () => {
  assert.equal(kingdomDream(character(), 2, rolls(3)).status, 'dead');
  assert.equal(kingdomDream(character(), 2, rolls(4)).player.life, 40);
});

test('Dreamtime 5 heals only on five or six and otherwise removes ten LIFE', () => {
  assert.equal(kingdomDream(character(), 5, rolls(5, 6, 6)).player.life, 48);
  assert.equal(kingdomDream(character(), 5, rolls(4)).player.life, 30);
});

test('The limerick needs an explicit timed result and deducts five LIFE on failure', () => {
  const dream = kingdomDream(character(), 6, rolls());
  assert.equal(dream.minutes, 15);
  assert.equal(kingdomFinishLimerick(dream, false), true);
  assert.equal(dream.player.life, 35);
  assert.equal(kingdomFinishLimerick(dream, false), false);
});

test('Dreamtime Gnurlbash can attack, depart, or accompany the player for one fight', () => {
  const hostile = kingdomDream(character(), 7, rolls(3, 3));
  assert.equal(hostile.fight.spec.id, 'dream7');
  assert.equal(hostile.fight.first, 'enemy');
  assert.equal(kingdomDream(character(), 7, rolls(4, 4)).status, 'awake');
  assert.equal(kingdomDream(character(), 7, rolls(6, 6)).player.gnurlbash, true);
});

test('Dreamtime shark appears only on five or six', () => {
  assert.equal(kingdomDream(character(), 8, rolls(4)).status, 'awake');
  assert.equal(kingdomDream(character(), 8, rolls(5, 6, 6, 1, 1)).fight.spec.id, 'dream8');
});

test('Failed leg recovery lasts three section transitions', () => {
  assert.deepEqual(kingdomDream(character(), 9, rolls(4, 4)).player.limpSections, [1, 2, 3]);
  assert.deepEqual(kingdomDream(character(), 9, rolls(5, 4)).player.limpSections, []);
});

test('Breaking bonds requires a strictly higher second roll, not a tie', () => {
  assert.equal(kingdomDream(character(), 10, rolls(3, 3, 3, 3)).status, 'dead');
  assert.equal(kingdomDream(character(), 10, rolls(3, 3, 4, 3)).status, 'awake');
});

test('Burial allows at most five rolls and stops at the first six', () => {
  const saved = kingdomDream(character(), 11, rolls(1, 2, 3, 4, 6));
  assert.equal(saved.status, 'awake');
  assert.equal(saved.rolls.length, 5);
  assert.equal(kingdomDream(character(), 11, rolls(6)).rolls.length, 1);
  assert.equal(kingdomDream(character(), 11, rolls(1, 2, 3, 4, 5)).status, 'dead');
});

test('Fog can kill, wake or choose another dream without an unbounded automatic loop', () => {
  assert.equal(kingdomDream(character(), 12, rolls(2)).status, 'dead');
  assert.equal(kingdomDream(character(), 12, rolls(4)).status, 'awake');
  const result = kingdomDream(character(), 12, rolls(6, 3, 3));
  assert.equal(result.status, 'redream');
  assert.equal(result.nextDream, 6);
});

test('Sleep keeps the printed Dreamtime probability and normal healing ceiling', () => {
  assert.equal(kingdomSleep(character(), rolls(5, 6, 6)).player.life, 48);
  assert.equal(kingdomSleep(character(), rolls(1, 3, 3)).status, 'limerick');
  assert.equal(kingdomSleep(character({ life: 0 }), rolls()), null);
});

test('Invisibility uses one dose even on failure and distinguishes head-only from full invisibility', () => {
  for (const [value, effect] of [[4, 'none'], [5, 'head'], [6, 'invisible']]) {
    const result = kingdomInvisibility(character({ invisibleDoses: 6 }), rolls(value));
    assert.equal(result.effect, effect);
    assert.equal(result.player.invisibleDoses, 5);
  }
});

test('Twenty book experience yields one permanent LIFE and never resurrects the dead', () => {
  const p = kingdomBookExperience(character({ experience: 19 }));
  assert.deepEqual([p.experience, p.permanent, p.life, p.maxLife], [20, 1, 41, 49]);
  assert.equal(kingdomBookExperience(character({ experience: 19, life: 0 })).life, 0);
  assert.throws(() => kingdomBookExperience(character(), -1), RangeError);
});

test('City patrol checks preserve the false beard exception and do not invent enemy statistics', () => {
  assert.equal(kingdomCityPatrol(character({ equipment: ['falseBeard'] }), rolls()).status, 'clear');
  const result = kingdomCityPatrol(character(), rolls(2, 5));
  assert.deepEqual([result.status, result.count, result.fine], ['patrol', 5, 200]);
  assert.equal(result.hit, undefined);
  assert.equal(result.life, undefined);
  assert.equal(kingdomCityPatrol(character(), rolls(4)).status, 'clear');
});

test('A city fine is charged only when affordable and never creates negative book gold', () => {
  const p = character({ gold: 199 });
  assert.equal(kingdomPayFine(p, 200), false);
  p.gold = 200;
  assert.equal(kingdomPayFine(p, 200), true);
  assert.equal(p.gold, 0);
  assert.equal(kingdomPayFine(p, -200), false);
});
