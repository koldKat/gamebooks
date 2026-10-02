import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const dir = new URL('../../../public/js/', import.meta.url);
test('reading relocation preserves implementations and exact dependency targets', () => {
  const digests = {
    liveread: '86c62138d797933d41d916939624eaa3528b48db604286633277c262890f4bc0',
    'liveread-shared': '7a305b8967fc5494a00f3962a9075a3cdb435122061baadb8fa7aa3e0cbaa1dc',
  };
  for (const [name, digest] of Object.entries(digests)) {
    assert.equal(existsSync(new URL(name + '.js', dir)), false);
    const source = readFileSync(new URL('reading/' + name + '.js', dir), 'utf8');
    assert.equal(createHash('sha256').update(source.replace(/^import .*;$/gm, '')).digest('hex'), digest);
  }
  assert.equal(existsSync(new URL('reading.js', dir)), false);
  const moduleUrl = new URL('reading/liveread.js', dir);
  const source = readFileSync(moduleUrl, 'utf8');
  const imports = [...source.matchAll(/^import .*from '([^']+)';$/gm)]
    .map(match => fileURLToPath(new URL(match[1], moduleUrl)));
  assert.deepEqual(imports, ['core/state.js', 'play.js', 'graph.js', 'i18n.js', 'core/util.js', 'reading/liveread-shared.js']
    .map(path => fileURLToPath(new URL(path, dir))));
});

test('mobile keeps existing dependencies and imports only the shared reading module', async () => {
  const sharedUrl = new URL('reading/liveread-shared.js', dir);
  const shared = readFileSync(sharedUrl, 'utf8');
  assert.doesNotMatch(shared, /^import\s|\bimport\s*\(/m);
  const mobileUrl = new URL('../mobile/js/reader.js', dir);
  const mobile = readFileSync(mobileUrl, 'utf8');
  // Mobile source baseline excludes imports; executable AST unchanged after comment cleanup.
  assert.equal(createHash('sha256').update(mobile.replace(/^import[\s\S]*?;$/gm, '')).digest('hex'),
    'fd7ec5e93f4d2e68347fa33e73a28532d1d04ec4bec41816c9978418e9dfd264');
  const imports = [...mobile.matchAll(/^import[\s\S]*?from '([^']+)';$/gm)]
    .map(match => new URL(match[1], mobileUrl));
  const desktopImports = imports.filter(url => url.href.startsWith(dir.href));
  assert.deepEqual(desktopImports.map(url => url.href),
    ['core/state.js', 'graph.js', 'ui-helpers/confirm.js', 'i18n.js', 'reading/liveread-shared.js'].map(path => new URL(path, dir).href));
  const module = await import(sharedUrl);
  assert.equal(module.terminalHeadingKey(true), 'liveread.victory_heading');
  assert.equal(module.terminalHeadingKey(false), 'liveread.death_heading');
  assert.match(module.TROPHY_SVG, /<svg class="end-icon"/);
  assert.match(module.BROKEN_SHIELD_SVG, /<svg class="end-icon"/);
});

test('relocated desktop reader still loads, prefetches and commits sections', () => {
  const fixture = readFileSync(new URL('./runtime.fixture', import.meta.url), 'utf8');
  const path = fileURLToPath(new URL('reading/liveread.js', dir));
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '--eval', fixture, path], { encoding: 'utf8', timeout: 15000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
