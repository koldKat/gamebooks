'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { gunzipSync } = require('node:zlib');
const context = vm.createContext({ module: { exports: {} }, Buffer, setInterval: () => 0, require(name) {
  if (['./db', 'geoip-lite', './impersonation-context', './request-url'].includes(name)) return {};
  return require(name);
} });
vm.runInContext(fs.readFileSync(require.resolve('../server/request-helpers'), 'utf8'), context);
const { send } = context.module.exports;
function response(body, encoding) {
  return new Promise(resolve => {
    const headers = {};
    const res = { req: { headers: { 'accept-encoding': encoding } }, setHeader: (key, value) => { headers[key] = value; },
      writeHead: (status, values) => { assert.equal(status, 200); Object.assign(headers, values); },
      end: data => resolve({ headers, data }) };
    send(res, 200, body);
  });
}
test('large JSON responses negotiate gzip without changing their contents or cache policy', async () => {
  const body = { text: 'Български текст '.repeat(500) };
  const { headers, data } = await response(body, 'br, gzip;q=0.8');
  assert.equal(headers['Content-Encoding'], 'gzip');
  assert.equal(headers['Content-Length'], data.length);
  assert.equal(headers['Cache-Control'], 'no-store');
  assert.equal(headers.Vary, 'Accept-Encoding');
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.deepEqual(JSON.parse(gunzipSync(data)), body);
  assert.ok(data.length < Buffer.byteLength(JSON.stringify(body)) / 4);
});
test('small responses and clients that refuse gzip receive plain JSON', async () => {
  for (const [body, encoding] of [[{ ok: true }, 'gzip'], [{ text: 'x'.repeat(2000) }, undefined],
    [{ text: 'x'.repeat(2000) }, 'gzip;q=0, *;q=1'], [{ text: 'x'.repeat(2000) }, 'br']]) {
    const { headers, data } = await response(body, encoding);
    assert.equal(headers['Content-Encoding'], undefined);
    assert.equal(headers['Content-Length'], Buffer.byteLength(data));
    assert.deepEqual(JSON.parse(data), body);
  }
  assert.equal((await response({ text: 'x'.repeat(2000) }, '*;q=1')).headers['Content-Encoding'], 'gzip');
});
