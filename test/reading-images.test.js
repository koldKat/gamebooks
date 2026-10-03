'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');
const { externalizeImages, storeImage, MAX_BYTES } = require('../server/reading-image-storage');

test('small JPEG, GIF and WebP imports are stored as actual PNG, not renamed originals', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'reading-images-format-test-'));
  try {
    for (const format of ['jpeg', 'gif', 'webp']) {
      const source = spawnSync('nice', ['-n', '10', 'convert', '-size', '8x8', 'xc:white', `${format}:-`]);
      assert.equal(source.status, 0, source.stderr.toString());
      const filename = storeImage(format, source.stdout.toString('base64'), directory);
      assert.match(filename, /^[a-f0-9]{64}\.png$/);
      const data = fs.readFileSync(path.join(directory, filename));
      assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      assert.ok(data.length <= MAX_BYTES);
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('oversized images use PNG palette fallback and refuse uncapped output', () => {
  const calls = [], writes = [];
  let fits = true;
  const context = vm.createContext({ Buffer, process, __dirname: '/app/server', module: { exports: {} }, require: name => {
    if (name === 'fs') return { mkdirSync() {}, writeFileSync(file, data) { writes.push({ file, bytes: data.length }); } };
    if (name === 'child_process') return { spawnSync(command, args) {
      calls.push({ command, args });
      return { status: 0, stdout: Buffer.alloc(fits && args.includes('-colors') ? 100 : MAX_BYTES + 1) };
    } };
    return require(name);
  } });
  vm.runInContext(fs.readFileSync(require.resolve('../server/reading-image-storage'), 'utf8'), context);
  const oversized = Buffer.alloc(MAX_BYTES + 1).toString('base64');
  assert.match(context.module.exports.storeImage('png', oversized), /\.png$/);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.command === 'nice' && call.args.at(-1) === 'png:-'));
  assert.equal(writes[0].bytes, 100);
  fits = false;
  assert.throws(() => context.module.exports.storeImage('png', oversized), /within 256 KB/);
  assert.equal(writes.length, 1);
});

test('external images preserve surrounding prose, deduplicate, and cap size', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'reading-images-test-'));
  try {
    const image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
    const html = `<p>Keep this.</p><img src="data:image/png;base64,${image}"><a href="#section-13">13</a>`;
    const result = externalizeImages(html, 107, directory);
    assert.match(result, /^<p>Keep this\.<\/p><img src="\/api\/books\/107\/reading-images\/[a-f0-9]{64}\.png"><a href="#section-13">13<\/a>$/);
    externalizeImages(html, 319, directory);
    assert.equal(fs.readdirSync(directory).length, 1);
    assert.ok(fs.statSync(path.join(directory, fs.readdirSync(directory)[0])).size <= MAX_BYTES);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('image endpoint checks authentication, unlock, and book ownership before reading files', async () => {
  let userId = null, locked = true, referenced = false, reads = 0, status, authorization;
  const context = vm.createContext({ __dirname: '/app/server', module: { exports: {} }, require: name => {
    if (name === 'fs') return { promises: { readFile: async () => { reads++; return Buffer.from('image'); } } };
    if (name === 'path') return path;
    if (name === './db/connection') return { db: { prepare: () => ({ get: () => referenced }) } };
    if (name === './db') return { _canLiveRead: () => true, readingAccess: { getAccess: () => ({ locked }) } };
    return { authenticate: async req => { authorization = req.headers.authorization; return userId; }, isLocalhostReal: () => false, tokenFromReq: req => req.headers.authorization,
      send: (res, code) => { status = code; } };
  } });
  vm.runInContext(fs.readFileSync(require.resolve('../server/reading-images'), 'utf8'), context);
  const handler = context.module.exports.handleReadingImage;
  const request = { headers: {} }, response = { writeHead(code) { status = code; }, end() {} };
  const filename = `${'a'.repeat(64)}.png`;
  await handler(request, response, 107, filename);
  assert.equal(reads, 0);
  userId = 1;
  await handler(request, response, 107, filename);
  assert.equal(status, 403);
  locked = false;
  await handler(request, response, 107, filename);
  assert.equal(status, 404);
  assert.equal(reads, 0);
  referenced = true;
  await handler(request, response, 107, filename);
  assert.equal(status, 200);
  assert.equal(reads, 1);
  await handler({ headers: { cookie: 'other=value; reading_image_session=secret%2Btoken' } }, response, 107, filename);
  assert.equal(authorization, 'Bearer secret+token');
  assert.equal(reads, 2);
  await handler(request, response, 107, '../escape.png');
  assert.equal(status, 404);
  assert.equal(reads, 2);
});
