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
  // Captured from d97de3b's unsplit inventory controller with the same fixture.
  assert.equal(digest, 'c3a7382433749d6480eb4f5ac81e8e0fbe7e7a0ed762b45c56200eae58e3cc6d');
});
