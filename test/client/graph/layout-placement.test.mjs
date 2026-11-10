import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

test('desktop and mobile nodes search around crowding without moving saved nodes', () => {
  const code = readFileSync(new URL('./layout-placement.fixture', import.meta.url), 'utf8');
  const root = fileURLToPath(new URL('../../../public/js/', import.meta.url));
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '--eval', code, root], { encoding: 'utf8', timeout: 15000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.cases, 26);
  assert.equal(report.mobileCases, 12);
  assert.equal(report.denseNodes, 602);
  console.log(`Dense graph placement: ${report.densePlacementMs} ms`);
});
