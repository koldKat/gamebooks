'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { migrate } = require('../server/migrate-reading-image-folders');

function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reading-folder-test-'));
  const directory = path.join(root, 'images'), databasePath = path.join(root, 'books.sqlite');
  fs.mkdirSync(directory);
  const db = new Database(databasePath);
  db.exec('CREATE TABLE book_sections (book_id INTEGER, html TEXT); CREATE TABLE book_frontmatter (book_id INTEGER, intro_text TEXT, rules_text TEXT)');
  const image = text => {
    const filename = `${crypto.createHash('sha256').update(text).digest('hex')}.png`;
    fs.writeFileSync(path.join(directory, filename), text);
    return filename;
  };
  try { run({ directory, databasePath, db, image }); }
  finally { db.close(); fs.rmSync(root, { recursive: true, force: true }); }
}

test('folder migration preserves URLs, shared images and unreferenced files; reruns are safe', () => fixture(({ directory, databasePath, db, image }) => {
  const shared = image('shared artwork'), orphan = image('unreferenced artwork');
  const url = id => `/api/books/${id}/reading-images/${shared}`;
  db.prepare('INSERT INTO book_sections VALUES (?, ?)').run(107, url(107));
  db.prepare('INSERT INTO book_frontmatter VALUES (?, ?, ?)').run(319, url(319), url(319));
  const before = fs.readFileSync(databasePath);
  const options = { databasePath, directory };
  assert.deepEqual(migrate(options), { references: 2, books: 2, unreferenced: 1, rootFiles: 2, removedRootFiles: 0 });
  assert.equal(fs.readFileSync(path.join(directory, '107', shared), 'utf8'), 'shared artwork');
  assert.equal(fs.readFileSync(path.join(directory, '319', shared), 'utf8'), 'shared artwork');
  assert.equal(fs.statSync(path.join(directory, '107', shared)).ino, fs.statSync(path.join(directory, '319', shared)).ino);
  assert.equal(migrate({ ...options, cleanup: true }).removedRootFiles, 2);
  assert.deepEqual(fs.readdirSync(directory).sort(), ['107', '319', '_unreferenced']);
  assert.equal(fs.readFileSync(path.join(directory, '_unreferenced', orphan), 'utf8'), 'unreferenced artwork');
  assert.equal(migrate({ ...options, cleanup: true }).removedRootFiles, 0);
  assert.deepEqual(fs.readFileSync(databasePath), before);
}));

test('missing images and corrupt destinations abort before removing flat files', () => fixture(({ directory, databasePath, db, image }) => {
  const filename = image('valid artwork');
  const missing = `${'a'.repeat(64)}.png`;
  db.prepare('INSERT INTO book_sections VALUES (?, ?)').run(107, `/api/books/107/reading-images/${missing}`);
  assert.throws(() => migrate({ databasePath, directory, cleanup: true }), /ENOENT/);
  assert.deepEqual(fs.readdirSync(directory), [filename]);
  db.prepare('UPDATE book_sections SET html = ?').run(`/api/books/107/reading-images/${filename}`);
  fs.mkdirSync(path.join(directory, '107'));
  fs.writeFileSync(path.join(directory, '107', filename), 'corrupt');
  assert.throws(() => migrate({ databasePath, directory, cleanup: true }), /hash mismatch/);
  assert.ok(fs.existsSync(path.join(directory, filename)));
}));

test('cross-book references are rejected before migration', () => fixture(({ directory, databasePath, db, image }) => {
  const filename = image('valid artwork');
  db.prepare('INSERT INTO book_sections VALUES (?, ?)').run(107, `/api/books/319/reading-images/${filename}`);
  assert.throws(() => migrate({ databasePath, directory, cleanup: true }), /Cross-book/);
  assert.deepEqual(fs.readdirSync(directory), [filename]);
}));
