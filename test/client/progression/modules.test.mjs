import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const dir = new URL('../../../public/js/', import.meta.url);
test('progression relocation preserves XP, floaties and shop implementations without root wrappers', () => {
  // Non-import source captured before the path-only relocation.
  const digests = {
    "app-xp": "62ebae94314ff21dd8ceeab81ea9d2573e118a713eaacf9ee54a2b46c4272b5a",
    "rewards": "8da80d47d5afcb77b829bd8f4061974c2625b498d90149ea5958425d920d86e1",
    "shop": "945d2d9497d587fa2a1239eb907b6f1ce56fc017b2bb1063d3d008e3b15c4125"
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
    shop: ['core/state.js', 'core/util.js', 'i18n.js'],
  };
  for (const [name, dependencies] of Object.entries(expected)) {
    const moduleUrl = new URL('progression/' + name + '.js', dir);
    const source = readFileSync(moduleUrl, 'utf8');
    const actual = [...source.matchAll(/^import .*from '([^']+)';$/gm)]
      .map(match => fileURLToPath(new URL(match[1], moduleUrl)));
    assert.deepEqual(actual, dependencies.map(path => fileURLToPath(new URL(path, dir))));
  }
});
