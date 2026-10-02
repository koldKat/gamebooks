import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const sourceUrl = new URL('../../../public/js/core/livetab.js', import.meta.url);
test('live-tab relocation preserves implementation and dependency identities', () => {
  const source = readFileSync(sourceUrl, 'utf8');
  assert.equal(existsSync(new URL('../livetab.js', sourceUrl)), false);
  assert.equal(createHash('sha256').update(source.replace(/^import .*;$/gm, '')).digest('hex'),
    '3ab10d7f885c4f199435a1f4190b25dbf232950ebff02bbf15f3a7754887fdde');
  const imports = [...source.matchAll(/^import .*from '([^']+)';$/gm)]
    .map(match => new URL(match[1], sourceUrl).href);
  assert.deepEqual(imports, ['core/state.js', 'progression/shop.js']
    .map(path => new URL('../' + path, sourceUrl).href));
});

test('live-tab leadership, streams, polling and follower rewards retain behavior', () => {
  const fixture = readFileSync(new URL('./livetab-runtime.fixture', import.meta.url), 'utf8');
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '--eval', fixture, fileURLToPath(sourceUrl)],
    { encoding: 'utf8', timeout: 15000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
