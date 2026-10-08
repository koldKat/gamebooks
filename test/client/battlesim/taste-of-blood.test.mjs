import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../../public/js/battlesim/battlesim696.js', import.meta.url), 'utf8');
const roundSource = source.slice(source.indexOf('function _runRound()'), source.indexOf('function _resetBattle()'));
const resetSource = source.slice(source.indexOf('function _resetBattle()'), source.indexOf('// ── Render'));
const dataSource = source.slice(source.indexOf('function _data()'), source.indexOf('function _appendLog('));
const attributesSource = source.slice(source.indexOf('const CREATURE_ATTRIBUTES ='), source.indexOf('function _data()'));
const selectSource = source.slice(source.indexOf('  function select(enemy)'), source.indexOf("  dropdown.addEventListener('mousedown'"));
const fighter = () => ({ sila: 0, refleks: 0, izdrazhlivost: 2, ataka: 0, zashtita: 0, life: 20, lifeMax: 20, lifeInitial: 20 });
const battle = version => ({ player: fighter(), enemy: fighter(), attackerIsPlayer: true, roundsThisBattle: 0, log: [], history: [], ...(version ? { exchangeRulesVersion: version } : {}) });

function runRound(data, rolls) {
  const resolve = new Function('_data', '_battleOver', '_rollChance', '_enemyNameSafe', 't', '_appendLog', '_hasEnemy', '_enemyDefeated', '_playerDefeated', '_recordOutcome', 'saveState', '_renderAll', 'SVG_TROPHY', 'SVG_SKULL', `${roundSource}; return _runRound;`)(
    () => data, () => false, () => rolls.shift(), () => 'Enemy', key => key,
    (d, text) => d.log.push(text), () => true, () => data.enemy.life <= 0,
    () => data.player.life <= 0, () => {}, () => {}, () => {}, '', '',
  );
  resolve();
}

test('future fights alternate after missed player and enemy attacks', () => {
  const data = battle(2);
  runRound(data, [1, 6]);
  assert.equal(data.attackerIsPlayer, false);
  runRound(data, [1, 6]);
  assert.equal(data.attackerIsPlayer, true);
  assert.equal(data.roundsThisBattle, 2);
  assert.equal(data.player.life, 20);
  assert.equal(data.enemy.life, 20);
});

test('existing saved fights keep their legacy missed-blow handling', () => {
  const data = battle();
  runRound(data, [1, 6]);
  assert.equal(data.attackerIsPlayer, true);
  assert.equal(data.exchangeRulesVersion, undefined);
});

test('successful attacks still alternate in both rule versions', () => {
  for (const version of [undefined, 2]) {
    const data = battle(version);
    runRound(data, [6, 1]);
    assert.equal(data.attackerIsPlayer, false);
    assert.equal(data.enemy.life, 16);
  }
});

test('new simulator state uses corrected rules without upgrading saved state on read', () => {
  const fresh = {};
  const load = pt => new Function('currentPlaythrough', `${dataSource}; return _data;`)(() => pt)();
  assert.equal(load(fresh).exchangeRulesVersion, 2);
  const saved = { sim696: battle() };
  const before = structuredClone(saved);
  load(saved);
  assert.deepEqual(saved, before);
});

test('explicit reset opts into corrected exchange rules', () => {
  const data = battle();
  const reset = new Function('_data', '_appendLog', 't', '_enemyNameSafe', 'saveState', '_renderAll', `${resetSource}; return _resetBattle;`)(
    () => data, () => {}, key => key, () => 'Enemy', () => {}, () => {},
  );
  reset();
  assert.equal(data.exchangeRulesVersion, 2);
  runRound(data, [1, 6]);
  assert.equal(data.attackerIsPlayer, false);
  assert.match(source, /d\.roundsThisBattle = 0;\s*d\.exchangeRulesVersion = 2;\s*closeDropdown\(\)/);
});

test('future creature selections load printed strength and reflex without changing player values', () => {
  const data = battle();
  const player = structuredClone(data.player);
  const select = new Function('_data', 'input', 'closeDropdown', 'saveState', '_renderAll', `${attributesSource}; ${selectSource}; return select;`)(
    () => data, {}, () => {}, () => {}, () => {},
  );
  select({ name: 'Мечка', attack: 3, defense: 3, hp: 30, pb: 4 });
  assert.equal(data.enemy.sila, 5);
  assert.equal(data.enemy.refleks, 1);
  select({ name: 'Полуджентри', attack: 4, defense: 4, hp: 25, pb: 3 });
  assert.equal(data.enemy.sila, 3);
  assert.equal(data.enemy.refleks, 3);
  assert.deepEqual(data.player, player);
  assert.equal(data.exchangeRulesVersion, 2);
});
