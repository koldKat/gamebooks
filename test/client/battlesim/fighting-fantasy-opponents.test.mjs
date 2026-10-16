import test from 'node:test';
import assert from 'node:assert/strict';
import { newThievesCharacter, startThievesFight } from '../../../public/js/battlesim/engines/city-of-thieves/core.js';
import { newShamutantiCharacter, startShamutantiFight } from '../../../public/js/battlesim/engines/shamutanti/core.js';
import { newSamuraiCharacter } from '../../../public/js/battlesim/engines/sword-of-samurai/character.js';
import { startSamuraiFight } from '../../../public/js/battlesim/engines/sword-of-samurai/core.js';
import * as demons from '../../../public/js/battlesim/books/718/combat.js';
import * as khare from '../../../public/js/battlesim/books/722/combat.js';
import * as serpents from '../../../public/js/battlesim/books/723/combat.js';
import * as crown from '../../../public/js/battlesim/books/724/combat.js';

test('FF and Sorcery custom opponents retain independent stats without mutating characters', () => {
  const opponents = [{displayName: 'First', skill: 0, stamina: 2}, {displayName: 'Second', skill: 3, stamina: 8}];
  const engines = [[newThievesCharacter, startThievesFight], [newShamutantiCharacter, startShamutantiFight],
    [newSamuraiCharacter, startSamuraiFight], ...[demons, khare, serpents, crown].map(engine => [engine.newCharacter, engine.startFight])];
  for (const [create, start] of engines) {
    const player = create(), before = structuredClone(player);
    const fight = start(0, player, {opponents});
    assert.equal(fight.config.custom, true);
    assert.deepEqual(fight.enemies.map(enemy => [enemy.displayName, enemy.skill, enemy.stamina]),
      opponents.map(enemy => [enemy.displayName, enemy.skill, enemy.stamina]));
    assert.deepEqual(player, before);
    assert.throws(() => start(0, player, {opponents: [{...opponents[0], stamina: 0}]}));
    assert.throws(() => start(0, player));
  }
});
