'use strict';

// Completion rewards are permanent, independent of the mutable runs and catalog.
function hasRubyAccess(db, userId) {
  return !!db.prepare('SELECT 1 FROM users WHERE id=?').get(userId);
}

function initializeRubies(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS ruby_rewards (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('book','anthology')),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY(user_id,book_id,kind));
    CREATE TABLE IF NOT EXISTS user_rubies (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      rubies_earned INTEGER NOT NULL DEFAULT 0 CHECK(rubies_earned>=0),
      rubies_spent INTEGER NOT NULL DEFAULT 0 CHECK(rubies_spent>=0),
      rubies_bought INTEGER NOT NULL DEFAULT 0 CHECK(rubies_bought>=0),
      CHECK(rubies_earned+rubies_bought>=rubies_spent));
    CREATE TABLE IF NOT EXISTS ruby_market (
      id INTEGER PRIMARY KEY CHECK(id=1), rubies INTEGER NOT NULL DEFAULT 0 CHECK(rubies>=0),
      completions INTEGER NOT NULL DEFAULT 0, rubies_generated INTEGER NOT NULL DEFAULT 0);
    INSERT OR IGNORE INTO ruby_market(id) VALUES(1);
    CREATE TABLE IF NOT EXISTS ruby_exchanges (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      request_id TEXT NOT NULL, rubies INTEGER NOT NULL CHECK(rubies>0),
      rate INTEGER NOT NULL CHECK(rate>0), gold_coins INTEGER NOT NULL CHECK(gold_coins>0),
      direction TEXT NOT NULL CHECK(direction IN ('sell','buy')),
      created_at INTEGER NOT NULL DEFAULT (unixepoch()), PRIMARY KEY(user_id,request_id));
    CREATE TABLE IF NOT EXISTS ruby_migrations(name TEXT PRIMARY KEY);
    CREATE TRIGGER IF NOT EXISTS award_completion_ruby AFTER INSERT ON ruby_rewards BEGIN
      INSERT INTO user_rubies(user_id,rubies_earned) VALUES(NEW.user_id,1)
        ON CONFLICT(user_id) DO UPDATE SET rubies_earned=rubies_earned+1;
      UPDATE ruby_market SET rubies=rubies+(completions+1)/10-completions/10,
        rubies_generated=rubies_generated+(completions+1)/10-completions/10,
        completions=completions+1 WHERE id=1;
    END;`);
}

function createRubyCompletionChecker(db) {
  const book = db.prepare(`SELECT b.*, e.section_id AS uncounted_entry FROM books b
    LEFT JOIN book_reading_entries e ON e.book_id=b.id AND e.counts_as_section=0 WHERE b.id=?`);
  const sections = db.prepare('SELECT section_id FROM book_sections WHERE book_id=?');
  const state = db.prepare('SELECT state_data FROM user_books WHERE user_id=? AND book_id=?');
  const visits = db.prepare("SELECT ref FROM xp_events WHERE user_id=? AND event='visit_node' AND ref LIKE ?");
  const rewarded = db.prepare('SELECT 1 FROM ruby_rewards WHERE user_id=? AND book_id=? AND kind=?');
  const award = db.prepare('INSERT OR IGNORE INTO ruby_rewards(user_id,book_id,kind) VALUES(?,?,?)');
  const children = db.prepare(`SELECT id FROM books WHERE is_container=0 AND (parent_book_id=? OR id IN
    (SELECT book_id FROM book_anthology_memberships WHERE anthology_id=?))`);
  const parents = db.prepare(`SELECT parent_book_id AS id FROM books WHERE id=? AND parent_book_id IS NOT NULL
    UNION SELECT anthology_id FROM book_anthology_memberships WHERE book_id=?`);

  function completion(userId, row) {
    const total = row.total_sections;
    if (!Number.isSafeInteger(total) || total < 1) return { count: 0, complete: false };
    const canonical = sections.all(row.id).map(s => String(s.section_id)).filter(s => s !== row.uncounted_entry);
    // Sparse/prefixed imports require their actual section IDs, never just a path length.
    // Incomplete imports cannot establish the complete set of required sections.
    if (canonical.length && canonical.length !== total) return { count: total, complete: false };
    const visited = new Set(visits.all(userId, `${row.id}:%`).map(v => v.ref.slice(String(row.id).length + 1)));
    let saved;
    try { saved = JSON.parse(state.get(userId, row.id)?.state_data || '{}'); } catch { saved = {}; }
    const runs = Array.isArray(saved?.playthroughs) ? saved.playthroughs : [];
    const archived = Array.isArray(saved?.preSeriesRuns) ? saved.preSeriesRuns : [];
    for (const run of [...runs, ...archived]) {
      for (const id of Array.isArray(run?.path) ? run.path : []) visited.add(String(id));
    }
    if (canonical.length) return { count: total, complete: canonical.every(id => visited.has(id)) };
    // Without imported prose the catalog's ordinary numbered sections are authoritative.
    // A sparse numbering scheme needs imported IDs before it can be certified.
    if ((row.max_section_number ?? total) !== total) return { count: total, complete: false };
    if (visited.size < total) return { count: total, complete: false };
    for (let i=1; i<=total; i++) if (!visited.has(String(i))) return { count: total, complete: false };
    return { count: total, complete: true };
  }

  const check = db.transaction((userId, bookId) => {
    const row = book.get(bookId);
    if (!row) return 0;
    let earned = 0;
    if (row.is_public && !row.is_container && row.total_sections >= 100 && !rewarded.get(userId, row.id, 'book')) {
      if (completion(userId, row).complete) earned += award.run(userId, row.id, 'book').changes;
    }
    const anthologyIds = row.is_container ? [{ id: row.id }] : parents.all(bookId, bookId);
    for (const { id } of anthologyIds) {
      const anthology = book.get(id);
      if (rewarded.get(userId, id, 'anthology') || !anthology?.is_container || !anthology.is_public) continue;
      const members = children.all(id,id).map(child => book.get(child.id));
      if (!members.length || members.some(child => !child.is_public) || members.reduce((n, child) => n+child.total_sections,0) < 100) continue;
      if (members.every(child => completion(userId,child).complete)) earned += award.run(userId,id,'anthology').changes;
    }
    return earned;
  });
  return (userId, bookId) => check.immediate(userId,bookId);
}

function backfillRubies(db) {
  db.transaction(() => {
    if (db.prepare("SELECT 1 FROM ruby_migrations WHERE name='completion-v1'").get()) return;
    const check = createRubyCompletionChecker(db);
    // Include deleted-library progress preserved in the permanent visits ledger.
    const candidates = db.prepare(`SELECT user_id,book_id FROM user_books UNION
      SELECT user_id,CAST(substr(ref,1,instr(ref,':')-1) AS INTEGER) FROM xp_events WHERE event='visit_node'`).all();
    for (const { user_id,book_id } of candidates) check(user_id,book_id);
    db.prepare("INSERT INTO ruby_migrations(name) VALUES('completion-v1')").run();
  }).immediate();
}

function rubyInfoForUser(db, userId) {
  const row = db.prepare(`SELECT r.*,
    (SELECT COUNT(*) FROM users) AS rate,(SELECT rubies FROM ruby_market WHERE id=1) AS stock
    FROM users u LEFT JOIN user_rubies r ON r.user_id=u.id WHERE u.id=?`).get(userId);
  if (!row) return {};
  return {
    rubiesEarned: row?.rubies_earned || 0,
    rubiesBalance: (row?.rubies_earned || 0)+(row?.rubies_bought || 0)-(row?.rubies_spent || 0),
    rubiesExchanged: row?.rubies_spent || 0, rubiesBought: row?.rubies_bought || 0,
    rubyExchangeRate: row.rate, rubyBuyRate: row.rate,
    rubyPurchaseStock: row.stock || 0,
  };
}

module.exports = { initializeRubies, createRubyCompletionChecker, backfillRubies, rubyInfoForUser, hasRubyAccess };
