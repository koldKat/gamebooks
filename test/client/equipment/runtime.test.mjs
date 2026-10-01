import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('equipment preserves stack transfers, slot rendering, metadata, templates, cache and read-only runs', () => {
  const source = readFileSync(new URL('./runtime-check.fixture', import.meta.url), 'utf8');
  const root = fileURLToPath(new URL('../../../public/js/', import.meta.url));
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '--eval', source, root], { encoding: 'utf8', timeout: 15000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const { cases, exports, digest } = JSON.parse(result.stdout);
  assert.equal(cases, 16); assert.equal(exports, 4);
  // Captured from e6883df's unsplit equipment controller with identical fixtures.
  assert.equal(digest, '6746a9a28983cb24f49d2a7942fdc9ee5aeb84ac8a504cac7eb6b846641e1504');
});
