'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { externalizeImages, DIRECTORY, MAX_BYTES } = require('./reading-image-storage');

async function main() {
  const databasePath = path.join(__dirname, '..', 'database.sqlite');
  const db = new Database(databasePath);
  db.pragma('busy_timeout = 10000');
  const rows = db.prepare("SELECT book_id, section_id, html FROM book_sections WHERE html LIKE '%data:image/%'").all();
  if (!rows.length) { console.log('No embedded section images remain.'); db.close(); return; }
  const backup = path.join(__dirname, '..', 'backups', `reading-images-${Date.now()}.sqlite`);
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  await db.backup(backup);
  const changes = rows.map(row => ({ ...row, replacement: externalizeImages(row.html, row.book_id) }));
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
  console.log(JSON.stringify({ backup, sections: changes.length, files: files.length,
    imageBytes: sizes.reduce((a, b) => a + b, 0), maxBytes: Math.max(...sizes),
    htmlBytesRemoved: changes.reduce((sum, row) => sum + Buffer.byteLength(row.html) - Buffer.byteLength(row.replacement), 0) }));
  db.close();
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { main };
