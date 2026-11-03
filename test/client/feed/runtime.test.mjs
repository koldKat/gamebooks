import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('feed preserves rendering, loading, interactions, previews and day covers', () => {
  const source = readFileSync(new URL('./runtime-check.fixture', import.meta.url), 'utf8');
  const root = fileURLToPath(new URL('../../../public/js/', import.meta.url));
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '--eval', source, root], { encoding: 'utf8', timeout: 15000, env: { ...process.env, TZ: 'UTC' } });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const { digest, cases } = JSON.parse(result.stdout);
  assert.equal(cases, 38);
  // Includes filter ordering and native fieldset/legend announcement borders.
  assert.equal(digest, 'a85c3ff66601bb9d229855ebd64166a9e23b90b2fc125347db5760249b38cec8');
});
