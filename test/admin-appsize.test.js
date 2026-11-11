'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('admin GET returns the saved size; POST scans with current exclusions', async () => {
  const text = source('server/routes/admin.js');
  const handler = text.match(/async function handleAdminAppSize\(req, res\) \{[\s\S]*?\n\}/)[0];
  let scans = 0;
  let allowed = true;
  let response;
  const read = () => 123;
  read.refresh = async patterns => { scans++; assert.deepEqual(Array.from(patterns), ['*.zip', 'node_modules']); return 456; };
  const context = vm.createContext({ requireLocalhost: () => allowed, db: { getAdminSetting: () => '*.zip\n\n node_modules ' },
    readAppSize: read, send: (_res, status, body) => { response = { status, ...body }; } });
  vm.runInContext(handler, context);
  await context.handleAdminAppSize({ method: 'GET' }, {});
  assert.deepEqual(response, { status: 200, bytes: 123 });
  assert.equal(scans, 0);
  await context.handleAdminAppSize({ method: 'POST' }, {});
  assert.deepEqual(response, { status: 200, bytes: 456 });
  assert.equal(scans, 1);
  allowed = false;
  await context.handleAdminAppSize({ method: 'POST' }, {});
  assert.equal(scans, 1);
});

test('hourly loader suppresses duplicate requests and preserves the value on failure', async () => {
  const text = source('admin/js/dashboard.js');
  const loader = text.slice(text.indexOf('let appSizeInFlight = false;'), text.indexOf('\n}', text.indexOf('export async function loadAppSize')) + 2).replace('export ', '');
  const value = { textContent: '-' };
  const calls = [], alerts = [];
  let resolve, reject;
  const context = vm.createContext({ document: { getElementById: () => value },
    api: method => { calls.push(method); return new Promise((yes, no) => { resolve = yes; reject = no; }); },
    fmtBytes: n => `${n} B`, showAlert: message => alerts.push(message), console: { error() {} } });
  vm.runInContext(loader, context);
  const initial = context.loadAppSize();
  resolve({ bytes: 123 }); await initial;
  assert.equal(value.textContent, '123 B');
  const refresh = context.loadAppSize();
  await context.loadAppSize();
  assert.deepEqual(calls, ['GET', 'GET']);
  reject(new Error('scan failed')); await refresh;
  assert.equal(value.textContent, '123 B');
  assert.equal(alerts.length, 0);
  const retry = context.loadAppSize();
  resolve({ bytes: 456 }); await retry;
  assert.equal(value.textContent, '456 B');
});
