import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('inventory preserves grid, picker, transfers, metadata, templates and read-only behavior', () => {
  const source = readFileSync(new URL('./runtime-check.fixture', import.meta.url), 'utf8');
  const root = fileURLToPath(new URL('../../../public/js/', import.meta.url));
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '--eval', source, root], { encoding: 'utf8', timeout: 15000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const { cases, exports, digest } = JSON.parse(result.stdout);
  assert.equal(cases, 17);
  assert.equal(exports, 9);
  // Lazy picker markup and escaped full-name tooltip attributes are intentional.
  assert.equal(digest, 'e6ad4d7edc9afa6a378ca5cdc91da31b57d6807e9cf113a4a7e7d31015562d15');
});
