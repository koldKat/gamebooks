import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const dir = new URL('../../../public/js/', import.meta.url);
test('account relocation keeps root wrappers absent and unchanged modules intact', () => {
  // Non-import source captured from 362a441 before the path-only move.
  const digests = {
    auth: 'e9b227bf34d776f49c4780e6e807a4bae0e9bddbec7ada123591ac1a63fa1c05',
    'public-profile': '26f563499b681d771ef42c517515a77b1feee76cfbc0e3b5a53a8abfdc7161c3',
    user: 'c8ce4d40623ccdbbc022ec13447b2625202731179fd2e5db815cbc5d5217737e',
  };
  for (const [name, digest] of Object.entries(digests)) {
    assert.equal(existsSync(new URL(name + '.js', dir)), false);
    const source = readFileSync(new URL('account/' + name + '.js', dir), 'utf8');
    assert.equal(createHash('sha256').update(source.replace(/^import .*;$/gm, '')).digest('hex'), digest);
  }
  assert.equal(existsSync(new URL('account.js', dir)), false);
  // Profile now has a separately tested logout/pending-fetch lifecycle fix.
  assert.equal(existsSync(new URL('profile.js', dir)), false);
  assert.ok(existsSync(new URL('account/profile.js', dir)));
  assert.ok(existsSync(new URL('ui-helpers/prefs.js', dir)));
  assert.ok(existsSync(new URL('../mobile/js/auth.js', dir)), 'mobile keeps its independent authentication module');
});
