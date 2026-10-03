import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dir = new URL('../../../public/js/', import.meta.url);
test('desktop battle-sim relocation retains the registry and visibility lifecycle', () => {
  assert.equal(existsSync(new URL('battle-sim-loader.js', dir)), false);
  const source = readFileSync(new URL('battlesim/loader.js', dir), 'utf8');
  // Only _loadBattleSim and its in-flight map changed for the concurrency fix.
  const start = source.indexOf('async function _loadBattleSim(');
  const end = source.indexOf('export function hideActiveBattleSim');
  assert.ok(start > 0 && end > start);
  const unchanged = (source.slice(0, start) + source.slice(end)).replace('const _loading = new Map();\n', '');
  assert.equal(createHash('sha256').update(unchanged).digest('hex'),
    '271a6f777e8aca694e444472d460a057815c293dd95c577b7b3e94046713138a');
  assert.doesNotMatch(source, /^import\s/m, 'no eager simulator imports');
  assert.match(source, /import\(`\.\/battlesim\$\{numericId\}\.js`\)/);
});

test('every desktop-supported simulator exists with the expected dynamic export shape', () => {
  const source = readFileSync(new URL('battlesim/loader.js', dir), 'utf8');
  const registry = source.match(/const SUPPORTED_BATTLE_SIM_BOOKS = new Set\(\[([\s\S]*?)\]\)/)[1];
  const ids = [...registry.matchAll(/\d+/g)].map(match => Number(match[0]));
  assert.ok(ids.length > 100);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) {
    const module = readFileSync(new URL('battlesim/battlesim' + id + '.js', dir), 'utf8');
    const names = id === 829 ? ['initBattleSim', 'renderBattleSim', 'setBattleSimVisible']
      : id === 8 ? ['initBattleSim8', 'renderSim8', 'setSim8Visible']
      : ['initSim' + id, 'renderSim' + id, 'setSim' + id + 'Visible'];
    for (const name of names) assert.match(module, new RegExp('export\\s+(?:async\\s+)?function\\s+' + name + '\\b'), id + ': ' + name);
  }
});

test('desktop lazy loading preserves cache, switching, cancellation and failure handling', () => {
  const fixture = readFileSync(new URL('./loader-runtime.fixture', import.meta.url), 'utf8');
  const path = fileURLToPath(new URL('battlesim/loader.js', dir));
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '--eval', fixture, path], { encoding: 'utf8', timeout: 15000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
