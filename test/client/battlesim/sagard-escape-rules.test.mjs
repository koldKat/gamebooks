import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startSagardFight, sagardTurn, resolveSagardTurn, validateSagardFight} from '../../../public/js/battlesim/engines/sagard/core.js';
import {emptySagardState, rememberSagardFight} from '../../../public/js/battlesim/engines/sagard/state.js';

const rules = {maxHeroHp: 20, damageByLevel: Object.fromEntries(Array.from({length: 6}, (_, n) => [n, [0, 1, 2, 3]]))};
const foe = name => ({name, level: 2, hp: 10});
const start = (extra = {}, hero = {}) => startSagardFight({level: 2, hp: 20, ...hero},
  {name: 'Synthetic escaping foes', winTarget: 'next', enemyEscapeFaces: [4], storyGoldLossPerEscape: 7,
    opponents: [foe('A'), foe('B'), foe('C')], ...extra}, rules);
const reload = value => JSON.parse(JSON.stringify(value));
const step = (fight, die, target) => resolveSagardTurn(reload(fight), die, {target});

test('every survivor checks escape before any remaining opponent attacks', () => {
  let fight = step(start(), 1, 'enemy0');
  for (const [index, die] of [4, 1, 4].entries()) {
    assert.equal(sagardTurn(fight).kind, 'enemyEscape');
    assert.equal(sagardTurn(fight).attackerId, 'enemy' + index);
    assert.equal(fight.hero.hp, 20);
    fight = step(fight, die);
  }
  assert.equal(sagardTurn(fight).kind, 'attack');
  assert.equal(sagardTurn(fight).attackerId, 'enemy1');
  assert.equal(fight.opponents[0].hp, 10); assert.equal(fight.opponents[0].escaped, true);
  fight = step(fight, 4);
  assert.equal(fight.hero.hp, 17); assert.equal(fight.round, 2);
  assert.deepEqual(sagardTurn(fight).targets, ['enemy1']);
  fight = step(fight, 1);
  assert.equal(sagardTurn(fight).kind, 'enemyEscape');
  assert.equal(sagardTurn(fight).attackerId, 'enemy1');
});

test('defeated opponents receive no escape check or reply', () => {
  let fight = start({opponents: [{...foe('A'), hp: 1}, foe('B')]});
  fight = step(fight, 2, 'enemy0');
  assert.equal(sagardTurn(fight).attackerId, 'enemy1');
  fight = step(fight, 1);
  assert.equal(sagardTurn(fight).attackerId, 'enemy1');
  const won = step(start({opponents: [{...foe('A'), hp: 1}]}), 2);
  assert.equal(won.status, 'win'); assert.equal(won.log.length, 1);
});

test('escaped opponents retain their HP and report story losses without awarding a defeat-based victory', () => {
  let fight = step(start(), 1, 'enemy0');
  for (let n = 0; n < 3; n++) fight = step(fight, 4);
  assert.equal(fight.status, 'withdrawn'); assert.equal(fight.destination, 'next');
  assert.equal(fight.hero.hp, 20); assert.ok(fight.opponents.every(row => row.hp === 10 && row.escaped));
  assert.equal(fight.log.filter(e => e.kind === 'enemyEscape').reduce((n, e) => n + e.storyGoldLost, 0), 21);
  const state = emptySagardState(); state.fight = reload(fight); state.characterGold = 100;
  rememberSagardFight(state);
  assert.equal(state.characterGold, 100); assert.equal(state.history.length, 0);
  assert.throws(() => step(fight, 1));
});

test('pending escape checks survive reload and reject invalid rolls or corrupted saves', () => {
  const fight = step(start(), 1, 'enemy0'), saved = JSON.stringify(fight);
  validateSagardFight(reload(fight));
  assert.throws(() => resolveSagardTurn(fight, 5));
  assert.equal(JSON.stringify(fight), saved);
  const altered = reload(fight); altered.enemyEscapeQueue[0] = 'hero';
  assert.throws(() => validateSagardFight(altered));
  assert.throws(() => start({enemyEscapeFaces: [0]}));
});

test('an armor restriction changes this encounter rather than removing saved equipment', () => {
  let fight = start({heroArmorDisabled: true, enemyEscapeFaces: undefined, opponents: [foe('A')]}, {damageReduction: 2});
  assert.equal(fight.hero.damageReduction, 0);
  fight = step(fight, 1); fight = step(fight, 4);
  assert.equal(fight.hero.hp, 17);
  const state = emptySagardState(); state.setup.armor = 2; state.fight = fight; rememberSagardFight(state);
  assert.equal(state.setup.armor, 2);
  const next = start({enemyEscapeFaces: undefined}, {hp: state.setup.hp, damageReduction: state.setup.armor});
  assert.equal(next.hero.damageReduction, 2);
});

test('a printed chart exception applies at its stated level without inventing a level penalty', () => {
  const exception = {enemyEscapeFaces: undefined, opponents: [foe('A')], printedHero: {level: 2, hp: 5, chart: [1, 1, 1, 1]}};
  const printed = step(start(exception), 4);
  assert.equal(printed.hero.level, 2); assert.equal(printed.hero.maxHp, 20);
  assert.equal(printed.opponents[0].hp, 9);
  const higher = step(start(exception, {level: 3}), 4);
  assert.equal(higher.hero.level, 3); assert.equal(higher.opponents[0].hp, 7);
  assert.throws(() => start({...exception, printedHero: {level: 2, chart: [1]}}));
});
