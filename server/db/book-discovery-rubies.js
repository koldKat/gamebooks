'use strict';

// Permanent public-book discovery rewards; legacy diamond wallet fields display rubies.
const { createRubyCompletionChecker } = require('./rubies');
const { isImpersonatingContext } = require('../impersonation-context');

function backfillDiscoveryRubiesForUser(db, userId) {
  if (isImpersonatingContext()) return 0;
  const check = createRubyCompletionChecker(db, { discovery: true });
  return db.transaction(() => {
    let earned = 0;
    const candidates = db.prepare(`SELECT book_id FROM user_books WHERE user_id=? UNION
      SELECT CAST(substr(ref,1,instr(ref,':')-1) AS INTEGER) FROM xp_events
      WHERE user_id=? AND event IN ('discover_node','visit_node')`);
    for (const { book_id } of candidates.all(userId, userId)) earned += check(userId, book_id);
    return earned;
  }).immediate();
}

function initializeBookDiscoveryRubies(db) {
  return db.transaction(() => {
    db.exec(`CREATE TABLE IF NOT EXISTS book_discovery_ruby_rewards (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      book_id INTEGER NOT NULL,
      kind TEXT NOT NULL CHECK(kind='book'),
      created_at INTEGER NOT NULL DEFAULT(unixepoch()),
      PRIMARY KEY(user_id,book_id,kind));
      CREATE TRIGGER IF NOT EXISTS award_book_discovery_ruby
      AFTER INSERT ON book_discovery_ruby_rewards BEGIN
        INSERT INTO user_diamonds(user_id,diamonds_earned) VALUES(NEW.user_id,1)
          ON CONFLICT(user_id) DO UPDATE SET diamonds_earned=diamonds_earned+1;
      END;
      CREATE TABLE IF NOT EXISTS currency_migrations(name TEXT PRIMARY KEY);`);
    if (db.prepare("SELECT 1 FROM currency_migrations WHERE name='public-book-discovery-rubies-v1'").get()) return 0;
    let earned = 0;
    for (const { id } of db.prepare('SELECT id FROM users').all()) earned += backfillDiscoveryRubiesForUser(db, id);
    db.prepare("INSERT INTO currency_migrations(name) VALUES('public-book-discovery-rubies-v1')").run();
    return earned;
  }).immediate();
}

function backfillDiscoveryRubiesForBook(db, bookId) {
  if (isImpersonatingContext()) return [];
  const check = createRubyCompletionChecker(db, { discovery: true });
  return db.transaction(() => {
    const rewards = [];
    for (const { user_id } of db.prepare(`SELECT user_id FROM user_books WHERE book_id=? UNION
      SELECT user_id FROM xp_events WHERE event IN ('discover_node','visit_node') AND ref LIKE ?`)
      .all(bookId, `${bookId}:%`)) {
      const amount = check(user_id, bookId);
      if (amount) rewards.push({ userId: user_id, amount });
    }
    return rewards;
  }).immediate();
}

module.exports = { initializeBookDiscoveryRubies, backfillDiscoveryRubiesForUser, backfillDiscoveryRubiesForBook };
