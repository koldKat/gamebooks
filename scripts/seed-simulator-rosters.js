'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { seedEnemyRoster } = require('../server/db/enemy-rosters');

function main(args) {
  const [databasePath, ...requested] = args;
  if (!databasePath || !requested.length || requested.some(id => !/^[1-9][0-9]*$/.test(id))) {
    throw new Error('Usage: node scripts/seed-simulator-rosters.js <database-file> <book-id>...');
  }
  const documents = [...new Set(requested)].map(id => {
    const document = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/simulator-rosters', id + '.json'), 'utf8'));
    if (document.bookId !== Number(id)) throw new Error('Roster book ID mismatch');
    return document;
  });
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
