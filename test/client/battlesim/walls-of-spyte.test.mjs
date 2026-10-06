import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture(saved) {
  const source = readFileSync(new URL('../../../public/js/battlesim/battlesim398.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const pt = saved ? { sim398: structuredClone(saved) } : {};
  const context = vm.createContext({ currentPlaythrough: () => pt, saveState() {}, t: k => k });
  vm.runInContext(source + '\n_renderAll = () => {};', context);
  return { run: code => vm.runInContext(code, context), data: vm.runInContext('_data()', context) };
}

test('new Warrior starts with printed armour without modifying saved characters', () => {
  const fresh = fixture();
  assert.equal(fresh.data.player.armor, 3);
  fresh.data.player.armor = 4;
  fresh.data.player.endurance = 43;
  fresh.data.enemy.armor = 7;
  fresh.data.enemy.endurance = 11;
  fresh.data.roundsThisBattle = 5;
  fresh.data.log.push('Saved round');
  const saved = JSON.parse(JSON.stringify(fresh.data));
  assert.deepEqual(JSON.parse(JSON.stringify(fixture(saved).data)), saved);
});

test('enemy selection applies matching printed armour and retains damage bonus', () => {
  const f = fixture();
  const rows = f.run('PRINTED_ENEMY_ARMOUR');
  assert.equal(rows.length, 19);
  for (const [name, attack, hp, pb, defense, armor] of rows) {
    const enemy = { name, attack, hp, pb, defense };
    f.run(`_selectEnemy(${JSON.stringify(enemy)})`);
    assert.equal(f.data.enemy.armor, armor);
    assert.equal(f.data.enemy.dmgBonus, defense);
    assert.equal(f.data.enemy.endurance, hp);
    for (const key of ['attack', 'hp', 'pb', 'defense']) {
      f.run(`_selectEnemy(${JSON.stringify({ ...enemy, [key]: enemy[key] + 1 })})`);
      assert.equal(f.data.enemy.armor, 0);
    }
  }
});

test('variable and weapon-dependent armour remains manual', () => {
  const f = fixture();
  for (const enemy of [
    { name: 'Анарх', attack: 8, hp: 30, pb: 3, defense: 0 },
    { name: 'Магът Тор', attack: 12, hp: 50, pb: 8, defense: 0 },
    { name: 'Истински магове', attack: 12, hp: 75, pb: 8, defense: 0 },
    { name: 'Unknown', attack: 8, hp: 30, pb: 3, defense: 2 },
  ]) {
    f.run(`_selectEnemy(${JSON.stringify(enemy)})`);
    assert.equal(f.data.enemy.armor, 0);
    assert.equal(f.data.enemy.dmgBonus, enemy.defense);
  }
});
