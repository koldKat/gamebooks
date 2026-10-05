import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture(saved) {
  const source = readFileSync(new URL('../../../public/js/battlesim/battlesim186.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const pt = saved ? { sim186: structuredClone(saved) } : {};
  const elements = new Map();
  const document = { getElementById: id => {
    if (!elements.has(id)) elements.set(id, {});
    return elements.get(id);
  } };
  const context = vm.createContext({ currentPlaythrough: () => pt, saveState: () => {}, document, t: k => k, escapeHtml: s => s });
  vm.runInContext(source + '\n_renderAll = () => {};', context);
  const run = s => vm.runInContext(s, context);
  return { run, d: run('_data()'), source, elements };
}

function ready(saved) {
  const f = fixture(saved);
  f.d.rolled = true;
  f.d.mode = 'ship';
  Object.assign(f.d.ship, { weapons: 12, shields: 12, shieldsInitial: 12 });
  Object.assign(f.d.enemyShip, { name: 'Alien', weapons: 0, shields: 2, shieldsMax: 2 });
  f.run('Math.random = () => 0');
  return f;
}

test('future initial SHIELDS rolls use one die plus twelve', () => {
  const f = fixture();
  const roll = f.source.match(/d\.ship\.shieldsInitial = .*;/)[0];
  for (const [random, expected] of [[0, 13], [0.999, 18]]) {
    f.run(`Math.random = () => ${random}; var d = _data(); ${roll}`);
    assert.equal(f.d.ship.shieldsInitial, expected);
  }
});

test('new fights continue at zero enemy shields until another damaging hit', () => {
  const f = ready();
  f.run('_runShipRound(); _renderStatus()');
  assert.equal(f.d.enemyShip.shields, 0);
  assert.equal(f.d.history.length, 0);
  assert.equal(f.elements.get('sim186-round').disabled, false);
  f.d.ship.weapons = 0;
  f.run('_runShipRound()');
  assert.equal(f.d.history.length, 0);
  f.d.ship.weapons = 12;
  f.run('_runShipRound(); _runShipRound(); _renderStatus()');
  assert.equal(f.d.enemyShip.destroyed, true);
  assert.equal(f.d.history.length, 1);
  assert.equal(f.d.history[0].outcome, 'win');
  assert.equal(f.elements.get('sim186-round').disabled, true);
});

test('player shields also survive depletion and misses but not a further hit', () => {
  const f = ready();
  f.d.ship.shields = 2;
  f.d.ship.weapons = 0;
  f.d.enemyShip.weapons = 12;
  f.d.enemyFiresFirst = true;
  f.run('_runShipRound()');
  assert.equal(f.d.ship.shields, 0);
  assert.equal(f.d.history.length, 0);
  f.d.enemyShip.weapons = 0;
  f.run('_runShipRound()');
  assert.equal(f.d.history.length, 0);
  f.d.enemyShip.weapons = 12;
  f.run('_runShipRound(); _runShipRound()');
  assert.equal(f.d.ship.destroyed, true);
  assert.equal(f.d.history.length, 1);
  assert.equal(f.d.history[0].outcome, 'loss');
});

test('saved legacy fights load unchanged and retain depletion outcomes', () => {
  const saved = JSON.parse(JSON.stringify(ready().d));
  delete saved.shipCombatRulesVersion;
  const f = fixture(saved);
  assert.deepEqual(JSON.parse(JSON.stringify(f.d)), saved);
  f.run('Math.random = () => 0; _runShipRound(); _renderStatus()');
  assert.equal(f.d.history.length, 1);
  assert.equal(f.d.enemyShip.destroyed, undefined);
  assert.equal(f.elements.get('sim186-round').disabled, true);
  f.run('_resetBattle()');
  assert.equal(f.d.shipCombatRulesVersion, undefined);
  assert.equal(f.d.ship.destroyed, undefined);
});

test('new enemy selection opts in without changing saved ship or crew values', () => {
  const f = ready();
  delete f.d.shipCombatRulesVersion;
  f.d.ship.shields = 0;
  f.d.crew.captain.stamina = 9;
  f.run('_startShipFight(_data(), { name: "New ship", attack: 8, hp: 12 })');
  assert.equal(f.d.shipCombatRulesVersion, 2);
  assert.equal(f.d.ship.shields, 0);
  assert.equal(f.d.crew.captain.stamina, 9);
  assert.equal(f.d.enemyShip.shields, 12);
  f.run('_renderStatus()');
  assert.equal(f.elements.get('sim186-round').disabled, false);
});

test('corrected destruction persists on reload and reset clears it without upgrading legacy fights', () => {
  const f = ready();
  f.run('_runShipRound(); _runShipRound()');
  const loaded = fixture(JSON.parse(JSON.stringify(f.d)));
  loaded.run('_runShipRound()');
  assert.equal(loaded.d.history.length, 1);
  loaded.run('_resetBattle()');
  assert.equal(loaded.d.enemyShip.destroyed, false);
  assert.equal(loaded.d.ship.destroyed, false);
  assert.equal(loaded.d.shipCombatRulesVersion, 2);
});

test('double-six damage depletes shields without premature destruction', () => {
  const f = ready();
  f.d.enemyShip.shields = 1;
  f.run('var dice = [0, 0, 0.999, 0.999]; Math.random = () => dice.shift(); _playerShipShot(_data())');
  assert.equal(f.d.enemyShip.shields, 0);
  assert.equal(f.d.history.length, 0);
});

test('ship mode cannot fight an unselected enemy with zero maximum shields', () => {
  const f = ready();
  f.d.enemyShip.shieldsMax = 0;
  f.run('_runShipRound(); _renderStatus()');
  assert.equal(f.d.roundsThisBattle, 0);
  assert.equal(f.elements.get('sim186-round').disabled, true);
});
