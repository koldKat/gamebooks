'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture(cached, { full = false } = {}) {
  const local = new Map([['books_list_v1', cached], ['token', 'real-token']]);
  const session = new Map([['demoActive', '1'], ['other', 'preserve']]);
  let writes = 0;
  const context = vm.createContext({
    localStorage: {
      getItem: key => local.get(key), removeItem: key => local.delete(key),
      setItem: (key, value) => { if (full) throw new Error('Quota exceeded'); writes++; local.set(key, value); },
    },
    sessionStorage: { removeItem: key => session.delete(key) },
  });
  vm.runInContext(fs.readFileSync(require.resolve('../public/js/boot/retire-sample-cache.js'), 'utf8').replace(/^export /gm, ''), context);
  return { retire: context.retireSampleCache, local, session, writes: () => writes };
}

test('startup cache cleanup removes flagged samples while keeping real books, credentials and other session data', () => {
  const h = fixture(JSON.stringify([{ id: 1, name: 'Renamed sample', is_demo: 1 },
    { id: 2, name: 'Demo Book', is_demo: 0 }, { id: 3, name: 'Real book' }]));
  h.retire();
  assert.deepEqual(JSON.parse(h.local.get('books_list_v1')), [{ id: 2, name: 'Demo Book' }, { id: 3, name: 'Real book' }]);
  assert.equal(h.local.get('token'), 'real-token');
  assert.equal(h.session.has('demoActive'), false);
  assert.equal(h.session.get('other'), 'preserve');
  h.retire();
  assert.equal(h.writes(), 1, 'already-clean caches are not rewritten');
});

test('full storage invalidates stale sample cache; malformed or unavailable storage never blocks startup', () => {
  const full = fixture('[{"id":1,"is_demo":1}]', { full: true });
  assert.doesNotThrow(full.retire);
  assert.equal(full.local.has('books_list_v1'), false);
  for (const cached of ['broken', '{}', '[null,"legacy",3]']) assert.doesNotThrow(fixture(cached).retire);
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(require.resolve('../public/js/boot/retire-sample-cache.js'), 'utf8').replace(/^export /gm, ''), context);
  assert.doesNotThrow(context.retireSampleCache);
});
