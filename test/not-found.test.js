'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { serveFile } = require('../server/file-transfer');
const { renderNotFoundPage, serveNotFoundPage } = require('../server/not-found');
const messages = require('../server/not-found-messages');

test('not-found templates contain 100 distinct, complete messages and a safe route home', () => {
  assert.equal(messages.length, 100);
  assert.equal(new Set(messages).size, 100);
  for (const message of messages) {
    assert.ok(message.length > 30);
    assert.ok(!/[{}<>—]/u.test(message), message);
    const html = renderNotFoundPage(message);
    assert.ok(html.includes('href="/"'));
    assert.ok(html.includes('Back to the adventure'));
    assert.ok(html.includes('noindex'));
  }
  assert.ok(renderNotFoundPage('<script>bad</script>').includes('&lt;script&gt;'));
});

test('missing pages keep status 404, while assets keep a plain-text failure', async () => {
  const request = { method: 'GET', headers: {} };
  const missing = __dirname + '/this-file-does-not-exist.html';
  const response = (options) => new Promise(resolve => {
    const res = { destroyed: false,
      writeHead(status, headers) { this.status = status; this.headers = headers; },
      end(body) { resolve({status: this.status, headers: this.headers, body}); },
    };
    serveFile(request, res, missing, {headers: {}, ...options});
  });
  const page = await response({onNotFound: (req,res) => serveNotFoundPage(req,res,()=>messages[0])});
  assert.equal(page.status, 404);
  assert.equal(page.headers['Cache-Control'], 'no-store');
  assert.match(page.headers['Content-Type'], /text\/html/);
  assert.match(page.body, /You’ve wandered off the map/);
  const asset = await response({});
  assert.equal(asset.status, 404);
  assert.equal(asset.body, 'Not found');
  let body = 'unexpected';
  serveNotFoundPage({method:'HEAD'}, {writeHead(status) {assert.equal(status,404);},end(value) {body=value;}});
  assert.equal(body, undefined);
});

test('template pool seeds once and preserves edits, removals and disabled rows', () => {
  const Database = require('better-sqlite3');
  const { initializeNotFoundTemplates } = require('../server/db/not-found-templates');
  const db = new Database(':memory:');
  try {
    initializeNotFoundTemplates(db);
    assert.equal(db.prepare('SELECT count(*) n FROM not_found_templates').get().n,100);
    db.prepare("UPDATE not_found_templates SET template='Edited by admin',active=0 WHERE id=1").run();
    db.prepare('DELETE FROM not_found_templates WHERE id=2').run();
    const before=db.prepare('SELECT * FROM not_found_templates').all();
    initializeNotFoundTemplates(db);
    assert.deepEqual(db.prepare('SELECT * FROM not_found_templates').all(),before);
  } finally {db.close();}
});
