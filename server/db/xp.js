'use strict';

// XP / leveling / coins / progress-XP awarding, plus impersonation tokens and the
// demo-book builder (both lived in this same stretch of the original server/db.js,
// kept here verbatim rather than relocated - see git history/docs for why). This is
// the one domain module required by nearly every other one (books, feed, admin,
// forum, parties all award XP/coins), the same role state.js plays on the frontend.

const { db } = require('./connection');
const { generateToken } = require('./auth');
const { isImpersonatingContext } = require('../impersonation-context');

// ── Impersonation tokens ──────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS impersonation_tokens (
    token      TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  );
`);

// ── XP configuration ─────────────────────────────────────────────────────────
db.prepare(`CREATE TABLE IF NOT EXISTS xp_config (
  event  TEXT PRIMARY KEY,
  amount REAL NOT NULL
)`).run();

const _xpDefaults = {
  discover_node: 1, visit_node: 2, discover_all: 30, visit_all: 40,
  add_note: 5, set_priority: 2, mark_battle: 3, set_color: 2,
  run_depth: 25, death_run: 15, battle_run: 15, win_run: 20,
  first_win: 100, first_loss: 50, first_battle_death: 25,
  // Same achievements as above, still once-per-book (not per-series) - just
  // worth more when that book's first win/loss/battle-death happens to occur
  // as part of an open-world series run, since that represents more
  // investment (persistent character sheet, potentially several books) than
  // a plain single-book run.
  first_win_ow: 150, first_loss_ow: 75, first_battle_death_ow: 40,
  share_run: 20, charsheet_run: 10, charsheet_saved: 40,
  notebook_saved: 40, rate_book: 25, add_to_library: 15, add_book: 50,
  add_isbn: 20, add_issn: 20, add_asin: 20, add_pages: 5,
  add_authors: 10, add_description: 40, make_book_public: 100,
  upload_cover: 15, favorite_cover: 5, add_book_to_series: 10,
  add_series_number: 5, add_book_to_anthology: 10, add_anthology_order: 5,
  create_series: 50, add_series_description: 10, make_series_public: 100,
  series_open_world: 150, book_added_by_other: 100, series_added_by_other: 100,
  join_party: 50, create_party: 75, upload_avatar: 25, public_profile: 75,
  pdf_available: 150, export_book: 50, export_all: 200, idle_heartbeat: 1,
  forum_thread: 25, forum_post: 5, party_formed: 0,
  inventory_started: 25, add_item: 5, add_charsheet_field: 5, rate_series: 25,
  equipment_started: 25, equip_item: 5,
  battlesim_win: 10, battlesim_loss: 5,
  // per-book rates for group milestones (actual award = rate × book count)
  discover_all_series: 30, discover_all_anthology: 30,
  visit_all_series: 40,    visit_all_anthology: 40,
  won_all_series: 20,      won_all_anthology: 20,
};
db.transaction(() => {
  const ins = db.prepare('INSERT OR IGNORE INTO xp_config (event, amount) VALUES (?, ?)');
  for (const [event, amount] of Object.entries(_xpDefaults)) ins.run(event, amount);
})();

let _xpCache = new Map(db.prepare('SELECT event, amount FROM xp_config').all().map(r => [r.event, r.amount]));

function getXpAmount(event) { return _xpCache.get(event) ?? 0; }
function getXpConfig()      { return db.prepare('SELECT event, amount FROM xp_config ORDER BY event').all(); }
function setXpAmount(event, amount) {
  db.prepare('INSERT OR REPLACE INTO xp_config (event, amount) VALUES (?, ?)').run(event, amount);
  _xpCache.set(event, amount);
}

function createImpersonationToken(userId) {
  // Purge any stale tokens for this user first
  db.prepare(`DELETE FROM impersonation_tokens WHERE user_id = ? OR created_at < strftime('%s','now') - 300`).run(userId);
  const token = generateToken();
  db.prepare('INSERT INTO impersonation_tokens (token, user_id) VALUES (?, ?)').run(token, userId);
  return token;
}

function consumeImpersonationToken(token) {
  const row = db.prepare(
    `SELECT user_id FROM impersonation_tokens WHERE token = ? AND created_at > strftime('%s','now') - 300`
  ).get(token);
  if (!row) return null;
  db.prepare('DELETE FROM impersonation_tokens WHERE token = ?').run(token);
  return row.user_id;
}

// ── XP / Leveling ─────────────────────────────────────────────────────────────

const TITLES = [
  'Newborn',          //   0
  'Lost Soul',        //   1
  'Stray',            //   2
  'Wandering Eye',    //   3
  'Curious Soul',     //   4
  'Seeker',           //   5
  'Fledgling',        //   6
  'Novice',           //   7
  'Initiate',         //   8
  'Student',          //   9
  'Apprentice',       //  10
  'Wanderer',         //  11
  'Drifter',          //  12
  'Rover',            //  13
  'Roamer',           //  14
  'Traveller',        //  15
  'Wayfarer',         //  16
  'Scout',            //  17
  'Ranger',           //  18
  'Journeyman',       //  19
  'Trailblazer',      //  20
  'Explorer',         //  21
  'Pioneer',          //  22
  'Surveyor',         //  23
  'Discoverer',       //  24
  'Frontiersman',     //  25
  'Pathbreaker',      //  26
  'Realm Walker',     //  27
  'Horizon Seeker',   //  28
  'Lore Hunter',      //  29
  'Outrider',         //  30
  'Pathfinder',       //  31
  'Guide',            //  32
  'Navigator',        //  33
  'Wayfinder',        //  34
  'Trail Marshal',    //  35
  'Route Keeper',     //  36
  'Mapper',           //  37
  'Chartist',         //  38
  'Lorekeeper',       //  39
  'Chronicler',       //  40
  'Cartographer',     //  41
  'Mapmaker',         //  42
  'Geographer',       //  43
  'Atlas Keeper',     //  44
  'Realm Scribe',     //  45
  'Land Warden',      //  46
  'World Mapper',     //  47
  'Domain Keeper',    //  48
  'Grand Surveyor',   //  49
  'Chief Cartographer', // 50
  'Adventurer',       //  51
  'Bold Wanderer',    //  52
  'Daring Scout',     //  53
  'Fortune Seeker',   //  54
  'Risk Taker',       //  55
  'Danger Walker',    //  56
  'Iron Will',        //  57
  'Brave Heart',      //  58
  'Fearless One',     //  59
  'Undaunted',        //  60
  'Veteran',          //  61
  'Seasoned Hand',    //  62
  'Old Guard',        //  63
  'Grizzled Tracker', //  64
  'Battle-Scarred',   //  65
  'Proven Explorer',  //  66
  'Tested Wayfarer',  //  67
  'Hardened Soul',    //  68
  'Ironclad',         //  69
  'Elder',            //  70
  'Champion',         //  71
  'Conqueror',        //  72
  'Victor',           //  73
  'Vanquisher',       //  74
  'Undefeated',       //  75
  'Master',           //  76
  'Grand Master',     //  77
  'Paragon',          //  78
  'Exemplar',         //  79
  'Peerless',         //  80
  'Hero',             //  81
  'Guardian',         //  82
  'Defender',         //  83
  'Protector',        //  84
  'Stalwart',         //  85
  'Bastion',          //  86
  'Paladin',          //  87
  'Luminary',         //  88
  'Beacon',           //  89
  'Vanguard',         //  90
  'Legend',           //  91
  'Myth',             //  92
  'Immortal',         //  93
  'Demigod',          //  94
  'Ascendant',        //  95
  'Exalted',          //  96
  'Transcendent',     //  97
  'Eternal',          //  98
  'Timeless',         //  99
  'Godwalker',        // 100
];

function computeLevel(xp) {
  if (xp <= 0) return 0;
  const n = Math.floor((-1 + Math.sqrt(1 + 8 * xp / 1000)) / 2);
  return Math.min(n, 100);
}

function xpForLevel(n) {
  return 1000 * n * (n + 1) / 2;
}

function getTitleForLevel(level) {
  return TITLES[Math.min(Math.max(level, 0), 100)];
}

const _insertNotif = db.prepare(
  'INSERT INTO notifications (user_id, type, payload) VALUES (?, ?, ?)'
);

let _xpFeedHook = null;

function setXpFeedHook(fn) {
  _xpFeedHook = typeof fn === 'function' ? fn : null;
}

// Fires on every successful XP/coin award for any user - powers the admin-only
// "someone else earned XP/GC" floaters. Distinct from _xpFeedHook, which only
// fires on level-up and carries no amount.
let _appXpHook = null;

function setAppXpHook(fn) {
  _appXpHook = typeof fn === 'function' ? fn : null;
}

const _awardCoinsTx = db.transaction((userId, event, ref, amount) => {
  const r = db.prepare(
    'INSERT OR IGNORE INTO coin_events (user_id, event, ref, amount) VALUES (?, ?, ?, ?)'
  ).run(userId, event, String(ref), amount);
  if (r.changes > 0 && amount > 0) {
    db.prepare('UPDATE users SET bonus_coins = bonus_coins + ? WHERE id = ?').run(amount, userId);
    const row = db.prepare('SELECT xp, coins_spent, bonus_coins FROM users WHERE id = ?').get(userId);
    const balance = Math.floor((row?.xp || 0) / 1000) + (row?.bonus_coins || 0) - (row?.coins_spent || 0);
    _insertNotif.run(userId, 'coin_gain', JSON.stringify({ amount, balance, reason: event }));
    try { _appXpHook?.({ userId, coinDelta: amount }); } catch (_) {}
  }
  return r.changes > 0;
});

// Central safety net: no coins are ever awarded while the current request's
// account is impersonated, regardless of which route/db function triggered
// this call - see impersonation-context.js for why this lives here instead
// of at each individual call site.
function awardCoins(userId, event, ref, amount) {
  if (isImpersonatingContext()) return false;
  return _awardCoinsTx(userId, event, String(ref), amount);
}

// ── Bonus GC lottery ─────────────────────────────────────────────────────────
// A small chance, rolled on every genuine XP event (not deduped repeats - see
// the r.changes > 0 gate around the call site below), of a bonus gold coin
// appearing for the player to claim on the landing screen. Base chance is
// level × 0.01%, uncapped. Players can also buy extra chance in the shop
// (shop_items 'gc_chance', same escalating-cost pattern as xp_boost/undo/
// etc.), capped at `level` purchases so purchased chance never exceeds the
// level-based amount. Only one pending coin can exist at a time - rolling
// while one is already waiting is a silent no-op, not a wasted/replaced roll.
// `pending`/`gcChancePurchased` are passed in from _awardXpTx's own `before`
// row - this fires on every XP event (very hot path: idle_heartbeat alone
// ticks once a minute per active user, on top of every discover/visit/etc.),
// so it deliberately doesn't run its own extra SELECT for data the caller
// already has in hand.
function _rollBonusGc(userId, xp, pending, gcChancePurchased) {
  if (pending) return;
  const level = computeLevel(xp);
  const purchased = Math.min(gcChancePurchased || 0, level);
  const chance = (level + purchased) * 0.0001; // 0.01% per level + 0.01% per purchase
  if (chance > 0 && Math.random() < chance) {
    db.prepare('UPDATE users SET pending_bonus_gc = 1, bonus_gc_generated = bonus_gc_generated + 1 WHERE id = ?').run(userId);
  }
}

// Clearing the flag and awarding the coin happen in one transaction so a
// claim can never clear the flag without actually paying out (or vice
// versa). awardCoins() is called from inside here - better-sqlite3 nests
// transactions as savepoints, same pattern _awardXpTx already uses below
// for level-up coins.
const _claimBonusGcTx = db.transaction((userId) => {
  const row = db.prepare('SELECT pending_bonus_gc FROM users WHERE id = ?').get(userId);
  if (!row?.pending_bonus_gc) return { error: 'nothing_to_claim' };
  db.prepare('UPDATE users SET pending_bonus_gc = 0 WHERE id = ?').run(userId);
  awardCoins(userId, 'bonus_gc_claim', Date.now(), 1);
  return { ok: true };
});

// Same central safety net as awardCoins/awardXp above.
function claimBonusGc(userId) {
  if (isImpersonatingContext()) return { error: 'impersonating' };
  return _claimBonusGcTx(userId);
}

const _awardXpTx = db.transaction((userId, event, ref, amount) => {
  const before      = db.prepare('SELECT xp, xp_boost_pct, xp_boost_carry, coins_spent, bonus_coins, pending_bonus_gc, bonus_gc_chance_purchased FROM users WHERE id = ?').get(userId);
  const beforeXp    = before?.xp ?? 0;
  const boost       = before?.xp_boost_pct ?? 0;
  const carry       = before?.xp_boost_carry ?? 0;
  const coinsSpent  = before?.coins_spent ?? 0;
  const bonusCoins  = before?.bonus_coins ?? 0;
  const baseAmount  = Math.max(0, Number(amount) || 0);
  const baseWhole   = Math.floor(baseAmount);
  const rawExtra    = baseAmount > 0 ? baseAmount * (boost / 1000) : 0;
  const totalExtra  = rawExtra + carry;
  const extraWhole  = Math.floor(totalExtra);
  const newCarry    = totalExtra - extraWhole;
  const boosted     = baseWhole + extraWhole;
  const r = db.prepare(
    'INSERT OR IGNORE INTO xp_events (user_id, event, ref) VALUES (?, ?, ?)'
  ).run(userId, event, ref);
  if (r.changes > 0) _rollBonusGc(userId, beforeXp, before?.pending_bonus_gc, before?.bonus_gc_chance_purchased);
  if (r.changes > 0 && boosted > 0) {
    db.prepare('UPDATE users SET xp = xp + ?, xp_from_boost = xp_from_boost + ?, xp_boost_carry = ? WHERE id = ?').run(boosted, extraWhole, newCarry, userId);
    try { _appXpHook?.({ userId, xpDelta: boosted }); } catch (_) {}
    const after    = db.prepare('SELECT xp FROM users WHERE id = ?').get(userId)?.xp ?? 0;
    const lvBefore = computeLevel(beforeXp);
    const lvAfter  = computeLevel(after);
    const ins      = db.prepare('INSERT OR IGNORE INTO xp_events (user_id, event, ref, template_id) VALUES (?, ?, ?, ?)');
    const _tmplRow = db.prepare('SELECT id FROM level_up_templates WHERE active = 1 ORDER BY RANDOM() LIMIT 1');
    for (let lv = lvBefore + 1; lv <= lvAfter; lv++) {
      const tmplId = _tmplRow.get()?.id ?? null;
      ins.run(userId, 'level_up', String(lv), tmplId);
      _insertNotif.run(userId, 'level_up', JSON.stringify({ level: lv, title: getTitleForLevel(lv) }));
      awardCoins(userId, 'level_up_coin', lv, 1);
    }
    const levelsGained = lvAfter - lvBefore;
    if (levelsGained > 0) {
      db.prepare('UPDATE users SET xp_boost_pct = xp_boost_pct + ? WHERE id = ?').run(levelsGained, userId);
      try { _xpFeedHook?.({ type: 'feed_changed', entity: 'profile', action: 'level_up', id: userId }); } catch (_) {}
    }
    const coinsBefore = Math.floor(beforeXp / 1000);
    const coinsAfter  = Math.floor(after / 1000);
    const coinsGained = coinsAfter - coinsBefore;
    if (coinsGained > 0) {
      _insertNotif.run(userId, 'coin_gain', JSON.stringify({ amount: coinsGained, balance: coinsAfter + bonusCoins - coinsSpent, reason: 'xp_milestone' }));
    }
  }
  return r.changes > 0;
});

// Same central safety net as awardCoins above.
function awardXp(userId, event, ref, amountOverride = null) {
  if (isImpersonatingContext()) return false;
  const amount = amountOverride ?? getXpAmount(event);
  return _awardXpTx(userId, event, String(ref), amount);
}

function awardIdleHeartbeatXp(userId) {
  const base = getXpAmount('idle_heartbeat');
  const row  = db.prepare('SELECT xp, bonus_heartbeat_xp, heartbeat_carry FROM users WHERE id = ?').get(userId);
  const purchased  = row?.bonus_heartbeat_xp ?? 0;
  const freeBoosts = Math.max(0, computeLevel(row?.xp || 0) - 10);
  const carry      = row?.heartbeat_carry ?? 0;
  const rawAmount   = base + ((purchased + freeBoosts) * 0.1);
  const total       = rawAmount + carry;
  const wholeAmount = Math.floor(total);
  const newCarry    = total - wholeAmount;
  const minuteRef   = String(Math.floor(Date.now() / 60_000));
  const awarded = awardXp(userId, 'idle_heartbeat', minuteRef, wholeAmount);
  if (awarded) db.prepare('UPDATE users SET heartbeat_carry = ? WHERE id = ?').run(newCarry, userId);
  if (awarded) {
    const banked     = db.prepare('SELECT heartbeat_minutes_banked FROM users WHERE id = ?').get(userId)?.heartbeat_minutes_banked || 0;
    const liveCount  = db.prepare("SELECT COUNT(*) AS n FROM xp_events WHERE user_id = ? AND event = 'idle_heartbeat'").get(userId)?.n || 0;
    const playDays   = Math.floor((banked + liveCount) / 1440);
    if (playDays > 0) awardCoins(userId, 'playtime_24h', playDays, 1);
  }
  return awarded;
}

function getUserXpInfo(userId) {
  const row  = db.prepare('SELECT xp, coins_spent, xp_boost_pct, bonus_undos, bonus_fast_travels, bonus_heartbeat_xp, bonus_coins, admin_gifted_coins, xp_from_boost, bonus_gc_chance_purchased, pending_bonus_gc FROM users WHERE id = ?').get(userId);
  const bonusGcClaimed = db.prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM coin_events WHERE user_id = ? AND event = 'bonus_gc_claim'").get(userId).n;
  const xp   = row?.xp || 0;
  const level = computeLevel(xp);
  const coinsEarned  = Math.floor(xp / 1000) + (row?.bonus_coins || 0);
  const coinsBalance = coinsEarned - (row?.coins_spent || 0);
  return {
    xp,
    level,
    title:             getTitleForLevel(level),
    levelXp:           xpForLevel(level),
    nextLevelXp:       level < 100 ? xpForLevel(level + 1) : null,
    coinsEarned,
    coinsBalance,
    coinsSpent:        row?.coins_spent          || 0,
    bonusCoins:        row?.bonus_coins          || 0,
    adminGiftedCoins:  row?.admin_gifted_coins   || 0,
    xpBoostPct:        (row?.xp_boost_pct || 0) / 10,
    xpBoostPurchased:  Math.max(0, (row?.xp_boost_pct || 0) - level),
    bonusUndos:        row?.bonus_undos       || 0,
    bonusFastTravels:  row?.bonus_fast_travels || 0,
    bonusHeartbeatXp:     row?.bonus_heartbeat_xp || 0,
    bonusHeartbeatXpFree: Math.max(0, level - 10),
    xpFromBoost:       row?.xp_from_boost     || 0,
    bonusGcChancePurchased: row?.bonus_gc_chance_purchased || 0,
    pendingBonusGc:         !!row?.pending_bonus_gc,
    bonusGcClaimed:         bonusGcClaimed,
  };
}

function getBookCreator(bookId) {
  const row = db.prepare('SELECT created_by FROM books WHERE id = ?').get(bookId);
  return row?.created_by ?? null;
}

function getBookIdentifiers(userId, bookId) {
  // Verify the user tracks this book, then return shared identifier columns
  // userId=null skips the ownership check (admin edits of other users' books)
  if (userId !== null) {
    const ub = db.prepare('SELECT book_id FROM user_books WHERE book_id = ? AND user_id = ?').get(bookId, userId);
    if (!ub) return { isbn: null, issn: null, asin: null, pages: null, authors: null, description: null, is_public: 0 };
  }
  const row = db.prepare('SELECT isbn, issn, asin, pages, authors, description, discoverable_sections, is_public FROM books WHERE id = ?').get(bookId);
  if (!row) return { isbn: null, issn: null, asin: null, pages: null, authors: null, description: null, discoverable_sections: null, is_public: 0 };
  return { isbn: row.isbn || null, issn: row.issn || null, asin: row.asin || null, pages: row.pages || null, authors: row.authors || null, description: row.description || null, discoverable_sections: row.discoverable_sections ?? null, is_public: row.is_public ?? 0 };
}

// A choices array entry isn't guaranteed to already be a number the way a
// graph object key already is (Object.keys always stringifies, but a raw
// choices[] value can be either, depending on how it was stored) - adding
// it to a Set unnormalized let '13' (string) and 13 (number) count as two
// separate discovered sections instead of one, inflating discover_all's
// count well past the book's real total and awarding it before the player
// had actually seen everything. Same normalization graph.js's client-side
// _bfsDepth/_getPositionedNeighbors already needed for the identical reason.
function _normSec(v) {
  const n = Number(v);
  return (!isNaN(n) && n > 0) ? n : (v !== -1 && v !== 0 && v !== '-1' && v !== '0' ? v : null);
}

function _discoveredSet(graph) {
  const s = new Set();
  for (const [sec, data] of Object.entries(graph)) {
    const id = _normSec(sec);
    if (id !== null) s.add(id);
    for (const c of (data.choices || [])) {
      const cid = _normSec(c);
      if (cid !== null) s.add(cid);
    }
  }
  return s;
}

// Mirrors public/js/state.js's mappedCountFor() predicate exactly - a manually-
// added node (bg.js's "+ Add node", no `discovered` flag) reads as fully mapped
// immediately even with zero choices, same as any node with real choices/
// portals. Used so such nodes also count toward visit_all/book_completed -
// a deliberately-noted bonus episode (e.g. one the player knows about from
// reading the book directly, not from playing) shouldn't block 100%
// completion just because it was never walked into via an actual playthrough.
function _mappedSet(graph) {
  const s = new Set();
  for (const [sec, data] of Object.entries(graph)) {
    if (!data?.discovered || (data.choices || []).length > 0 || (data.portals || []).length > 0) {
      const id = _normSec(sec);
      if (id !== null) s.add(id);
    }
  }
  return s;
}

// pt.path entries come straight from client navigation, same unnormalized-
// string-vs-number risk _discoveredSet above has for choices[] - without
// _normSec here, a run whose path mixes string and number section ids would
// undercount toward visit_all in the opposite direction discover_all was
// overcounting (each real section counted as 2 distinct "visited" entries
// inflates the numerator here too, but the more common failure mode is
// visit_all never reaching 100% because the set looks artificially larger
// than the book's own effective total).
function _visitedSet(playthroughs) {
  const s = new Set();
  for (const pt of playthroughs)
    for (const sec of (pt.path || [])) {
      const id = _normSec(sec);
      if (id !== null) s.add(id);
    }
  return s;
}

// _visitedSet only sees CURRENT playthroughs, so a section visited in a run that was
// later deleted silently disappears from it even though the section really was visited
// (the graph entry recording its choices survives run deletion, but pt.path doesn't).
// The visit_node XP ledger is append-only (INSERT OR IGNORE, never deleted) and is
// exactly the permanent record of every section ever actually visited for this book -
// use it as the source of truth for "has the player visited everything," falling back
// to it only when the live count looks short, to avoid the extra query in the common case.
function _permanentVisitedCount(userId, bookId) {
  return db.prepare(`SELECT COUNT(*) AS n FROM xp_events WHERE user_id = ? AND event = 'visit_node' AND ref LIKE ?`)
    .get(userId, `${bookId}:%`).n;
}

// Shared demo state builder - single source of truth for graph/positions/runs.
// createDemoBook, refreshDemoBooks, and getDemoBookState all call this.
//
// Structure: a mostly linear spine (1→5→8→11→14→17→18→21→22→26→29/30) with
// short two-node branch pairs. Sections 4, 7, 12, 15 are referenced as choices
// but never mapped - they appear as grey "discovered" nodes on the graph.
// Three demo runs cover the mapped sections; those four nodes remain unvisited.
function _buildDemoState(now, day) {
  return {
    bookName:      'Demo Book',
    totalSections: 50,
    graph: {
      // START
      1:  { choices: [2, 3] },

      // LEFT PATH - underground/dungeon
      2:  { choices: [5, 6],   priority: 'high', note: 'Steps lead to a torchlit guardroom - the guard dozes at his post' },
      5:  { choices: [9, 10],  note: 'Guardroom: a ring of keys hangs by the door, or try the ventilation shaft' },
      6:  { choices: [9],      priority: 'low',  note: 'Tight crawl through the shaft - filthy, but the guard never stirs' },
      // 10 → discovered-only
      9:  { choices: [14, 15], note: 'The old vault: hinges look weak - force it, or hunt for the combination?' },
      14: { choices: [22],     priority: 'high', note: 'The signet ring gleams on the shelf - exactly what you came for' },
      15: { choices: [22, 23], note: 'Storage room - barrels, rope, and two doors' },
      // 23 → discovered-only

      // RIGHT PATH - upper floors
      3:  { choices: [7, 8],   note: "Rope ladder creaks - above, candlelight spills from a high window" },
      7:  { choices: [11, 12], priority: 'high', note: 'A library, undisturbed for years - old map on the desk, or the hidden panel?' },
      8:  { choices: [12, 13], note: 'The study: a locked bureau or the narrow window ledge?' },
      11: { choices: [20, 21], note: "The map marks two ways through the east wing - north corridor or servants' passage" },
      12: { choices: [21],     priority: 'low',  note: 'The hidden passage runs one-way - no turning back from here' },
      13: { choices: [-1],     priority: 'low',  note: 'The ledge crumbles - you grab for the ivy but it tears away' },
      // 20 → discovered-only
      21: { choices: [28, 29], note: "The servants' passage opens onto a wide gallery" },

      // CONVERGENCE - mid-game hub
      22: { choices: [30, 31], note: 'The undercroft - torches gutter in the draught. Two ways out.' },
      28: { choices: [30, 32], priority: 'high', note: 'East balcony - courtyard below, battlements above' },
      29: { choices: [32],     note: "The servants' stair winds up to the battlements" },

      // LATE GAME
      30: { choices: [36, 37], note: 'The courtyard at night - gatehouse to the west, stables to the east' },
      31: { choices: [36],     priority: 'low',  note: 'The well shaft surfaces near the gatehouse - you emerge muddy but unseen' },
      32: { choices: [38, 39], note: 'The battlements: a signal fire ready to light, or the postern gate below?' },
      36: { choices: [42, 43], note: 'Gatehouse - the portcullis chain, or the narrow side door?' },
      37: { choices: [43, 44], priority: 'high', note: "A saddled horse waits in the last stall - the groom hasn't noticed you yet" },
      38: { choices: [44],     note: 'The signal fire blazes - minutes later, a lantern blinks from the river' },
      39: { choices: [45, 46], note: 'The postern gate groans as you lift the latch - a guard turns at the sound' },

      // ENDINGS
      42: { choices: [-1],     priority: 'low',  note: "The portcullis drops with a thunderous crash - you're trapped" },
      43: { choices: [48],     priority: 'high', note: 'Hoofbeats fade into the night as the castle disappears behind you' },
      44: { choices: [48, 49], note: 'The dock - a skiff tied to the post and a rowboat drifting loose' },
      45: { choices: [-1],     note: "The guard's shout brings a dozen more - swords flash in the torchlight" },
      46: { choices: [49],     priority: 'high', note: 'You slip through the gate and melt into the shadows beyond the walls' },
      48: { choices: [0],      note: 'Riding hard through the night, the signet ring safe in your pocket - a new chapter begins' },
      49: { choices: [0],      note: 'The current carries you downstream, exhausted but alive - and free' },
    },
    playthroughs: [
      {
        path: [1, 2, 5, 9, 14, 22, 30, 36, 42],
        completed: true, result: 'death',
        startedAt: now - 9 * day, completedAt: now - 7 * day, lastActionAt: now - 7 * day,
        undosUsed: 0, fastTravelsUsed: 0, charSheet: { fields: [] },
        diceState: { count: 2, lastRoll: [1, 3] },
      },
      {
        path: [1, 3, 7, 11, 21, 28, 32, 38, 44, 48],
        completed: true, result: 'success',
        startedAt: now - 6 * day, completedAt: now - 4 * day, lastActionAt: now - 4 * day,
        undosUsed: 1, fastTravelsUsed: 0, charSheet: { fields: [] },
        diceState: { count: 2, lastRoll: [6, 5] },
      },
      {
        path: [1, 3, 8, 12, 21],
        completed: false, result: null,
        startedAt: now - 3 * day, lastActionAt: now - 1 * day,
        undosUsed: 0, fastTravelsUsed: 0, charSheet: { fields: [] },
        diceState: { count: 2, lastRoll: null },
      },
    ],
    activePtIndex: 2,
    charSheetTemplate: null,
    positions: {
       1: { x:    0, y:    0 },
       2: { x: -360, y:  180 },
       3: { x:  360, y:  180 },
       5: { x: -540, y:  360 },
       6: { x: -180, y:  360 },
       7: { x:  180, y:  360 },
       8: { x:  540, y:  360 },
       9: { x: -540, y:  540 },
      10: { x: -180, y:  540 },  // discovered-only
      11: { x:  180, y:  540 },
      12: { x:  360, y:  540 },
      13: { x:  540, y:  540 },
      14: { x: -720, y:  720 },
      15: { x: -360, y:  720 },
      20: { x:  120, y:  720 },  // discovered-only
      21: { x:  360, y:  720 },
      22: { x: -540, y:  900 },
      23: { x: -180, y:  900 },  // discovered-only
      28: { x:  180, y:  900 },
      29: { x:  540, y:  900 },
      30: { x: -180, y: 1080 },
      31: { x: -540, y: 1080 },
      32: { x:  360, y: 1080 },
      36: { x: -360, y: 1260 },
      37: { x:    0, y: 1260 },
      38: { x:  360, y: 1260 },
      39: { x:  540, y: 1260 },
      42: { x: -540, y: 1440 },
      43: { x: -180, y: 1440 },
      44: { x:  180, y: 1440 },
      45: { x:  540, y: 1440 },
      46: { x:  360, y: 1440 },
      48: { x:    0, y: 1620 },
      49: { x:  360, y: 1620 },
    },
    viewport: { x: 0, y: 900, scale: 0.35 },
  };
}

function createDemoBook(userId) {
  const now = Date.now(), day = 24 * 60 * 60 * 1000;
  const state = { isDemoBook: true, ..._buildDemoState(now, day) };
  const bookResult = db.prepare(
    `INSERT INTO books (name, total_sections, is_demo, created_at, updated_at)
     VALUES (?, ?, 1, strftime('%s','now'), strftime('%s','now'))`
  ).run('Demo Book', 50);
  const bookId = bookResult.lastInsertRowid;
  db.prepare(
    `INSERT INTO user_books (user_id, book_id, state_data, created_at, updated_at)
     VALUES (?, ?, ?, strftime('%s','now'), strftime('%s','now'))`
  ).run(userId, bookId, JSON.stringify(state));
  return bookId;
}

function refreshDemoBooks() {
  const now = Date.now(), day = 24 * 60 * 60 * 1000;
  const bookIds = db.prepare("SELECT id FROM books WHERE is_demo = 1").all().map(r => r.id);
  for (const bookId of bookIds) {
    const state = { isDemoBook: true, ..._buildDemoState(now, day) };
    db.prepare("UPDATE books SET name = ?, total_sections = ?, updated_at = strftime('%s','now') WHERE id = ?")
      .run('Demo Book', 50, bookId);
    db.prepare("UPDATE user_books SET state_data = ?, updated_at = strftime('%s','now') WHERE book_id = ?")
      .run(JSON.stringify(state), bookId);
  }
}

function getDemoBookState() {
  const now = Date.now(), day = 24 * 60 * 60 * 1000;
  return _buildDemoState(now, day);
}

// ── Group milestone helpers ───────────────────────────────────────────────────

// Check if user has achieved perBookEvent on all books in series/anthology,
// and if so award the group event. INSERT OR IGNORE prevents re-award if new
// books are later added after the milestone was already earned.
function _checkGroupMilestone(userId, seriesId, parentBookId, perBookEvent, seriesEvent, anthologyEvent, awardCoinsOnComplete = false) {
  if (seriesId) {
    const total = db.prepare(
      'SELECT COUNT(*) AS n FROM books WHERE series_id = ? AND is_demo = 0 AND is_container = 0'
    ).get(seriesId).n;
    if (total > 0) {
      const missing = db.prepare(`
        SELECT COUNT(*) AS n FROM books b
        WHERE b.series_id = ? AND b.is_demo = 0 AND b.is_container = 0
          AND NOT EXISTS (
            SELECT 1 FROM xp_events xe
            WHERE xe.user_id = ? AND xe.event = ? AND xe.ref = CAST(b.id AS TEXT)
          )
      `).get(seriesId, userId, perBookEvent).n;
      if (missing === 0) {
        awardXp(userId, seriesEvent, String(seriesId), total * getXpAmount(seriesEvent));
        if (awardCoinsOnComplete) awardCoins(userId, seriesEvent, String(seriesId), total);
      }
    }
  }
  if (parentBookId) {
    const total = db.prepare(
      'SELECT COUNT(*) AS n FROM books WHERE parent_book_id = ? AND is_demo = 0'
    ).get(parentBookId).n;
    if (total > 0) {
      const missing = db.prepare(`
        SELECT COUNT(*) AS n FROM books b
        WHERE b.parent_book_id = ? AND b.is_demo = 0
          AND NOT EXISTS (
            SELECT 1 FROM xp_events xe
            WHERE xe.user_id = ? AND xe.event = ? AND xe.ref = CAST(b.id AS TEXT)
          )
      `).get(parentBookId, userId, perBookEvent).n;
      if (missing === 0) {
        awardXp(userId, anthologyEvent, String(parentBookId), total * getXpAmount(anthologyEvent));
        if (awardCoinsOnComplete) awardCoins(userId, anthologyEvent, String(parentBookId), total);
      }
    }
  }
}

// For wins, the ref is '{bookId}:{runIndex}' so we need LIKE matching.
function _checkGroupWonAll(userId, seriesId, parentBookId) {
  if (seriesId) {
    const total = db.prepare(
      'SELECT COUNT(*) AS n FROM books WHERE series_id = ? AND is_demo = 0 AND is_container = 0'
    ).get(seriesId).n;
    if (total > 0) {
      const missing = db.prepare(`
        SELECT COUNT(*) AS n FROM books b
        WHERE b.series_id = ? AND b.is_demo = 0 AND b.is_container = 0
          AND NOT EXISTS (
            SELECT 1 FROM xp_events xe
            WHERE xe.user_id = ? AND xe.event = 'win_run'
              AND xe.ref LIKE (CAST(b.id AS TEXT) || ':%')
          )
      `).get(seriesId, userId).n;
      if (missing === 0) awardXp(userId, 'won_all_series', String(seriesId), total * getXpAmount('won_all_series'));
    }
  }
  if (parentBookId) {
    const total = db.prepare(
      'SELECT COUNT(*) AS n FROM books WHERE parent_book_id = ? AND is_demo = 0'
    ).get(parentBookId).n;
    if (total > 0) {
      const missing = db.prepare(`
        SELECT COUNT(*) AS n FROM books b
        WHERE b.parent_book_id = ? AND b.is_demo = 0
          AND NOT EXISTS (
            SELECT 1 FROM xp_events xe
            WHERE xe.user_id = ? AND xe.event = 'win_run'
              AND xe.ref LIKE (CAST(b.id AS TEXT) || ':%')
          )
      `).get(parentBookId, userId).n;
      if (missing === 0) awardXp(userId, 'won_all_anthology', String(parentBookId), total * getXpAmount('won_all_anthology'));
    }
  }
}

// Per-playthrough state keys used by every battle simulator module (see
// processStateXp below) - kept as one list so a future sim just needs
// adding here, not duplicated at each call site. sim201/sim202/sim203 were
// missing from this list for a while after each shipped (silently no
// battlesim_win/battlesim_loss XP for those three books) until caught and
// backfilled - sim209/sim210/sim211 quietly repeated the exact same gap
// (each shipped without a corresponding addition here) until caught again
// while adding sim212 - this list still isn't wired to anything that would
// catch a future sim missing from it automatically, so it's worth
// double-checking here specifically whenever a new battlesimNNN.js ships.
// 'sim829' (not 'battleSim') matches server/db.js's one-time pt.battleSim ->
// pt.sim829 rename, which brought book 829 in line with every other sim's
// pt.simNNN naming (it predates that convention).
const SIM_HISTORY_KEYS = ['sim829', 'sim8', 'sim286', 'sim198', 'sim199', 'sim200', 'sim186', 'sim201', 'sim202', 'sim203', 'sim83', 'sim86', 'sim114', 'sim115', 'sim123', 'sim130', 'sim92', 'sim108', 'sim216', 'sim193', 'sim217', 'sim526', 'sim322', 'sim323', 'sim324', 'sim325', 'sim122', 'sim80', 'sim82', 'sim118', 'sim218', 'sim430', 'sim204', 'sim205', 'sim206', 'sim207', 'sim208', 'sim209', 'sim210', 'sim211', 'sim212', 'sim213', 'sim214', 'sim215', 'sim219'];

function processStateXp(userId, bookId, oldState, newState, totalSections) {
  if (newState?.isDemoBook) return;
  // Use discoverable_sections as the effective ceiling if set, else fall back to totalSections
  const bookRow   = db.prepare('SELECT discoverable_sections, series_id, parent_book_id FROM books WHERE id = ?').get(bookId);
  const effective = bookRow?.discoverable_sections ?? totalSections;

  // For open world series, per-run XP uses a series-scoped ref so that propagation
  // across books (via _syncSeriesRuns) cannot award the same event multiple times.
  const seriesRow = bookRow?.series_id
    ? db.prepare('SELECT is_open_world FROM series WHERE id = ?').get(bookRow.series_id)
    : null;
  const owSeriesId = seriesRow?.is_open_world ? bookRow.series_id : null;

  const oldGraph = oldState?.graph || {};
  const newGraph = newState?.graph || {};
  const oldPts   = oldState?.playthroughs || [];
  const newPts   = newState?.playthroughs || [];

  // Discovered nodes - always per-book (genuinely different work in each book)
  const oldDisc = _discoveredSet(oldGraph);
  const newDisc = _discoveredSet(newGraph);
  for (const sec of newDisc)
    if (!oldDisc.has(sec)) awardXp(userId, 'discover_node', `${bookId}:${sec}`);
  if (effective > 0 && newDisc.size >= effective && oldDisc.size < effective) {
    awardXp(userId, 'discover_all', bookId);
    _checkGroupMilestone(userId, bookRow?.series_id, bookRow?.parent_book_id,
      'discover_all', 'discover_all_series', 'discover_all_anthology');
  }

  // Visited nodes - always per-book
  const oldVis = _visitedSet(oldPts);
  const newVis = _visitedSet(newPts);
  for (const sec of newVis)
    if (!oldVis.has(sec)) awardXp(userId, 'visit_node', `${bookId}:${sec}`);
  if (effective > 0 && oldVis.size < effective) {
    // Union with _mappedSet so manually-added/noted nodes (never walked into
    // via a real playthrough, but already showing 100% in the "Mapped" stat)
    // can complete the book too - see _mappedSet's own comment.
    const combined = new Set([...newVis, ...(_mappedSet(newGraph))]);
    const trulyVisited = combined.size >= effective ? combined.size : Math.max(combined.size, _permanentVisitedCount(userId, bookId));
    if (trulyVisited >= effective) {
      awardXp(userId, 'visit_all', bookId);
      awardCoins(userId, 'book_completed', bookId, 1);
      _checkGroupMilestone(userId, bookRow?.series_id, bookRow?.parent_book_id,
        'visit_all', 'visit_all_series', 'visit_all_anthology', true);
    }
  }

  // Notes, priorities, and battle flags - always per-book
  for (const [sec, data] of Object.entries(newGraph)) {
    if (data.note     && !oldGraph[sec]?.note)     awardXp(userId, 'add_note',     `${bookId}:${sec}`);
    if (data.priority && !oldGraph[sec]?.priority) awardXp(userId, 'set_priority', `${bookId}:${sec}`);
    if (data.battle   && !oldGraph[sec]?.battle)   awardXp(userId, 'mark_battle',  `${bookId}:${sec}`);
    if (data.color    && !oldGraph[sec]?.color)    awardXp(userId, 'set_color',    `${bookId}:${sec}`);
  }

  // Character sheet fields added beyond the book's template - diffed against the
  // template (not the previous save) so a fresh run started from a template doesn't
  // award XP for the template's own fields, only ones the user adds afterwards.
  // Field ids are preserved verbatim when a template is copied into a new run
  // (see ui.js startPlaythrough), so any id absent from the template is user-added.
  const templateFieldIds = new Set(
    (newState?.charSheetTemplate?.fields ?? []).map(f => f?.id).filter(id => id != null)
  );

  // Per-run events - use series-scoped ref for open world so propagation across books
  // doesn't re-award the same event (UNIQUE constraint on user_id+event+ref deduplicates).
  // The ref uses the run's own startedAt timestamp, not its array index - a deleted run's
  // old index can be reused by an unrelated later run, and an index-based ref would make
  // that later run's rewards collide with (and get silently blocked by) the deleted run's
  // leftover xp_events rows. startedAt is assigned once at creation and never reused.
  // run_depth is the one deliberate exception - see below.
  let _anyRunJustCompleted = false;
  for (let i = 0; i < newPts.length; i++) {
    const oldPt = oldPts[i];
    const newPt = newPts[i];
    // A synced series-run placeholder that was never actually played in this book
    // (open-world.js's _syncSeriesRuns pads every book in a series with one slot per
    // series run so numbers stay aligned) still gets its charSheet/result mirrored
    // onto it for display, but must never earn this book's per-run XP - skip it
    // entirely. Matches _syncSeriesRuns' own touchedHere check - startedAt alone,
    // not path.length: a since-fixed open-world.js bug could inject a single path
    // entry into an untouched placeholder without ever setting startedAt, which
    // defeated a path.length-based guard.
    if (newPt && !newPt.startedAt) continue;
    const runKey = newPt?.startedAt ?? i;
    const ref    = owSeriesId ? `series:${owSeriesId}:${runKey}` : `${bookId}:${runKey}`;

    if (!oldPt?.completed && newPt?.completed) {
      _anyRunJustCompleted = true;
      if (newPt.result === 'death') {
        awardXp(userId, 'death_run', ref);
        // first_win/first_loss/first_battle_death use bookId as ref (not
        // series-scoped) so they fire once per book per user regardless of
        // open-world status - but pay out more when this particular
        // completion happens as part of an open-world series run.
        awardXp(userId, 'first_loss', String(bookId), owSeriesId ? getXpAmount('first_loss_ow') : null);
      } else if (newPt.result === 'battle') {
        awardXp(userId, 'battle_run', ref);
        awardXp(userId, 'first_battle_death', String(bookId), owSeriesId ? getXpAmount('first_battle_death_ow') : null);
      } else if (newPt.result === 'success') {
        awardXp(userId, 'win_run', ref);
        awardXp(userId, 'first_win', String(bookId), owSeriesId ? getXpAmount('first_win_ow') : null);
        // won_all checks only make sense for non-open-world books (open world has series_run_completed)
        if (!owSeriesId) _checkGroupWonAll(userId, bookRow?.series_id, bookRow?.parent_book_id);
      }
    }
    if (!oldPt?.isPublic && newPt?.isPublic)
      awardXp(userId, 'share_run', ref);
    if (!oldPt?.charSheetEdited && newPt?.charSheetEdited)
      awardXp(userId, 'charsheet_saved', ref);
    // Same template-inheritance issue add_charsheet_field already guards against below:
    // a run started from a template copies the template's fields immediately (see
    // ui.js startPlaythrough), so "fields.length > 0" is trivially true for every new
    // run with a template configured, with zero real action - award only if at least
    // one field isn't from the template, i.e. the player actually engaged with it.
    const hadOwnField = (oldPt?.charSheet?.fields ?? []).some(f => f?.id != null && !templateFieldIds.has(f.id));
    const hasOwnField  = (newPt?.charSheet?.fields ?? []).some(f => f?.id != null && !templateFieldIds.has(f.id));
    if (!hadOwnField && hasOwnField)
      awardXp(userId, 'charsheet_run', ref);
    for (const field of (newPt?.charSheet?.fields ?? [])) {
      if (field?.id != null && !templateFieldIds.has(field.id))
        awardXp(userId, 'add_charsheet_field', `${ref}:${field.id}`);
    }

    // run_depth deliberately keeps the OLD index-based ref (not the startedAt-based
    // `ref` above): starting a run costs nothing, so re-creating a run at the *same*
    // slot after deleting it should not re-earn this - only a genuinely new, never-
    // before-used slot should. Index-based dedup gives exactly that: slot 24 re-created
    // after being deleted collides with its own old award (correctly no XP); a brand
    // new slot 26 has never been used, so it awards fresh. This is intentionally
    // different from the events above, which must survive slot reuse because
    // completing/sharing/editing a charsheet each represents real, distinct effort.
    const oldLen = oldPt?.path?.length ?? 0;
    const newLen = newPt?.path?.length ?? 0;
    if (oldLen < 1 && newLen >= 1)
      awardXp(userId, 'run_depth', owSeriesId ? `series:${owSeriesId}:${i}` : `${bookId}:${i}`);

    // Battle simulators (all, listed in SIM_HISTORY_KEYS) each log
    // finished battles into their own history array with an identical
    // { outcome: 'win'|'loss', ts } shape - award a small, repeatable amount
    // per outcome using the entry's own ts as the ref (same trick
    // idle_heartbeat uses for a naturally-unique, non-colliding ref per real
    // event, rather than the "once ever" dedup most other events use).
    // Deliberately no per-book/per-sim distinction - simulator practice
    // isn't real playthrough progress, so it's not worth a bigger reward or
    // an anti-farm mechanism, just a small nod for using it.
    // Compares by max ts, not array length - history used to be capped at
    // 100 entries via .shift() (removed 2026-08-09, now a true lifetime
    // log), and a length-only comparison would have silently stopped
    // awarding XP forever once that cap was hit. Kept the ts comparison
    // even after removing the cap since it's still correct and there's no
    // reason to change working logic for it.
    for (const simKey of SIM_HISTORY_KEYS) {
      const oldHist = oldPt?.[simKey]?.history ?? [];
      const newHist = newPt?.[simKey]?.history ?? [];
      if (!newHist.length) continue;
      const oldMaxTs = oldHist.reduce((max, e) => Math.max(max, e?.ts ?? 0), 0);
      for (const entry of newHist) {
        if (!entry || (entry.ts ?? 0) <= oldMaxTs) continue;
        if (entry.outcome === 'win')  awardXp(userId, 'battlesim_win',  `${simKey}:${entry.ts}`);
        if (entry.outcome === 'loss') awardXp(userId, 'battlesim_loss', `${simKey}:${entry.ts}`);
      }
    }
  }

  // Reconciliation safety net: the transition check above (`!oldPt?.completed && newPt?.completed`)
  // compares against a snapshot that can go stale under racing saves (e.g. two tabs saving the
  // same book close together), silently skipping a completion's award forever since it never
  // sees the transition again. Since awardXp's ref is unique per run-index and INSERT OR IGNORE
  // no-ops anything already logged, it's safe (and cheap - only runs when the fast path above
  // found nothing) to re-scan every completed run and let the ledger itself be the source of
  // truth, self-healing any gap on the very next save of this book.
  if (!_anyRunJustCompleted) {
    // Excludes untouched series-run placeholders (see the same guard on the fast path
    // above) - a leaked completed:true on one would otherwise re-earn XP on every
    // single save of this book forever, since this net has no "just transitioned"
    // requirement at all.
    const _touched = pt => !!pt?.startedAt;
    const completedCount = newPts.filter(pt => pt?.completed && _touched(pt)).length;
    if (completedCount > 0) {
      const refPrefix = owSeriesId ? `series:${owSeriesId}:` : `${bookId}:`;
      const loggedCount = db.prepare(
        "SELECT COUNT(*) AS n FROM xp_events WHERE user_id = ? AND event IN ('win_run','death_run','battle_run') AND ref LIKE ?"
      ).get(userId, `${refPrefix}%`)?.n || 0;
      if (loggedCount < completedCount) {
        for (let i = 0; i < newPts.length; i++) {
          const newPt = newPts[i];
          if (!newPt?.completed || !_touched(newPt)) continue;
          const ref = `${refPrefix}${newPt?.startedAt ?? i}`;
          let awarded = false;
          if (newPt.result === 'death') {
            awarded = awardXp(userId, 'death_run', ref);
            if (awarded) awardXp(userId, 'first_loss', String(bookId), owSeriesId ? getXpAmount('first_loss_ow') : null);
          } else if (newPt.result === 'battle') {
            awarded = awardXp(userId, 'battle_run', ref);
            if (awarded) awardXp(userId, 'first_battle_death', String(bookId), owSeriesId ? getXpAmount('first_battle_death_ow') : null);
          } else if (newPt.result === 'success') {
            awarded = awardXp(userId, 'win_run', ref);
            if (awarded) {
              awardXp(userId, 'first_win', String(bookId), owSeriesId ? getXpAmount('first_win_ow') : null);
              if (!owSeriesId) _checkGroupWonAll(userId, bookRow?.series_id, bookRow?.parent_book_id);
            }
          }
          if (awarded) _anyRunJustCompleted = true;
        }
      }
    }
  }

  // 1 GC per 100 completed runs milestone - only check when a run just finished
  if (_anyRunJustCompleted) {
    const totalCompleted = db.prepare(
      "SELECT COUNT(*) AS n FROM xp_events WHERE user_id = ? AND event IN ('win_run','death_run','battle_run')"
    ).get(userId)?.n || 0;
    const milestones = Math.floor(totalCompleted / 100);
    for (let m = 1; m <= milestones; m++) {
      awardCoins(userId, 'runs_milestone', String(m * 100), 1);
    }
  }

  // Inventory XP - diff across all playthroughs, batched in one transaction
  const _invItems = pts => new Set(
    pts.flatMap(pt => (pt.inventory ?? []).map(s => (typeof s === 'number' ? s : s?.itemId)).filter(id => id != null))
  );
  const oldItems = _invItems(oldPts);
  const newItems = _invItems(newPts);
  if (oldItems.size > 0 || newItems.size > 0) {
    db.transaction(() => {
      if (oldItems.size === 0 && newItems.size > 0)
        awardXp(userId, 'inventory_started', String(bookId));
      for (const itemId of newItems)
        if (!oldItems.has(itemId)) awardXp(userId, 'add_item', `${bookId}:${itemId}`);
    })();
  }

  // Equipment XP - same pattern as inventory, diffed across all playthroughs.
  const _eqItems = pts => new Set(
    pts.flatMap(pt => Object.values(pt.equipment ?? {}).map(e => e?.itemId).filter(id => id != null))
  );
  const oldEquip = _eqItems(oldPts);
  const newEquip = _eqItems(newPts);
  if (oldEquip.size > 0 || newEquip.size > 0) {
    db.transaction(() => {
      if (oldEquip.size === 0 && newEquip.size > 0)
        awardXp(userId, 'equipment_started', String(bookId));
      for (const itemId of newEquip)
        if (!oldEquip.has(itemId)) awardXp(userId, 'equip_item', `${bookId}:${itemId}`);
    })();
  }
}

function migrateXpForUser(userId) {
  const user = db.prepare('SELECT avatar_path, public_profile FROM users WHERE id = ?').get(userId);
  if (!user) return;

  if (user.avatar_path)   awardXp(userId, 'upload_avatar', userId);
  if (user.public_profile) awardXp(userId, 'public_profile', userId);

  const books = db.prepare(`
    SELECT b.id, b.total_sections, b.discoverable_sections, b.isbn, b.issn, b.asin, b.cover_path, b.is_demo, b.is_public, b.created_by, ub.state_data
    FROM user_books ub JOIN books b ON b.id = ub.book_id
    WHERE ub.user_id = ?
  `).all(userId);

  for (const book of books) {
    const bid       = book.id;
    const tot       = book.total_sections || 0;
    const effective = book.discoverable_sections ?? tot;
    awardXp(userId, 'add_book', bid);
    if (book.isbn) awardXp(userId, 'add_isbn', bid);
    if (book.issn) awardXp(userId, 'add_issn', bid);
    if (book.asin) awardXp(userId, 'add_asin', bid);
    if (book.cover_path) awardXp(userId, 'upload_cover', bid);
    if (book.is_public && book.created_by === userId) awardXp(userId, 'make_book_public', bid);

    let s; try { s = JSON.parse(book.state_data || '{}'); } catch { continue; }
    if (book.is_demo) continue;
    const graph = s.graph || {};
    const pts   = s.playthroughs || [];
    const templateFieldIds = new Set(
      (s.charSheetTemplate?.fields ?? []).map(f => f?.id).filter(id => id != null)
    );

    const disc = _discoveredSet(graph);
    for (const sec of disc) awardXp(userId, 'discover_node', `${bid}:${sec}`);
    if (effective > 0 && disc.size >= effective) awardXp(userId, 'discover_all', bid);

    const vis = _visitedSet(pts);
    for (const sec of vis) awardXp(userId, 'visit_node', `${bid}:${sec}`);
    const visOrMapped = new Set([...vis, ...(_mappedSet(graph))]);
    if (effective > 0 && visOrMapped.size >= effective) {
      awardXp(userId, 'visit_all', bid);
      awardCoins(userId, 'book_completed', bid, 1);
    }

    for (const [sec, data] of Object.entries(graph)) {
      if (data.note)     awardXp(userId, 'add_note',     `${bid}:${sec}`);
      if (data.priority) awardXp(userId, 'set_priority', `${bid}:${sec}`);
      if (data.color)    awardXp(userId, 'set_color',    `${bid}:${sec}`);
    }

    for (let i = 0; i < pts.length; i++) {
      const pt  = pts[i];
      const ref = `${bid}:${pt?.startedAt ?? i}`;
      if (pt.completed) {
        if (pt.result === 'death')   awardXp(userId, 'death_run', ref);
        else if (pt.result === 'success') awardXp(userId, 'win_run', ref);
      }
      if (pt.isPublic)                         awardXp(userId, 'share_run',     ref);
      // Same template-inheritance exclusion as processStateXp - see there for why.
      if ((pt.charSheet?.fields ?? []).some(f => f?.id != null && !templateFieldIds.has(f.id)))
        awardXp(userId, 'charsheet_run', ref);
      // run_depth deliberately stays index-based - see processStateXp for why.
      if ((pt.path || []).length >= 1) awardXp(userId, 'run_depth', `${bid}:${i}`);
    }
  }
}

function runXpMigration() {
  const migrated = new Set(
    db.prepare('SELECT DISTINCT user_id FROM xp_events').all().map(r => r.user_id)
  );
  const users = db.prepare('SELECT id FROM users').all();
  for (const u of users) {
    if (!migrated.has(u.id)) migrateXpForUser(u.id);
  }
}

function migratePublicBookXp() {
  const done = db.prepare(`SELECT value FROM admin_settings WHERE key = 'public_book_xp_migrated'`).get();
  if (done?.value === '1') return;
  const books = db.prepare(
    `SELECT id, created_by FROM books WHERE is_public = 1 AND is_demo = 0 AND created_by IS NOT NULL`
  ).all();
  for (const book of books) {
    awardXp(book.created_by, 'make_book_public', book.id);
  }
  db.prepare(`INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('public_book_xp_migrated', '1')`).run();
}

// One-time retroactive award of equipment_started/equip_item for gear equipped
// before this XP category existed.
function migrateEquipmentXp() {
  const done = db.prepare(`SELECT value FROM admin_settings WHERE key = 'equipment_xp_migrated'`).get();
  if (done?.value === '1') return;
  const rows = db.prepare(`
    SELECT ub.user_id, ub.book_id, ub.state_data, b.is_demo
    FROM user_books ub JOIN books b ON b.id = ub.book_id
  `).all();
  for (const row of rows) {
    if (row.is_demo) continue;
    let s; try { s = JSON.parse(row.state_data || '{}'); } catch { continue; }
    const pts = s.playthroughs || [];
    const itemIds = new Set(
      pts.flatMap(pt => Object.values(pt.equipment ?? {}).map(e => e?.itemId).filter(id => id != null))
    );
    if (itemIds.size === 0) continue;
    awardXp(row.user_id, 'equipment_started', String(row.book_id));
    for (const itemId of itemIds) awardXp(row.user_id, 'equip_item', `${row.book_id}:${itemId}`);
  }
  db.prepare(`INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('equipment_xp_migrated', '1')`).run();
}

module.exports = {
  createImpersonationToken, consumeImpersonationToken,
  getXpAmount, getXpConfig, setXpAmount,
  TITLES, computeLevel, xpForLevel, getTitleForLevel,
  setXpFeedHook, setAppXpHook,
  awardCoins, awardXp, awardIdleHeartbeatXp, getUserXpInfo, claimBonusGc,
  getBookCreator, getBookIdentifiers,
  _discoveredSet, _visitedSet, _mappedSet, _permanentVisitedCount,
  _buildDemoState, createDemoBook, refreshDemoBooks, getDemoBookState,
  _checkGroupMilestone, _checkGroupWonAll, processStateXp,
  migrateXpForUser, runXpMigration, migratePublicBookXp, migrateEquipmentXp,
  _insertNotif, SIM_HISTORY_KEYS,
};
