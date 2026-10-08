import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import * as combat from '../../../public/js/battlesim/engines/demonspawn/fire-wolf.js';
import * as encounters from '../../../public/js/battlesim/engines/demonspawn/fire-wolf-encounters.js';
import * as groups from '../../../public/js/battlesim/engines/demonspawn/fire-wolf-groups.js';
import * as magic from '../../../public/js/battlesim/engines/demonspawn/fire-wolf-magic.js';
import strings from '../../../public/js/i18n/en/battlesim/battlesim534.js';

function fixture(section = 173) {
  const p = { ...combat.rollFireWolfCharacter(() => 0.4), power: 100, maxPower: 100, healingStone: 0, bluePowder: 0 };
  const prepared = encounters.prepareFireWolfEncounter(section, p);
  const fight = prepared.encounter.manualGroup ? groups.createFireWolfManualGroup(prepared) : encounters.createFireWolfEncounterDuel(prepared);
  const nodes = new Map();
  const node = key => {
    if (!nodes.has(key)) nodes.set(key, { value: '', checked: false, classList: { remove() {}, contains: () => true } });
    return nodes.get(key);
  };
  node('encounter').value = String(section); node('spell').value = 'armour'; node('target').value = '0';
  const d = { player: p, prepared, fight, opponent: 0, nextOptions: {}, history: [], log: [],
    magic: magic.createFireWolfMagicSection(section, fight.player, fight.enemy) };
  d.magic.opening.enemyLives = prepared.enemies.map(e => e.lifePoints);
  const context = createContext({ ...combat, ...encounters, ...groups, ...magic,
    currentBookId: 534, pt: { path: [20, 122, 173], sim534: d }, saves: 0, alerts: [],
    currentPlaythrough: () => context.pt, saveState: () => context.saves++,
    showAlert: message => context.alerts.push(message), structuredClone,
    escapeHtml: value => String(value), document: { activeElement: null, getElementById: id => node(id.replace('sim534-', '')) },
    t: (key, params = {}) => (strings[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => params[name] ?? `{${name}}`),
    castFireWolfSpell: (m, p, s, o) => magic.castFireWolfSpell(m, p, s, o, () => 0.999),
    castFireWolfRegentSpell: (e, s) => magic.castFireWolfRegentSpell(e, s, () => 0.999),
    resolveFireWolfDeathLuck: f => combat.resolveFireWolfDeathLuck(f, () => 0.999),
  });
  const source = readFileSync(new URL('../../../public/js/battlesim/battlesim534.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?;\n/gm, '').replace(/export /g, '');
  runInContext(source, context);
  return { context, d, node, run: code => runInContext(code, context) };
}

test('Fire*Wolf rerenders and reopening preserve pending death Luck and disable edits', () => {
  const f = fixture(); f.d.fight.pending = 'death-luck'; f.d.fight.player.lifePoints = 0;
  const before = JSON.stringify(f.d.fight);
  f.run('renderSim534(); renderSim534();');
  assert.equal(JSON.stringify(f.d.fight), before);
  assert.equal(f.node('lifePoints').disabled, true); assert.equal(f.node('roll').disabled, true);
  assert.equal(f.node('start').disabled, true); assert.equal(f.node('death_luck').hidden, false);
});

test('sequential pack victories are recorded only after the last opponent without restoring player Life', () => {
  const f = fixture(62); f.d.fight.outcome = 'win'; f.d.fight.player.lifePoints = 120;
  f.run('record(data()); next();');
  assert.equal(f.d.history.length, 0); assert.equal(f.d.opponent, 1);
  assert.equal(f.d.fight.player.lifePoints, 120); assert.equal(f.d.fight.enemy.lifePoints, 394);
  f.d.opponent = 11; f.d.fight.outcome = 'win';
  f.run('record(data()); record(data());'); assert.equal(f.d.history.length, 1);
});

test('spell cost and cooldown survive repeated renders and cannot be cast twice', () => {
  const f = fixture(); f.run('cast(); renderSim534(); renderSim534();');
  assert.equal(f.d.fight.player.power, 75); assert.equal(f.d.fight.player.magicArmour, 10);
  assert.deepEqual(f.d.magic.used, ['armour']); assert.equal(f.node('cast').disabled, true);
  f.run('cast();'); assert.equal(f.d.fight.player.power, 75); assert.equal(f.context.alerts.length, 1);
});

test('Regent spell damage respects magic Armour and Xenophobia without reducing ordinary fixed damage by physical armour', () => {
  const f = fixture(); f.d.fight.turn = 'enemy'; f.d.fight.player.magicArmour = 10;
  f.d.fight.player.armour = 'plate'; f.d.fight.enemy.magicFear = 5;
  f.node('regent-spell').value = 'firebolt'; const oldLife = f.d.fight.player.lifePoints;
  f.run('regentSpell(); regentSpell();');
  assert.equal(f.d.fight.player.lifePoints, oldLife - 60);
  assert.equal(f.d.fight.enemy.lifePoints, 598); assert.equal(f.d.fight.turn, 'player');
});

test('book and run switches cannot mutate an earlier character or carry its fight into a new run', () => {
  const f = fixture(); const before = JSON.stringify(f.d);
  f.context.currentBookId = 535; f.run('renderSim534(); cast(); regentSpell();');
  assert.equal(JSON.stringify(f.d), before); assert.equal(f.context.saves, 0);
  f.context.currentBookId = 534; f.context.pt = {};
  f.run('renderSim534();'); assert.equal(f.context.pt.sim534.fight, null);
  assert.equal(JSON.stringify(f.d), before);
});

test('Regent spell turns complete rest without resetting it before both enemy turns', () => {
  const f = fixture(); f.node('regent-spell').value = 'leprosy';
  f.d.fight.turn = 'enemy'; f.d.fight.rest = 2; f.d.fight.attacks = 4;
  f.run('regentSpell();');
  assert.equal(f.d.fight.rest, 1); assert.equal(f.d.fight.attacks, 4);
  f.d.fight.turn = 'enemy'; f.run('regentSpell();');
  assert.equal(f.d.fight.rest, 0); assert.equal(f.d.fight.attacks, 0);
  assert.equal(f.d.fight.enemyTurns, 2);
});
