import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../../public/js/battlesim/battlesim716.js', import.meta.url), 'utf8');
const combat = source.slice(source.indexOf('function _ready('), source.indexOf('function _resetBattle()'));
const battle = version => ({
  player: { sila: 0, barzina: 0, lovkost: 0, reflekt: 0, bm: 1, izdr: 30, izdrMax: 36 },
  enemy: { name: 'Enemy', ataka: 20, zashtita: 100, bm: 4, izdr: 10, izdrMax: 10, nonlethal: true },
  roundsThisBattle: 0, log: [], history: [], ...(version ? { combatRulesVersion: version } : {}),
});
function run(data) {
  const round = new Function('_data', '_roll', '_playerAtaka', '_playerZashtita', '_appendLog', '_enemyNameSafe', 't', '_recordOutcome', 'saveState', '_renderAll', 'SVG_TROPHY', 'SVG_SKULL', `${combat};return _runRound;`)(
    () => data, () => 1, () => 0, () => 0, (d, value) => d.log.push(value), () => 'Enemy', key => key,
    (d, outcome) => d.history.push(outcome), () => {}, () => {}, '', '',
  );
  round();
}
test('new first-blood fights stop after ten lost points and restore half of this fight loss', () => {
  const data = battle(2);
  run(data);
  assert.equal(data.player.izdr, 25);
  assert.equal(data.battleOutcome, 'loss');
  assert.deepEqual(data.history, ['loss']);
  assert.equal(data.log.filter(key => key.endsWith('enemy_hit')).length, 1);
  const saved = structuredClone(data);
  run(data);
  assert.deepEqual(data, saved);
});
test('winning a new first-blood fight does not heal pre-existing wounds', () => {
  const data = battle(2);
  data.enemy.zashtita = 0;
  data.enemy.izdr = 1;
  run(data);
  assert.equal(data.player.izdr, 30);
  assert.equal(data.battleOutcome, 'win');
});
test('existing saved fights retain legacy first-blood behavior', () => {
  const data = battle();
  run(data);
  assert.equal(data.player.izdr, 18);
  assert.equal(data.combatRulesVersion, undefined);
  assert.equal(data.battleOutcome, undefined);
});
test('new lethal fights do not use a ten-point loss limit or recover damage', () => {
  const data = battle(2);
  data.enemy.nonlethal = false;
  data.enemy.izdr = 20;
  run(data);
  assert.equal(data.player.izdr, 0);
  assert.equal(data.battleOutcome, 'loss');
});
test('reading old state does not upgrade saved combat rules', () => {
  const dataSource = source.slice(source.indexOf('function _data()'), source.indexOf('function _playerAtaka('));
  const saved = { sim716: battle() };
  const old = structuredClone(saved);
  new Function('currentPlaythrough', `${dataSource};return _data();`)(() => saved);
  assert.deepEqual(saved, old);
  const fresh = {};
  new Function('currentPlaythrough', `${dataSource};return _data();`)(() => fresh);
  assert.equal(fresh.sim716.combatRulesVersion, 2);
});
test('future selections adjust the printed conditional stats for Barzaka', () => {
  const start = source.indexOf("    d.enemy.name       = enemy.name;");
  const selection = source.slice(start, source.indexOf('    saveState();', start));
  const data = battle();
  data.player.barzina = 8;
  data.player.reflekt = 4;
  const player = structuredClone(data.player);
  new Function('d', 'enemy', selection)(data, { name: 'Бързака', attack: 18, defense: 12, pb: 4, hp: 10 });
  assert.equal(data.enemy.ataka, 10);
  assert.equal(data.enemy.zashtita, 8);
  assert.equal(data.combatRulesVersion, 2);
  assert.deepEqual(data.player, player);
});
