'use strict';

const { coinBalance } = require('./xp');

// Change this policy to disable the trial; paid access is deliberately off.
const DEFAULT_POLICY = Object.freeze({ testBookId: 263, paidEnabled: false });

function createReadingAccess(db, policy = DEFAULT_POLICY) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reading_unlocks (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      cost_gc INTEGER NOT NULL CHECK(cost_gc >= 0),
      unlocked_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      PRIMARY KEY (user_id, book_id)
    );
    CREATE TABLE IF NOT EXISTS reading_access_migrations (name TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS book_reading_entries (
      book_id INTEGER PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
      section_id TEXT NOT NULL CHECK(length(trim(section_id)) > 0 AND trim(section_id) NOT IN ('0', '-1')),
      counts_as_section INTEGER NOT NULL DEFAULT 1 CHECK(counts_as_section IN (0, 1))
    );
  `);
  if (!db.prepare('PRAGMA table_info(book_reading_entries)').all().some(column => column.name === 'counts_as_section')) {
    db.exec('ALTER TABLE book_reading_entries ADD COLUMN counts_as_section INTEGER NOT NULL DEFAULT 1 CHECK(counts_as_section IN (0, 1))');
  }
  db.transaction(() => {
    if (db.prepare('SELECT 1 FROM reading_access_migrations WHERE name = ?').get('historical-runs-v1')) return;
    db.exec(`INSERT OR IGNORE INTO reading_unlocks (user_id, book_id, cost_gc)
      SELECT DISTINCT ub.user_id, ub.book_id, 0 FROM user_books ub
      JOIN books b ON b.id = ub.book_id
      JOIN json_each(CASE WHEN json_valid(ub.state_data) THEN ub.state_data ELSE '{}' END, '$.playthroughs') p
      WHERE b.has_live_reading = 1 AND COALESCE(b.is_demo, 0) = 0
        AND json_array_length(CASE WHEN p.type = 'object' THEN p.value ELSE '{}' END, '$.path') > 0`);
    db.prepare('INSERT INTO reading_access_migrations (name) VALUES (?)').run('historical-runs-v1');
  })();

  function getAccess(userId, bookId, includeFrontmatter = true) {
    const book = db.prepare(`SELECT b.id, b.name, b.total_sections, e.section_id AS reading_start_section
      FROM books b LEFT JOIN book_reading_entries e ON e.book_id = b.id
      WHERE b.id = ? AND b.has_live_reading = 1 AND
        (b.is_public = 1 OR b.created_by = ? OR EXISTS
          (SELECT 1 FROM user_books ub WHERE ub.book_id = b.id AND ub.user_id = ?))`).get(bookId, userId, userId);
    if (!book) return null;
    const purchased = !!db.prepare('SELECT 1 FROM reading_unlocks WHERE user_id = ? AND book_id = ?').get(userId, bookId);
    const normalCost = Math.floor(Math.max(0, book.total_sections || 0) / 100);
    const trial = book.id === policy.testBookId;
    const gated = trial || (policy.paidEnabled && normalCost > 0);
    const locked = gated && !purchased;
    const user = includeFrontmatter ? db.prepare('SELECT xp, bonus_coins, coins_spent, bonus_gc_mint_purchased FROM users WHERE id = ?').get(userId) : null;
    const balance = user ? coinBalance(user) : null;
    const frontmatter = locked && includeFrontmatter
      ? db.prepare('SELECT intro_text, rules_text FROM book_frontmatter WHERE book_id = ?').get(bookId) : null;
    const rawStart = book.reading_start_section?.trim();
    const startSection = rawStart && /^\d+$/.test(rawStart) ? Number(rawStart) || 1 : rawStart || 1;
    return { bookId: book.id, name: book.name, purchased, locked, startSection,
      cost: trial ? 0 : normalCost, purchasingEnabled: gated,
      balance, canAfford: trial || normalCost === 0 || (balance !== null && balance >= normalCost),
      introText: frontmatter?.intro_text || '', rulesText: frontmatter?.rules_text || '' };
  }

  // Frontmatter/backmatter for on-demand viewing during reading (getAccess withholds it once unlocked).
  function getReadingMatter(userId, bookId) {
    const book = db.prepare(`SELECT b.id FROM books b
      WHERE b.id = ? AND b.has_live_reading = 1 AND
        (b.is_public = 1 OR b.created_by = ? OR EXISTS
          (SELECT 1 FROM user_books ub WHERE ub.book_id = b.id AND ub.user_id = ?))`).get(bookId, userId, userId);
    if (!book) return null;
    const fm = db.prepare('SELECT intro_text, rules_text FROM book_frontmatter WHERE book_id = ?').get(bookId);
    return { introText: fm?.intro_text || '', rulesText: fm?.rules_text || '' };
  }

  const unlock = db.transaction((userId, bookId) => {
    const access = getAccess(userId, bookId, false);
    if (!access) return { error: 'not_found' };
    if (access.purchased) return { ok: true, alreadyUnlocked: true, cost: 0 };
    if (!access.purchasingEnabled) return { error: 'purchasing_disabled' };
    const user = db.prepare('SELECT xp, bonus_coins, coins_spent, bonus_gc_mint_purchased FROM users WHERE id = ?').get(userId);
    if (!user) return { error: 'not_found' };
    const balance = coinBalance(user);
    if (access.cost > 0 && balance < access.cost) return { error: 'insufficient_coins' };
    db.prepare('INSERT INTO reading_unlocks (user_id, book_id, cost_gc) VALUES (?, ?, ?)').run(userId, bookId, access.cost);
    if (access.cost) db.prepare('UPDATE users SET coins_spent = coins_spent + ? WHERE id = ?').run(access.cost, userId);
    return { ok: true, alreadyUnlocked: false, cost: access.cost, newBalance: balance - access.cost };
  });
  return { getAccess, unlock, getReadingMatter };
}

module.exports = { createReadingAccess, DEFAULT_POLICY };
