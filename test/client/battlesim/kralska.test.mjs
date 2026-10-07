import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture(saved, preserveDeadPlayer = true, bookId = 481) {
  const stateKey = `sim${bookId}`;
  const pt = saved ? { [stateKey]: structuredClone(saved) } : {};
  const math = Object.create(Math);
  let rolls = [0, 0];
  math.random = () => rolls.shift() ?? 0;
  const source = readFileSync(new URL('../../../public/js/battlesim/engines/kralska.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export /gm, '')
    .replace('return { init, render, setVisible };', 'return { data: _data, applyEnemy: _applyEnemy, round: _runRound };');
  const context = vm.createContext({ Math: math, currentPlaythrough: () => pt, saveState() {}, t: key => key,
    escapeHtml: value => value, document: { getElementById: () => null } });
  vm.runInContext(source + '\nglobalThis.factory = createKralskaSim; globalThis.resolve = resolveRound;', context);
  const sim = context.factory({ bookId, idPrefix: stateKey, stateKey, i18nPrefix: `battlesim${bookId}`, startSila: 5, startIzd: 20, preserveDeadPlayer });
  return { sim, setRolls: values => { rolls = values; }, resolve: context.resolve };
}

test('Кралска кръв: all opposed dice totals use the printed one-point damage and harmless ties', () => {
  const f = fixture();
  for (let player = 1; player <= 6; player++) for (let enemy = 1; enemy <= 6; enemy++) {
    f.setRolls([(player - 0.5) / 6, (enemy - 0.5) / 6]);
    const result = f.resolve(5, 3);
    assert.equal(result.playerTotal, 5 + player);
    assert.equal(result.enemyTotal, 3 + enemy);
    assert.equal(result.playerLoss, 5 + player < 3 + enemy ? 1 : 0);
    assert.equal(result.enemyLoss, 5 + player > 3 + enemy ? 1 : 0);
  }
});

test('481: new characters start at 5/20 without changing saved characters or fights', () => {
  const fresh = fixture().sim.data();
  assert.deepEqual(JSON.parse(JSON.stringify(fresh.player)), { sila: 5, izd: 20 });
  const saved = JSON.parse(JSON.stringify(fresh));
  saved.player = { sila: 9, izd: 31 };
  saved.enemy = { name: 'saved', sila: 3, izd: 5, curIzd: 2, hasStats: true };
  saved.log = ['saved log'];
  saved.history = [{ enemy: 'saved', outcome: 'win', ts: 1 }];
  assert.deepEqual(JSON.parse(JSON.stringify(fixture(saved).sim.data())), saved);
});

test('481: selecting a future enemy cannot resurrect a dead player', () => {
  const f = fixture(), data = f.sim.data();
  data.player.izd = 0;
  f.sim.applyEnemy(data, { name: 'enemy', attack: 3, hp: 6 });
  assert.equal(data.player.izd, 0);
  f.sim.round();
  assert.equal(data.enemy.curIzd, 6);
  assert.equal(data.history.length, 0);
});

test('unaudited serials retain their existing enemy-selection behavior', () => {
  const f = fixture(undefined, false), data = f.sim.data();
  data.player.izd = 0;
  f.sim.applyEnemy(data, { name: 'enemy', attack: 3, hp: 6 });
  assert.equal(data.player.izd, 20);
});

test('486: enemy selection preserves death and existing saved fights', () => {
  const wrapper = readFileSync(new URL('../../../public/js/battlesim/battlesim486.js', import.meta.url), 'utf8');
  assert.match(wrapper, /preserveDeadPlayer:\s*true/);
  const initial = JSON.parse(JSON.stringify(fixture(undefined, true, 486).sim.data()));
  initial.player = { sila: 7, izd: 0 };
  initial.enemy = { name: 'saved enemy', sila: 6, izd: 1, curIzd: 1, hasStats: true };
  initial.log = ['existing fight'];
  const f = fixture(initial, true, 486);
  assert.deepEqual(JSON.parse(JSON.stringify(f.sim.data())), initial);
  f.sim.applyEnemy(f.sim.data(), { name: 'new enemy', attack: 5, hp: 12 });
  assert.equal(f.sim.data().player.izd, 0);
  f.sim.round();
  assert.equal(f.sim.data().enemy.curIzd, 12);
});

test('491: enemy selection preserves death and existing saved fights', () => {
  const wrapper = readFileSync(new URL('../../../public/js/battlesim/battlesim491.js', import.meta.url), 'utf8');
  assert.match(wrapper, /preserveDeadPlayer:\s*true/);
  const initial = JSON.parse(JSON.stringify(fixture(undefined, true, 491).sim.data()));
  initial.player = { sila: 7, izd: 0 };
  initial.enemy = { name: 'saved enemy', sila: 3, izd: 6, curIzd: 2, hasStats: true };
  initial.log = ['existing fight'];
  const f = fixture(initial, true, 491);
  assert.deepEqual(JSON.parse(JSON.stringify(f.sim.data())), initial);
  f.sim.applyEnemy(f.sim.data(), { name: 'new enemy', attack: 4, hp: 7 });
  assert.equal(f.sim.data().player.izd, 0);
  f.sim.round();
  assert.equal(f.sim.data().enemy.curIzd, 7);
  assert.equal(f.sim.data().history.length, 0);
});
