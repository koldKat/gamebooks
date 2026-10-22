import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = new URL('../../../public/js/', import.meta.url);
test('progression relocation preserves unchanged implementations without root wrappers', () => {
  // Feature tests cover behavior as these modules evolve after relocation.
  assert.equal(existsSync(new URL('app-xp.js', dir)), false);
  assert.ok(existsSync(new URL('progression/app-xp.js', dir)));
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
    'app-xp': ['core/state.js', 'progression/shop.js', 'progression/rubies.js', 'progression/diamonds.js', 'core/util.js', 'i18n.js'],
    rewards: ['core/state.js', 'progression/shop.js', 'account/profile.js', 'progression/diamonds.js', 'progression/rubies.js', 'progression/ruby-exchange-shop.js', 'progression/exchange-shop.js', 'progression/heartbeat-coins.js', 'progression/snapshot-cache.js', 'core/livetab.js', 'community/notif.js', 'core/util.js'],
    shop: ['core/state.js', 'core/util.js', 'i18n.js', 'ui-helpers/coin-icon.js', 'progression/diamonds.js', 'progression/ruby-exchange-shop.js', 'progression/exchange-shop.js'],
  };
  for (const [name, dependencies] of Object.entries(expected)) {
    const moduleUrl = new URL('progression/' + name + '.js', dir);
    const source = readFileSync(moduleUrl, 'utf8');
    const actual = [...source.matchAll(/^import .*from '([^']+)';$/gm)]
      .map(match => fileURLToPath(new URL(match[1], moduleUrl)));
    assert.deepEqual(actual, dependencies.map(path => fileURLToPath(new URL(path, dir))));
  }
});
