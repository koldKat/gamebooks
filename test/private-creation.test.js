'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Database = require('better-sqlite3');
const { migrateSeriesNames } = require('../server/db/series-schema');

function setup() {
  const deletedFiles = [];
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
      published_at INTEGER, created_at INTEGER DEFAULT 0, cover_path TEXT,
      pdf_path TEXT, epub_path TEXT, has_battle_sim INTEGER DEFAULT 0, has_live_reading INTEGER DEFAULT 0);
    CREATE TABLE user_books (user_id INTEGER, book_id INTEGER, state_data TEXT, created_at INTEGER DEFAULT 0, updated_at INTEGER, rating REAL, UNIQUE(user_id,book_id));
    CREATE TABLE book_anthology_memberships (book_id INTEGER, anthology_id INTEGER, book_order INTEGER);
    CREATE TABLE user_stashes (id INTEGER PRIMARY KEY, user_id INTEGER, name TEXT, created_at INTEGER DEFAULT 0);
    CREATE TABLE stash_books (stash_id INTEGER REFERENCES user_stashes(id) ON DELETE CASCADE, user_id INTEGER, book_id INTEGER);
    CREATE TABLE stash_series (stash_id INTEGER REFERENCES user_stashes(id) ON DELETE CASCADE, user_id INTEGER, series_id INTEGER);
    CREATE TABLE stash_excluded_books (stash_id INTEGER REFERENCES user_stashes(id) ON DELETE CASCADE, user_id INTEGER, book_id INTEGER);`);
  const connection = { db, _foldForSearch: s => s.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase(),
    _naturalCompareByName: (a, b) => a.name.localeCompare(b.name), _naturalCompare: (a, b) => String(a).localeCompare(String(b)),
    _getPdfSize: () => null, _getEpubSize: () => null };
  function load(name, deps) {
    const context = vm.createContext({ module: { exports: {} }, require: name => deps[name], Date, console,
      __dirname: require('node:path').resolve(__dirname, '../server/db') });
    let source = fs.readFileSync(require.resolve('../server/db/' + name), 'utf8');
    if (name === 'books') source = source.slice(0, source.indexOf('// One-time cleanup:')) + source.slice(source.indexOf('function getBookRating('));
    vm.runInContext(source, context);
    return context.module.exports;
  }
  const books = load('books', { './connection': connection, './xp': { awardXp() {} },
    fs: { unlinkSync: filename => deletedFiles.push(filename) }, path: require('node:path') });
  const feed = load('feed', { './connection': connection, './xp': {}, './content': {}, './books': books });
  return { db, books, feed, deletedFiles };
}

test('series contents deletion prunes orphan books and attachments but preserves other readers', () => {
  const { db, books, deletedFiles } = setup();
  try {
    db.exec(`INSERT INTO series (id,name,created_by) VALUES (1,'Fantasy Trip',1);
      INSERT INTO user_series (user_id,series_id) VALUES (1,1);
      INSERT INTO books (id,name,series_id,created_by,cover_path,pdf_path,epub_path) VALUES
        (1,'Orphan',1,1,'one.png','one.pdf','one.epub'),
        (2,'Shared',1,1,'two.png','two.pdf',NULL);
      INSERT INTO user_books (user_id,book_id,state_data) VALUES (1,1,'owner'),(1,2,'owner'),(2,2,'preserve');`);
    books.removeSeriesFromLibrary(1, 1);
    assert.equal(db.prepare('SELECT 1 FROM books WHERE id=1').get(), undefined);
    assert.equal(db.prepare('SELECT created_by FROM books WHERE id=2').get().created_by, 2);
    assert.equal(db.prepare('SELECT state_data FROM user_books WHERE user_id=2 AND book_id=2').get().state_data, 'preserve');
    assert.equal(db.prepare('SELECT count(*) AS n FROM user_books WHERE user_id=1').get().n, 0);
    assert.deepEqual(deletedFiles.map(p => require('node:path').basename(p)).sort(), ['one.epub', 'one.pdf', 'one.png']);
  } finally { db.close(); }
});

test('series contents deletion preserves primary and additional anthology memberships', () => {
  const { db, books, deletedFiles } = setup();
  try {
    db.exec(`INSERT INTO series (id,name) VALUES (1,'Series');
      INSERT INTO user_series (user_id,series_id) VALUES (1,1);
      INSERT INTO books (id,name,is_container,series_id,parent_book_id) VALUES
        (10,'Outside anthology',1,NULL,NULL),(11,'Primary child',0,1,10),(12,'Additional child',0,1,NULL);
      INSERT INTO book_anthology_memberships (book_id,anthology_id) VALUES (12,10);
      INSERT INTO user_books (user_id,book_id) VALUES (1,10),(1,11),(1,12);`);
    books.removeSeriesFromLibrary(1, 1);
    assert.equal(db.prepare('SELECT count(*) AS n FROM user_books WHERE user_id=1').get().n, 3);
    assert.equal(db.prepare('SELECT count(*) AS n FROM books').get().n, 3);
    assert.deepEqual(deletedFiles, []);
  } finally { db.close(); }
});

test('anthology contents deletion removes orphan children and their attachments', () => {
  const { db, books, deletedFiles } = setup();
  try {
    db.exec(`INSERT INTO books (id,name,is_container,parent_book_id,created_by,pdf_path) VALUES
      (1,'Anthology',1,NULL,1,'anthology.pdf'),(2,'Child',0,1,1,'child.pdf'),(3,'Shared child',0,1,1,'shared.pdf');
      INSERT INTO user_books (user_id,book_id,state_data) VALUES (1,1,'owner'),(1,2,'owner'),(1,3,'owner'),(2,3,'preserve');`);
    assert.equal(books.deleteBook(1, 1, true), true);
    assert.equal(db.prepare('SELECT count(*) AS n FROM books').get().n, 1);
    assert.equal(db.prepare('SELECT parent_book_id FROM books WHERE id=3').get().parent_book_id, null);
    assert.equal(db.prepare('SELECT state_data FROM user_books WHERE user_id=2 AND book_id=3').get().state_data, 'preserve');
    assert.deepEqual(deletedFiles.map(p => require('node:path').basename(p)).sort(), ['anthology.pdf', 'child.pdf']);
  } finally { db.close(); }
});

test('container-only deletion preserves children and files still referenced by other books', () => {
  const { db, books, deletedFiles } = setup();
  try {
    db.exec(`INSERT INTO books (id,name,is_container,parent_book_id,pdf_path,epub_path,cover_path) VALUES
      (1,'Anthology',1,NULL,'shared.pdf',NULL,'shared.png'),(2,'Child',0,1,'shared.pdf',NULL,'shared.png'),
      (3,'Standalone',0,NULL,'other.pdf','other.epub',NULL);
      INSERT INTO user_books (user_id,book_id) VALUES (1,1),(1,2),(1,3);`);
    assert.equal(books.deleteBook(1, 1, false), true);
    assert.equal(db.prepare('SELECT book_id FROM user_books WHERE book_id=2').get().book_id, 2);
    assert.equal(db.prepare('SELECT parent_book_id FROM books WHERE id=2').get().parent_book_id, null);
    assert.deepEqual(deletedFiles, []);
    assert.equal(books.deleteBook(1, 3), true);
    assert.deepEqual(deletedFiles.map(p => require('node:path').basename(p)).sort(), ['other.epub', 'other.pdf']);
  } finally { db.close(); }
});

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
  let status, response;
  const api = { ...books, isUserAdmin: () => !!options.admin, isUserModerator: () => !!options.moderator,
    getBookCreator: id => db.prepare('SELECT created_by FROM books WHERE id=?').get(id)?.created_by ?? null,
    getBookIdentifiers: () => ({ is_public: 0 }), awardXp() {},
  };
  const context = vm.createContext({ module: { exports: {} }, require(name) {
    if (name === '../db') return api;
    if (name === '../request-helpers') return { isLocalhost: () => false, authenticate: async () => options.userId,
      readBody: async () => options.body, send: (_res, code, body) => { status = code; response = body; } };
    if (name === '../sse') return { feedPush() {}, publicCatalogPush() {} };
    return {};
  } });
  vm.runInContext(fs.readFileSync(require.resolve('../server/routes/books'), 'utf8'), context);
  return { edit: async id => { await context.module.exports.handleUpdateBook({}, {}, id); return status; }, get response() { return response; } };
}

test('metadata save returns the saved book and only its owned destination series', async () => {
  const { db, books } = setup();
  try {
    db.exec('CREATE TABLE book_reading_entries (book_id INTEGER, section_id TEXT, counts_as_section INTEGER)');
    const bid = books.createBook(1, 'Original', 100).id;
    const target = books.getOrCreateSeries('Destination', 1, true);
    books.getOrCreateSeries('Unrelated', 1, true);
    const routes = editRoutes(db, books, { userId: 1, body: { name: 'Saved', total_sections: 100,
      is_public: false, series_name: 'Destination', series_number: '2' } });
    assert.equal(await routes.edit(bid), 200);
    assert.equal(routes.response.book.id, bid);
    assert.equal(routes.response.book.name, 'Saved');
    assert.equal(routes.response.book.series_id, target);
    assert.equal(routes.response.book.series_name, 'Destination');
    assert.equal(routes.response.book.series_number, '2');
    assert.equal(routes.response.series.id, target);
    assert.equal(routes.response.series.is_owner, true);
    assert.equal(books.getAllSeries(1, target).length, 1);
    assert.equal(books.getAllSeries(2, target).length, 0, 'private unrelated memberships are not returned');
  } finally { db.close(); }
});

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

test('database facade exposes the numbering helper used by book updates', () => {
  const {db, books} = setup();
  try {
    const source = fs.readFileSync(require.resolve('../server/db'), 'utf8');
    const imports = source.match(/const \{([^}]+)\} = require\('\.\/db\/books'\);/);
    assert.ok(imports, 'book persistence import declaration');
    const exports = source.slice(source.lastIndexOf('module.exports = {'));
    assert.match(exports, /\bgetBookNumberingMinimum\b/, 'helper must be public, not just imported');
    const context = vm.createContext({module: {exports: {}}, require: () => books});
    vm.runInContext(imports[0] + '\nmodule.exports = {getBookNumberingMinimum};', context);
    assert.equal(context.module.exports.getBookNumberingMinimum, books.getBookNumberingMinimum);
    assert.equal(context.module.exports.getBookNumberingMinimum({total_sections: 10}, 12), 12);
  } finally { db.close(); }
});

test('prefixed imported passages preserve their independent numeric maximum on edit', async () => {
  const { db, books } = setup();
  try {
    db.exec('CREATE TABLE book_reading_entries (book_id INTEGER, section_id TEXT, counts_as_section INTEGER); CREATE TABLE book_sections (book_id INTEGER, section_id TEXT)');
    const book = books.createBook(1, 'Lettered book', 7, null, null, null, null, null, null, null, null, false, null, null, true, 5);
    db.prepare('UPDATE books SET has_live_reading=1 WHERE id=?').run(book.id);
    const add = db.prepare('INSERT INTO book_sections VALUES(?,?)');
    for (const id of ['1', '2', '3', '4', '5', 'у0', 'р1', 'intro']) add.run(book.id, id);
    const options = { userId: 1, body: { name: 'Lettered book', total_sections: 7, is_public: true, max_section_number: 5 } };
    const routes = editRoutes(db, books, options);
    assert.equal(await routes.edit(book.id), 200);
    assert.equal(books.getBookById(book.id).max_section_number, 5);
    options.body.max_section_number = 4; assert.equal(await routes.edit(book.id), 400);
    options.body.total_sections = 6; assert.equal(await routes.edit(book.id), 400, 'imported numeric labels stay protected even if total is reduced');
    options.body.max_section_number = 5; options.body.total_sections = 8;
    assert.equal(await routes.edit(book.id), 400, 'lettered allowance cannot grow from client input');
    options.body.max_section_number = 6; assert.equal(await routes.edit(book.id), 200);
    db.prepare('DELETE FROM book_sections WHERE section_id=?').run('р1');
    assert.equal(books.getBookNumberingMinimum(books.getBookById(book.id), 8), 7, 'allowance requires imported prefixed rows');
  } finally { db.close(); }
});

test('empty container creation does not publish a covers refresh, but ordinary children still do', async () => {
  let body, status;
  const catalog = [], feed = [], rewards = [];
  const context = vm.createContext({ module: { exports: {} }, require(name) {
    if (name === '../db') return {
      createSeries: () => ({ id: 10, name: body.name, existed: false }),
      createBook: () => ({ id: 11 }),
      awardXp: (...args) => rewards.push(args),
    };
    if (name === '../request-helpers') return { authenticate: async () => 1, readBody: async () => body, send: (_res, code) => { status = code; } };
    if (name === '../sse') return { feedPush: event => feed.push(event), publicCatalogPush: event => catalog.push(event) };
    return {};
  } });
  vm.runInContext(fs.readFileSync(require.resolve('../server/routes/books'), 'utf8'), context);
  body = { name: 'Empty series', is_public: true };
  await context.module.exports.handleCreateSeries({}, {});
  assert.equal(status, 200);
  assert.equal(catalog.length, 0);
  assert.ok(rewards.some(row => row[1] === 'create_series'));
  body = { name: 'Empty anthology', is_public: true, is_container: 1 };
  await context.module.exports.handleCreateBook({}, {});
  assert.equal(status, 200);
  assert.equal(catalog.length, 0);
  assert.equal(feed.length, 2, 'library/feed events remain unchanged');
  body = { name: 'First child', total_sections: 10, is_public: true, parent_book_id: 11 };
  await context.module.exports.handleCreateBook({}, {});
  assert.equal(catalog.length, 1, 'adding the first public child publishes the catalog change');
  assert.equal(catalog[0].action, 'create');
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

test('moderators can edit their own private books, and moderate only other public books', async () => {
  const { db, books } = setup();
  try {
    db.exec('CREATE TABLE book_reading_entries (book_id INTEGER, section_id TEXT, counts_as_section INTEGER)');
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
    options.body.is_public = false;
    assert.equal(await routes.edit(4), 200, 'creator rights are preserved for a Lorekeeper’s own private book');
    assert.equal(books.getBookById(4).is_public, 0, 'metadata edit keeps the book private');
    options.body.is_public = false;
    assert.equal(await routes.edit(1), 403);
    assert.equal(books.getBookById(1).is_public, 1);
    options.body.is_public = true; options.moderator = false;
    assert.equal(await routes.edit(1), 404, 'revoked role loses edit access');
    options.admin = true;
    assert.equal(await routes.edit(2), 200, 'admin private-book editing is preserved');
  } finally { db.close(); }
});

test('library removal permits moderators and admins without metadata edit checks', async () => {
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
  assert.equal(status, 200); assert.equal(mutations, 2);
  admin = true;
  await context.module.exports.handleDeleteBook({ url: '/api/books/1' }, {}, 1);
  assert.equal(status, 200); assert.equal(mutations, 4);
});

test('book and anthology metadata permissions cover role, creator and visibility combinations', async () => {
  const { db, books } = setup();
  try {
    db.exec('CREATE TABLE book_reading_entries (book_id INTEGER, section_id TEXT, counts_as_section INTEGER)');
    let id = 100;
    for (const role of ['player', 'moderator', 'admin']) {
      for (const owner of [1, 2]) for (const isPublic of [false, true]) for (const isContainer of [false, true]) {
        const bookId = id++, count = isContainer ? 0 : 199;
        db.prepare('INSERT INTO books(id,name,created_by,is_public,is_container,total_sections) VALUES(?,?,?,?,?,?)')
          .run(bookId, 'Original', owner, Number(isPublic), Number(isContainer), count);
        db.prepare('INSERT INTO user_books(user_id,book_id,state_data) VALUES(2,?,?)').run(bookId, '{}');
        const options = { userId: 2, moderator: role === 'moderator', admin: role === 'admin',
          body: { name: 'Edited', total_sections: count, is_container: isContainer, is_public: isPublic } };
        const routes = editRoutes(db, books, options);
        const allowed = role === 'admin' || owner === 2 || (role === 'moderator' && isPublic);
        assert.equal(await routes.edit(bookId), allowed ? 200 : 404, `${role} creator=${owner} public=${isPublic} anthology=${isContainer}`);
        assert.equal(books.getBookById(bookId).name, allowed ? 'Edited' : 'Original');
        assert.equal(books.getBookById(bookId).is_public, Number(isPublic), 'saving metadata retains the chosen visibility');
      }
    }
  } finally { db.close(); }
});

test('removing another creator’s book affects only the requesting library and keeps creator files', () => {
  const { db, books, deletedFiles } = setup();
  try {
    db.exec(`INSERT INTO books (id,name,created_by,is_public,pdf_path,cover_path) VALUES
      (1,'OWT 1',1,1,'one.pdf','one.png'),(2,'The Legion of Shadow',1,1,'two.pdf','two.png');
      INSERT INTO user_books(user_id,book_id,state_data) VALUES
      (1,1,'creator progress'),(2,1,'player progress'),(2,2,'last reader');`);
    const before = db.prepare('SELECT * FROM books ORDER BY id').all();
    assert.equal(books.deleteBook(2, 1), true);
    assert.equal(db.prepare('SELECT state_data FROM user_books WHERE user_id=1 AND book_id=1').get().state_data, 'creator progress');
    assert.equal(db.prepare('SELECT 1 FROM user_books WHERE user_id=2 AND book_id=1').get(), undefined);
    assert.equal(books.deleteBook(2, 2), true, 'last reader can remove another creator’s book');
    assert.equal(db.prepare('SELECT count(*) AS n FROM user_books WHERE user_id=2').get().n, 0);
    assert.deepEqual(db.prepare('SELECT * FROM books ORDER BY id').all(), before);
    assert.deepEqual(deletedFiles, []);
    assert.equal(books.deleteBook(2, 1), false, 'repeat removal does not touch the creator’s account');
  } finally { db.close(); }
});

test('OWT stash removal cannot resurrect removed books or retain stale stash memberships', () => {
  const { db, books } = setup();
  try {
    db.exec(`INSERT INTO books(id,name,created_by) VALUES (11,'OWT 1',1),(12,'OWT 2',1),(13,'OWT 3',1);
      INSERT INTO user_books(user_id,book_id,state_data) VALUES
      (1,11,'creator1'),(1,12,'creator2'),(1,13,'creator3'),(2,11,'player1'),(2,12,'player2'),(2,13,'player3');`);
    const creator = books.createStash(1, 'Creator stash', [11, 12, 13]);
    const player = books.createStash(2, 'OWT', [11, 12, 13], [], [12]);
    assert.ok(creator.ok && player.ok);
    assert.equal(books.deleteBook(2, 13), true);
    assert.equal(books.deleteBook(2, 12), true);
    assert.deepEqual(Array.from(books.getStashes(2)[0].bookIds), [11]);
    assert.deepEqual(Array.from(books.getStashes(2)[0].excludedBookIds), []);
    assert.equal(books.deleteStash(2, player.id), true);
    assert.deepEqual(db.prepare('SELECT book_id FROM user_books WHERE user_id=2').all(), [{ book_id: 11 }]);
    assert.equal(books.deleteBook(2, 11), true);
    assert.equal(db.prepare('SELECT count(*) AS n FROM user_books WHERE user_id=1').get().n, 3);
    assert.deepEqual(Array.from(books.getStashes(1)[0].bookIds), [11, 12, 13]);
  } finally { db.close(); }
});

for (const cascade of [false, true]) {
  test(`removing a series clears only that player's stash links, cascade=${cascade}`, () => {
    const { db, books } = setup();
    try {
      db.exec(`INSERT INTO series(id,name,created_by) VALUES (7,'OWT',1);
        INSERT INTO user_series(user_id,series_id) VALUES (1,7),(2,7);
        INSERT INTO books(id,name,series_id,created_by) VALUES (11,'OWT 1',7,1);
        INSERT INTO user_books(user_id,book_id,state_data) VALUES (1,11,'creator'),(2,11,'player');`);
      assert.ok(books.createStash(1, 'Creator stash', [], [7]).ok);
      assert.ok(books.createStash(2, 'Player stash', [], [7]).ok);
      if (cascade) books.removeSeriesFromLibrary(2, 7);
      else books.removeSeriesEntryOnly(2, 7);
      assert.deepEqual(Array.from(books.getStashes(2)[0].seriesIds), []);
      assert.deepEqual(Array.from(books.getStashes(1)[0].seriesIds), [7]);
      assert.equal(db.prepare('SELECT count(*) AS n FROM user_books WHERE user_id=2').get().n, cascade ? 0 : 1);
      assert.equal(db.prepare('SELECT state_data FROM user_books WHERE user_id=1').get().state_data, 'creator');
      assert.equal(db.prepare('SELECT series_id FROM books WHERE id=11').get().series_id, 7);
    } finally { db.close(); }
  });
}

test('anthology removal includes secondary members and requires ownership of the library entry', () => {
  const { db, books, deletedFiles } = setup();
  try {
    db.exec(`INSERT INTO books(id,name,created_by,is_container,parent_book_id) VALUES
      (10,'Anthology',1,1,NULL),(11,'Primary',1,0,10),(12,'Secondary',1,0,NULL);
      INSERT INTO book_anthology_memberships(book_id,anthology_id) VALUES (12,10);
      INSERT INTO user_books(user_id,book_id,state_data) VALUES
      (1,10,'creator'),(1,11,'creator'),(1,12,'creator'),(2,11,'player'),(2,12,'player');`);
    const before = db.prepare('SELECT * FROM books ORDER BY id').all();
    assert.equal(books.deleteBook(2, 10, true), false);
    assert.equal(db.prepare('SELECT count(*) AS n FROM user_books WHERE user_id=2').get().n, 2);
    db.prepare('INSERT INTO user_books(user_id,book_id) VALUES (2,10)').run();
    assert.equal(books.deleteBook(2, 10, true), true);
    assert.equal(db.prepare('SELECT count(*) AS n FROM user_books WHERE user_id=2').get().n, 0);
    assert.equal(db.prepare('SELECT count(*) AS n FROM user_books WHERE user_id=1').get().n, 3);
    assert.deepEqual(db.prepare('SELECT * FROM books ORDER BY id').all(), before);
    assert.deepEqual(deletedFiles, []);
  } finally { db.close(); }
});
