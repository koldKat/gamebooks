import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFixtureRoster } from './roster-fixtures.mjs';
import { ENCOUNTERS } from '../../../public/js/battlesim/books/1649/definition.js';
import { createFight } from '../../../public/js/battlesim/engines/cthulhu-solo/combat.js';

await loadFixtureRoster(1649);
const entry = id => ENCOUNTERS.find(row => String(row.id) === String(id));
const investigator = name => ({ name, hp: 20, maxHp: 20, dex: 60, dodge: 30, brawl: 50,
  pow: 55, str: 50, con: 50, skill: 50, damage: '1D6', weaponKind: 'pistol', moveSpeed: 7, luck: 50 });

test('the reviewed database catalog contains every distinct preset and remains unchanged by setup', () => {
  assert.equal(ENCOUNTERS.length, 42);
  assert.equal(new Set(ENCOUNTERS.map(e => e.id)).size, 42);
  const before = structuredClone(ENCOUNTERS);
  for (const spec of ENCOUNTERS) {
    const party = [investigator('Main'), investigator('Ally')];
    const count = spec.enemyCount ? party.length * (spec.enemyCount === 'double-party' ? 2 : 1) : spec.enemies.length;
    const enemies = Array.from({ length: count }, (_, index) => {
      const enemy = structuredClone(spec.enemies[spec.enemyCount ? 0 : index]);
      // The possessed investigator's actual current HP is explicitly supplied by the player.
      if (enemy.hp === null) { assert.equal(spec.section, 1104); enemy.hp = 9; enemy.maxHp = 12; }
      return enemy;
    });
    const fight = createFight(spec, party, enemies);
    assert.equal(fight.enemies.length, count, spec.id);
    assert.equal(fight.status, 'fighting', spec.id);
  }
  assert.deepEqual(ENCOUNTERS, before);
});

test('vampire claws retain the differing printed damage and unknown Dodge is not invented', () => {
  assert.equal(entry(466).enemies[0].moves[0].damage, '1D4+DB');
  assert.equal(entry(491).enemies[0].moves[0].damage, '1D4');
  assert.equal(entry(466).enemies[0].dodge, null);
  assert.deepEqual(entry(466).enemies[0].moves[1].thresholds, { hard: 20, extreme: 8 });
  assert.deepEqual(entry(491).enemies[0].moves[1].thresholds, { hard: 20, extreme: 8 });
});

test('smuggler DEX, group sizes and simultaneous volley retain their distinct source rules', () => {
  assert.equal(entry(173).enemies.length, 2); assert.equal(entry(173).enemies[0].dex, 46);
  assert.equal(entry(200).enemies.length, 3); assert.equal(entry(200).enemies[0].attacks, 2);
  assert.equal(entry(200).simultaneous, true); assert.equal(entry(200).singleRound, true);
  assert.equal(entry(1136).enemies[0].dex, 44);
});

test('phases retain their source-specific critical, restraint and damage rules', () => {
  assert.equal(entry(1032).playerCriticalAt, 4); assert.equal(entry(1045).playerCriticalAt, 0);
  assert.equal(entry(1023).enemies[0].moves[0].skipAttack, true);
  assert.equal(entry(1038).enemies[0].moves[2].effect, 'entangle');
  assert.equal(entry(1055).playerFumble, 'destroy');
  assert.equal(entry(1015).enemies[0].silverSaveStuns, false);
  assert.equal(entry(1131).group, entry(700).group);
});

test('pack, crow and brawl abstractions remain explicit instead of inventing printed HP', () => {
  assert.equal(entry(999).enemyCount, 'double-party'); assert.equal(entry(999).enemies[0].healthMode, 'threshold');
  assert.equal(entry(1109).playerDamageToKill, 5); assert.equal(entry(1010).enemyActionsLimit, 2);
  assert.equal(entry(900).roundDamageTarget, 20); assert.equal(entry(1156).playerEffect, 'knockout');
});
