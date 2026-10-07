import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

function fixture() {
  const nodes = new Map();
  let closed = false;
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '0', options: [{ value: '0' }],
      classList: { remove() { closed = true; } } });
    return nodes.get(id);
  };
  const fight = {
    player: { expertise: 12, vitality: 18, fortune: 9, weaponDamage: 2 }, status: 'fighting',
    encounter: { foes: [{ name: 'Crocodile', expertise: 13, vitality: 10, initialVitality: 12, damage: 3 }] },
    pending: { events: [], player: { total: 16 }, rolls: [{ total: 13 }], enemyDamage: 0,
      hits: [{ index: 0, damage: 2 }], selection: { attackBonus: true, bonusHit: 0, defensePoints: 2, preventSpecial: true } },
  };
  const context = vm.createContext({ currentBookId: 524, pt: { sim524: { fight, log: [], history: [], potions: 3, provisions: 2 } },
    document: { getElementById: node, activeElement: null }, t: key => key, escapeHtml: String });
  context.currentPlaythrough = () => context.pt;
  const source = readFileSync(new URL('../../../public/js/battlesim/battlesim524.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?;\n/gm, '').replace(/export /g, '');
  vm.runInContext(source, context);
  return { context, node, fight, closed: () => closed };
}

test('live simulator redraws retain pending Fortune choices and leave rolls unchanged', () => {
  const f = fixture();
  const before = JSON.stringify(f.fight);
  vm.runInContext('renderSim524(); renderSim524();', f.context);
  assert.equal(f.node('sim524-bonus').checked, true);
  assert.equal(f.node('sim524-defense').value, 2);
  assert.equal(f.node('sim524-special').checked, true);
  assert.equal(f.node('sim524-bonus-hit').value, '0');
  assert.equal(f.node('sim524-start').disabled, true);
  assert.equal(f.node('sim524-roll').disabled, true);
  assert.equal(JSON.stringify(f.fight), before);
});

test('switching books closes the panel without creating state in another book', () => {
  const f = fixture();
  f.context.currentBookId = 525;
  f.context.pt = {};
  vm.runInContext('renderSim524();', f.context);
  assert.equal(f.closed(), true);
  assert.deepEqual(f.context.pt, {});
});
