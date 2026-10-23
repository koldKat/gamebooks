'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function digest(file) {
  const hash = crypto.createHash('sha256'), buffer = Buffer.alloc(64 * 1024);
  const fd = fs.openSync(file, 'r');
  try {
    let count;
    while ((count = fs.readSync(fd, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, count));
    return hash.digest('hex');
  } finally { fs.closeSync(fd); }
}

function sameFile(a, b) {
  const first = fs.lstatSync(a), second = fs.lstatSync(b);
  if (!first.isFile() || !second.isFile() || first.size !== second.size) return false;
  return (first.dev === second.dev && first.ino === second.ino) || digest(a) === digest(b);
}

function migrateBookFiles(db, directory, { cleanup = false } = {}) {
  const files = fs.readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && /\.(pdf|epub)$/i.test(entry.name))
    .map(entry => ({ name: entry.name, relative: path.extname(entry.name).slice(1).toLowerCase() + 's/' + entry.name }));
  const changes = [];
  for (const row of db.prepare('SELECT id,pdf_path,epub_path FROM books ORDER BY id').all()) {
    for (const [column, folder, extension] of [['pdf_path', 'pdfs', '.pdf'], ['epub_path', 'epubs', '.epub']]) {
      const value = row[column];
      if (!value) continue;
      const nested = value.startsWith(folder + '/');
      const name = nested ? value.slice(folder.length + 1) : value;
      if (path.basename(name) !== name || name.includes('\\') || path.extname(name).toLowerCase() !== extension)
        throw Error(`Unexpected ${column} for book ${row.id}: ${value}`);
      const target = path.join(directory, folder, name);
      const source = nested ? target : path.join(directory, name);
      if (!fs.existsSync(source) && !fs.existsSync(target)) throw Error(`Missing book file: ${value}`);
      if (!nested) changes.push({ id: row.id, column, before: value, after: folder + '/' + name });
    }
  }
  // Stage identical hard links first. Old server instances and links remain usable.
  for (const folder of ['pdfs', 'epubs']) fs.mkdirSync(path.join(directory, folder), { recursive: true });
  for (const file of files) {
    const source = path.join(directory, file.name), target = path.join(directory, file.relative);
    if (!fs.existsSync(target)) fs.linkSync(source, target);
    if (!sameFile(source, target)) throw Error(`Conflicting destination: ${file.relative}`);
  }
  for (const change of changes) {
    if (!fs.statSync(path.join(directory, change.after)).isFile()) throw Error(`Missing destination: ${change.after}`);
  }
  db.transaction(() => {
    for (const change of changes) {
      const result = db.prepare(`UPDATE books SET ${change.column}=? WHERE id=? AND ${change.column}=?`)
        .run(change.after, change.id, change.before);
      if (result.changes !== 1) throw Error(`Concurrent file edit for book ${change.id}`);
    }
  }).immediate();
  // Cleanup only after deploying format-aware uploads and legacy download support.
  let removed = 0;
  if (cleanup) {
    db.transaction(() => {
      const referenced = db.prepare('SELECT 1 FROM books WHERE pdf_path=? OR epub_path=? LIMIT 1');
      for (const file of files) {
        if (referenced.get(file.name, file.name)) throw Error(`Flat file still referenced: ${file.name}`);
        if (!sameFile(path.join(directory, file.name), path.join(directory, file.relative)))
          throw Error(`Destination changed: ${file.relative}`);
      }
      for (const file of files) { fs.unlinkSync(path.join(directory, file.name)); removed++; }
    }).immediate();
  }
  return { stagedFiles: files.length, updatedReferences: changes.length, removedFlatFiles: removed };
}

module.exports = { migrateBookFiles, sameFile };

if (require.main === module) {
  (async () => {
    const Database = require('better-sqlite3');
    const { BOOKS_DIR } = require('./paths');
    const args = process.argv.slice(2), backupIndex = args.indexOf('--backup');
    if (backupIndex < 0 || !args[backupIndex + 1]) throw Error('Supply --backup /absolute/path/to/new.sqlite');
    const backup = path.resolve(args[backupIndex + 1]);
    if (fs.existsSync(backup)) throw Error('Backup already exists; choose a new path');
    const db = new Database(path.join(__dirname, '..', 'database.sqlite'));
    try {
      db.pragma('busy_timeout = 5000');
      await db.backup(backup);
      console.log(JSON.stringify({ backup, ...migrateBookFiles(db, BOOKS_DIR, { cleanup: args.includes('--cleanup') }) }));
    } finally { db.close(); }
  })().catch(error => { console.error(error); process.exitCode = 1; });
}
