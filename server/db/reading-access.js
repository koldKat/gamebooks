'use strict';

const { coinBalance } = require('./xp');

const DEFAULT_READING_THRESHOLD = 482;
const READING_THRESHOLD_KEY = 'reading_paid_user_threshold';

function createReadingAccess(db) {
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
      counts_as_section INTEGER NOT NULL DEFAULT 1 CHECK(counts_as_section IN (0, 1)),
      start_section_id TEXT CHECK(start_section_id IS NULL OR
        (length(trim(start_section_id)) > 0 AND trim(start_section_id) NOT IN ('0', '-1')))
    );
  `);
  if (!db.prepare('PRAGMA table_info(book_reading_entries)').all().some(column => column.name === 'counts_as_section')) {
    db.exec('ALTER TABLE book_reading_entries ADD COLUMN counts_as_section INTEGER NOT NULL DEFAULT 1 CHECK(counts_as_section IN (0, 1))');
  }
  if (!db.prepare('PRAGMA table_info(book_reading_entries)').all().some(column => column.name === 'start_section_id')) {
    db.exec(`ALTER TABLE book_reading_entries ADD COLUMN start_section_id TEXT CHECK(start_section_id IS NULL OR
      (length(trim(start_section_id)) > 0 AND trim(start_section_id) NOT IN ('0', '-1')))`);
  }
  db.transaction(() => {
    if (db.prepare('SELECT 1 FROM reading_access_migrations WHERE name = ?').get('historical-runs-v1')) return;
    db.exec(`INSERT OR IGNORE INTO reading_unlocks (user_id, book_id, cost_gc)
      SELECT DISTINCT ub.user_id, ub.book_id, 0 FROM user_books ub
      JOIN books b ON b.id = ub.book_id
      JOIN json_each(CASE WHEN json_valid(ub.state_data) THEN ub.state_data ELSE '{}' END, '$.playthroughs') p
      WHERE b.has_live_reading = 1
        AND json_array_length(CASE WHEN p.type = 'object' THEN p.value ELSE '{}' END, '$.path') > 0`);
    db.prepare('INSERT INTO reading_access_migrations (name) VALUES (?)').run('historical-runs-v1');
  })();

  db.prepare('INSERT OR IGNORE INTO admin_settings (key, value) VALUES (?, ?)')
    .run(READING_THRESHOLD_KEY, String(DEFAULT_READING_THRESHOLD));
  db.exec(`CREATE TABLE IF NOT EXISTS reading_paid_testers (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE
  );
  INSERT OR IGNORE INTO reading_paid_testers (user_id)
    SELECT id FROM users WHERE lower(username) = 'sashii';`);
  function threshold() {
    const value = Number(db.prepare('SELECT value FROM admin_settings WHERE key = ?').get(READING_THRESHOLD_KEY)?.value);
    return Number.isSafeInteger(value) && value >= 0 ? value : DEFAULT_READING_THRESHOLD;
  }
  function grandfather(name, admins) {
    if (db.prepare('SELECT 1 FROM reading_access_migrations WHERE name = ?').get(name)) return;
    db.prepare(`INSERT OR IGNORE INTO reading_unlocks (user_id, book_id, cost_gc)
      SELECT DISTINCT ub.user_id, ub.book_id, 0 FROM user_books ub
      JOIN books b ON b.id = ub.book_id JOIN users u ON u.id = ub.user_id
      JOIN json_each(CASE WHEN json_valid(ub.state_data) THEN ub.state_data ELSE '{}' END) runs
      JOIN json_each(CASE WHEN runs.type = 'array' THEN runs.value ELSE '[]' END) p
      WHERE b.has_live_reading = 1 AND (u.is_admin != 0 OR EXISTS
        (SELECT 1 FROM reading_paid_testers t WHERE t.user_id = u.id)) = ?
        AND runs.key IN ('playthroughs', 'preSeriesRuns')
        AND json_array_length(CASE WHEN p.type = 'object' THEN p.value ELSE '{}' END, '$.path') > 0`).run(admins ? 1 : 0);
    db.prepare('INSERT INTO reading_access_migrations (name) VALUES (?)').run(name);
  }
  const syncActivation = db.transaction(() => {
    grandfather('paid-admin-historical-runs-v2', true);
    const active = db.prepare('SELECT COUNT(*) AS count FROM users').get().count >= threshold();
    if (active) grandfather('paid-player-historical-runs-v2', false);
    return active;
  });
  const setThreshold = db.transaction(value => {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('Invalid reading threshold');
    db.prepare('UPDATE admin_settings SET value = ? WHERE key = ?').run(String(value), READING_THRESHOLD_KEY);
    syncActivation();
  });
  syncActivation();
  db.transaction(() => grandfather('free-player-historical-runs-v2', false))();
  // Remember free-period ownership when a run starts, even if that run is deleted later.
  for (const operation of ['INSERT', 'UPDATE OF state_data']) {
    const suffix = operation === 'INSERT' ? 'insert' : 'update';
    db.exec(`CREATE TRIGGER IF NOT EXISTS reading_free_run_${suffix}
      AFTER ${operation} ON user_books
      WHEN NOT EXISTS (SELECT 1 FROM reading_unlocks WHERE user_id = NEW.user_id AND book_id = NEW.book_id)
        AND EXISTS (SELECT 1 FROM books WHERE id = NEW.book_id AND has_live_reading = 1)
        AND EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id AND is_admin = 0)
        AND NOT EXISTS (SELECT 1 FROM reading_paid_testers WHERE user_id = NEW.user_id)
        AND (SELECT COUNT(*) FROM users) < CAST((SELECT value FROM admin_settings WHERE key = '${READING_THRESHOLD_KEY}') AS INTEGER)
      BEGIN
        INSERT OR IGNORE INTO reading_unlocks (user_id, book_id, cost_gc)
          SELECT NEW.user_id, NEW.book_id, 0
          FROM json_each(CASE WHEN json_valid(NEW.state_data) THEN NEW.state_data ELSE '{}' END) runs
          JOIN json_each(CASE WHEN runs.type = 'array' THEN runs.value ELSE '[]' END) p
          WHERE runs.key IN ('playthroughs', 'preSeriesRuns')
            AND json_array_length(CASE WHEN p.type = 'object' THEN p.value ELSE '{}' END, '$.path') > 0;
      END`);
  }

  function getAccess(userId, bookId, includeFrontmatter = true) {
    const book = db.prepare(`SELECT b.id, b.name, b.total_sections, b.cover_path, b.description, b.authors,
      COALESCE(e.start_section_id, e.section_id) AS reading_start_section
      FROM books b LEFT JOIN book_reading_entries e ON e.book_id = b.id
      WHERE b.id = ? AND b.has_live_reading = 1 AND
        (b.is_public = 1 OR b.created_by = ? OR EXISTS
          (SELECT 1 FROM user_books ub WHERE ub.book_id = b.id AND ub.user_id = ?))`).get(bookId, userId, userId);
    if (!book) return null;
    const active = syncActivation();
    const purchased = !!db.prepare('SELECT 1 FROM reading_unlocks WHERE user_id = ? AND book_id = ?').get(userId, bookId);
    const normalCost = Math.floor(Math.max(0, book.total_sections || 0) / 100);
    const tester = !!db.prepare('SELECT 1 FROM reading_paid_testers WHERE user_id = ?').get(userId);
    const gated = normalCost > 0 && (active || tester || !!db.prepare('SELECT is_admin FROM users WHERE id = ?').get(userId)?.is_admin);
    const locked = gated && !purchased;
    const user = includeFrontmatter ? db.prepare('SELECT xp, bonus_coins, coins_spent, bonus_gc_mint_purchased FROM users WHERE id = ?').get(userId) : null;
    const balance = user ? coinBalance(user) : null;
    const frontmatter = locked && includeFrontmatter
      ? db.prepare('SELECT intro_text, rules_text FROM book_frontmatter WHERE book_id = ?').get(bookId) : null;
    const rawStart = book.reading_start_section?.trim();
    const startSection = rawStart && /^\d+$/.test(rawStart) ? Number(rawStart) || 1 : rawStart || 1;
    return { bookId: book.id, name: book.name, purchased, locked, startSection,
      coverUrl: locked && includeFrontmatter && book.cover_path ? `/covers/${encodeURIComponent(book.cover_path)}` : null,
      description: locked && includeFrontmatter ? book.description || '' : '',
      authors: locked && includeFrontmatter ? book.authors || '' : '',
      cost: gated ? normalCost : 0, purchasingEnabled: gated,
      balance, canAfford: !gated || (balance !== null && balance >= normalCost),
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

  const unlock = db.transaction((userId, bookId, expectedCost) => {
    const access = getAccess(userId, bookId, false);
    if (!access) return { error: 'not_found' };
    if (access.purchased) return { ok: true, alreadyUnlocked: true, cost: 0 };
    if (!access.purchasingEnabled) return { error: 'purchasing_disabled' };
    if (expectedCost !== access.cost) return { error: 'cost_changed', cost: access.cost };
    const user = db.prepare('SELECT xp, bonus_coins, coins_spent, bonus_gc_mint_purchased FROM users WHERE id = ?').get(userId);
    if (!user) return { error: 'not_found' };
    const balance = coinBalance(user);
    if (access.cost > 0 && balance < access.cost) return { error: 'insufficient_coins' };
    db.prepare('INSERT INTO reading_unlocks (user_id, book_id, cost_gc) VALUES (?, ?, ?)').run(userId, bookId, access.cost);
    if (access.cost) db.prepare('UPDATE users SET coins_spent = coins_spent + ? WHERE id = ?').run(access.cost, userId);
    return { ok: true, alreadyUnlocked: false, cost: access.cost, newBalance: balance - access.cost };
  });
  return { getAccess, unlock, getReadingMatter, syncActivation, setThreshold, threshold };
}

module.exports = { createReadingAccess, DEFAULT_READING_THRESHOLD, READING_THRESHOLD_KEY };
