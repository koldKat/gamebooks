import { readRosterDocument } from '../../helpers/roster-db.cjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const catalog = readRosterDocument(1444);
const entries = [...new Map(catalog.enemies.map(row => [row.stats.entryIndex, row.stats.entry])).values()];
const entry = section => entries.find(e => e.section === String(section));

test('Dueltrack database metadata covers all printed combat scenes and explicit variants', () => {
  assert.equal(entries.length, 16);
  assert.equal(catalog.enemies.length, 27);
  const sections = entries.flatMap(e => [e.section, ...e.variants.map(v => v.section)]);
  assert.equal(sections.length, 37);
  assert.equal(new Set(sections).size, 37);
  for (const row of catalog.enemies) {
    assert.equal(row.stats.family, 'car-wars');
    assert.equal(row.stats.partCount, row.stats.entry.enemies.length);
    assert.equal(row.hp, row.stats.entry.enemies[row.stats.slot].hp);
  }
});

test('similar-looking kidnapper and Raveling fights retain their different printed profiles', () => {
  assert.equal(entry(166).enemies[0].hp, 70);
  assert.equal(entry(249).enemies[0].hp, 90);
  assert.equal(entry(49).enemies[0].gunnerSeat, false);
  assert.equal(entry(228).enemies[0].gunnerSeat, true);
  assert.equal(entry(228).enemies[0].gunnerGunnery, 2);
  assert.equal(entry(228).enemies[1].gunnerGunnery, 3);
  assert.equal(entry(49).enemies[1].gunnery, null);
  assert.equal(entry(349).enemies[0].gunnery, null);
  assert.equal(entry(228).rules.allies[0].gunnery, null);
});

test('heavy rockets are single-use, while Hernandez has a recoilless extra magazine', () => {
  for (const e of entries) for (const foe of e.enemies) for (const weapon of foe.weapons ?? []) {
    if (weapon.name === 'Heavy rocket') {
      assert.equal(weapon.oneShot, true);
      assert.equal(weapon.ammo, 1);
    }
  }
  const rifle = entry(204).enemies[4].weapons[0];
  assert.equal(rifle.ammoCapacity, 20);
  assert.equal(rifle.oneShot, undefined);
  assert.equal(entry(265).enemies[0].weapons[1].damageDice, 2,
    'Black Widow carries rocket launchers, not heavy rockets');
});

test('robot and human opponents keep their printed defeat thresholds and noncombatants stay unarmed', () => {
  assert.equal(entry(70).enemies[0].unconsciousAt, 0);
  assert.equal(entry(70).enemies[0].hp, 2);
  assert.equal(entry(18).enemies[0].unconsciousAt, 1);
  assert.equal(entry(18).enemies[0].armour, 6);
  assert.equal(entry(389).rules.openingHeroShots, 2);
  for (const foe of entry(389).enemies.slice(0, 3)) {
    assert.equal(foe.canAttack, false);
    assert.equal(foe.gunnery, null);
  }
  assert.equal(entry(389).rules.enemyAttackBonus, -2);
});

test('player vehicles retain source armour, plant boxes and computer ownership', () => {
  const profiles = entry(18).playerVehicles;
  const special = profiles.find(v => v.key === 'simpson-special');
  assert.equal(special.hp, 50); assert.equal(special.powerPlant.boxes, 11);
  assert.equal(entry(18).playerDefaults.hp, 3);
  assert.equal(entry(18).playerDefaults.armour, 6);
  assert.equal(entry(18).playerDefaults.defenseClass, 10);
  const orion = profiles.find(v => v.key === 'orion');
  assert.equal(orion.gadgets.length, 1);
  assert.equal(orion.gadgets[0].computerFor, 'driver');
  const wolverine = profiles.find(v => v.key === 'wolverine');
  assert.equal(wolverine.driving, 3);
  assert.deepEqual(wolverine.gadgets.map(g => [g.computerFor, g.bonus]), [['driver', 1], ['gunner', 1]]);
});

test('the two arena tables and the distinct robot restrictions stay separate', () => {
  const arena = entry(204);
  assert.equal(arena.rules.arena.targetTables['314'][0][2], 'hero');
  assert.equal(arena.rules.arena.targetTables['377'][0][2], 'fixed');
  assert.equal(arena.variants.find(v => v.section === '92').rules.robotGunner.sameTargetAsDriver, true);
  assert.equal(entry(166).variants.find(v => v.section === '202').rules.robotGunner.sameTargetAsDriver, undefined);
  assert.equal(arena.variants.find(v => v.section === '92').rules.robotGunner.activeTurns, 8);
  assert.equal(arena.variants.find(v => v.section === '346').rules.robotGunner.activeTurns, undefined);
});
