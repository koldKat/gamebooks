import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const dir = new URL('../../../public/js/', import.meta.url);
test('account relocation keeps root wrappers absent and unchanged modules intact', () => {
  // Non-import source baseline; comment cleanup verified against unchanged executable ASTs.
  const digests = {
    auth: 'f5a59cea9ac32de7dd96723dcd077f6f76e621b8ce0e00343aa0d9191d6be4dc',
    // Public run marker behavior is covered by public-run-markers.test.mjs.
    // User role rendering has changed since relocation and is covered by role-display-names.test.js.
  };
  for (const [name, digest] of Object.entries(digests)) {
    assert.equal(existsSync(new URL(name + '.js', dir)), false);
    const source = readFileSync(new URL('account/' + name + '.js', dir), 'utf8');
    assert.equal(createHash('sha256').update(source.replace(/^import .*;$/gm, '')).digest('hex'), digest);
  }
  for (const name of ['public-profile', 'user']) {
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
