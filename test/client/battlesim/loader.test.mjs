import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from './simulator-source.mjs';
import { readFileSync as readPhysical } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dir = new URL('../../../public/js/', import.meta.url);
test('desktop battle-sim relocation retains the registry and visibility lifecycle', () => {
  assert.equal(existsSync(new URL('battle-sim-loader.js', dir)), false);
  const source = readFileSync(new URL('battlesim/loader.js', dir), 'utf8');
  // Guard the cache/visibility shell independently of the uniform module API.
  const start = source.indexOf('async function _loadBattleSim(');
  const end = source.indexOf('export function hideActiveBattleSim');
  assert.ok(start > 0 && end > start);
  // Normalize out the supported-books registry: it legitimately grows with every new sim,
  // so the hash guards the loader logic, not the id list.
  const unchanged = (source.slice(0, start) + source.slice(end))
    .replace('const _loading = new Map();\n', '')
    .replace("import {prepareBattleSimLayout, simulatorOverlay} from './layout.js';\n\n", '')
    .replace(/const SUPPORTED_BATTLE_SIM_BOOKS = new Set\(\[[\s\S]*?\]\);/, 'SUPPORTED_SET');
  assert.equal(createHash('sha256').update(unchanged).digest('hex'),
    '3cce23bb8c59cf73e60f839520bfa24a895c9062049d4f4ac8efc9599ac32069');
  assert.deepEqual(source.match(/^import\s.+$/gm),
    ["import {prepareBattleSimLayout, simulatorOverlay} from './layout.js';"],
    'only the lightweight layout helper is eager; simulators remain lazy');
  assert.match(source, /import\(`\.\/battlesim\$\{numericId\}\.js`\)/);
});

test('every desktop-supported simulator exists with the expected dynamic export shape', () => {
  const source = readFileSync(new URL('battlesim/loader.js', dir), 'utf8');
  const registry = source.match(/const SUPPORTED_BATTLE_SIM_BOOKS = new Set\(\[([\s\S]*?)\]\)/)[1];
  const ids = [...registry.matchAll(/\d+/g)].map(match => Number(match[0]));
  assert.ok(ids.length > 100);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) {
    const entry = readPhysical(new URL('battlesim/battlesim' + id + '.js', dir), 'utf8');
    const exports = entry.match(new RegExp("export\\s+(\\*|\\{[^}]+\\})\\s+from './books/"+id+"/panel\\.js'"));
    assert.ok(exports, id + ': panel exports');
    if (exports[1] !== '*') {
      for (const name of ['init', 'render', 'setVisible']) assert.match(exports[1], new RegExp('\\b' + name + '\\b'), id + ': ' + name);
    }
    const module = readPhysical(new URL('battlesim/books/' + id + '/panel.js', dir), 'utf8');
    const names = ['init', 'render', 'setVisible'];
    for (const name of names) assert.match(module, new RegExp('export\\s*\\{[^}]*\\bas\\s+'+name+'\\b'), id + ': ' + name);
  }
});

test('desktop lazy loading preserves cache, switching, cancellation and failure handling', () => {
  const fixture = readFileSync(new URL('./loader-runtime.fixture', import.meta.url), 'utf8');
  const path = fileURLToPath(new URL('battlesim/loader.js', dir));
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '--eval', fixture, path], { encoding: 'utf8', timeout: 15000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
