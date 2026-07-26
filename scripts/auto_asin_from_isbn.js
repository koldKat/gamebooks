// Derive ASIN from ISBN-13 for all English books (978-0/978-1) missing ASIN
// ASIN for physical books = ISBN-10, computed from ISBN-13
// Run with: node scripts/auto_asin_from_isbn.js

const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '..', 'database.sqlite'));

function isbn13toIsbn10(isbn13) {
  // Remove hyphens/spaces, validate length
  const s = isbn13.replace(/[-\s]/g, '');
  if (s.length !== 13 || (!s.startsWith('9780') && !s.startsWith('9781'))) return null;
  // Take digits 4-12 (9 digits, excluding '978' prefix and last check digit)
  const core = s.slice(3, 12);
  // Compute check digit: sum of (10*d1 + 9*d2 + ... + 2*d9), then (11 - sum%11) % 11
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (10 - i) * parseInt(core[i]);
  const check = (11 - (sum % 11)) % 11;
  return core + (check === 10 ? 'X' : String(check));
}

function getXpAmount(event) {
  return db.prepare('SELECT amount FROM xp_config WHERE event = ?').get(event)?.amount ?? 0;
}
function computeLevel(xp) {
  return Math.floor((-1 + Math.sqrt(1 + 8 * xp / 1000)) / 2);
}
const _insertNotif = db.prepare('INSERT INTO notifications (user_id, type, payload) VALUES (?, ?, ?)');

function awardXp(userId, event, ref) {
  const amount   = getXpAmount(event);
  const before   = db.prepare('SELECT xp, xp_boost_pct, bonus_coins, coins_spent FROM users WHERE id = ?').get(userId);
  const beforeXp = before?.xp ?? 0;
  const boost    = before?.xp_boost_pct ?? 0;
  const bonusCoins = before?.bonus_coins ?? 0;
  const coinsSpent = before?.coins_spent ?? 0;
  const boosted  = amount > 0 ? Math.floor(amount * (1 + boost / 100)) : 0;
  const baseWhole = Math.floor(amount);
  const r = db.prepare('INSERT OR IGNORE INTO xp_events (user_id, event, ref) VALUES (?, ?, ?)').run(userId, event, String(ref));
  if (r.changes > 0 && boosted > 0) {
    const extra = Math.max(0, boosted - baseWhole);
    db.prepare('UPDATE users SET xp = xp + ?, xp_from_boost = xp_from_boost + ? WHERE id = ?').run(boosted, extra, userId);
    const after    = db.prepare('SELECT xp FROM users WHERE id = ?').get(userId)?.xp ?? 0;
    const lvBefore = computeLevel(beforeXp);
    const lvAfter  = computeLevel(after);
    for (let lv = lvBefore + 1; lv <= lvAfter; lv++) {
      db.prepare('INSERT OR IGNORE INTO xp_events (user_id, event, ref) VALUES (?, ?, ?)').run(userId, 'level_up', String(lv));
      _insertNotif.run(userId, 'level_up', JSON.stringify({ level: lv, title: `Level ${lv}` }));
    }
    if (lvAfter > lvBefore)
      db.prepare('UPDATE users SET xp_boost_pct = xp_boost_pct + ? WHERE id = ?').run(lvAfter - lvBefore, userId);
    const coinsGained = Math.floor(after / 1000) - Math.floor(beforeXp / 1000);
    if (coinsGained > 0)
      _insertNotif.run(userId, 'coin_gain', JSON.stringify({ amount: coinsGained, balance: Math.floor(after / 1000) + bonusCoins - coinsSpent, reason: 'xp_milestone' }));
    return { awarded: true, boosted };
  }
  return { awarded: r.changes > 0, boosted: 0 };
}

const USER_ID = 1;

const books = db.prepare(`
  SELECT b.id, b.name, b.isbn
  FROM books b
  JOIN user_books ub ON b.id = ub.book_id
  WHERE ub.user_id = ? AND b.is_container = 0
    AND b.asin IS NULL
    AND (b.isbn LIKE '9780%' OR b.isbn LIKE '9781%')
  ORDER BY b.id
`).all(USER_ID);

let applied = 0, skipped = 0, totalXp = 0;

db.transaction(() => {
  for (const book of books) {
    const asin = isbn13toIsbn10(book.isbn);
    if (!asin) { skipped++; continue; }
    db.prepare('UPDATE books SET asin = ? WHERE id = ?').run(asin, book.id);
    const r = awardXp(USER_ID, 'add_asin', book.id);
    totalXp += r.boosted;
    applied++;
  }
})();

const finalXp = db.prepare('SELECT xp FROM users WHERE id = ?').get(USER_ID).xp;
console.log(`ASIN set:    ${applied} books`);
console.log(`Skipped:     ${skipped} (invalid ISBN format)`);
console.log(`XP gained:   +${totalXp}`);
console.log(`Total XP:    ${finalXp}`);
