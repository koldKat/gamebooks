'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Database = require('better-sqlite3');

test('setup returns open the book rules without creating a counted section', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`CREATE TABLE book_sections (book_id INTEGER, section_id TEXT, html TEXT, choices TEXT);
      CREATE TABLE book_frontmatter (book_id INTEGER, rules_text TEXT);
      INSERT INTO book_frontmatter VALUES (708, '<h3>Rules</h3><p>Choose your attributes.</p>');`);
    const source = fs.readFileSync(require.resolve('../server/db/books'), 'utf8');
    const begin = source.indexOf('function getBookSection(');
    const end = source.indexOf('\nfunction getBookNumberingMinimum(', begin);
    assert.ok(begin >= 0 && end > begin);
    const read = vm.runInNewContext(`(${source.slice(begin, end)})`, { db });
    const plain = value => JSON.parse(JSON.stringify(value));

    assert.deepEqual(plain(read(708, 'rules')), {
      html: '<h3>Rules</h3><p>Choose your attributes.</p>', choices: [],
    });
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM book_sections').get().count, 0);
    assert.equal(read(709, 'rules'), null);
    assert.equal(read(708, 'missing'), null);

    db.prepare('INSERT INTO book_sections VALUES (?, ?, ?, ?)')
      .run(708, 'rules', '<p>A real named passage.</p>', '[12]');
    assert.deepEqual(plain(read(708, 'rules')), { html: '<p>A real named passage.</p>', choices: [12] });
    db.exec("INSERT INTO book_frontmatter VALUES (710, ''); INSERT INTO book_frontmatter VALUES (711, NULL)");
    assert.equal(read(710, 'rules'), null);
    assert.equal(read(711, 'rules'), null);
  } finally {
    db.close();
  }
});
