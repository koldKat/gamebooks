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
  // Captured from e87332f's unsplit feed with the same fixed-date fixtures.
  assert.equal(digest, '5d11c32e3b5319dd5e92f0e88fa023b03ba795d87daa1941f6a6bffdb2a14324');
});
