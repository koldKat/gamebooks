import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('profile closes and pending loads cannot reopen after logout or session changes', () => {
  const source = readFileSync(new URL('./profile-lifecycle.fixture', import.meta.url), 'utf8');
  const path = fileURLToPath(new URL('../../../public/js/account/profile.js', import.meta.url));
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '--eval', source, path], { encoding: 'utf8', timeout: 15000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
