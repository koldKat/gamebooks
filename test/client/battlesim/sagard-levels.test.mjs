import {test} from 'node:test';
import assert from 'node:assert/strict';
import {maxSagardLevel, validateSagardRules, startSagardFight, resolveSagardTurn,
  validateSagardFight} from '../../../public/js/battlesim/engines/sagard/core.js';
import {sagardSetupMarkup} from '../../../public/js/battlesim/engines/sagard/setup-panel.js';

// Synthetic tables exercise catalog-defined limits without duplicating book statistics.
const rulesFor = count => ({maxHeroHp: 20, maxShield: 0, initialHeroLevel: 2,
  healingLabels: {fang: 'First recovery', moss: 'Second recovery'},
  damageByLevel: Object.fromEntries(Array.from({length: count}, (_, level) => [level, [0, 1, 2, level + 1]]))});
const encounter = level => ({name: 'Synthetic encounter', initiative: 'hero', escape: 'none',
  opponents: [{name: 'Synthetic opponent', level, hp: 20}]});
const reload = value => JSON.parse(JSON.stringify(value));

test('the seventh printed level resolves damage and survives a reload after each action', () => {
  const rules = rulesFor(7);
  let fight = startSagardFight({level: 6, hp: 20}, encounter(6), rules);
  assert.equal(maxSagardLevel(rules), 6);
  assert.equal(fight.rulesVersion, 1);
  fight = resolveSagardTurn(reload(fight), 4);
  assert.equal(fight.opponents[0].hp, 13);
  fight = resolveSagardTurn(reload(fight), 4);
  assert.equal(fight.hero.hp, 13);
  assert.equal(fight.round, 2);
  assert.deepEqual(validateSagardFight(reload(fight)), fight);
  const penalized = startSagardFight({level: 6, hp: 20}, {...encounter(6), heroLevelPenalty: 1}, rules);
  assert.equal(penalized.hero.level, 5);
  assert.equal(penalized.baseHeroLevel, 6);
  validateSagardFight(reload(penalized));
});

test('six-level catalogs and existing fights retain their original limits and serialized state', () => {
  const rules = rulesFor(6);
  const fight = startSagardFight({level: 5, hp: 20}, encounter(5), rules);
  const saved = JSON.stringify(fight);
  assert.equal(maxSagardLevel(rules), 5);
  validateSagardFight(reload(fight));
  assert.equal(JSON.stringify(fight), saved);
  assert.throws(() => startSagardFight({level: 6, hp: 20}, encounter(5), rules));
  assert.throws(() => startSagardFight({level: 5, hp: 20}, encounter(6), rules));
  assert.throws(() => startSagardFight({level: 5, hp: 20}, {...encounter(5), temporaryHeroLevel: 6}, rules));
});

test('missing levels and unsupported tables fail rather than supplying invented charts', () => {
  for (const count of [5, 8]) assert.throws(() => validateSagardRules(rulesFor(count)));
  const sparse = rulesFor(7);
  delete sparse.damageByLevel[3];
  sparse.damageByLevel[7] = [0, 1, 2, 8];
  assert.throws(() => validateSagardRules(sparse));
  assert.throws(() => startSagardFight({level: 7, hp: 20}, encounter(6), rulesFor(7)));
});

test('setup level limits come from the selected book catalog', () => {
  for (const count of [6, 7]) {
    const markup = sagardSetupMarkup('synthetic', [{section: '1', name: 'Synthetic', rules: rulesFor(count)}]);
    assert.match(markup, new RegExp('id="synthetic-level"[^>]*max="' + (count - 1) + '"'));
  }
});
