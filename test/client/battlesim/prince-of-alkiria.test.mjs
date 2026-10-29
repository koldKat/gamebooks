import { readRosterDocument } from '../../helpers/roster-db.cjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from './simulator-source.mjs';
import vm from 'node:vm';
import { loadFixtureRoster } from './roster-fixtures.mjs';
import { ROSTER } from '../../../public/js/battlesim/books/412/definition.js';
await loadFixtureRoster(412);
const rosterEntries = readRosterDocument(412).enemies.map(row => row.stats.entry);

function fixture(saved, bonus = 5) {
  const entries = structuredClone(rosterEntries);
  entries.find(entry => entry.companionRules).companionRules.alvian.strengthBonus = bonus;
  const pt = saved ? { sim412: structuredClone(saved) } : {};
  const strip = source => source.replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const engine = strip(readFileSync(new URL('../../../public/js/battlesim/engines/alkiria.js', import.meta.url), 'utf8'));
  const source = strip(readFileSync(new URL('../../../public/js/battlesim/battlesim412.js', import.meta.url), 'utf8'));
  const context = vm.createContext({ currentPlaythrough: () => pt, saveState() {}, t: key => key, escapeHtml: value => value,
    createRosterLoader:(_id,_dataset,install)=>{install(entries);return async()=>{};} });
  vm.runInContext(engine + '\n' + source + '\n_renderAll = () => {}; globalThis.sim = { data: _data, start: _startBattle, strike: _strikeOnce, end: _checkEnd, pick: _pickEnemy, resolve: resolveStrike };', context);
  return { sim: context.sim, data: context.sim.data(), context };
}

test('starting future fights preserves current LIFE instead of restoring initial LIFE', () => {
  const { sim, data } = fixture();
  data.player.lp = 17;
  data.player.startLp = 58;
  sim.start();
  assert.equal(data.player.lp, 17);
  assert.equal(data.player.startLp, 58);
  assert.equal(data.printedCombatRules, 1);
});

test('future simultaneous deaths are losses; legacy fights keep their saved resolution', () => {
  for (const future of [false, true]) {
    const { sim, data } = fixture();
    if (future) sim.start();
    data.player.lp = 0;
    data.enemy.hp = 0;
    sim.end(data);
    assert.equal(data.winner, future ? 'enemy' : 'player');
    assert.equal(data.history[0].outcome, future ? 'loss' : 'win');
  }
});

test('Alvian bonus is captured for future fights without changing character values', () => {
  const { sim, data } = fixture();
  data.nextCompanionBonus = true;
  sim.start();
  assert.equal(data.companionBonus, 5);
  assert.equal(data.player.lp, 58);
  data.nextCompanionBonus = false;
  assert.equal(data.companionBonus, 5);
  assert.equal(sim.resolve(58, 14, 4, data.companionBonus).playerStr, 12);
  data.over = true;
  sim.start();
  assert.equal(data.companionBonus, 0);
});

test('strength bonus remains independent of changing LIFE tiers', () => {
  const { sim } = fixture();
  for (const [lp, strength] of [[58,7],[40,5],[26,5],[25,3],[11,3],[10,1],[1,1]]) {
    assert.equal(sim.resolve(lp, 14, 4).playerStr, strength);
    assert.equal(sim.resolve(lp, 14, 4, 5).playerStr, strength + 5);
  }
});

test('companion metadata controls new fights while saved captures keep their original bonus', () => {
  const {sim, data} = fixture(undefined, 9);
  data.nextCompanionBonus = true;
  sim.start();
  assert.equal(data.companionBonus, 9);
  assert.equal(data.player.lp, 58);
  assert.equal(sim.resolve(58, 14, 4, data.companionBonus).playerStr, 16);
  const saved = {...structuredClone(data), companionBonus: 5};
  const resumed = fixture(saved, 9);
  assert.deepEqual(JSON.parse(JSON.stringify(resumed.data)), JSON.parse(JSON.stringify(saved)));
  assert.equal(resumed.data.companionBonus, 5);
  assert.ok(ROSTER.every(entry => !Object.hasOwn(entry, 'companionRules')));
});

test('opening legacy fights does not migrate settings or character values', () => {
  const old = fixture().data;
  old.player.lp = 13;
  old.started = true;
  old.log.push('Saved round');
  const expected = JSON.parse(JSON.stringify(old));
  const { data } = fixture(expected);
  assert.deepEqual(JSON.parse(JSON.stringify(data)), expected);
  assert.equal(data.printedCombatRules, undefined);
});

test('starting at zero LIFE cannot resurrect a character', () => {
  const { sim, data } = fixture();
  data.player.lp = 0;
  sim.start();
  assert.equal(data.player.lp, 0);
  assert.equal(data.over, true);
  assert.equal(data.winner, 'enemy');
});

test('the source beast has no invented HP and ends after five surviving strikes',()=>{
  const {sim,data,context}=fixture();
  sim.pick('e23');sim.start();context.drawChance=()=>12;
  assert.equal(data.enemy.hp,null);
  for(let strike=1;strike<=5;strike++){
    sim.strike(data);
    assert.equal(data.timedEncounter.strikes,strike);
    assert.equal(data.over,strike===5);
    assert.equal(data.enemy.hp,null);
  }
  assert.equal(data.winner,'player');assert.equal(data.timedEncounter.destination,250);
  assert.equal(data.history.length,1);
});

test('death on the fifth strike takes precedence over the rescue continuation',()=>{
  const {sim,data,context}=fixture();
  sim.pick('e23');data.player.lp=10;sim.start();context.drawChance=()=>1;
  for(let strike=0;strike<5;strike++)sim.strike(data);
  assert.equal(data.player.lp,0);assert.equal(data.winner,'enemy');assert.equal(data.history[0].outcome,'loss');
});

test('a pending timed fight resumes its recorded strike count without changing old normal fights',()=>{
  let {sim,data,context}=fixture();sim.pick('e23');sim.start();context.drawChance=()=>12;
  for(let i=0;i<3;i++)sim.strike(data);
  const snapshot=JSON.parse(JSON.stringify(data));
  const resumed=fixture(snapshot);assert.deepEqual(JSON.parse(JSON.stringify(resumed.data)),snapshot);
  resumed.context.drawChance=()=>12;resumed.sim.strike(resumed.data);resumed.sim.strike(resumed.data);
  assert.equal(resumed.data.over,true);assert.equal(resumed.data.timedEncounter.strikes,5);
  const old={...snapshot,enemy:{str:17,hp:6,startHp:10},over:false,history:[]};delete old.timedEncounter;
  const legacy=fixture(old);assert.equal(legacy.data.enemy.hp,6);assert.equal(legacy.data.timedEncounter,undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(legacy.data)),old);
});
