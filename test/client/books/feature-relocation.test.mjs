import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const dir = new URL('../../../public/js/', import.meta.url);
test('library feature relocation preserves implementations without root wrappers', () => {
  const digests = {
    "add-book": "cf253432c4b8c161d0f73204bf7c53d19356fb96b11c9a60910f937357279d63",
    "autocomplete": "aaea976bce6b382fd4c9a0780a00ec2f3dcddbd158f3f8044dece4e16c9141bf",
    "export": "450820edb2102369edfc517142930d5ca9310db47e4404fc2007b03fc94e22dc"
  };
  for (const [name, digest] of Object.entries(digests)) {
    assert.equal(existsSync(new URL(name + '.js', dir)), false);
    const source = readFileSync(new URL('books/' + name + '.js', dir), 'utf8');
    assert.equal(createHash('sha256').update(source.replace(/^import[\s\S]*?;$/gm, '')).digest('hex'), digest);
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
