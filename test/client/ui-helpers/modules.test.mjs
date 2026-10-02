import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const dir = new URL('../../../public/js/', import.meta.url);
test('UI helper relocation preserves implementations and lightweight dependencies', () => {
  const digests = {
    confirm: 'f4ef543c741ef428b11a855cfe4884c3d07aaab591889187d7e83e6dde69973d',
    tooltip: 'c2ca46f3adf6f0986d575f2275466cde6a9f052a6e9d1db6163f56a4c8f5969f',
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
