import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const dir = new URL('../../../public/js/', import.meta.url);
test('account relocation keeps root wrappers absent and unchanged modules intact', () => {
  // Non-import source baseline; comment cleanup verified against unchanged executable ASTs.
  const digests = {
    auth: 'f5a59cea9ac32de7dd96723dcd077f6f76e621b8ce0e00343aa0d9191d6be4dc',
    'public-profile': '1431bd883bb1bf66a2711bba03869d9756453ce17d4742103ad3782e5dd1d138',
    user: '6a0e5eee3143805e90dee5da269571f8ee1851736e9303489fa6b4123c59a70d',
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
