import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('graph preserves layout, drawing, live bindings, lifecycle and pathfinding', () => {
  const source = readFileSync(new URL('./runtime-check.fixture', import.meta.url), 'utf8');
  const root = fileURLToPath(new URL('../../../public/js/', import.meta.url));
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '--eval', source, root], { encoding: 'utf8', timeout: 15000 });
  assert.ifError(result.error); assert.equal(result.status, 0, result.stdout + result.stderr);
  const { digest, cases } = JSON.parse(result.stdout);
  assert.equal(cases, 20);
  // Original graph baseline, updated so chart deletion preserves completed-run history.
  assert.equal(digest, '35d18aa461f38c54ce264d34bec0c6210254e6c45d689cdbba91cf7291e87f87');
});
