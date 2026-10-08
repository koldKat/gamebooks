'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function load(file, deps) {
  const context = vm.createContext({ module: { exports: {} }, require: name => name in deps ? deps[name] : require(name), Date, Buffer, __dirname: path.dirname(require.resolve(file)) });
  vm.runInContext(fs.readFileSync(require.resolve(file), 'utf8'), context);
  return context.module.exports;
}
test('only the admin interface can grant or revoke moderator, with strict boolean validation', async () => {
  let allowed = false, body = { isModerator: true }, status, calls = [];
  const routes = load('../server/routes/admin', {
    '../db': { setModerator: (id, flag) => { calls.push([id, flag]); return id === 7; } },
    '../request-helpers': { requireLocalhost: () => allowed, readBody: async () => body, send: (_res, code) => { status = code; } },
    '../sse': {}, '../paths': {}, '../runtime-state': {}, '../email': {}, '../backup': { BACKUP_DIR: '/tmp/backups' },
  });
  await routes.handleAdminSetModerator({}, {}, 7); assert.equal(calls.length, 0);
  allowed = true; body = { isModerator: 'false' };
  await routes.handleAdminSetModerator({}, {}, 7); assert.equal(status, 400); assert.equal(calls.length, 0);
  for (const flag of [true, false]) {
    body = { isModerator: flag }; await routes.handleAdminSetModerator({}, {}, 7);
    assert.equal(status, 200); assert.deepEqual(calls.at(-1), [7, flag]);
  }
  await routes.handleAdminSetModerator({}, {}, 8); assert.equal(status, 404);
});
test('moderator cover uploads allow public books without library membership and reject private books before reading files', async () => {
  let book = { created_by: 1, is_public: 1 }, moderator = true, admin = false, status, reads = 0, writes = 0, saved;
  const routes = load('../server/routes/profile', {
    fs: { writeFileSync() { writes++; } },
    '../db': { isUserAdmin: () => admin, isUserModerator: () => moderator, getBookById: () => book,
      getBookState: () => null, setBookCover: (...args) => { saved = args; }, awardXp() {} },
    '../paths': { COVERS_DIR: '/tmp' }, '../epub-validation': {}, '../runtime-state': {},
    '../sse': { publicCatalogPush() {} },
    '../request-helpers': { isLocalhost: () => false, authenticate: async () => 2,
      readRawBody: async () => { reads++; return Buffer.from('image'); }, isAllowedImage: () => true,
      send: (_res, code) => { status = code; } },
  });
  await routes.handleUploadCover({}, {}, 9);
  assert.equal(status, 200); assert.equal(writes, 1); assert.equal(saved[0], 2); assert.equal(saved[1], 9); assert.equal(saved[3], true);
  for (const created_by of [1, 2]) {
    book = { created_by, is_public: 0 }; await routes.handleUploadCover({}, {}, 9);
    assert.equal(status, 404); assert.equal(reads, 1); assert.equal(writes, 1);
  }
  book = { created_by: 1, is_public: 1 }; moderator = false;
  await routes.handleUploadCover({}, {}, 9); assert.equal(status, 403); assert.equal(reads, 1);
  admin = true; book.is_public = 0;
  await routes.handleUploadCover({}, {}, 9); assert.equal(status, 200);
});

test('moderators edit public series outside their library, never private series or deletion', async () => {
  let moderator = true, admin = false, body = { name: 'Updated', description: 'Blurb', is_public: true }, status, updates = 0, removals = 0;
  const series = { id: 9, created_by: 1, is_public: 1, description: 'Old', is_open_world: false };
  const routes = load('../server/routes/books', {
    '../db': { isUserAdmin: () => admin, isUserModerator: () => moderator, getSeriesById: () => series,
      updateSeries: (id, name, description, isPublic, ow) => {
        assert.equal(id, 9); assert.equal(isPublic, true); assert.equal(ow, null);
        series.name = name; series.description = description; updates++; return true;
      },
      removeSeriesFromLibrary() { removals++; }, awardXp() {},
    },
    '../export': {},
    '../request-helpers': { authenticate: async () => 2, readBody: async () => body, send: (_res, code) => { status = code; } },
    '../sse': { feedPush() {}, publicCatalogPush() {} },
  });
  await routes.handleUpdateSeries({}, {}, 9);
  assert.equal(status, 200); assert.equal(series.name, 'Updated'); assert.equal(series.created_by, 1);
  for (const owner of [1, 2]) {
    series.created_by = owner; series.is_public = 0;
    await routes.handleUpdateSeries({}, {}, 9); assert.equal(status, 404); assert.equal(updates, 1);
  }
  series.is_public = 1; body.is_public = false;
  await routes.handleUpdateSeries({}, {}, 9); assert.equal(status, 403); assert.equal(updates, 1);
  await routes.handleDeleteSeries({ url: '/api/series/9' }, {}, 9); assert.equal(status, 403); assert.equal(removals, 0);
  moderator = false; series.created_by = 1; body.is_public = true;
  await routes.handleUpdateSeries({}, {}, 9); assert.equal(status, 403); assert.equal(updates, 1);
  admin = true; series.is_public = 0;
  await routes.handleUpdateSeries({}, {}, 9); assert.equal(status, 200); assert.equal(updates, 2);
});

test('moderator secondary anthology edits require both book and anthology to be public', async () => {
  let publicBook = true, publicAnthology = true, status, body = { book_id: 7, book_order: 2 }, mutations = 0;
  const routes = load('../server/routes/books', {
    '../db': { isUserAdmin: () => false, isUserModerator: () => true,
      getBookById: id => ({ is_public: id === 3 ? publicAnthology : publicBook }),
      addAnthologyMember: (user, anthology, book, order, authorized) => {
        assert.equal(authorized, true); mutations++; return { ok: true };
      }, removeAnthologyMember: (user, anthology, book, authorized) => {
        assert.equal(authorized, true); mutations++; return { ok: true };
      },
    }, '../export': {},
    '../request-helpers': { isLocalhost: () => false, authenticate: async () => 2,
      readBody: async () => body, send: (_res, code) => { status = code; } },
    '../sse': { feedPush() {} },
  });
  await routes.handleAddAnthologyMember({}, {}, 3); assert.equal(status, 200);
  await routes.handleRemoveAnthologyMember({}, {}, 3, 7); assert.equal(status, 200);
  assert.equal(mutations, 2);
  for (const [book, anthology] of [[false, true], [true, false], [false, false]]) {
    publicBook = book; publicAnthology = anthology;
    await routes.handleAddAnthologyMember({}, {}, 3); assert.equal(status, 404);
    await routes.handleRemoveAnthologyMember({}, {}, 3, 7); assert.equal(status, 404);
    assert.equal(mutations, 2, 'private membership remains unchanged');
  }
});
