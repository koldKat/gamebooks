'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Database = require('better-sqlite3');
const { migrateBookFiles } = require('../server/migrate-book-files');
const { legacyBookDownload } = require('../server/book-files');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'book-folders-'));
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE books(id INTEGER PRIMARY KEY,pdf_path TEXT,epub_path TEXT,name TEXT);
    CREATE TABLE user_books(book_id INTEGER,state_data TEXT);
    INSERT INTO books VALUES(1,'one.pdf','one.epub','One'),(2,'one.pdf',NULL,'Shared');
    INSERT INTO user_books VALUES(1,'preserved run');`);
  for (const file of ['one.pdf', 'one.epub', 'unreferenced.pdf']) fs.writeFileSync(path.join(directory, file), file);
  t.after(() => { db.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  return { db, directory };
}

test('staging preserves original bytes, shared files, unrelated fields and runs; cleanup is repeatable', t => {
  const { db, directory } = fixture(t);
  const original = fs.statSync(path.join(directory, 'one.pdf'));
  assert.deepEqual(migrateBookFiles(db, directory), { stagedFiles: 3, updatedReferences: 3, removedFlatFiles: 0 });
  assert.deepEqual(db.prepare('SELECT * FROM books ORDER BY id').all(), [
    { id: 1, pdf_path: 'pdfs/one.pdf', epub_path: 'epubs/one.epub', name: 'One' },
    { id: 2, pdf_path: 'pdfs/one.pdf', epub_path: null, name: 'Shared' },
  ]);
  assert.equal(db.prepare('SELECT state_data FROM user_books').get().state_data, 'preserved run');
  assert.equal(fs.statSync(path.join(directory, 'pdfs/one.pdf')).ino, original.ino);
  assert.equal(fs.readFileSync(path.join(directory, 'epubs/one.epub'), 'utf8'), 'one.epub');
  assert.equal(fs.readFileSync(path.join(directory, 'pdfs/unreferenced.pdf'), 'utf8'), 'unreferenced.pdf');
  assert.equal(migrateBookFiles(db, directory).updatedReferences, 0);
  assert.equal(migrateBookFiles(db, directory, { cleanup: true }).removedFlatFiles, 3);
  assert.deepEqual(fs.readdirSync(directory).sort(), ['epubs', 'pdfs']);
  assert.equal(migrateBookFiles(db, directory, { cleanup: true }).removedFlatFiles, 0);
  assert.equal(legacyBookDownload('/books/one.pdf', directory), path.join(directory, 'pdfs/one.pdf'));
  assert.equal(legacyBookDownload('/books/one.epub', directory), path.join(directory, 'epubs/one.epub'));
  for (const url of ['/books/../one.pdf', '/books/..\\one.pdf', '/books/pdfs/one.pdf', '/books/no.pdf', '/other/one.pdf'])
    assert.equal(legacyBookDownload(url, directory), null);
});

test('destination conflict leaves the original and database paths untouched', t => {
  const { db, directory } = fixture(t);
  fs.mkdirSync(path.join(directory, 'pdfs'));
  fs.writeFileSync(path.join(directory, 'pdfs/one.pdf'), 'conflicting bytes');
  assert.throws(() => migrateBookFiles(db, directory, { cleanup: true }), /Conflicting destination/);
  assert.equal(db.prepare('SELECT pdf_path FROM books WHERE id=1').get().pdf_path, 'one.pdf');
  assert.equal(fs.readFileSync(path.join(directory, 'one.pdf'), 'utf8'), 'one.pdf');
});

test('missing sources and concurrent database edits cannot partially update book paths', t => {
  const { db, directory } = fixture(t);
  fs.unlinkSync(path.join(directory, 'one.epub'));
  assert.throws(() => migrateBookFiles(db, directory), /Missing book file/);
  assert.equal(db.prepare('SELECT pdf_path FROM books WHERE id=1').get().pdf_path, 'one.pdf');
  fs.writeFileSync(path.join(directory, 'one.epub'), 'one.epub');
  db.exec("CREATE TRIGGER reject_path BEFORE UPDATE ON books WHEN NEW.id=2 BEGIN SELECT RAISE(ABORT,'blocked'); END");
  assert.throws(() => migrateBookFiles(db, directory, { cleanup: true }), /blocked/);
  assert.equal(db.prepare('SELECT pdf_path FROM books WHERE id=1').get().pdf_path, 'one.pdf');
  assert.ok(fs.existsSync(path.join(directory, 'one.pdf')));
});

test('PDF uploads save and return the organized relative path without changing XP behavior', async () => {
  const vm = require('node:vm');
  const routePath = require.resolve('../server/routes/profile');
  const realRequire = require('node:module').createRequire(routePath);
  const calls = [];
  const validate = () => true;
  const dependencies = {
    '../sse': {},
    '../runtime-state': {},
    '../paths': { BOOKS_DIR: '/books' },
    '../db': { getBookById: () => ({ pdf_path: 'existing.pdf' }),
      setBookPdf: (id, file) => { assert.equal(id, 42); assert.match(file, /^pdfs\/42_\d+\.pdf$/); calls.push('saved'); },
      awardPdfXp: () => assert.fail('Replacing a PDF must not award first-upload XP'),
      getUserById: () => ({ is_admin: 1 }) },
    '../request-helpers': { isLocalhost: () => false, authenticate: async () => 1,
      send: (_res, status, body) => { assert.equal(status, 200); assert.match(body.pdfUrl, /^\/books\/pdfs\/42_\d+\.pdf$/); calls.push('sent'); } },
    '../file-transfer': { isPdfFile: validate, receiveUpload: async (_req, file, options) => {
      assert.match(file, /^\/books\/pdfs\/42_\d+\.pdf$/); assert.equal(options.validateFile, validate); calls.push('uploaded');
    } },
  };
  const context = vm.createContext({ module: { exports: {} }, Buffer, Date,
    require: name => Object.hasOwn(dependencies, name) ? dependencies[name] : realRequire(name) });
  vm.runInContext(fs.readFileSync(routePath, 'utf8'), context);
  await context.module.exports.handleUploadPdf({}, {}, 42);
  assert.deepEqual(calls, ['uploaded', 'saved', 'sent']);
});
