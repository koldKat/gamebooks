'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Load a CommonJS module with its top-level requires stubbed.
function load(file, deps) {
  const context = vm.createContext({ module: { exports: {} }, require: name => (name in deps ? deps[name] : require(name)), console, Buffer, process, Date });
  vm.runInContext(fs.readFileSync(require.resolve(file), 'utf8'), context);
  return context.module.exports;
}

function harness({ filename = 'shot.png', magic = [0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4] } = {}) {
  const calls = { created: null, status: null, payload: null, written: null };
  const routes = load('../server/routes/profile', {
    fs: { writeFileSync: (p, b) => { calls.written = { p, len: b.length }; }, existsSync: () => true, mkdirSync() {} },
    path: require('node:path'),
    '../epub-validation': require('../server/epub-validation'),
    '../db': { createAttachment: (name, original, mimeType, size, userId) => { calls.created = { name, original, mimeType, size, userId }; return 42; } },
    '../paths': { AVATARS_DIR: '/a', COVERS_DIR: '/c', BOOKS_DIR: '/b', ATTACHMENTS_DIR: '/att' },
    '../request-helpers': {
      authenticate: async () => 7, authenticateOptional: async () => 7,
      send: (res, code, body) => { calls.status = code; calls.payload = body; },
      readBody: async () => ({}), readRawBody: async () => Buffer.from(magic),
      isAllowedImage: () => true, isAllowedAttachmentType: () => true,
      ATTACHMENT_MAX: 64 * 1024 * 1024, AVATAR_UPLOAD_MAX: 256 * 1024, isLocalhost: () => false,
    },
    '../sse': { feedPush() {}, userBadgePush() {}, publicCatalogPush() {} },
    '../runtime-state': { MIME: { '.png': 'image/png', '.jpg': 'image/jpeg' } },
  });
  return { routes, calls, req: { headers: { 'x-filename': filename } } };
}

// Regression: handleUploadAttachment referenced MIME without importing it, crashing every upload.
test('handleUploadAttachment stores the upload with its detected MIME type', async () => {
  const { routes, calls, req } = harness();
  await routes.handleUploadAttachment(req, {});
  assert.equal(calls.status, 200);
  assert.equal(calls.created.mimeType, 'image/png');
  assert.equal(calls.payload.id, 42);
  assert.match(calls.payload.url, /^\/attachments\/att_7_\d+\.png$/);
  assert.equal(calls.written.len, 8);
});

test('JPEG magic bytes override the extension to .jpg', async () => {
  const { routes, calls, req } = harness({ filename: 'shot.png', magic: [0xFF, 0xD8, 0xFF, 0xE0] });
  await routes.handleUploadAttachment(req, {});
  assert.equal(calls.created.mimeType, 'image/jpeg');
  assert.match(calls.payload.url, /\.jpg$/);
});
