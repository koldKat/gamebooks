'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { serveFile } = require('../server/file-transfer');
const { renderNotFoundPage, serveNotFoundPage, isDocumentNavigation } = require('../server/not-found');
const messages = require('../server/not-found-messages');

test('direct visits to missing assets use the themed page while embedded assets and APIs do not', () => {
  const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
  const source = fs.readFileSync(require.resolve('../server/static'), 'utf8');
  let options;
  const context = vm.createContext({ROOT:path.resolve('public'), path, MIME:{'.jpg':'image/jpeg'},
    legacyBookDownload:() => null, addSecurityHeaders() {}, getEtagCache:() => new Map(),
    serveNotFoundPage, isDocumentNavigation, serveFile(req,res,file,input) {options=input;}});
  vm.runInContext(source.slice(source.indexOf('function serveStatic('), source.indexOf('function serveRobots(')), context);
  for (const [url, headers, themed] of [
    ['/covers/missing.jpg', {'sec-fetch-dest':'document'}, true],
    ['/covers/missing.jpg', {'sec-fetch-dest':'iframe'}, true],
    ['/covers/missing.jpg', {'sec-fetch-dest':'frame'}, true],
    ['/covers/missing.jpg', {accept:'text/html,application/xhtml+xml,*/*;q=0.8'}, true],
    ['/covers/missing.jpg', {'sec-fetch-dest':'image',accept:'image/avif,image/webp,*/*'}, false],
    ['/covers/missing.jpg', {'sec-fetch-dest':'image',accept:'text/html'}, false],
    ['/js/missing.js', {'sec-fetch-dest':'script'}, false],
    ['/api/missing.jpg', {'sec-fetch-dest':'document'}, false],
  ]) {
    context.serveStatic({url,method:'GET',headers}, {});
    assert.equal(options.onNotFound === serveNotFoundPage, themed, url + JSON.stringify(headers));
  }
});

test('missing admin pages and direct asset visits use the same themed 404 after access checks', () => {
  const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
  const source = fs.readFileSync(require.resolve('../server/routes/admin'), 'utf8');
  let allowed=true, themed=0, plain=0;
  const context=vm.createContext({PROJECT_ROOT:path.resolve('.'),path,
    fs:{readFile(filename,callback) {callback(Error('ENOENT'));}},
    requireLocalhost:() => allowed, addAdminSecurityHeaders() {}, isDocumentNavigation,
    serveNotFoundPage() {themed++;}});
  vm.runInContext(source.slice(source.indexOf('function serveAdminFile('),source.indexOf('function serveAdminPanel(')),context);
  const response={writeHead(status) {assert.equal(status,404);},end(body) {assert.equal(body,'Not found');plain++;}};
  context.serveAdminFile({headers:{}},response,'missing.html');
  context.serveAdminFile({headers:{'sec-fetch-dest':'document'}},response,'missing.js');
  assert.equal(themed,2);
  context.serveAdminFile({headers:{'sec-fetch-dest':'script'}},response,'missing.js');
  assert.equal(plain,1);
  allowed=false;
  context.serveAdminFile({headers:{'sec-fetch-dest':'document'}},response,'missing.html');
  assert.equal(themed,2,'themed response must not bypass admin access control');
});

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
