import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('play preserves runs, choices, undo, portals, rewards, dialogs and render ordering', () => {
  const source = readFileSync(new URL('./runtime-check.fixture', import.meta.url), 'utf8');
  const root = fileURLToPath(new URL('../../../public/js/', import.meta.url));
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '--eval', source, root], { encoding: 'utf8', timeout: 15000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const { digest, cases, exports } = JSON.parse(result.stdout);
  assert.equal(cases, 42);
  assert.equal(exports, 34);
  // Captured from 31eb060's unsplit controller with the same isolated fixtures.
  assert.equal(digest, '6f1b7232fbf8e905dbbb23fd6d59e7455d1c73e167ec33b24f6177df9f2ee3e1');
});
