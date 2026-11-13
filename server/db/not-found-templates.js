'use strict';

// Seed the not-found flavor pool once; later top-ups preserve existing edits.
const messages = require('../not-found-messages');

function initializeNotFoundTemplates(db) {
  db.transaction(() => {
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='not_found_templates'").get()) return;
    db.exec(`CREATE TABLE not_found_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    )`);
    const insert = db.prepare('INSERT INTO not_found_templates(template) VALUES (?)');
    for (const text of messages) insert.run(text);
  }).immediate();
}

module.exports = { initializeNotFoundTemplates };
