import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const dir = new URL('../../../public/js/', import.meta.url);
test('library feature relocation preserves entry points without root wrappers', () => {
  const entryPoints = {
    'add-book': ['openAddBook', 'openAddComp', 'openAddSeries', 'initAddBook'],
    autocomplete: ['invalidateAutocompleteCaches', '_loadAutocompleteBooks', '_loadSeriesAutocomplete'],
    export: ['exportAll', 'exportBook'],
  };
  for (const [name, exports] of Object.entries(entryPoints)) {
    assert.equal(existsSync(new URL(name + '.js', dir)), false);
    const source = readFileSync(new URL('books/' + name + '.js', dir), 'utf8');
    for (const entry of exports) assert.match(source, new RegExp(`export (?:async )?function ${entry}\\(`));
  }
  assert.ok(existsSync(new URL('books.js', dir)), 'existing library facade remains');
});

test('library feature relocation preserves dependency identities and order', () => {
  const expected = {
    'add-book': ['core/state.js', 'i18n.js', 'books.js', 'covers.js', 'core/sort.js', 'play.js', 'edit-book.js', 'books/autocomplete.js', 'core/util.js'],
    autocomplete: ['core/state.js', 'books.js', 'core/sort.js', 'core/util.js', 'i18n.js'],
    export: ['core/state.js', 'play.js', 'i18n.js'],
  };
  for (const [name, dependencies] of Object.entries(expected)) {
    const moduleUrl = new URL('books/' + name + '.js', dir);
    const source = readFileSync(moduleUrl, 'utf8');
    const actual = [...source.matchAll(/^import[\s\S]*?from '([^']+)';$/gm)]
      .map(match => new URL(match[1], moduleUrl).href);
    assert.deepEqual(actual, dependencies.map(path => new URL(path, dir).href));
  }
});

test('relocated library autocomplete caches and export downloads retain behavior', () => {
  const fixture = readFileSync(new URL('./feature-runtime.fixture', import.meta.url), 'utf8');
  const root = fileURLToPath(new URL('books/', dir));
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '--eval', fixture, root], { encoding: 'utf8', timeout: 15000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
