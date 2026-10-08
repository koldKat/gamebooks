'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Database = require('better-sqlite3');
const { migrateSeriesNames } = require('../server/db/series-schema');

function setup() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, avatar_path TEXT, public_profile INTEGER, is_moderator INTEGER DEFAULT 0);
    INSERT INTO users (id,username) VALUES (1,'Owner'),(2,'Other');
    CREATE TABLE series (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
      description TEXT, created_by INTEGER REFERENCES users(id), created_at INTEGER DEFAULT 0,
      is_public INTEGER DEFAULT 0, published_at INTEGER, is_open_world INTEGER DEFAULT 0);
    CREATE TABLE user_series (user_id INTEGER REFERENCES users(id), series_id INTEGER REFERENCES series(id) ON DELETE CASCADE, added_at INTEGER DEFAULT 0, rating REAL, UNIQUE(user_id,series_id));
    CREATE TABLE books (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, total_sections INTEGER DEFAULT 10, max_section_number INTEGER, discoverable_sections INTEGER, updated_at INTEGER,
      isbn TEXT, issn TEXT, asin TEXT, pages INTEGER, authors TEXT, description TEXT, created_by INTEGER,
      series_id INTEGER REFERENCES series(id) ON DELETE SET NULL, series_number TEXT,
      is_container INTEGER DEFAULT 0, parent_book_id INTEGER, book_order INTEGER, is_public INTEGER DEFAULT 0,
      published_at INTEGER, created_at INTEGER DEFAULT 0, is_demo INTEGER DEFAULT 0, cover_path TEXT,
      pdf_path TEXT, epub_path TEXT, has_battle_sim INTEGER DEFAULT 0, has_live_reading INTEGER DEFAULT 0);
    CREATE TABLE user_books (user_id INTEGER, book_id INTEGER, state_data TEXT, updated_at INTEGER, rating REAL, UNIQUE(user_id,book_id));
    CREATE TABLE book_anthology_memberships (book_id INTEGER, anthology_id INTEGER, book_order INTEGER);`);
  const connection = { db, _foldForSearch: s => s.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase(),
    _naturalCompareByName: (a, b) => a.name.localeCompare(b.name), _naturalCompare: (a, b) => String(a).localeCompare(String(b)),
    _getPdfSize: () => null, _getEpubSize: () => null };
  function load(name, deps) {
    const context = vm.createContext({ module: { exports: {} }, require: name => deps[name], Date });
    let source = fs.readFileSync(require.resolve('../server/db/' + name), 'utf8');
    if (name === 'books') source = source.slice(0, source.indexOf('// One-time cleanup:')) + source.slice(source.indexOf('function getBookRating('));
    vm.runInContext(source, context);
    return context.module.exports;
  }
  const books = load('books', { './connection': connection, './xp': { awardXp() {} } });
  const feed = load('feed', { './connection': connection, './xp': {}, './content': {}, './books': books });
  return { db, books, feed };
}

test('series migration preserves IDs, foreign keys, metadata, indexes, triggers and sequence', () => {
  const { db } = setup();
  try {
    db.exec(`INSERT INTO series (id,name,description,created_by,is_public,is_open_world) VALUES (5,'Secret','Kept',1,0,1),(100,'Deleted',1,1,0,0);
      DELETE FROM series WHERE id = 100;
      INSERT INTO user_series (user_id,series_id) VALUES (1,5);
      INSERT INTO books (name,series_id) VALUES ('Child',5);
      CREATE INDEX series_owner_idx ON series(created_by);
      CREATE TABLE edits (series_id INTEGER);
      CREATE TRIGGER series_edits AFTER UPDATE ON series BEGIN INSERT INTO edits VALUES (new.id); END;`);
    assert.equal(migrateSeriesNames(db), true);
    assert.equal(migrateSeriesNames(db), false, 'migration is idempotent');
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
    assert.equal(db.prepare('SELECT series_id FROM user_series').get().series_id, 5);
    assert.equal(db.prepare('SELECT series_id FROM books').get().series_id, 5);
    assert.deepEqual(db.prepare('SELECT description,is_open_world FROM series WHERE id=5').get(), { description: 'Kept', is_open_world: 1 });
    const duplicate = db.prepare("INSERT INTO series (name,created_by) VALUES ('Secret',2)").run();
    assert.equal(duplicate.lastInsertRowid, 101, 'deleted IDs cannot be reused');
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name='series_owner_idx'").get());
    db.exec("UPDATE series SET description='Updated' WHERE id=5");
    assert.equal(db.prepare('SELECT series_id FROM edits').get().series_id, 5);
    db.exec('DELETE FROM series WHERE id=5');
    assert.equal(db.prepare('SELECT count(*) AS n FROM user_series').get().n, 0);
    assert.equal(db.prepare('SELECT series_id FROM books').get().series_id, null);
  } finally { db.close(); }
});

test('hidden private series cannot appear in suggestions or be reused when creating or assigning a series', () => {
  const { db, books } = setup();
  try {
    db.exec("INSERT INTO series (id,name,created_by) VALUES (1,'Secret',1); INSERT INTO user_series (user_id,series_id) VALUES (1,1)");
    migrateSeriesNames(db);
    assert.equal(books.getSeriesAutocomplete(2).length, 0);
    assert.equal(books.getSeriesAutocomplete().length, 0);
    assert.equal(books.getSeriesAutocomplete(1)[0].id, 1);
    const created = books.createSeries('Secret', 'My description', 2, true);
    assert.equal(created.existed, false);
    assert.notEqual(created.id, 1);
    assert.equal(db.prepare('SELECT description,is_public FROM series WHERE id=1').get().description, null);
    assert.equal(db.prepare('SELECT is_public FROM series WHERE id=1').get().is_public, 0);
    assert.equal(db.prepare('SELECT 1 FROM user_series WHERE user_id=2 AND series_id=1').get(), undefined);
    assert.equal(books.createSeries('SECRET', null, 2).id, created.id, 'visible matching series can be reused');
    assert.equal(books.createSeries('Secret', null, 1).id, 1, 'own private match is preferred over another public match');
    const published = books.createSeries('Published', null, 1, true);
    books.createSeries('Published', 'Do not change another creator', 2);
    assert.equal(db.prepare('SELECT description FROM series WHERE id=?').get(published.id).description, null);
    db.exec("INSERT INTO series (name,created_by) VALUES ('Another secret',1)");
    const linked = books.getOrCreateSeries('Another secret', 2, true);
    assert.equal(db.prepare('SELECT created_by FROM series WHERE id=?').get(linked).created_by, 2);
    assert.equal(books.getOrCreateSeries('ANOTHER SECRET', 2, true), linked);
    assert.equal(books.getSeriesAutocomplete().length, 2, 'guests see public entries only');
  } finally { db.close(); }
});

test('public catalogs and anthology metadata exclude private groups and private children', () => {
  const { db, books, feed } = setup();
  try {
    db.exec(`INSERT INTO series (id,name,created_by,is_public) VALUES (1,'Private series',1,0),(2,'Public series',1,1);
      INSERT INTO books (id,name,is_container,is_public,parent_book_id,series_id) VALUES
      (1,'Private anthology',1,0,NULL,2),(2,'Public child',0,1,1,NULL),
      (3,'Public anthology',1,1,NULL,2),(4,'Private child',0,0,3,NULL),
      (5,'Published child',0,1,3,NULL),(6,'Private book',0,0,NULL,NULL),
      (7,'Public book in private series',0,1,NULL,1),(8,'Private extra child',0,0,NULL,NULL);
      INSERT INTO book_anthology_memberships VALUES (8,3,1),(7,1,1); UPDATE books SET created_by=1;`);
    const catalog = feed.getAllPublicBooks();
    assert.deepEqual(Array.from(catalog, b => b.id), [3,7]);
    const anthology = catalog.find(b => b.id === 3);
    assert.deepEqual(Array.from(anthology.childNames), ['Published child']);
    assert.equal(anthology.totalSections, 10);
    assert.equal(catalog.find(b => b.id === 7).seriesName, null);
    assert.equal(catalog.find(b => b.id === 7).seriesId, null);
    assert.equal(feed.getBookActivity(7).book.maxSectionNumber, 10, 'catalog edit metadata exposes the default maximum');
    assert.equal(feed.getBookActivity(7).book.secondaryAnthologies.length, 0, 'private secondary anthology names stay hidden');
    assert.equal(feed.getPublicBookMeta(4), null, 'public parent does not publish a private child');
    assert.equal(feed.getPublicBookMeta(1), null);
    assert.equal(feed.getBookActivity(1), null);
    assert.equal(feed.getBookActivity(1, 2), null);
    assert.equal(feed.getBookActivity(1, 1).book.name, 'Private anthology', 'creator can still inspect their private book');
    assert.deepEqual(Array.from(feed.getBookActivity(3).book.children, b => b.id), [5]);
    assert.equal(feed.getPublicBookMeta(2).parentName, null, 'private parent name is hidden');
    assert.deepEqual(Array.from(feed.getPublicBookMeta(3).children, b => b.id), [5]);
    assert.deepEqual(Array.from(books.getPublicSeriesInfo(2).books, b => b.id), [3]);
    assert.equal(feed.getAllPublicAnthologies()[0].childCount, 1);
    assert.equal(books.addBookToLibrary(2, 1).reason, 'not_public');
    const newBook = books.createBook(2, 'Private book', 10, null, null, null, null, null, null, null, null, false, null, null, true);
    const newAnthology = books.createBook(2, 'Private anthology', 0, null, null, null, null, null, null, null, null, true, null, null, true);
    assert.notEqual(newBook.id, 6, 'book creation never substitutes a hidden book');
    assert.notEqual(newAnthology.id, 1, 'anthology creation never substitutes a hidden anthology');
    assert.equal(db.prepare('SELECT is_public FROM books WHERE id=1').get().is_public, 0);
  } finally { db.close(); }
});

test('adding a series by ID rejects a private series before any mutation or event', async () => {
  let isPublic = 0, mutations = 0, status;
  const context = vm.createContext({ module: { exports: {} }, require(name) {
    if (name === '../db') return { getSeriesById: () => ({ id: 1, is_public: isPublic, created_by: 1 }),
      addSeriesToLibrary: () => mutations++, awardXp: () => mutations++ };
    if (name === '../request-helpers') return { authenticate: async () => 2, send: (_res, code) => { status = code; } };
    if (name === '../sse') return { feedPush: () => mutations++ };
    return {};
  } });
  vm.runInContext(fs.readFileSync(require.resolve('../server/routes/books'), 'utf8'), context);
  await context.module.exports.handleAddSeriesToLibrary({}, {}, 1);
  assert.equal(status, 404); assert.equal(mutations, 0);
  isPublic = 1;
  await context.module.exports.handleAddSeriesToLibrary({}, {}, 1);
  assert.equal(status, 200); assert.equal(mutations, 3);
});

test('failed schema migration rolls back completely and restores foreign key enforcement', () => {
  const { db } = setup();
  try {
    db.exec("INSERT INTO series (id,name,created_by) VALUES (1,'Original',1)");
    const wrapper = { prepare: sql => db.prepare(sql), pragma: (...args) => db.pragma(...args),
      transaction: fn => db.transaction(fn), exec: sql => {
        if (sql.startsWith('ALTER TABLE')) throw new Error('simulated migration failure');
        return db.exec(sql);
      } };
    assert.throws(() => migrateSeriesNames(wrapper), /simulated migration failure/);
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
    assert.equal(db.prepare('SELECT name FROM series WHERE id=1').get().name, 'Original');
    assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name='series_name_migration'").get(), undefined);
    assert.throws(() => db.exec("INSERT INTO series (name,created_by) VALUES ('Original',2)"), /UNIQUE/);
  } finally { db.close(); }
});

test('migration preserves the sequence when the old series table is empty', () => {
  const { db } = setup();
  try {
    db.exec("INSERT INTO series (id,name,created_by) VALUES (100,'Deleted',1); DELETE FROM series;");
    migrateSeriesNames(db);
    assert.equal(db.prepare("INSERT INTO series (name,created_by) VALUES ('New',1)").run().lastInsertRowid, 101);
  } finally { db.close(); }
});

function editRoutes(db, books, options) {
  let status;
  const api = { ...books, isUserAdmin: () => !!options.admin, isUserModerator: () => !!options.moderator,
    getBookCreator: id => db.prepare('SELECT created_by FROM books WHERE id=?').get(id)?.created_by ?? null,
    getBookIdentifiers: () => ({ is_public: 0 }), awardXp() {},
  };
  const context = vm.createContext({ module: { exports: {} }, require(name) {
    if (name === '../db') return api;
    if (name === '../request-helpers') return { isLocalhost: () => false, authenticate: async () => options.userId,
      readBody: async () => options.body, send: (_res, code) => { status = code; } };
    if (name === '../sse') return { feedPush() {}, publicCatalogPush() {} };
    return {};
  } });
  vm.runInContext(fs.readFileSync(require.resolve('../server/routes/books'), 'utf8'), context);
  return { edit: async id => { await context.module.exports.handleUpdateBook({}, {}, id); return status; } };
}

test('rejected metadata edits cannot create series or library memberships', async () => {
  const { db, books } = setup();
  try {
    db.exec("INSERT INTO books (id,name,created_by) VALUES (1,'Book',1); INSERT INTO user_books (user_id,book_id,state_data) VALUES (2,1,'{}')");
    const routes = editRoutes(db, books, { userId: 2, body: { name: 'Book', total_sections: 10, series_name: 'Unwanted series' } });
    assert.equal(await routes.edit(1), 404);
    assert.equal(await routes.edit(999), 404);
    assert.equal(db.prepare('SELECT count(*) AS n FROM series').get().n, 0);
    assert.equal(db.prepare('SELECT count(*) AS n FROM user_series').get().n, 0);
  } finally { db.close(); }
});

test('admin edits keep an unchanged private series link instead of creating another series', async () => {
  const { db, books } = setup();
  try {
    db.exec("INSERT INTO series (id,name,created_by) VALUES (1,'Private series',1); INSERT INTO books (id,name,created_by,series_id) VALUES (1,'Book',1,1); INSERT INTO user_books (user_id,book_id,state_data) VALUES (1,1,'{}')");
    migrateSeriesNames(db);
    const options = { userId: 2, admin: true, body: { name: 'Edited book', total_sections: 10, series_name: 'Private series' } };
    const routes = editRoutes(db, books, options);
    assert.equal(await routes.edit(1), 200);
    assert.equal(db.prepare('SELECT series_id FROM books WHERE id=1').get().series_id, 1);
    assert.equal(db.prepare('SELECT count(*) AS n FROM series').get().n, 1);
    assert.equal(db.prepare('SELECT count(*) AS n FROM user_series').get().n, 0);
    options.body.series_name = 'New series';
    assert.equal(await routes.edit(1), 200);
    assert.notEqual(db.prepare('SELECT series_id FROM books WHERE id=1').get().series_id, 1);
    assert.equal(db.prepare('SELECT count(*) AS n FROM series').get().n, 2);
  } finally { db.close(); }
});

test('sparse section numbering round-trips through creation, shared state, library additions and edits', async () => {
  const { db, books, feed } = setup();
  try {
    db.exec('CREATE TABLE book_reading_entries (book_id INTEGER, section_id TEXT, counts_as_section INTEGER)');
    const book = books.createBook(1, 'Sparse book', 420, null, null, null, null, null, null, null, null, false, null, null, true, 1003);
    assert.equal(book.total_sections, 420);
    assert.equal(book.max_section_number, 1003);
    assert.equal(feed.getBookActivity(book.id).book.maxSectionNumber, 1003);
    assert.equal(books.getBookState(1, book.id).maxSectionNumber, 1003);
    assert.equal(books.addBookToLibrary(2, book.id).ok, true);
    const progress = { totalSections: 1003, maxSectionNumber: 420, graph: { 1003: { choices: [0] } }, playthroughs: [{ path: [1, 1003] }] };
    books.saveBookState(2, book.id, progress);
    const loaded = books.getBookState(2, book.id);
    assert.equal(loaded.totalSections, 420, 'shared count overrides stale saves');
    assert.equal(loaded.maxSectionNumber, 1003, 'shared maximum overrides stale saves');
    assert.equal(loaded.playthroughs[0].path[1], 1003);
    const options = { userId: 1, body: { name: 'Sparse book', total_sections: 420, is_public: true } };
    const routes = editRoutes(db, books, options);
    assert.equal(await routes.edit(book.id), 200);
    assert.equal(books.getBookById(book.id).max_section_number, 1003, 'omitted maximum is preserved');
    for (const invalid of [419, 1003.5, '1003', -1, 0, Number.MAX_SAFE_INTEGER + 1]) {
      options.body.max_section_number = invalid;
      assert.equal(await routes.edit(book.id), 400, String(invalid));
      assert.equal(books.getBookById(book.id).max_section_number, 1003);
    }
    options.body.max_section_number = 1100;
    assert.equal(await routes.edit(book.id), 200);
    assert.equal(books.getBookState(2, book.id).maxSectionNumber, 1100, 'other readers receive metadata changes');
    options.body.max_section_number = null;
    options.body.total_sections = 1100;
    assert.equal(await routes.edit(book.id), 200);
    assert.equal(books.getBookState(2, book.id).maxSectionNumber, 1100, 'explicit null defaults to the total');
    assert.equal(books.getBookState(2, book.id).playthroughs[0].path[1], 1003, 'metadata edits preserve progress');
  } finally { db.close(); }
});

test('create route accepts a separate maximum and rejects invalid values before creating a series', async () => {
  let body, status, created, seriesCalls = 0;
  const context = vm.createContext({ module: { exports: {} }, require(name) {
    if (name === '../db') return { createBook: (...args) => { created = args; return { id: 1 }; }, awardXp() {}, getOrCreateSeries: () => { seriesCalls++; return 1; } };
    if (name === '../request-helpers') return { authenticate: async () => 1, readBody: async () => body, send: (_res, code) => { status = code; } };
    if (name === '../sse') return { feedPush() {}, publicCatalogPush() {} };
    return {};
  } });
  vm.runInContext(fs.readFileSync(require.resolve('../server/routes/books'), 'utf8'), context);
  for (const max of [419, 1003.5, '1003', 0]) {
    body = { name: 'Book', total_sections: 420, max_section_number: max, series_name: 'Series' };
    await context.module.exports.handleCreateBook({}, {});
    assert.equal(status, 400);
    assert.equal(seriesCalls, 0);
    assert.equal(created, undefined);
  }
  for (const max of [1003, null, undefined]) {
    body = { name: 'Book', total_sections: 420, max_section_number: max };
    await context.module.exports.handleCreateBook({}, {});
    assert.equal(status, 200);
    assert.equal(created[2], 420);
    assert.equal(created[15], max ?? 420);
  }
});

test('moderators edit public metadata without tracking it, but cannot edit private books or unpublish', async () => {
  const { db, books } = setup();
  try {
    db.exec(`INSERT INTO books (id,name,created_by,is_public) VALUES (1,'Public',1,1),(2,'Private',1,0),(3,'Orphan public',1,1),(4,'Own private',2,0);
      INSERT INTO user_books (user_id,book_id,state_data) VALUES (1,1,'{"graph":{"9":{"choices":[10]}}}'),(1,2,'{}'),(2,4,'{}');`);
    const original = db.prepare('SELECT state_data FROM user_books WHERE user_id=1 AND book_id=1').get().state_data;
    const options = { userId: 2, moderator: true, body: { name: 'Corrected', total_sections: 10, is_public: true } };
    const routes = editRoutes(db, books, options);
    assert.equal(await routes.edit(1), 200);
    assert.equal(books.getBookById(1).name, 'Corrected');
    assert.equal(db.prepare('SELECT created_by FROM books WHERE id=1').get().created_by, 1);
    assert.equal(db.prepare('SELECT state_data FROM user_books WHERE user_id=1 AND book_id=1').get().state_data, original);
    assert.equal(db.prepare('SELECT count(*) AS n FROM user_books WHERE user_id=2 AND book_id=1').get().n, 0);
    assert.equal(await routes.edit(3), 200, 'public books with no library rows can still be moderated');
    assert.equal(await routes.edit(2), 404);
    assert.equal(await routes.edit(4), 404, 'moderators cannot edit even their own private books');
    options.body.is_public = false;
    assert.equal(await routes.edit(1), 403);
    assert.equal(books.getBookById(1).is_public, 1);
    options.body.is_public = true; options.moderator = false;
    assert.equal(await routes.edit(1), 404, 'revoked role loses edit access');
    options.admin = true;
    assert.equal(await routes.edit(2), 200, 'admin private-book editing is preserved');
  } finally { db.close(); }
});

test('moderator book deletion is refused before any delete or metadata side effect', async () => {
  let moderator = true, admin = false, status, mutations = 0;
  const context = vm.createContext({ module: { exports: {} }, require(name) {
    if (name === '../db') return { isUserAdmin: () => admin, isUserModerator: () => moderator,
      getBookIdentifiers: () => { mutations++; return {}; }, deleteBook: () => { mutations++; return true; } };
    if (name === '../request-helpers') return { authenticate: async () => 2, send: (_res, code) => { status = code; } };
    if (name === '../sse') return { feedPush() {} };
    return {};
  }, URL });
  vm.runInContext(fs.readFileSync(require.resolve('../server/routes/books'), 'utf8'), context);
  await context.module.exports.handleDeleteBook({ url: '/api/books/1' }, {}, 1);
  assert.equal(status, 403); assert.equal(mutations, 0);
  admin = true;
  await context.module.exports.handleDeleteBook({ url: '/api/books/1' }, {}, 1);
  assert.equal(status, 200); assert.equal(mutations, 2);
});
