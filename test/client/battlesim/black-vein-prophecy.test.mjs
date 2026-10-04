import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../../public/js/battlesim/battlesim238.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');

function fixture(saved) {
  const pt = saved ? { sim238: structuredClone(saved) } : {};
  const context = vm.createContext({ currentPlaythrough: () => pt, saveState: () => {}, t: k => k, escapeHtml: s => s });
  vm.runInContext(source + '\n_renderAll = () => {}; _roll2d6 = () => 7;', context);
  const run = s => vm.runInContext(s, context);
  const d = run('_data()');
  if (!saved) {
    Object.assign(d.player, { skill: 8, skillInitial: 8, stamina: 20, staminaInitial: 20, luck: 8 });
    Object.assign(d.enemy, { name: 'Robber', skill: 7, stamina: 10, staminaMax: 10 });
    d.rolled = true;
  }
  return { d, run };
}

test('new fight Lucky hit costs four STAMINA in total and one LUCK', () => {
  const { d, run } = fixture();
  run('_runRound(); _testLuck()');
  assert.equal(d.enemy.stamina, 6);
  assert.equal(d.player.luck, 7);
});

test('all other Luck outcomes keep their source adjustments', () => {
  for (const [kind, luck, player, enemy] of [['player-hit', 1, 18, 9], ['enemy-hit', 8, 19, 8], ['enemy-hit', 1, 17, 8]]) {
    const { d, run } = fixture();
    d.enemy.stamina = 8;
    d.player.stamina = 18;
    d.player.luck = luck;
    d.pendingLuckQueue.push({ kind });
    run('_testLuck()');
    assert.equal(d.player.stamina, player);
    assert.equal(d.enemy.stamina, enemy);
  }
});

test('saved legacy fight is unchanged on load and keeps one extra Lucky damage', () => {
  const saved = JSON.parse(JSON.stringify(fixture().d));
  delete saved.correctedLuckDamage;
  const { d, run } = fixture(saved);
  assert.deepEqual(JSON.parse(JSON.stringify(d)), saved);
  run('_runRound(); _testLuck(); _resetBattle()');
  assert.equal(d.correctedLuckDamage, undefined);
  run('_runRound(); _testLuck()');
  assert.equal(d.enemy.stamina, 7);
});

test('new encounter adopts correction without changing character stats, survives reload', () => {
  const saved = JSON.parse(JSON.stringify(fixture().d));
  delete saved.correctedLuckDamage;
  const { d, run } = fixture(saved);
  const player = JSON.parse(JSON.stringify(d.player));
  run('_resetEncounterKnobs(_data())');
  assert.equal(d.correctedLuckDamage, true);
  assert.deepEqual(JSON.parse(JSON.stringify(d.player)), player);
  assert.deepEqual(JSON.parse(JSON.stringify(fixture(JSON.parse(JSON.stringify(d))).d)), JSON.parse(JSON.stringify(d)));
});

test('Lucky killing blow records victory once, without negative enemy STAMINA', () => {
  const { d, run } = fixture();
  d.enemy.stamina = 3;
  run('_runRound(); _testLuck(); _testLuck(); _runRound()');
  assert.equal(d.enemy.stamina, 0);
  assert.equal(d.history.length, 1);
  assert.equal(d.history[0].outcome, 'win');
});

test('single-opponent ties miss; parry opponent can wound but cannot be wounded', () => {
  const { d, run } = fixture();
  delete d.pairedCombat;
  d.enemy.skill = 8;
  Object.assign(d.secondEnemy, { active: true, name: 'Slaver', skill: 9 });
  run('_runRound()');
  assert.equal(d.enemy.stamina, 10);
  assert.equal(d.player.stamina, 18);
  assert.equal(d.pendingLuckQueue[0].kind, 'enemy-hit');
  run('_skipLuck()');
  d.secondEnemy.skill = 7;
  run('_runRound()');
  assert.equal(d.enemy.stamina, 10);
  assert.equal(d.player.stamina, 18);
  assert.equal(d.pendingLuckQueue.length, 0);
});

function pair() {
  const f = fixture();
  Object.assign(f.d.secondEnemy, { active: true, name: 'Slaver', skill: 7, stamina: 8, staminaMax: 8, target: 'enemy' });
  return f;
}

test('paired fights wound only the target, can switch targets, preserve pending Luck target', () => {
  const { d, run } = pair();
  run('_runRound()');
  assert.equal(d.enemy.stamina, 8);
  assert.equal(d.secondEnemy.stamina, 8);
  assert.equal(d.pendingLuckQueue[0].target, 'enemy');
  d.secondEnemy.target = 'secondEnemy';
  run('_testLuck()');
  assert.equal(d.enemy.stamina, 6);
  assert.equal(d.secondEnemy.stamina, 8);
  run('_runRound(); _testLuck()');
  assert.equal(d.enemy.stamina, 6);
  assert.equal(d.secondEnemy.stamina, 4);
});

test('first enemy death does not end paired fight and surviving enemy still attacks that round', () => {
  const { d, run } = pair();
  d.enemy.stamina = 2;
  d.secondEnemy.skill = 9;
  run('_runRound()');
  assert.equal(d.enemy.stamina, 0);
  assert.equal(d.secondEnemy.stamina, 8);
  assert.equal(d.player.stamina, 18);
  assert.equal(d.history.length, 0);
  run('_skipLuck(); _runRound()');
  assert.equal(d.secondEnemy.target, 'secondEnemy');
  assert.equal(d.player.stamina, 16);
  assert.equal(d.enemy.stamina, 0);
});

test('both enemy deaths record one victory, reset restores both and reload preserves selected target', () => {
  const { d, run } = pair();
  d.enemy.stamina = 2;
  d.secondEnemy.stamina = 2;
  run('_runRound(); _runRound(); _runRound()');
  assert.equal(d.enemy.stamina, 0);
  assert.equal(d.secondEnemy.stamina, 0);
  assert.equal(d.history.length, 1);
  assert.equal(d.history[0].outcome, 'win');
  run('_resetBattle()');
  assert.equal(d.enemy.stamina, 10);
  assert.equal(d.secondEnemy.stamina, 8);
  d.secondEnemy.target = 'secondEnemy';
  const saved = JSON.parse(JSON.stringify(d));
  assert.deepEqual(JSON.parse(JSON.stringify(fixture(saved).d)), saved);
});

test('Lucky second-enemy kill continues until first dies; Unlucky second hit heals only second', () => {
  const { d, run } = pair();
  d.secondEnemy.target = 'secondEnemy';
  d.secondEnemy.stamina = 3;
  run('_runRound(); _testLuck()');
  assert.equal(d.secondEnemy.stamina, 0);
  assert.equal(d.enemy.stamina, 10);
  assert.equal(d.history.length, 0);
  const f = pair();
  f.d.secondEnemy.target = 'secondEnemy';
  f.d.player.luck = 1;
  f.run('_runRound(); _testLuck()');
  assert.equal(f.d.secondEnemy.stamina, 7);
  assert.equal(f.d.enemy.stamina, 10);
});

test('paired ties miss, defeated foe cannot attack, zero second STAMINA requires setup', () => {
  const { d, run } = pair();
  d.enemy.skill = 8;
  d.secondEnemy.skill = 8;
  run('_runRound()');
  assert.equal(d.player.stamina, 20);
  assert.equal(d.enemy.stamina, 10);
  assert.equal(d.secondEnemy.stamina, 8);
  d.enemy.stamina = 0;
  d.enemy.skill = 100;
  d.secondEnemy.skill = 7;
  run('_runRound()');
  assert.equal(d.player.stamina, 20);
  assert.equal(d.secondEnemy.stamina, 6);
  const f = pair();
  f.d.secondEnemy.staminaMax = 0;
  f.run('_runRound()');
  assert.equal(f.d.roundsThisBattle, 0);
});

test('paired two wounds queue independently and player death clears queue without victory', () => {
  const { d, run } = pair();
  d.enemy.skill = 9;
  d.secondEnemy.skill = 10;
  run('_runRound()');
  assert.equal(d.player.stamina, 16);
  assert.equal(d.pendingLuckQueue.length, 2);
  run('_testLuck(); _testLuck()');
  assert.equal(d.player.stamina, 18);
  assert.equal(d.player.luck, 6);
  d.player.stamina = 3;
  run('_runRound(); _runRound()');
  assert.equal(d.player.stamina, 0);
  assert.equal(d.pendingLuckQueue.length, 0);
  assert.equal(d.history.length, 1);
  assert.equal(d.history[0].outcome, 'loss');
});

test('legacy paired fight has no added fields on load/reset and retains first-death outcome', () => {
  const saved = JSON.parse(JSON.stringify(pair().d));
  delete saved.pairedCombat;
  saved.secondEnemy = { active: true, name: 'Slaver', skill: 9 };
  const { d, run } = fixture(saved);
  assert.deepEqual(JSON.parse(JSON.stringify(d)), saved);
  d.enemy.stamina = 2;
  run('_runRound()');
  assert.equal(d.history.length, 1);
  assert.equal(d.player.stamina, 20);
  run('_resetBattle()');
  assert.deepEqual(JSON.parse(JSON.stringify(d.secondEnemy)), saved.secondEnemy);
  assert.equal(d.pairedCombat, undefined);
  run('_resetEncounterKnobs(_data())');
  assert.equal(d.pairedCombat, true);
  assert.equal(d.secondEnemy.staminaMax, 0);
});

test('new character rolls SKILL die plus four without rerolling saved characters', () => {
  const handler = source.match(/document\.getElementById\('sim238-roll'\)\.addEventListener\('click', \(\) => \{([\s\S]*?)\n  \}\);/)[1];
  for (const die of [1, 6]) {
    const { d, run } = fixture();
    d.rolled = false;
    run('_roll1d6 = () => ' + die);
    run('(function () {' + handler + '})()');
    assert.equal(d.player.skillInitial, die + 4);
    assert.equal(d.player.skill, die + 4);
    assert.equal(d.player.staminaInitial, 19);
    assert.equal(d.player.luckInitial, die + 6);
    assert.equal(d.rolled, true);
    const saved = JSON.parse(JSON.stringify(d));
    const loaded = fixture(saved);
    loaded.run('(function () {' + handler + '})()');
    assert.deepEqual(JSON.parse(JSON.stringify(loaded.d)), saved);
  }
  const { d, run } = fixture();
  d.player.skill = 12;
  d.player.skillInitial = 12;
  const saved = JSON.parse(JSON.stringify(d));
  run('(function () {' + handler + '})()');
  assert.deepEqual(JSON.parse(JSON.stringify(d)), saved);
});

test('paired UI exposes STAMINA, roster selection and target control without changing legacy UI state', async () => {
  for (const legacy of [false, true]) {
    const f = pair();
    if (legacy) delete f.d.pairedCombat;
    const saved = JSON.parse(JSON.stringify(f.d));
    const elements = new Map();
    function element() {
      const classes = new Set();
      return { value: '', style: {}, dataset: {}, handlers: {}, classList: { add: k => classes.add(k), remove: k => classes.delete(k), contains: k => classes.has(k) },
        addEventListener(k, fn) { (this.handlers[k] ||= []).push(fn); }, setAttribute() {}, removeAttribute() {}, appendChild() {}, querySelectorAll: () => [] };
    }
    const get = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
    const document = { getElementById: get, createElement: element, addEventListener() {}, body: element() };
    // Inject the same DOM methods used by initialization and real event handlers.
    const context = vm.createContext({ currentPlaythrough: () => ({ sim238: f.d }), saveState() {}, t: k => k, escapeHtml: s => s,
      document, getPlayBtnRow: () => element(), registerPanelShortcut() {}, shortcutLabel: s => s, ALL_PANEL_OVERLAY_IDS: [] });
    vm.runInContext(source + '\ninitSim238(); _renderAll();', context);
    assert.equal(get('sim238-paired-fields').style.display, legacy ? 'none' : '');
    assert.equal(get('sim238-second-label').textContent, legacy ? 'battlesim238.ui.second_name' : 'battlesim238.ui.second_tracked');
    assert.deepEqual(JSON.parse(JSON.stringify(f.d)), saved);
    if (legacy) continue;
    get('sim238-target').handlers.change[0]({ target: { value: 'secondEnemy' } });
    assert.equal(f.d.secondEnemy.target, 'secondEnemy');
    f.d.pendingLuckQueue.push({ kind: 'player-hit', target: 'enemy' });
    get('sim238-target').handlers.change[0]({ target: { value: 'enemy' } });
    assert.equal(f.d.secondEnemy.target, 'secondEnemy');
    assert.equal(get('sim238-target').disabled, true);
    f.d.pendingLuckQueue = [];
    vm.runInContext('_enemyList = [{name:"Jungle Man II",attack:6,hp:6}];', context);
    get('sim238-second-name').value = 'Jungle';
    await get('sim238-second-name').handlers.focus[0]();
    get('sim238-second-dropdown').handlers.mousedown[0]({ target: { closest: () => ({ dataset: { idx: '0' } }) }, preventDefault() {} });
    assert.equal(f.d.secondEnemy.name, 'Jungle Man II');
    assert.equal(f.d.secondEnemy.skill, 6);
    assert.equal(f.d.secondEnemy.stamina, 6);
    assert.equal(get('sim238-second-stamina').value, 6);
  }
});
