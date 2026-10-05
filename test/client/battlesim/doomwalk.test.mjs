import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture(saved) {
  const source = readFileSync(new URL('../../../public/js/battlesim/battlesim397.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const pt = saved ? { sim397: structuredClone(saved) } : {};
  const context = vm.createContext({ currentPlaythrough: () => pt, saveState() {}, t: k => k });
  vm.runInContext(source + '\n_renderAll = () => {};', context);
  return { run: code => vm.runInContext(code, context), data: vm.runInContext('_data()', context) };
}

test('printed armour applies only when selecting matching roster enemies', () => {
  const f = fixture();
  const rows = f.run('PRINTED_ENEMY_ARMOUR');
  for (const [name, attack, hp, pb, defense, armor] of rows) {
    const enemy = { name, attack, hp, pb, defense };
    f.run(`_selectEnemy(${JSON.stringify(enemy)})`);
    assert.equal(f.data.enemy.armor, armor);
    assert.equal(f.data.enemy.dmgBonus, defense);
    f.run(`_selectEnemy(${JSON.stringify({ ...enemy, hp: hp + 1 })})`);
    assert.equal(f.data.enemy.armor, 0);
  }
  f.run('_selectEnemy({name: "Unknown", attack: 8, hp: 27, pb: 3, defense: 3})');
  assert.equal(f.data.enemy.armor, 0);
  assert.equal(f.data.enemy.dmgBonus, 3);
});

test('loading a saved character and fight does not change armour or other values', () => {
  const f = fixture();
  Object.assign(f.data.enemy, { name: 'Какодемон', armor: 0, endurance: 11 });
  f.data.roundsThisBattle = 4;
  const saved = JSON.parse(JSON.stringify(f.data));
  assert.deepEqual(JSON.parse(JSON.stringify(fixture(saved).data)), saved);
});
