import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture(saved) {
  const pt = saved ? { sim440: structuredClone(saved) } : {};
  const source = readFileSync(new URL('../../../public/js/battlesim/battlesim440.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const math = Object.create(Math); math.random = () => .2;
  const context = vm.createContext({ Math: math, currentPlaythrough: () => pt, saveState() {}, showAlert() {}, escapeHtml: value => value, t: key => key });
  vm.runInContext(source + '\n_renderAll = () => {}; globalThis.sim = { data: _data, capture: _captureFightEffects, skill: _effectiveSkill, round: _runRound, reset: _resetBattle, potion: _usePotion, escapeRoute: _escapeRoute, init: initSim440 };', context);
  return { sim: context.sim, data: context.sim.data(), math, context };
}

function combat(section = 0) {
  const result = fixture();
  Object.assign(result.data, { rolled: true, combatSkill: 20, combatSkillInitial: 20, endurance: 100, enduranceInitial: 100, willpower: 30, willpowerInitial: 30 });
  Object.assign(result.data.enemy, { name: 'Enemy §' + section, skill: 20, endurance: 100, enduranceMax: 100 });
  result.sim.capture(result.data);
  return result;
}

test('legacy opening and rounds preserve saved fields and former behaviour', () => {
  const saved = JSON.parse(JSON.stringify(combat().data));
  for (const key of ['printedRules','combatEffects','willpower','willpowerInitial','nextWeapon','nextWillSpend']) delete saved[key];
  const { sim, data } = fixture(saved);
  assert.deepEqual(JSON.parse(JSON.stringify(data)), saved);
  sim.round(); assert.equal(data.endurance, 96); assert.equal(data.enemy.endurance, 96);
  assert.equal(data.willpower, undefined);
});

test('new characters do not assume the optional potion', () => {
  assert.equal(fixture().data.hasHealingPotion, false);
});

test('future initial rolls include WILLPOWER without rerolling saved characters', () => {
  const { sim, data, math, context } = fixture();
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { style: {}, events: {}, addEventListener(type, fn) { this.events[type] = fn; }, querySelectorAll() { return []; } });
    return nodes.get(id);
  };
  Object.assign(context, { document: { createElement: () => node('overlay'), getElementById: node, body: { appendChild() {} }, addEventListener() {} }, getPlayBtnRow: () => ({ appendChild() {} }), registerPanelShortcut() {}, shortcutLabel: v => v, ALL_PANEL_OVERLAY_IDS: [] });
  const picks = [.2,.3,.4]; math.random = () => picks.shift();
  sim.init(); node('sim440-roll').events.click();
  assert.equal(data.combatSkillInitial, 12); assert.equal(data.willpowerInitial, 23); assert.equal(data.enduranceInitial, 24);
  const saved = JSON.stringify(data); node('sim440-roll').events.click();
  assert.equal(JSON.stringify(data), saved);
});

test('staff spends WILLPOWER and multiplies only enemy damage', () => {
  const { sim, data } = combat(); data.nextWillSpend = 3; sim.capture(data);
  sim.round(); assert.equal(data.enemy.endurance, 88); assert.equal(data.endurance, 96); assert.equal(data.willpower, 27);
});

test('remaining WILLPOWER caps spending; exhausted staff incurs minus six', () => {
  const { sim, data } = combat(); data.nextWillSpend = 3; data.willpower = 1; sim.capture(data);
  sim.round(); assert.equal(data.willpower, 0); assert.equal(data.enemy.endurance, 96);
  assert.equal(sim.skill(data), 14); sim.round(); assert.equal(data.willpower, 0);
});

test('fractional WILLPOWER below one cannot pay for a magical staff round', () => {
  const { sim, data } = combat(); data.willpower = .5;
  assert.equal(sim.skill(data), 14); sim.round(); assert.equal(data.willpower, .5);
});

test('ordinary weapons and unarmed combat do not spend WILLPOWER', () => {
  for (const [weapon, skill] of [['other',14], ['none',12]]) {
    const { sim, data } = combat(); data.nextWeapon = weapon; sim.capture(data);
    assert.equal(sim.skill(data), skill); sim.round(); assert.equal(data.willpower, 30);
  }
});

test('next-fight options do not change captured fight settings', () => {
  const { sim, data } = combat(); data.nextWeapon = 'none'; data.nextWillSpend = 3; data.nextDagger = true;
  assert.equal(sim.skill(data), 20); sim.round(); assert.equal(data.willpower, 29);
});

test('printed skill modifiers apply once and optional dagger is independent', () => {
  for (const [section, bonus] of [[20,-2],[61,-2],[82,-2],[83,2],[116,2],[123,-2]]) {
    const { sim, data } = combat(section); assert.equal(sim.skill(data), 20 + bonus);
    data.nextDagger = true; sim.capture(data); assert.equal(sim.skill(data), 21 + bonus);
  }
});

test('section 99 first-round immunity includes instant death and then expires', () => {
  const { sim, data, math } = combat(99);
  data.combatSkill = 0; math.random = () => .1;
  sim.round(); assert.equal(data.endurance, 100);
  sim.round(); assert.equal(data.endurance, 0); assert.equal(data.history[0].outcome, 'loss');
});

test('round deadlines stop without falsely recording a kill', () => {
  for (const [section, rounds, route] of [[20,4,149],[61,5,149],[134,3,153],[273,3,182]]) {
    const { sim, data } = combat(section);
    for (let i = 0; i < rounds; i++) sim.round();
    assert.equal(data.combatEffects.routes[0], route);
    assert.equal(data.roundsThisBattle, rounds); assert.equal(data.history.length, 0);
    const snapshot = JSON.stringify(data); sim.round(); assert.equal(JSON.stringify(data), snapshot);
  }
});

test('winning on the last allowed round beats timeout', () => {
  for (const [section, rounds, route] of [[20,4,97],[61,5,271],[273,3,85]]) {
    const { sim, data } = combat(section); data.roundsThisBattle = rounds - 1; data.enemy.endurance = 1;
    sim.round(); assert.equal(data.history[0].outcome, 'win'); assert.equal(data.combatEffects.routes[0], route);
  }
});

test('death takes priority over simultaneous enemy death only for future fights', () => {
  for (const future of [true,false]) {
    const { sim, data } = combat(); data.endurance = data.enemy.endurance = 1;
    if (!future) { delete data.combatEffects; delete data.printedRules; }
    sim.round(); assert.equal(data.history[0].outcome, future ? 'loss' : 'win');
  }
});

test('section 163 escape takes damage without injuring the enemy', () => {
  const { sim, data } = combat(163); assert.equal(sim.escapeRoute(data), 30);
  sim.round(true); assert.equal(data.enemy.endurance, 100); assert.equal(data.endurance, 96);
  assert.equal(data.combatEffects.routes[0], 30); assert.equal(data.history.length, 0);
  const other = combat(254), before = JSON.stringify(other.data);
  other.sim.round(true); assert.equal(JSON.stringify(other.data), before);
});

test('reset starts a future fight without healing or restoring WILLPOWER', () => {
  const { sim, data } = combat(); sim.round();
  const ep = data.endurance, wp = data.willpower;
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

test('source victory routes match all 18 roster encounters', () => {
  for (const [section, route] of [[4,65],[10,65],[11,82],[20,97],[39,259],[61,271],[82,247],[83,197],[99,40],[116,197],[123,177],[134,153],[163,88],[176,308],[251,134],[254,158],[273,85],[301,259]]) {
    const { sim, data } = combat(section); data.enemy.endurance = 1;
    sim.round(); assert.equal(data.combatEffects.routes[0], route);
  }
});

test('simulator localization contains every referenced static key', () => {
  const source = readFileSync(new URL('../../../public/js/battlesim/battlesim440.js', import.meta.url), 'utf8');
  const translations = readFileSync(new URL('../../../public/js/i18n/en/battlesim/battlesim440.js', import.meta.url), 'utf8');
  for (const key of new Set([...source.matchAll(/['"](battlesim440\.[a-z_]+\.[a-z_]+)['"]/g)].map(m => m[1]))) {
    if (key === 'battlesim440.ui.') continue;
    assert.ok(translations.includes("'" + key + "'"), key);
  }
});
