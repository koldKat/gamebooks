import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../../../public/', import.meta.url));
const js = resolve(root, 'js');

test('community relocation preserves each module implementation without root wrappers', () => {
  // Baseline includes feedback fixes and the Coin Mint purchase bonus notification.
  const digests = {
    inbox: '29c252f34e0b8e7fb803705f404130c7e520e01df68c9688c7e2eccbc2102478',
    feedback: 'cb26d728a3b4c4afdf5bbb37c568c0f3f0ebfaed4c7e2b746fcea497e04fde8d',
    notif: '435a80e52bbe4a7282b5736348cc03455fe66662220ad9ca74567d9d744587de',
  };
  for (const [name, digest] of Object.entries(digests)) {
    assert.equal(existsSync(resolve(js, name + '.js')), false, 'no old root module: ' + name);
    const source = readFileSync(resolve(js, 'community', name + '.js'), 'utf8');
    assert.equal(createHash('sha256').update(source.replace(/^import .*;$/gm, '')).digest('hex'), digest);
  }
  assert.equal(existsSync(resolve(js, 'community.js')), false);
});

test('desktop and mobile client imports resolve after community relocation', () => {
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) { walk(path); continue; }
      if (!path.endsWith('.js')) continue;
      const source = readFileSync(path, 'utf8');
      for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"]([^'"]+)['"]/g)) {
        if (!match[1].startsWith('.')) continue;
        assert.ok(existsSync(resolve(dirname(path), match[1])), `${path}: missing ${match[1]}`);
      }
    }
  }
  walk(js);
  walk(resolve(root, 'mobile/js'));
});
