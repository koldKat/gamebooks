import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('feed filter patches preserve other categories and account preferences', async () => {
  const source = readFileSync(new URL('../../server/routes/profile.js', import.meta.url), 'utf8');
  let stored = { feedFilters: { runs: false }, legendCollapsed: '1' };
  let patch, pushed = 0;
  const context = {
    authenticate: async () => 7,
    readBody: async () => patch,
    db: { getUserPrefs: () => stored, setUserPrefs: (id, next) => { assert.equal(id, 7); stored = next; } },
    send: (res, status) => assert.equal(status, 200),
    userBadgePush: id => { assert.equal(id, 7); pushed++; },
  };
  runInNewContext(source.slice(source.indexOf('async function handleSetPrefs('), source.indexOf('async function handleUploadAvatar(')), context);
  for (patch of [{ feedFilters: { news: false } }, { feedFilters: { runs: true } }]) {
    await context.handleSetPrefs({}, {});
  }
  assert.deepEqual(JSON.parse(JSON.stringify(stored)), { feedFilters: { runs: true, news: false }, legendCollapsed: '1' });
  assert.equal(pushed, 2, 'other devices notified of each preference change');
});
