const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const root = path.resolve(__dirname, '..');
const database = new Database(path.join(root, 'database.sqlite'), {readonly: true});
try {
  const modules = fs.readdirSync(path.join(root, 'public/js/battlesim/books'))
    .filter(name => /^\d+$/.test(name)).map(Number);
  const books = database.prepare('SELECT id, name, has_battle_sim FROM books').all();
  const byId = new Map(books.map(book => [book.id, book]));
  const errors = [];
  for (const id of modules) {
    const book = byId.get(id);
    if (!book?.has_battle_sim) errors.push(`${id}: module exists but catalog availability is disabled${book ? ` (${book.name})` : ' (book missing)'}`);
  }
  for (const book of books) {
    if (book.has_battle_sim && !modules.includes(book.id)) errors.push(`${book.id}: catalog enabled without a simulator module (${book.name})`);
  }
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`${modules.length} simulator modules match ${books.filter(book => book.has_battle_sim).length} enabled catalog entries.`);
  }
} finally {
  database.close();
}
