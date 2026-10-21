import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const dir = new URL('../../../public/js/', import.meta.url);
test('progression relocation preserves unchanged implementations without root wrappers', () => {
  // Non-import source baseline; comment cleanup verified against unchanged executable ASTs.
  const digests = {
    "app-xp": "02b4f4c1c7316f5cb9253bf05c65ed3bda7ad097f7ca857345c8581a3b7806b4",
  };
  for (const [name, digest] of Object.entries(digests)) {
    assert.equal(existsSync(new URL(name + '.js', dir)), false);
    const source = readFileSync(new URL('progression/' + name + '.js', dir), 'utf8');
    assert.equal(createHash('sha256').update(source.replace(/^import .*;$/gm, '')).digest('hex'), digest);
  }
  // Rewards now also clear the private diamond display when the account changes.
  assert.equal(existsSync(new URL('rewards.js', dir)), false);
  assert.ok(existsSync(new URL('progression/rewards.js', dir)));
  // Shop now includes the separately tested private diamond upgrades.
  assert.equal(existsSync(new URL('shop.js', dir)), false);
  assert.ok(existsSync(new URL('progression/shop.js', dir)));
  assert.equal(existsSync(new URL('progression.js', dir)), false);
  assert.ok(existsSync(new URL('../mobile/js/toast.js', dir)));
});

test('progression imports retain their original dependency identities', () => {
  const expected = {
    'app-xp': ['core/state.js', 'progression/shop.js', 'core/util.js', 'i18n.js'],
    rewards: ['core/state.js', 'progression/shop.js', 'account/profile.js', 'progression/diamonds.js', 'core/livetab.js', 'community/notif.js', 'core/util.js'],
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
