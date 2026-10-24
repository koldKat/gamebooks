import { loadFixtureRoster } from './roster-fixtures.mjs';
await loadFixtureRoster(539);
await loadFixtureRoster(548);
await loadFixtureRoster(550);
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShadowsCharacter, startShadowsFight, shadowsAttack } from '../../../public/js/battlesim/engines/forbidden-gateway.js';
import { rollInnsmouthCharacter, createInnsmouthFight, attackInnsmouth } from '../../../public/js/battlesim/engines/innsmouth.js';
import { customUrowenEncounter } from '../../../public/js/battlesim/engines/urowen/opponents.js';
import { createUrowenSimState, prepareUrowenEncounter } from '../../../public/js/battlesim/engines/urowen/state.js';

test('custom Shadows combat retains distinct health pools without story destinations', () => {
  const player = createShadowsCharacter(() => .9), original = structuredClone(player);
  const fight = startShadowsFight(player, 0, {opponents: [{displayName: 'Physical foe', dexterity: 0,
    mentality: 2, health: 1, mental: 0, disbelief: 0, staminaDamage: 1, enduranceDamage: 0}]});
  shadowsAttack(fight, 0, () => 0);
  assert.equal(fight.status, 'win');
  assert.equal(fight.spec.custom, true);
  assert.equal(fight.enemies[0].displayName, 'Physical foe');
  assert.ok(!fight.destination);
  assert.deepEqual(player, original);
});

test('custom Innsmouth combat uses speed, accuracy, damage and health', () => {
  const player = rollInnsmouthCharacter(() => .9), original = structuredClone(player);
  const fight = createInnsmouthFight(0, player, {opponents: [{displayName: 'Custom foe', speed: 1, accuracy: 1, damage: 1, health: 1}]});
  attackInnsmouth(fight, 0, false, () => 0);
  assert.equal(fight.status, 'win');
  assert.equal(fight.enemies[0].displayName, 'Custom foe');
  assert.deepEqual(player, original);
});

test('custom Urowen combat preserves its own attributes and six armour locations', () => {
  const state = createUrowenSimState(), original = structuredClone(state);
  const spec = customUrowenEncounter([{displayName: 'Custom foe', attributeCode: 2,
    attributeValue: 3, life: 12, power: 0, damageDice: 1, damageBonus: -1,
    armor0: 1, armor1: 2, armor2: 3, armor3: 4, armor4: 5, armor5: 6}]);
  const next = prepareUrowenEncounter(state, spec);
  assert.equal(next.fight.enemies[0].attribute, 'MAG');
  assert.deepEqual(next.fight.enemies[0].armorByLocation, [1,2,3,4,5,6]);
  assert.equal(next.fight.status, 'prepared');
  assert.deepEqual(state, original);
  assert.throws(()=>customUrowenEncounter([{...spec.enemies[0],attributeCode:1,
    armor0:0,armor1:0,armor2:0,armor3:0,armor4:0,armor5:0,damageDice:2}]));
});
