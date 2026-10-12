import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const dir = new URL('../../../public/js/', import.meta.url);
test('core relocation preserves implementations without root wrappers or duplicate state', () => {
  const digests = {
    // Reader entries have separate progress accounting; discovered-mapped.test.mjs covers it.
    state: '33721a7cb3e182fc216163541f780d90365e4e06fbebeb39a75b60371edf6414',
    constants: 'b67245d28638c7d42c976068c7bc86ac822fff89d47c537d8fd9672ff19826a9',
    sort: 'a37194516dcc6faf776288906e52f3b9e8dc8d30a81df7158108d8b0e3742eb6',
    // Includes the reviewed simulator overlay registry additions.
    util: '19ebb70ba4e5e659b0f96a66b2f1a83ace4900cf927148fbd35b02e7934793e8',
  };
  for (const [name, digest] of Object.entries(digests)) {
    assert.equal(existsSync(new URL(name + '.js', dir)), false);
    const source = readFileSync(new URL('core/' + name + '.js', dir), 'utf8');
    assert.equal(createHash('sha256').update(source.replace(/^import .*;$/gm, '')).digest('hex'), digest);
    const imports = [...source.matchAll(/^import .*from '([^']+)';$/gm)].map(match => match[1]);
    assert.deepEqual(imports, name === 'util' ? ['./state.js', '../i18n.js'] : []);
  }
  assert.equal(existsSync(new URL('core.js', dir)), false);
  for (const path of ['boot/state.js', 'covers/state.js', 'feed/state.js']) {
    assert.ok(existsSync(new URL(path, dir)), 'feature-specific state remains in place: ' + path);
  }
  assert.equal(existsSync(new URL('../mobile/js/state.js', dir)), false, 'mobile continues sharing the application state');
});

test('all desktop and mobile modules parse and link with actual dependency exports', () => {
  const fixture = readFileSync(new URL('./link-graph.fixture', import.meta.url), 'utf8');
  const root = fileURLToPath(new URL('../', dir));
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '--eval', fixture, root], { encoding: 'utf8', timeout: 15000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
