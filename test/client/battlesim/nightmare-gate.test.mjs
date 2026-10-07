import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture(saved) {
  const pt = saved ? { sim441: structuredClone(saved) } : {};
  const source = readFileSync(new URL('../../../public/js/battlesim/battlesim441.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const math = Object.create(Math); math.random = () => .2;
  const context = vm.createContext({ Math: math, currentPlaythrough: () => pt, saveState() {}, showAlert() {}, escapeHtml: value => value, t: key => key });
  vm.runInContext(source + '\n_renderAll = () => {}; globalThis.sim = { data: _data, capture: _captureFightEffects, skill: _effectiveSkill, round: _runRound, reset: _resetBattle, potion: _usePotion, stop: _stopByChoice, stopRoute: _escapeRoute, init: initSim441 };', context);
  return { sim: context.sim, data: context.sim.data(), math, context };
}

function combat(section = 0) {
  const result = fixture();
  Object.assign(result.data, { rolled: true, combatSkill: 20, combatSkillInitial: 20, endurance: 100, enduranceInitial: 100, willpower: 30, willpowerInitial: 30 });
  Object.assign(result.data.enemy, { name: 'Enemy §' + section, skill: 20, endurance: 100, enduranceMax: 100 });
  result.sim.capture(result.data);
  return result;
}

test('opening legacy fights preserves values and former round behaviour', () => {
  const saved = JSON.parse(JSON.stringify(combat().data));
  for (const key of ['printedRules','combatEffects','willpower','willpowerInitial','nextWeapon','nextWillSpend','previousBooks']) delete saved[key];
  const { sim, data } = fixture(saved);
  assert.deepEqual(JSON.parse(JSON.stringify(data)), saved);
  sim.round(); assert.equal(data.endurance, 96); assert.equal(data.enemy.endurance, 96);
  assert.equal(data.willpower, undefined);
});

test('new characters do not assume a potion', () => assert.equal(fixture().data.hasHealingPotion, false));

test('future initial WILLPOWER respects previously completed books and never rerolls', () => {
  for (const [previousBooks, base] of [[0,20],[1,25],[2,30]]) {
    const { sim, data, math, context } = fixture(); data.previousBooks = previousBooks;
    const nodes = new Map();
    const node = id => {
      if (!nodes.has(id)) nodes.set(id, { style: {}, events: {}, addEventListener(type, fn) { this.events[type] = fn; }, querySelectorAll() { return []; } });
      return nodes.get(id);
    };
    Object.assign(context, { document: { createElement: () => node('overlay'), getElementById: node, body: { appendChild() {} }, addEventListener() {} }, getPlayBtnRow: () => ({ appendChild() {} }), registerPanelShortcut() {}, shortcutLabel: v => v, ALL_PANEL_OVERLAY_IDS: [] });
    const picks = [.2,.3,.4]; math.random = () => picks.shift();
    sim.init(); node('sim441-roll').events.click();
    assert.equal(data.combatSkillInitial, 12); assert.equal(data.willpowerInitial, base + 3); assert.equal(data.enduranceInitial, 24);
    const saved = JSON.stringify(data); node('sim441-roll').events.click(); assert.equal(JSON.stringify(data), saved);
  }
});

test('staff spends WILLPOWER and multiplies only enemy damage', () => {
  const { sim, data } = combat(); data.nextWillSpend = 3; sim.capture(data);
  sim.round(); assert.equal(data.enemy.endurance, 88); assert.equal(data.endurance, 96); assert.equal(data.willpower, 27);
});

test('remaining WILLPOWER caps spending and exhausted staff incurs minus six', () => {
  const { sim, data } = combat(); data.nextWillSpend = 3; data.willpower = 1; sim.capture(data);
  sim.round(); assert.equal(data.willpower, 0); assert.equal(data.enemy.endurance, 96);
  assert.equal(sim.skill(data), 14); sim.round(); assert.equal(data.willpower, 0);
});

test('ordinary weapons and unarmed combat do not spend WILLPOWER', () => {
  for (const [weapon, skill] of [['other',14], ['none',12]]) {
    const { sim, data } = combat(); data.nextWeapon = weapon; sim.capture(data);
    assert.equal(sim.skill(data), skill); sim.round(); assert.equal(data.willpower, 30);
  }
});

test('next-fight settings do not alter a captured fight', () => {
  const { sim, data } = combat(); data.nextWeapon = 'none'; data.nextWillSpend = 3;
  assert.equal(sim.skill(data), 20); sim.round(); assert.equal(data.willpower, 29);
});

test('leader fight 57 forces unarmed or inlaid-dagger penalties without magic', () => {
  const { sim, data } = combat(57); assert.equal(sim.skill(data), 12);
  sim.round(); assert.equal(data.willpower, 30);
  data.nextDagger = true; sim.capture(data); assert.equal(sim.skill(data), 14);
});

test('leader fight 322 allows staff but otherwise requires the printed penalties', () => {
  const { sim, data } = combat(322); assert.equal(sim.skill(data), 20);
  data.nextWeapon = 'other'; sim.capture(data); assert.equal(sim.skill(data), 12);
  data.nextDagger = true; sim.capture(data); assert.equal(sim.skill(data), 14);
});

test('Tanith assistance applies only to section 188 and is captured', () => {
  for (const section of [188,108]) {
    const { sim, data } = combat(section); data.nextTanith = true; sim.capture(data);
    assert.equal(sim.skill(data), section === 188 ? 22 : 20);
    data.nextTanith = false; assert.equal(sim.skill(data), section === 188 ? 22 : 20);
  }
});

test('door fight ignores all player damage including instant death', () => {
  const { sim, data, math } = combat(97); data.combatSkill = 0; math.random = () => .1;
  sim.round(); assert.equal(data.endurance, 100); assert.equal(data.willpower, 29);
});

test('survival and wolf deadlines stop without falsely recording a kill', () => {
  for (const [section, rounds, route] of [[87,3,150],[123,3,117],[194,2,51],[296,3,287]]) {
    const { sim, data } = combat(section);
    for (let i = 0; i < rounds; i++) sim.round();
    assert.equal(data.combatEffects.routes[0], route); assert.equal(data.roundsThisBattle, rounds); assert.equal(data.history.length, 0);
    const snapshot = JSON.stringify(data); sim.round(); assert.equal(JSON.stringify(data), snapshot);
  }
});

test('wolf victory on the final allowed round beats timeout', () => {
  const { sim, data } = combat(296); data.roundsThisBattle = 2; data.enemy.endurance = 1;
  sim.round(); assert.equal(data.history[0].outcome, 'win'); assert.equal(data.combatEffects.routes[0], 106);
});

test('ordinary simultaneous death is loss only for future fights', () => {
  for (const future of [true,false]) {
    const { sim, data } = combat(); data.endurance = data.enemy.endurance = 1;
    if (!future) { delete data.combatEffects; delete data.printedRules; }
    sim.round(); assert.equal(data.history[0].outcome, future ? 'loss' : 'win');
  }
});

test('section 243 directs loss to rescue and victory to its fatal narrative without healing', () => {
  for (const win of [true,false]) {
    const { sim, data } = combat(243);
    if (win) data.enemy.endurance = 1; else data.endurance = 1;
    sim.round(); assert.equal(data.combatEffects.routes[0], win ? 286 : 350);
    assert.equal(data.history[0].outcome, win ? 'win' : 'loss');
    if (!win) assert.equal(data.endurance, 0);
  }
});

test('printed voluntary stops do not incur an invented escape round', () => {
  for (const [section, route] of [[97,61],[243,218],[57,99],[322,99]]) {
    const { sim, data } = combat(section);
    if ([57,322].includes(section)) {
      assert.equal(sim.stopRoute(data), null);
      data.roundsThisBattle = 3; data.enemy.endurance = 90;
    }
    assert.equal(sim.stopRoute(data), route);
    const ep = data.endurance, wp = data.willpower, rounds = data.roundsThisBattle;
    sim.stop(); assert.equal(data.combatEffects.routes[0], route);
    assert.equal(data.endurance, ep); assert.equal(data.willpower, wp); assert.equal(data.roundsThisBattle, rounds);
    assert.equal(data.history.length, 0);
  }
});

test('leader stop requires strictly more ENDURANCE', () => {
  const { sim, data } = combat(57); data.roundsThisBattle = 3;
  assert.equal(sim.stopRoute(data), null);
  const snapshot = JSON.stringify(data); sim.stop(); assert.equal(JSON.stringify(data), snapshot);
});

test('reset starts a future fight without restoring ENDURANCE or WILLPOWER', () => {
  const { sim, data } = combat(); sim.round(); const ep = data.endurance, wp = data.willpower;
  sim.reset(); assert.equal(data.endurance, ep); assert.equal(data.willpower, wp);
  assert.equal(data.enemy.endurance, 100); assert.equal(data.roundsThisBattle, 0);
});

test('new potion rules prevent resurrection and preserve legacy use', () => {
  for (const future of [true,false]) {
    const { sim, data } = combat(); data.hasHealingPotion = true; data.endurance = 0;
    if (!future) { delete data.printedRules; delete data.combatEffects; }
    sim.potion(); assert.equal(data.endurance, future ? 0 : 4);
  }
});

test('victory routes match all source encounters including the door', () => {
  for (const [section, route] of [[17,250],[57,107],[64,133],[87,150],[97,124],[108,133],[123,117],[137,186],[178,106],[188,205],[194,51],[243,286],[296,106],[322,107]]) {
    const { sim, data, math } = combat(section); data.enemy.endurance = 1; math.random = () => 0;
    sim.round(); assert.equal(data.combatEffects.routes[0], route);
  }
});

test('localization contains all referenced static keys and dynamic choices', () => {
  const source = readFileSync(new URL('../../../public/js/battlesim/battlesim441.js', import.meta.url), 'utf8');
  const translations = readFileSync(new URL('../../../public/js/i18n/en/battlesim/battlesim441.js', import.meta.url), 'utf8');
  const keys = new Set([...source.matchAll(/['"](battlesim441\.[a-z_]+\.[a-z_]+)['"]/g)].map(m => m[1]));
  for (const key of ['staff','other','none','previous_0','previous_1','previous_2']) keys.add('battlesim441.ui.' + key);
  for (const key of keys) if (!['battlesim441.ui.','battlesim441.ui.previous_'].includes(key)) assert.ok(translations.includes("'" + key + "'"), key);
});
