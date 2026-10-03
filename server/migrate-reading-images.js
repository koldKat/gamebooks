'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { externalizeImages, storeImage, DIRECTORY, MAX_BYTES } = require('./reading-image-storage');

async function main({ normalizePng = false } = {}) {
  const databasePath = path.join(__dirname, '..', 'database.sqlite');
  const db = new Database(databasePath);
  db.pragma('busy_timeout = 10000');
  const rows = db.prepare(normalizePng
    ? "SELECT book_id, section_id, html FROM book_sections WHERE html LIKE '%data:image/%' OR html LIKE '%/reading-images/%'"
    : "SELECT book_id, section_id, html FROM book_sections WHERE html LIKE '%data:image/%'").all();
  if (!rows.length) { console.log('No embedded section images remain.'); db.close(); return; }
  const backup = path.join(__dirname, '..', 'backups', `reading-images-${Date.now()}.sqlite`);
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  await db.backup(backup);
  const converted = new Map();
  const changes = rows.map(row => {
    let replacement = externalizeImages(row.html, row.book_id);
    if (normalizePng) replacement = replacement.replace(/\/api\/books\/(\d+)\/reading-images\/([a-f0-9]{64}\.(jpg|gif|webp))/g, (_, bookId, filename, format) => {
      if (Number(bookId) !== row.book_id) throw new Error('Cross-book image reference');
      if (!converted.has(filename)) {
        try { converted.set(filename, storeImage(format, fs.readFileSync(path.join(DIRECTORY, filename)).toString('base64'))); }
        catch (error) { throw new Error(`${filename}: ${error.message}`); }
      }
      return `/api/books/${bookId}/reading-images/${converted.get(filename)}`;
    });
    return { ...row, replacement };
  }).filter(row => row.html !== row.replacement);
  const update = db.prepare('UPDATE book_sections SET html = ? WHERE book_id = ? AND section_id = ? AND html = ?');
  db.transaction(() => {
    for (const row of changes) {
      if (update.run(row.replacement, row.book_id, row.section_id, row.html).changes !== 1) {
        throw new Error(`Concurrent edit: ${row.book_id}/${row.section_id}`);
      }
    }
  })();
  const files = fs.readdirSync(DIRECTORY);
  const sizes = files.map(file => fs.statSync(path.join(DIRECTORY, file)).size);
  if (sizes.some(size => size > MAX_BYTES)) throw new Error('Oversized external image');
  console.log(JSON.stringify({ backup, sections: changes.length, convertedToPng: converted.size, files: files.length,
    imageBytes: sizes.reduce((a, b) => a + b, 0), maxBytes: Math.max(...sizes),
    htmlBytesRemoved: changes.reduce((sum, row) => sum + Buffer.byteLength(row.html) - Buffer.byteLength(row.replacement), 0) }));
  db.close();
}

if (require.main === module) main({ normalizePng: process.argv.includes('--png') }).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { main };
