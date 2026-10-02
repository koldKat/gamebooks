import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const dir = new URL('../../../public/js/', import.meta.url);
test('UI helper relocation preserves implementations and lightweight dependencies', () => {
  const digests = {
    confirm: 'bfecf79a4b8b946856c86d1a7417e4aa5e2635da1450a96d065ebb79df91f18b',
    tooltip: '325014a74416056b57cb207bc73ee587b885d5f71a53dff6da33048ca3cb5c9e',
  };
  for (const [name, digest] of Object.entries(digests)) {
    assert.equal(existsSync(new URL(name + '.js', dir)), false);
    const source = readFileSync(new URL('ui-helpers/' + name + '.js', dir), 'utf8');
    assert.equal(createHash('sha256').update(source.replace(/^import .*;$/gm, '')).digest('hex'), digest);
    const imports = [...source.matchAll(/^import .*from '([^']+)';$/gm)].map(match => match[1]);
    assert.deepEqual(imports, name === 'confirm' ? ['../i18n.js'] : []);
  }
  assert.equal(existsSync(new URL('ui-helpers.js', dir)), false);
  assert.match(readFileSync(new URL('play.js', dir), 'utf8'),
    /export \{ showConfirm, showAlert \} from '\.\/ui-helpers\/confirm\.js';/);
  for (const name of ['reader', 'notebook']) {
    assert.match(readFileSync(new URL('../mobile/js/' + name + '.js', dir), 'utf8'),
      /from '\.\.\/\.\.\/js\/ui-helpers\/confirm\.js';/);
  }
});

test('UI helpers retain desktop/mobile confirmation and tooltip interaction behavior', () => {
  const fixture = readFileSync(new URL('./runtime.fixture', import.meta.url), 'utf8');
  const path = fileURLToPath(new URL('ui-helpers/', dir));
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '--eval', fixture, path], { encoding: 'utf8', timeout: 15000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
