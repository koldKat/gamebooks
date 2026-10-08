'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { deflateRawSync } = require('node:zlib');
const { isEpub } = require('../server/epub-validation');

function archive(entries) {
  const files = [], directory = [];
  let offset = 0;
  for (const [name, content, method = 0] of entries) {
    const filename = Buffer.from(name), data = Buffer.from(content);
    const packed = method === 8 ? deflateRawSync(data) : data;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(method, 8);
    local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(filename.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 6); central.writeUInt16LE(method, 10);
    central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
    files.push(local, filename, packed); directory.push(central, filename);
    offset += local.length + filename.length + packed.length;
  }
  const end = Buffer.alloc(22), listing = Buffer.concat(directory);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(listing.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...files, listing, end]);
}
const container = ['META-INF/container.xml', '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>', 8];

test('accepts standard EPUB metadata and compressed mimetype with trailing newline', () => {
  for (const method of [0, 8]) {
    assert.equal(isEpub(archive([['mimetype', 'application/epub+zip', method], container])), true);
    assert.equal(isEpub(archive([['mimetype', 'application/epub+zip\r\n', method], container])), true);
  }
});
test('finds EPUB metadata beyond the first 100 bytes', () => {
  assert.equal(isEpub(archive([['cover.jpg', 'x'.repeat(200)], container, ['mimetype', 'application/epub+zip', 8]])), true);
});
test('rejects ordinary ZIPs, misleading marker strings and missing or invalid container metadata', () => {
  for (const entries of [ [['note.txt', 'application/epub+zip']], [['mimetype', 'application/epub+zip']],
    [['mimetype', 'application/zip'], container], [['mimetype', 'application/epub+zip'], ['META-INF/container.xml', 'not XML']],
    [['mimetype', 'application/epub+zip'], ['mimetype', 'application/epub+zip'], container] ]) {
    assert.equal(isEpub(archive(entries)), false);
  }
});
test('rejects truncated archives, invalid offsets, encryption and oversized metadata', () => {
  const good = archive([['mimetype', 'application/epub+zip', 8], container]);
  for (let length = 0; length < good.length; length++) assert.equal(isEpub(good.subarray(0, length)), false);
  const badOffset = Buffer.from(good); badOffset.writeUInt32LE(0xffffffff, badOffset.length - 6);
  assert.equal(isEpub(badOffset), false);
  const encrypted = Buffer.from(good); encrypted.writeUInt16LE(1, encrypted.indexOf(Buffer.from('504b0102', 'hex')) + 8);
  assert.equal(isEpub(encrypted), false);
  assert.equal(isEpub(archive([['mimetype', 'application/epub+zip' + ' '.repeat(10000), 8], container])), false);
});

test('EPUB upload accepts compressed metadata and rejects invalid files before saving or awarding XP', async () => {
  const fs = require('node:fs'), vm = require('node:vm');
  const routePath = require.resolve('../server/routes/profile');
  const routeRequire = require('node:module').createRequire(routePath);
  for (const valid of [true, false]) {
    const calls = [];
    const deps = {
      fs: { writeFileSync: () => calls.push('write') },
      '../db': { getBookById: () => ({}), setBookEpub: () => calls.push('save'), awardEpubXp: () => calls.push('xp') },
      '../paths': { BOOKS_DIR: '/books' },
      '../request-helpers': { isLocalhost: () => false, authenticate: async () => 1,
        readRawBody: async () => valid ? archive([['mimetype', 'application/epub+zip\r\n', 8], container]) : Buffer.from('not an EPUB'),
        send: (_, code) => calls.push(code) },
      '../sse': {}, '../runtime-state': {},
    };
    deps['../db'].getUserById = () => ({ is_admin: 1 });
    const context = vm.createContext({ module: { exports: {} }, require: name => Object.hasOwn(deps, name) ? deps[name] : routeRequire(name), Buffer, Date });
    vm.runInContext(fs.readFileSync(routePath, 'utf8'), context);
    await context.module.exports.handleUploadEpub({}, {}, 42);
    assert.deepEqual(calls, valid ? ['write', 'save', 'xp', 200] : [415]);
  }
});
