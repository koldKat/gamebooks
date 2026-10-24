import { loadFixtureRoster } from './roster-fixtures.mjs';
await loadFixtureRoster(534);
import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareFireWolfEncounter, createFireWolfEncounterDuel } from '../../../public/js/battlesim/engines/demonspawn/fire-wolf-encounters.js';
import { rollFireWolfCharacter } from '../../../public/js/battlesim/engines/demonspawn/fire-wolf.js';
import { prepareCryptsEncounter } from '../../../public/js/battlesim/engines/demonspawn/crypts-of-terror-encounters.js';
import { createCryptsFight } from '../../../public/js/battlesim/engines/demonspawn/crypts-of-terror.js';
import { prepareDemondoomEncounter } from '../../../public/js/battlesim/engines/demonspawn/demondoom-encounters.js';
import { createDemondoomFight } from '../../../public/js/battlesim/engines/demonspawn/demondoom.js';
import { prepareAncientEvilEncounter } from '../../../public/js/battlesim/engines/demonspawn/ancient-evil-roster.js';
import { createAncientEvilFight } from '../../../public/js/battlesim/engines/demonspawn/ancient-evil.js';

test('Demonspawn custom preparation preserves full enemy stats, equipment and player values', () => {
  const player = {...rollFireWolfCharacter(), power: 0, weapon: 'sword', armour: 'none'};
  const enemy = {...player, displayName: 'Custom opponent', lifePoints: 120, skill: 5, weapon: 10, armour: 5, shield: 1};
  const before = structuredClone(player);
  for (const [prepare, start] of [[prepareFireWolfEncounter, createFireWolfEncounterDuel],
    [prepareCryptsEncounter, createCryptsFight], [prepareDemondoomEncounter, createDemondoomFight],
    [prepareAncientEvilEncounter, createAncientEvilFight]]) {
    const prepared = prepare(0, player, {opponents: [enemy]}), fight = start(prepared);
    const target = fight.enemy ?? fight.enemies[0];
    assert.equal(prepared.encounter.custom, true);
    assert.equal(target.name, enemy.displayName);
    assert.equal(target.weapon, 10); assert.equal(target.armour, 5); assert.equal(target.shield, true);
    assert.equal(target.lifePoints, 120);
    assert.deepEqual(player, before);
    assert.throws(() => prepare(0, player, {opponents: [{...enemy, lifePoints: 0}]}));
  }
});
