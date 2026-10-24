import { loadFixtureRoster } from './roster-fixtures.mjs';
await loadFixtureRoster(521);
await loadFixtureRoster(522);
await loadFixtureRoster(523);
await loadFixtureRoster(524);
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMarshFight } from '../../../public/js/battlesim/engines/skyfall/marsh-combat.js';
import { createPyramidFight } from '../../../public/js/battlesim/engines/skyfall/black-pyramid.js';
import { createMineFight } from '../../../public/js/battlesim/engines/skyfall/mine-of-torments.js';
import { createGardenFight } from '../../../public/js/battlesim/engines/skyfall/garden-of-madness.js';

const player = {expertise: 12, vitality: 20, fortune: 10, weaponDamage: 2};
const opponents = [{displayName: 'Custom foe', expertise: -1, vitality: 8, damage: 0}];

test('Marsh missing printed damage accepts explicit editor values, never a blank default', () => {
  for (const damage of ['3', '0', 3, 0]) {
    const fight = createMarshFight(289, player, {opponents: [{...opponents[0], damage}]});
    assert.equal(fight.encounter.foes[0].damage, Number(damage));
  }
  for (const damage of ['', ' ', null, undefined, '-1', '1.5']) {
    assert.throws(() => createMarshFight(289, player, {opponents: [{...opponents[0], damage}]}));
  }
});

test('all Skyfall engines accept independent custom opponents with their existing round rules', () => {
  for (const create of [createMarshFight, createPyramidFight, createMineFight, createGardenFight]) {
    const fight = create('custom', player, {opponents});
    assert.equal(fight.encounter.custom, true);
    assert.deepEqual(fight.encounter.foes[0], {name: 'Custom foe', expertise: -1, vitality: 8, initialVitality: 8, damage: 0});
    assert.equal(fight.player.vitality, 20);
    fight.encounter.foes[0].vitality = 0;
    assert.equal(opponents[0].vitality, 8);
    assert.throws(() => create('unknown', player, {opponents}));
  }
});

test('Skyfall preset effects retain opening wounds, source-null stats and continuation wounds', () => {
  const opening = createPyramidFight(150, player, {opponents});
  assert.equal(opening.encounter.foes[0].vitality, 6);
  assert.equal(opening.encounter.foes[0].initialVitality, 8);
  assert.equal(opening.encounter.surprise, 'until-miss');
  const flowers = createGardenFight(141, player, {opponents});
  assert.equal(flowers.encounter.foes[0].vitality, null);
  assert.equal(flowers.encounter.mode, 'flowers');
  const previous = createGardenFight(41, player);
  previous.encounter.foes[0].vitality = 5;
  const continuation = createGardenFight(105, player, {opponents, previous});
  assert.equal(continuation.encounter.foes[0].vitality, 5);
  assert.throws(() => createPyramidFight(88, player, {opponents}));
});
