import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const dir = new URL('../../../public/js/', import.meta.url);
test('account modules retain dedicated locations and root wrappers stay absent', () => {
  for (const name of ['auth', 'public-profile', 'user']) {
    assert.equal(existsSync(new URL(name + '.js', dir)), false);
    assert.ok(existsSync(new URL('account/' + name + '.js', dir)));
  }
  assert.equal(existsSync(new URL('account.js', dir)), false);
  // Profile now has a separately tested logout/pending-fetch lifecycle fix.
  assert.equal(existsSync(new URL('profile.js', dir)), false);
  assert.ok(existsSync(new URL('account/profile.js', dir)));
  assert.ok(existsSync(new URL('ui-helpers/prefs.js', dir)));
  assert.ok(existsSync(new URL('../mobile/js/auth.js', dir)), 'mobile keeps its independent authentication module');
});
