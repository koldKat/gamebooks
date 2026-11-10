'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('book streams isolate accounts/books and exclude only the originating page', () => {
  const context = vm.createContext({ module: { exports: {} }, require: name => {
    if (name === './db') return { setXpFeedHook() {}, setAppXpHook() {} };
    if (name === './sse-transport') return { writeEvent: (res, data) => res.push(JSON.parse(data.slice(6))) };
    throw Error(name);
  } });
  vm.runInContext(fs.readFileSync(require.resolve('../server/sse'), 'utf8'), context);
  const { bookStreamRegister, bookStreamPush } = context.module.exports;
  const desktop = [], mobile = [], tab = [], otherBook = [], otherAccount = [];
  const cleanups = [
    bookStreamRegister(1, 7, 'desktop', desktop), bookStreamRegister(1, 7, 'mobile', mobile),
    bookStreamRegister(1, 7, 'tab', tab), bookStreamRegister(1, 8, 'otherBook', otherBook),
    bookStreamRegister(2, 7, 'otherAccount', otherAccount),
  ];
  bookStreamPush(1, 7, 'desktop', { type: 'state_updated', bookId: 7 });
  assert.equal(desktop.length, 0); assert.equal(mobile.length, 1); assert.equal(tab.length, 1);
  assert.equal(otherBook.length, 0); assert.equal(otherAccount.length, 0);
  bookStreamPush(1, 7, 'mobile', { type: 'positions_updated', bookId: 7 });
  assert.equal(desktop.length, 1); assert.equal(mobile.length, 1); assert.equal(tab.length, 2);
  cleanups.forEach(stop => stop());
  bookStreamPush(1, 7, '', { type: 'state_updated', bookId: 7 });
  assert.equal(desktop.length, 1); assert.equal(tab.length, 2);
});

test('a solo tracked book can subscribe, but a book outside the library cannot', async () => {
  const writes = [], registrations = [], cleanups = [];
  let tracked = true;
  const context = vm.createContext({ module: { exports: {} }, URL, require: name => {
    if (name === '../db') return { getSession: () => ({ user_id: 1 }), getPartyForBook: () => null, getBookState: () => tracked ? {} : null };
    if (name === '../request-helpers') return { tokenFromReq: () => null, send: (_res, status) => writes.push(status) };
    if (name === '../sse') return { bookStreamRegister: (...args) => { registrations.push(args.slice(0, 3)); return () => cleanups.push(true); } };
    if (name === '../sse-transport') return { maintainStream: (_res, cleanup) => cleanup() };
    return {};
  } });
  vm.runInContext(fs.readFileSync(require.resolve('../server/routes/books'), 'utf8'), context);
  const handler = context.module.exports.handleGetBookStream;
  const req = { url: '/api/books/7/stream?token=test&client=desktop' };
  const res = { writeHead: status => writes.push(status), write() {} };
  await handler(req, res, 7);
  assert.deepEqual(writes, [200]); assert.deepEqual(registrations, [[1, 7, 'desktop']]);
  assert.equal(cleanups.length, 1);
  tracked = false; await handler(req, res, 7);
  assert.deepEqual(writes, [200, 404]); assert.equal(registrations.length, 1);
});
