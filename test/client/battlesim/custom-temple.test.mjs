import { loadFixtureRoster } from './roster-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {newCharacter, startFight, round, resolveLuck} from '../../../public/js/battlesim/books/710/combat.js';
import {ENCOUNTERS} from '../../../public/js/battlesim/books/710/definition.js';

await loadFixtureRoster(710);

test('Temple custom opponents use ordinary printed combat without requiring a source encounter', () => {
  const hero = newCharacter(() => 1);
  const opponent = {displayName: 'A custom foe', skill: 0, stamina: 2};
  const before = JSON.stringify({hero, opponent, ENCOUNTERS});
  const fight = startFight(0, hero, {opponents: [opponent]});
  assert.equal(fight.config.custom, true);
  assert.equal(fight.enemies[0].displayName, 'A custom foe');
  const result = resolveLuck(round(fight, 0, () => 1), false);
  assert.equal(result.enemies[0].stamina, 0);
  assert.equal(result.outcome, 'win');
  assert.equal(fight.enemies[0].stamina, 2);
  assert.equal(JSON.stringify({hero, opponent, ENCOUNTERS}), before);
});

test('Temple preset overrides preserve encounter rules and validate opponent stats', () => {
  const hero = newCharacter(() => 1), source = ENCOUNTERS[0];
  const opponents = source.enemies.map(enemy => ({...enemy, displayName: 'Edited name', skill: 4, stamina: 12}));
  const fight = startFight(source.section, hero, {opponents});
  assert.equal(fight.enemies[0].skill, 4);
  for (const [key, value] of Object.entries(source)) if (key !== 'enemies') assert.deepEqual(fight.config[key], value);
  assert.throws(() => startFight(source.section, hero, {opponents: []}), RangeError);
  assert.throws(() => startFight(0, hero, {opponents: [{displayName: 'Invalid', skill: -1, stamina: 2}]}), RangeError);
});
