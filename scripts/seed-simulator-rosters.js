'use strict';
const fs = require('node:fs');
const Database = require('better-sqlite3');
const { seedEnemyRoster } = require('../server/db/enemy-rosters');

function main(args) {
  const [databasePath, ...requested] = args;
  if (!databasePath || !requested.length) {
    throw new Error('Usage: node scripts/seed-simulator-rosters.js <database-file> <reviewed-roster-file>...');
  }
  // Import explicitly reviewed temporary input; no duplicate roster catalog is
  // shipped or maintained alongside the database.
  const documents = [...new Set(requested)].map(file => JSON.parse(fs.readFileSync(file, 'utf8')));
  if (new Set(documents.map(document => document.bookId)).size !== documents.length) throw new Error('Duplicate roster book ID');
  const db = new Database(databasePath, { fileMustExist: true, timeout: 5000 });
  try {
    db.pragma('foreign_keys = ON');
    const results = db.transaction(() => documents.map(document => ({ bookId: document.bookId, ...seedEnemyRoster(db, document) })))();
    for (const result of results) process.stdout.write(JSON.stringify(result) + '\n');
  } finally { db.close(); }
}

if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
}
module.exports = { main };
