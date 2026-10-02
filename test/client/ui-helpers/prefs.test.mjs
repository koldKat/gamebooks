import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const sourceUrl = new URL('../../../public/js/ui-helpers/prefs.js', import.meta.url);
test('shared preference relocation preserves implementation and dependency targets', () => {
  const source = readFileSync(sourceUrl, 'utf8');
  assert.equal(existsSync(new URL('../prefs.js', sourceUrl)), false);
  assert.equal(createHash('sha256').update(source.replace(/^import .*;$/gm, '')).digest('hex'),
    '352ee341798726b051e4a01703090e1442d60d53b787abbb28ed7f8615195064');
  const imports = [...source.matchAll(/^import .*from '([^']+)';$/gm)].map(match => new URL(match[1], sourceUrl).href);
  assert.deepEqual(imports, ['core/state.js', 'play.js', 'covers.js', 'books.js'].map(path => new URL('../' + path, sourceUrl).href));
  for (const path of ['books/prefs.js', 'covers/prefs.js']) assert.ok(existsSync(new URL('../' + path, sourceUrl)));
});

test('shared preferences retain panel restoration, feed scroll and synchronization behavior', () => {
  const fixture = readFileSync(new URL('./prefs-runtime.fixture', import.meta.url), 'utf8');
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '--eval', fixture, fileURLToPath(sourceUrl)],
    { encoding: 'utf8', timeout: 15000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
