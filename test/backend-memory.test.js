'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { EventEmitter } = require('node:events');
const { PassThrough, Readable } = require('node:stream');
const { gunzipSync } = require('node:zlib');
const { execFileSync } = require('node:child_process');
const { createGeoLookup } = require('../server/geoip');
const { receiveUpload, isPdfFile, serveFile } = require('../server/file-transfer');
const { writeEvent, maintainStream, MAX_QUEUED_BYTES } = require('../server/sse-transport');

function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'backend-memory-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('GeoIP loads no full database and agrees with existing IPv4/IPv6 country/city results', () => {
  const output = execFileSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    const before = process.memoryUsage().arrayBuffers;
    const lean = require('./server/geoip');
    const addresses = ['8.8.8.8','1.1.1.1','208.67.222.222','93.184.216.34',
      '2001:4860:4860::8888','2606:4700:4700::1111','::ffff:8.8.8.8','10.0.0.1',
      '172.16.0.1','172.31.255.255','192.168.1.1','127.0.0.1','::1','not an IP'];
    let seed = 12345;
    for (let i = 0; i < 500; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      addresses.push([seed >>> 24, seed >>> 16 & 255, seed >>> 8 & 255, seed & 255].join('.'));
    }
    const actual = addresses.map(ip => lean.lookup(ip));
    assert.ok(process.memoryUsage().arrayBuffers - before < 1024 * 1024);
    const original = require('geoip-lite');
    addresses.forEach((ip, i) => {
      const expected = original.lookup(ip);
      assert.deepEqual(actual[i], expected ? {country:expected.country,city:expected.city} : null, ip);
    });
    lean.reloadDataSync();
    console.log('matching lookups; under 1 MiB of added buffers');
  `], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' });
  assert.match(output, /matching lookups/);
});

test('GeoIP tolerates absent data, supports country fallback and refreshes cached values', t => {
  const directory = temporary(t);
  const geo = createGeoLookup({ dataDir: directory, maxEntries: 2 });
  t.after(geo.reloadDataSync);
  assert.equal(geo.lookup('8.8.8.8'), null);
  const row = Buffer.alloc(10);
  row.writeUInt32BE(0x08080800, 0); row.writeUInt32BE(0x080808ff, 4); row.write('US', 8);
  fs.writeFileSync(path.join(directory, 'geoip-country.dat'), row);
  geo.reloadDataSync();
  assert.deepEqual(geo.lookup('8.8.8.8'), { country: 'US', city: '' });
  row.write('BG', 8);
  fs.writeFileSync(path.join(directory, 'geoip-country.dat'), row);
  assert.equal(geo.lookup('8.8.8.8').country, 'US');
  geo.reloadDataSync();
  assert.equal(geo.lookup('8.8.8.8').country, 'BG');
});

test('SSE permits transient backpressure but closes an excessively queued client', () => {
  const response = new EventEmitter();
  response.writableLength = 16 * 1024;
  const sent = [];
  response.write = data => { sent.push(data); return false; };
  response.destroy = () => { response.destroyed = true; response.emit('close'); };
  let removed = 0;
  maintainStream(response, () => removed++, 30_000);
  assert.equal(writeEvent(response, 'data: update\n\n'), true);
  assert.equal(removed, 0);
  response.writableLength = MAX_QUEUED_BYTES;
  assert.equal(writeEvent(response, 'data: update\n\n'), false);
  assert.equal(removed, 1);
  assert.equal(writeEvent(response, 'another'), false);
  response.emit('close');
  assert.equal(removed, 1);
  assert.deepEqual(sent, ['data: update\n\n']);
});

test('SSE close/error cancels ping work and unregisters only once', async () => {
  const response = new EventEmitter();
  let sent = 0, removed = 0;
  response.writableLength = 0;
  response.write = () => { sent++; return true; };
  response.destroy = () => { response.destroyed = true; response.emit('close'); };
  maintainStream(response, () => removed++, 5);
  response.emit('error', new Error('socket failed'));
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(sent, 0);
  assert.equal(removed, 1);
});

test('upload streams to disk, validates before publishing and cleans up invalid/oversized bodies', async t => {
  const directory = temporary(t);
  const file = path.join(directory, 'book.pdf');
  for (const [chunks, headers, code] of [
    [[Buffer.from('%PDF body')], {}, null],
    [[Buffer.from('bad')], {}, 'INVALID_FILE'],
    [[Buffer.alloc(9), Buffer.alloc(9)], {}, 'PAYLOAD_TOO_LARGE'],
    [[], {}, 'EMPTY_BODY'],
    [[Buffer.from('%PDF body')], { 'content-length': '100' }, 'PAYLOAD_TOO_LARGE'],
  ]) {
    const request = Readable.from(chunks); request.headers = headers;
    const operation = receiveUpload(request, file, { maxBytes: 16, validateFile: isPdfFile });
    if (code) await assert.rejects(operation, { code });
    else assert.equal(await operation, 9);
    assert.deepEqual(fs.readdirSync(directory), ['book.pdf']);
    assert.equal(fs.readFileSync(file, 'utf8'), '%PDF body');
  }
});

test('interrupted uploads remove partial files without replacing an existing book', async t => {
  const directory = temporary(t), filename = path.join(directory, 'book.pdf');
  fs.writeFileSync(filename, 'previous');
  const request = new PassThrough(); request.headers = {};
  const operation = receiveUpload(request, filename, { maxBytes: 100, validateFile: isPdfFile });
  request.write('%PDF partial'); request.emit('aborted');
  await assert.rejects(operation, { code: 'UPLOAD_ABORTED' });
  assert.deepEqual(fs.readdirSync(directory), ['book.pdf']);
  assert.equal(fs.readFileSync(filename, 'utf8'), 'previous');
});

test('real HTTP uploads stream large files and return 413 for both declared and chunked overflow', async t => {
  const directory = temporary(t), filename = path.join(directory, 'received.pdf');
  const server = http.createServer(async (req, res) => {
    try {
      const bytes = await receiveUpload(req, filename, { maxBytes: 4 * 1024 * 1024, validateFile: isPdfFile });
      res.writeHead(200); res.end(String(bytes));
    } catch (error) {
      res.writeHead(error.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400); res.end(error.code);
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const send = (count, headers) => new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port: server.address().port, method: 'POST', headers }, res => {
      let text = ''; res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, text }));
    });
    request.on('error', reject);
    const chunk = Buffer.alloc(64 * 1024); chunk.write('%PDF');
    function pump() {
      while (count-- > 0) {
        if (!request.write(chunk)) { request.once('drain', pump); return; }
      }
      request.end();
    }
    pump();
  });
  const success = await send(64, { 'content-length': String(4 * 1024 * 1024) });
  assert.deepEqual(success, { status: 200, text: String(4 * 1024 * 1024) });
  assert.equal(fs.statSync(filename).size, 4 * 1024 * 1024);
  assert.equal((await send(65, {})).status, 413);
  assert.equal((await send(1, { 'content-length': String(5 * 1024 * 1024) })).status, 413);
  assert.deepEqual(fs.readdirSync(directory), ['received.pdf']);
  assert.equal(fs.statSync(filename).size, 4 * 1024 * 1024);
});

test('PDF/EPUB routes preserve permissions and award rewards only after a successful first upload', async () => {
  const vm = require('node:vm');
  const routePath = require.resolve('../server/routes/profile');
  const moduleRequire = require('node:module').createRequire(routePath);
  for (const type of ['Pdf', 'Epub']) for (const scenario of ['forbidden', 'invalid', 'oversized', 'empty', 'aborted', 'first', 'replacement']) {
    const calls = [];
    const errors = { invalid: 'INVALID_FILE', oversized: 'PAYLOAD_TOO_LARGE', empty: 'EMPTY_BODY', aborted: 'UPLOAD_ABORTED' };
    const deps = {
      '../db': { getUserById: () => ({ is_admin: scenario !== 'forbidden' }),
        getBookById: () => ({ [type.toLowerCase() + '_path']: scenario === 'replacement' ? 'old' : null }),
        ['setBook' + type]: () => calls.push('save'), ['award' + type + 'Xp']: () => calls.push('xp') },
      '../paths': { BOOKS_DIR: '/books' }, '../sse': {}, '../runtime-state': {},
      '../request-helpers': { isLocalhost: () => false, authenticate: async () => 1,
        send: (_res, status) => calls.push(status) },
      '../file-transfer': { receiveUpload: async () => {
        calls.push('upload');
        if (errors[scenario]) throw Object.assign(new Error(scenario), { code: errors[scenario] });
      } },
    };
    const context = vm.createContext({ module: { exports: {} }, require: name => Object.hasOwn(deps, name) ? deps[name] : moduleRequire(name), Date });
    vm.runInContext(fs.readFileSync(routePath, 'utf8'), context);
    await context.module.exports['handleUpload' + type]({}, {}, 42);
    const expected = { forbidden: [403], invalid: ['upload', 415], oversized: ['upload', 413],
      empty: ['upload', 400], aborted: ['upload'], first: ['upload', 'save', 'xp', 200], replacement: ['upload', 'save', 200] };
    assert.deepEqual(calls, expected[scenario], type + ': ' + scenario);
  }
});

test('static streaming preserves content/gzip/HEAD and detects same-size modifications with ETags', async t => {
  const directory = temporary(t), filename = path.join(directory, 'asset.txt');
  const data = 'a'.repeat(100_000);
  fs.writeFileSync(filename, data);
  const server = http.createServer((req, res) => serveFile(req, res, filename, {
    headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-cache' }, gzip: true, etagCache: new Map(),
  }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const request = (headers = {}, method = 'GET') => new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port: server.address().port, headers, method }, res => {
      const chunks = []; res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data: Buffer.concat(chunks) }));
      res.on('error', reject);
    }).on('error', reject);
  });
  const plain = await request();
  assert.equal(plain.data.toString(), data);
  assert.equal(plain.headers['content-length'], String(data.length));
  const zipped = await request({ 'accept-encoding': 'gzip' });
  assert.equal(zipped.headers['content-encoding'], 'gzip');
  assert.equal(gunzipSync(zipped.data).toString(), data);
  const refused = await request({ 'accept-encoding': 'gzip;q=0, *;q=1' });
  assert.equal(refused.headers['content-encoding'], undefined);
  assert.equal((await request({}, 'HEAD')).data.length, 0);
  assert.equal((await request({ 'if-none-match': plain.headers.etag })).status, 304);
  await new Promise(resolve => setTimeout(resolve, 5));
  fs.writeFileSync(filename, 'b'.repeat(data.length));
  const changed = await request({ 'if-none-match': plain.headers.etag });
  assert.equal(changed.status, 200);
  assert.notEqual(changed.headers.etag, plain.headers.etag);
  fs.unlinkSync(filename);
  assert.equal((await request()).status, 404);
});
