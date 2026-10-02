import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const dir = new URL('../../../public/js/', import.meta.url);
test('progression relocation preserves XP, floaties and shop implementations without root wrappers', () => {
  // Non-import source baseline; comment cleanup verified against unchanged executable ASTs.
  const digests = {
    "app-xp": "353a3587b4278c1cd1af4880e265d43a79cbbf0ff0a2ed705c2baacc21c6b6e9",
    "rewards": "33fcb7bab962502059be6c89c7fa9ddefdf3d050c3a3490b6ebe69cc0b46d7fa",
    "shop": "a2b3418c0300ab4a997e99bfbf5de2f2b1b3b654569b9fd0696c80a8538aacc8"
  };
  for (const [name, digest] of Object.entries(digests)) {
    assert.equal(existsSync(new URL(name + '.js', dir)), false);
    const source = readFileSync(new URL('progression/' + name + '.js', dir), 'utf8');
    assert.equal(createHash('sha256').update(source.replace(/^import .*;$/gm, '')).digest('hex'), digest);
  }
  assert.equal(existsSync(new URL('progression.js', dir)), false);
  assert.ok(existsSync(new URL('../mobile/js/toast.js', dir)));
});

test('progression imports retain their original dependency identities', () => {
  const expected = {
    'app-xp': ['core/state.js', 'progression/shop.js', 'core/util.js', 'i18n.js'],
    rewards: ['core/state.js', 'progression/shop.js', 'account/profile.js', 'core/livetab.js', 'community/notif.js', 'core/util.js'],
    shop: ['core/state.js', 'core/util.js', 'i18n.js', 'ui-helpers/coin-icon.js'],
  };
  for (const [name, dependencies] of Object.entries(expected)) {
    const moduleUrl = new URL('progression/' + name + '.js', dir);
    const source = readFileSync(moduleUrl, 'utf8');
    const actual = [...source.matchAll(/^import .*from '([^']+)';$/gm)]
      .map(match => fileURLToPath(new URL(match[1], moduleUrl)));
    assert.deepEqual(actual, dependencies.map(path => fileURLToPath(new URL(path, dir))));
  }
});
