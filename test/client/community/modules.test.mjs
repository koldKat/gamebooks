import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../../../public/', import.meta.url));
const js = resolve(root, 'js');

test('community relocation preserves each module implementation without root wrappers', () => {
  // Baseline includes the tested permanent-deletion and failure-handling update.
  const digests = {
    inbox: 'faaf5f38e03e373851ca90e33868f3a50dd09e8a08dea56cff865f2538b66d0d',
    feedback: '88de25a00c297cb8d3aee5a8d68153d466b63dc770492b82a78c3105539ff2a0',
    notif: 'e8e24f821145ad571d089f3008325074881583290eeb4e62778b5e1d35a7a10b',
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
