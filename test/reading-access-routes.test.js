'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('section route rejects locked text before reading it, without affecting unlocked sections', async () => {
  const source = fs.readFileSync(require.resolve('../server/routes/books'), 'utf8');
  const handler = source.slice(source.indexOf('async function handleGetBookSection'), source.indexOf('async function handleSaveState'));
  let locked = true, reads = 0, response;
  const context = vm.createContext({ authenticate: async () => 1,
    require: () => ({ setReadingImageCookie() {} }),
    send: (req, status, body) => { response = { status, body }; },
    db: { _canLiveRead: () => true, readingAccess: { getAccess: () => ({ locked }) },
      getBookSection: () => { reads++; return { html: 'text' }; } } });
  vm.runInContext(handler, context);
  await context.handleGetBookSection({}, {}, 263, '1');
  assert.equal(response.status, 403);
  assert.equal(response.body.error, 'reading_locked');
  assert.equal(reads, 0);
  locked = false;
  await context.handleGetBookSection({}, {}, 263, '1');
  assert.equal(response.status, 200);
  assert.equal(reads, 1);
});

test('unlock endpoint authenticates and blocks impersonation', async () => {
  const source = fs.readFileSync(require.resolve('../server/routes/reading-access'), 'utf8');
  let userId = null, impersonating = false, calls = 0, status;
  const context = vm.createContext({ module: { exports: {} }, require: path => {
    if (path === '../db') return { readingAccess: { unlock: () => { calls++; return { ok: true }; } } };
    if (path === '../reading-images') return { setReadingImageCookie() {} };
    return { authenticate: async () => userId, isRequestImpersonating: () => impersonating,
      send: (req, code) => { status = code; } };
  } });
  vm.runInContext(source, context);
  const handler = context.module.exports.handleReadingAccess;
  await handler({}, {}, 263, true);
  assert.equal(calls, 0);
  userId = 1;
  impersonating = true;
  await handler({}, {}, 263, true);
  assert.equal(calls, 0);
  assert.equal(status, 403);
  impersonating = false;
  await handler({}, {}, 263, true);
  assert.equal(calls, 1);
  assert.equal(status, 200);
});

test('frontmatter previews establish the protected image cookie only after authorized access', async () => {
  let userId = null, result = null, cookies = 0, status;
  const context = vm.createContext({ module:{exports:{}}, require:name => {
    if (name==='../db') return {readingAccess:{getAccess:()=>result}};
    if (name==='../reading-images') return {setReadingImageCookie(){cookies++;}};
    if (name==='../sse') return {userBadgePush(){}};
    return {authenticate:async()=>userId,isRequestImpersonating:()=>false,send:(res,code)=>{status=code;}};
  }});
  vm.runInContext(fs.readFileSync(require.resolve('../server/routes/reading-access'),'utf8'),context);
  const handler=context.module.exports.handleReadingAccess;
  await handler({}, {}, 263);
  assert.equal(cookies,0);
  userId=1;
  await handler({}, {}, 263);
  assert.equal(status,404);
  assert.equal(cookies,0);
  result={locked:true,introText:'<p>Player matter</p>'};
  await handler({}, {}, 263);
  assert.equal(status,200);
  assert.equal(cookies,1);
});
