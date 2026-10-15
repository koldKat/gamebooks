import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../../server/routes/books.js', import.meta.url), 'utf8');
const handler = source.slice(source.indexOf('async function handleGetBookSection('), source.indexOf('async function handleSaveState('));

test('reading section routes decode encoded lettered IDs once and preserve ordinary IDs', async () => {
  for (const [input, expected] of [['1', '1'], ['А1', 'А1'], ['%D0%901', 'А1'], ['%D0%9125', 'Б25'], ['map-5', 'map-5'], ['%2520', '%20']]) {
    let received, status, cookie = false;
    const context = { authenticate: async () => 1, send: (_req, code) => { status = code; },
      db: { _canLiveRead: () => true, readingAccess: { getAccess: () => ({ locked: false }) },
        getBookSection: (id, section) => { assert.equal(id, 706); received = section; return { html: '<p>Text</p>', choices: [] }; } },
      require: () => ({ setReadingImageCookie: () => { cookie = true; } }) };
    runInNewContext(handler, context);
    await context.handleGetBookSection({}, {}, 706, input);
    assert.equal(received, expected); assert.equal(status, 200); assert.equal(cookie, true);
  }
});

test('reading section routes reject malformed escapes rather than throwing or querying', async () => {
  let status;
  const context = { authenticate: async () => 1, send: (_req, code) => { status = code; },
    db: { getBookSection() { throw Error('Must not query'); } } };
  runInNewContext(handler, context);
  await context.handleGetBookSection({}, {}, 706, '%E0%A4');
  assert.equal(status, 400);
});
