'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('file uploads have no XP award configuration or route award calls', () => {
  const configuration = fs.readFileSync(require.resolve('../server/db/xp'), 'utf8');
  const routes = fs.readFileSync(require.resolve('../server/routes/profile'), 'utf8');
  assert.doesNotMatch(configuration, /(?:pdf|epub)_available/);
  assert.doesNotMatch(routes, /award(?:Pdf|Epub)Xp/);
  assert.match(routes, /async function handleUploadPdf/);
  assert.match(routes, /db\.setBookPdf\(bookId, filename\)/);
});

test('retired format has no forms, route, MIME mapping, badge or download fallback', () => {
  for (const file of ['public/index.html', 'admin/index.html', 'server.js', 'server/runtime-state.js',
    'server/book-files.js', 'public/js/covers/markup.js', 'public/js/books/markup.js']) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /epub|Epub|EPUB/, file);
  }
});

test('admin pool retains the PDF contribution', () => {
  const source = fs.readFileSync(require.resolve('../server/db/misc'), 'utf8');
  assert.match(source, /COUNT\(\*\) AS n FROM books WHERE pdf_path IS NOT NULL/);
  assert.doesNotMatch(source, /epub|Epub|EPUB/);
});
