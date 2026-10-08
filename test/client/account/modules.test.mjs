import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const dir = new URL('../../../public/js/', import.meta.url);
test('account relocation keeps root wrappers absent and unchanged modules intact', () => {
  // Non-import source baseline; comment cleanup verified against unchanged executable ASTs.
  const digests = {
    auth: 'f5a59cea9ac32de7dd96723dcd077f6f76e621b8ce0e00343aa0d9191d6be4dc',
    'public-profile': 'c2d48729228af2d38123635d7c2e2311874d2f49028e2471eac6e7a14aa6fc3a',
    user: '1c05886d82403706640fea1d39f8099d5446769f55a1bd17c603f1465ae952ed',
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
