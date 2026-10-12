'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { DIRECTORY, MAX_BYTES, bookImageDirectory } = require('./reading-image-storage');

const FILE = /^[a-f0-9]{64}\.(png|jpg|gif|webp)$/;
const REFERENCE = /\/api\/books\/(\d+)\/reading-images\/([a-f0-9]{64}\.(?:png|jpg|gif|webp))/g;

function verify(file, filename) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error(`Invalid image: ${file}`);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (hash !== filename.split('.')[0]) throw new Error(`Image hash mismatch: ${file}`);
}

function migrate({ databasePath = path.join(__dirname, '..', 'database.sqlite'), directory = DIRECTORY, cleanup = false } = {}) {
  const db = new Database(databasePath, { readonly: true });
  const references = new Map();
  try {
    db.transaction(() => {
      for (const query of [
        'SELECT book_id, html AS text FROM book_sections',
        'SELECT book_id, intro_text AS text FROM book_frontmatter UNION ALL SELECT book_id, rules_text AS text FROM book_frontmatter',
      ]) {
        for (const row of db.prepare(query).iterate()) {
          for (const match of (row.text || '').matchAll(REFERENCE)) {
            const bookId = Number(match[1]), filename = match[2];
            if (bookId !== row.book_id) throw new Error(`Cross-book image reference: ${row.book_id}/${bookId}`);
            const target = path.join(bookImageDirectory(bookId, directory), filename);
            references.set(target, filename);
          }
        }
      }
    })();
    const flat = fs.readdirSync(directory, { withFileTypes: true }).filter(entry => !entry.isDirectory());
    for (const entry of flat) {
      if (!FILE.test(entry.name)) throw new Error(`Unexpected root entry: ${entry.name}`);
      verify(path.join(directory, entry.name), entry.name);
    }
    // Preflight every reference before modifying or removing any source file.
    for (const [target, filename] of references) {
      verify(fs.existsSync(target) ? target : path.join(directory, filename), filename);
    }
    const used = new Set(references.values());
    let unreferenced = 0;
    for (const entry of flat) {
      if (!used.has(entry.name)) {
        references.set(path.join(directory, '_unreferenced', entry.name), entry.name);
        unreferenced++;
      }
    }
    for (const [target, filename] of references) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      if (!fs.existsSync(target)) {
        // Same-filesystem hard links preserve shared artwork without duplicating bytes.
        fs.linkSync(path.join(directory, filename), target);
      }
      verify(target, filename);
    }
    if (cleanup) {
      for (const entry of flat) fs.unlinkSync(path.join(directory, entry.name));
    }
    return { references: references.size - unreferenced, books: new Set([...references.keys()].map(file => path.basename(path.dirname(file))).filter(id => id !== '_unreferenced')).size,
      unreferenced, rootFiles: flat.length, removedRootFiles: cleanup ? flat.length : 0 };
  } finally { db.close(); }
}

if (require.main === module) {
  try { console.log(JSON.stringify(migrate({ cleanup: process.argv.includes('--cleanup') }))); }
  catch (error) { console.error(error); process.exitCode = 1; }
}
module.exports = { migrate };
