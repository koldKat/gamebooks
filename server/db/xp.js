'use strict';

// XP, levels, coins, and progress rewards.

const { db } = require('./connection');
const { generateToken } = require('./auth');
const { isImpersonatingContext } = require('../impersonation-context');
const { isCleanRun } = require('../clean-run');
const { diamondInfoForUser } = require('./diamonds');
const { rubyInfoForUser, createRubyCompletionChecker } = require('./rubies');
let _rubyCompletionChecker;
const { getJobTitle } = require('./job-xp');
const { advanceHeartbeatCoins } = require('./heartbeat-coins');

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
  first_win: 100, first_loss: 50, first_battle_death: 25, clean_run: 50,
  // First-outcome achievements remain per book; open-world completions use higher amounts.
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
  pdf_available: 150, epub_available: 150, export_book: 50, export_all: 200, idle_heartbeat: 1,
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
// Sequence per-use refs so awards remain unique when saves share a millisecond.
let _xpRefSeq = 0;

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
  'Archon',           // 101
  'Radiant',          // 102
  'Celestial',        // 103
  'Empyrean',         // 104
  'Astral',           // 105
  'Starforger',       // 106
  'Voidwalker',       // 107
  'Aeon',             // 108
  'Demiurge',         // 109
  'Worldshaper',      // 110
  'Realmbinder',      // 111
  'Ineffable',        // 112
  'Boundless',        // 113
  'Deathless',        // 114
  'Primordial',       // 115
  'Omniscient',       // 116
  'Omnipotent',       // 117
  'Apotheosis',       // 118
  'Absolute',         // 119
  'Infinite',         // 120
];

function computeLevel(xp) {
  if (xp <= 0) return 0;
  // Uncapped; the only ceiling is the live-user-count XP-accrual gate in _awardXpTx.
  return Math.floor((-1 + Math.sqrt(1 + 8 * xp / 1000)) / 2);
}

// Dynamic level cap = live registered user count. Cached briefly to avoid a COUNT per XP event.
let _userCount = { n: 0, at: 0 };
function _liveUserCount() {
  const now = Date.now();
  if (now - _userCount.at > 30_000) _userCount = { n: db.prepare('SELECT COUNT(*) AS n FROM users').get().n, at: now };
  return _userCount.n;
}

function xpForLevel(n) {
  return 1000 * n * (n + 1) / 2;
}

// Coin Mint: XP->coin conversion is scaled by (level + purchased) x 0.1%, with the
// base level share free for everyone and purchases capped at level - see purchaseShopItem.
function coinMintPct(xp, mintPurchased) {
  const level = computeLevel(xp);
  return (level + Math.min(mintPurchased || 0, level)) * 0.001;
}
function coinsFromXp(xp, mintPurchased) {
  return Math.floor(((xp || 0) / 1000) * (1 + coinMintPct(xp, mintPurchased)));
}
function xpUntilNextCoin(xp, mintPurchased) {
  const current = coinsFromXp(xp, mintPurchased);
  let low = 1, high = 1000;
  // The mint rate may increase at the next level. Use the actual earning
  // calculation so the countdown includes that bonus and integer rounding.
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (coinsFromXp(xp + middle, mintPurchased) > current) high = middle;
    else low = middle + 1;
  }
  return low;
}
// Spendable balance from a user row (xp, bonus_coins, coins_spent, bonus_gc_mint_purchased).
function coinBalance(row) {
  return coinsFromXp(row?.xp || 0, row?.bonus_gc_mint_purchased)
    + (row?.bonus_coins || 0) - (row?.coins_spent || 0);
}

function toRoman(n) {
  const map = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
  let r = '';
  for (const [v, s] of map) while (n >= v) { r += s; n -= v; }
  return r;
}

function getTitleForLevel(level) {
  const lv = Math.max(level, 0);
  const top = TITLES.length - 1;
  if (lv <= top) return TITLES[lv];
  return TITLES[top] + ' ' + toRoman(lv - top + 1);
}

const _insertNotif = db.prepare(
  'INSERT INTO notifications (user_id, type, payload) VALUES (?, ?, ?)'
);

let _xpFeedHook = null;

function setXpFeedHook(fn) {
  _xpFeedHook = typeof fn === 'function' ? fn : null;
}

// Reward hooks carry XP/coin amounts; the level-up feed hook does not.
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
    const row = db.prepare('SELECT xp, coins_spent, bonus_coins, bonus_gc_mint_purchased FROM users WHERE id = ?').get(userId);
    const balance = coinBalance(row);
    _insertNotif.run(userId, 'coin_gain', JSON.stringify({ amount, balance, reason: event }));
    try { _appXpHook?.({ userId, coinDelta: amount }); } catch (_) {}
  }
  return r.changes > 0;
});

// Reject all coin awards during impersonation, regardless of the caller.
function awardCoins(userId, event, ref, amount) {
  if (isImpersonatingContext()) return false;
  return _awardCoinsTx(userId, event, String(ref), amount);
}

// Roll bonus GC only for genuine XP awards; keep at most one pending coin.
// Chance is level x 0.01% plus purchased chance capped at level purchases.
// Reuse the caller's row to avoid extra reads on this hot path.
function _rollBonusGc(userId, xp, pending, gcChancePurchased) {
  if (pending) return;
  const level = computeLevel(xp);
  const purchased = Math.min(gcChancePurchased || 0, level);
  const chance = (level + purchased) * 0.0001; // 0.01% per level + 0.01% per purchase
  if (chance > 0 && Math.random() < chance) {
    db.prepare('UPDATE users SET pending_bonus_gc = 1, bonus_gc_generated = bonus_gc_generated + 1 WHERE id = ?').run(userId);
  }
}

// Clear the pending flag and award the coin atomically.
const _claimBonusGcTx = db.transaction((userId) => {
  const row = db.prepare('SELECT pending_bonus_gc FROM users WHERE id = ?').get(userId);
  if (!row?.pending_bonus_gc) return { error: 'nothing_to_claim' };
  const beforeDiamonds = _appXpHook
    ? db.prepare('SELECT diamonds_earned FROM user_diamonds WHERE user_id=?').get(userId)?.diamonds_earned || 0 : null;
  db.prepare('UPDATE users SET pending_bonus_gc = 0 WHERE id = ?').run(userId);
  awardCoins(userId, 'bonus_gc_claim', Date.now(), 1);
  const afterDiamonds = beforeDiamonds === null ? 0
    : db.prepare('SELECT diamonds_earned FROM user_diamonds WHERE user_id=?').get(userId)?.diamonds_earned || 0;
  return { ok: true, diamondDelta: beforeDiamonds === null ? 0 : afterDiamonds - beforeDiamonds };
});

// Same central safety net as awardCoins/awardXp above.
function claimBonusGc(userId) {
  if (isImpersonatingContext()) return { error: 'impersonating' };
  const result = _claimBonusGcTx.immediate(userId);
  if (result.diamondDelta > 0) {
    try { _appXpHook?.({ userId, diamondDelta: result.diamondDelta }); } catch (_) {}
  }
  return result;
}

const _awardXpTx = db.transaction((userId, event, ref, amount) => {
  const before      = db.prepare('SELECT xp, xp_boost_pct, xp_boost_carry, coins_spent, bonus_coins, pending_bonus_gc, bonus_gc_chance_purchased, bonus_gc_mint_purchased FROM users WHERE id = ?').get(userId);
  const beforeXp    = before?.xp ?? 0;
  const boost       = before?.xp_boost_pct ?? 0;
  const carry       = before?.xp_boost_carry ?? 0;
  // At the dynamic cap, XP buffers up to one below the next level and never crosses it: award plain
  // XP (no boost/carry) clamped to the room remaining, so a later signup lifts the cap and the next
  // XP tick levels up. The event insert + Lucky Coin roll below still fire regardless.
  const level       = computeLevel(beforeXp);
  const frozen      = _liveUserCount() <= level;
  const baseAmount  = Math.max(0, Number(amount) || 0);
  const baseWhole   = Math.floor(baseAmount);
  const rawExtra    = baseAmount > 0 ? baseAmount * (boost / 1000) : 0;
  const totalExtra  = rawExtra + carry;
  let   extraWhole  = Math.floor(totalExtra);
  let   newCarry    = totalExtra - extraWhole;
  let   boosted     = baseWhole + extraWhole;
  if (frozen) {
    boosted    = Math.min(baseWhole, Math.max(0, xpForLevel(level + 1) - 1 - beforeXp));
    extraWhole = 0;
    newCarry   = carry;
  }
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
    const mintPurchased = before?.bonus_gc_mint_purchased;
    const coinsBefore = coinsFromXp(beforeXp, mintPurchased);
    const coinsAfter  = coinsFromXp(after, mintPurchased);
    const coinsGained = coinsAfter - coinsBefore;
    if (coinsGained > 0) {
      const current = db.prepare('SELECT xp, coins_spent, bonus_coins, bonus_gc_mint_purchased FROM users WHERE id = ?').get(userId);
      _insertNotif.run(userId, 'coin_gain', JSON.stringify({ amount: coinsGained, balance: coinBalance(current), reason: 'xp_milestone' }));
    }
  }
  return r.changes > 0;
});

// Same central safety net as awardCoins above.
function awardXp(userId, event, ref, amountOverride = null) {
  if (isImpersonatingContext()) return false;
  const amount = amountOverride ?? getXpAmount(event);
  // Reuse the mining snapshot for feed changes, including a main level-up event
  // awarded during a heartbeat. Job events themselves never award XP or coins.
  const snapshot = () => db.prepare(`SELECT
    COALESCE((SELECT diamonds_earned FROM user_diamonds WHERE user_id=?),0) AS earned,
    COALESCE((SELECT xp FROM user_job_xp WHERE user_id=?),0) AS jobXp`).get(userId, userId);
  const before = (_xpFeedHook || (_appXpHook && event !== 'idle_heartbeat')) ? snapshot() : null;
  const awarded = _awardXpTx(userId, event, String(ref), amount);
  if (awarded && before) {
    const after = snapshot();
    if (after.earned > before.earned) {
      try { _appXpHook?.({ userId, diamondDelta: after.earned - before.earned }); } catch (_) {}
    }
    if (computeLevel(after.jobXp) > computeLevel(before.jobXp)) {
      try { _xpFeedHook?.({ type: 'feed_changed', entity: 'profile', action: 'job_level_up', id: userId }); } catch (_) {}
    }
  }
  return awarded;
}

function awardIdleHeartbeatXp(userId) {
  const base = getXpAmount('idle_heartbeat');
  const row  = db.prepare('SELECT xp, bonus_heartbeat_xp, heartbeat_carry, pending_bonus_gc, bonus_gc_chance_purchased FROM users WHERE id = ?').get(userId);
  const heartbeatCoinsAwarded = !!row && !isImpersonatingContext()
    && advanceHeartbeatCoins(db, userId, Math.floor(Date.now() / 60000));
  // At the dynamic cap, buffer idle XP toward the next level WITHOUT an idle_heartbeat event (so
  // playtime coins/carry stay frozen and can't dump on unfreeze), clamped so it never crosses the
  // level, and keep the Lucky Coin roll ticking.
  const curXp    = row?.xp || 0;
  const curLevel = computeLevel(curXp);
  if (!isImpersonatingContext() && _liveUserCount() <= curLevel) {
    const room       = Math.max(0, xpForLevel(curLevel + 1) - 1 - curXp);
    const freeBoosts = Math.max(0, curLevel - 10);
    const add        = Math.min(Math.floor(base + ((row?.bonus_heartbeat_xp ?? 0) + freeBoosts) * 0.1), room);
    if (add > 0) db.prepare('UPDATE users SET xp = xp + ? WHERE id = ?').run(add, userId);
    _rollBonusGc(userId, curXp, row?.pending_bonus_gc, row?.bonus_gc_chance_purchased);
    const pendingAfter = db.prepare('SELECT pending_bonus_gc FROM users WHERE id = ?').get(userId)?.pending_bonus_gc;
    return { awarded: add > 0, coinRolled: !row?.pending_bonus_gc && !!pendingAfter, heartbeatCoinsAwarded };
  }
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
  let coinRolled = false;
  if (awarded) {
    const banked     = db.prepare('SELECT heartbeat_minutes_banked FROM users WHERE id = ?').get(userId)?.heartbeat_minutes_banked || 0;
    const liveCount  = db.prepare("SELECT COUNT(*) AS n FROM xp_events WHERE user_id = ? AND event = 'idle_heartbeat'").get(userId)?.n || 0;
    const playDays   = Math.floor((banked + liveCount) / 1440);
    if (playDays > 0) awardCoins(userId, 'playtime_24h', playDays, 1);
    // Compare pending state after the transaction to report a newly generated coin immediately.
    const pendingAfter = db.prepare('SELECT pending_bonus_gc FROM users WHERE id = ?').get(userId)?.pending_bonus_gc;
    coinRolled = !row?.pending_bonus_gc && !!pendingAfter;
  }
  return { awarded: !!awarded, coinRolled, heartbeatCoinsAwarded };
}

function getUserXpInfo(userId) {
  const row  = db.prepare(`SELECT xp, coins_spent, xp_boost_pct, bonus_undos, bonus_fast_travels,
    bonus_heartbeat_xp, bonus_coins, admin_gifted_coins, xp_from_boost,
    bonus_gc_chance_purchased, bonus_gc_mint_purchased, pending_bonus_gc,
    bonus_diamond_dig_purchased, bonus_diamond_exchange_purchased,
    COALESCE((SELECT qualifying_events FROM user_diamonds WHERE user_id = users.id), 0) AS event_xp,
    COALESCE((SELECT xp FROM user_job_xp WHERE user_id = users.id), 0) AS job_xp,
    COALESCE((SELECT user_count/10 FROM job_xp_policy WHERE id=1), 0) AS job_level_cap,
    COALESCE((SELECT diamonds_earned FROM user_diamonds WHERE user_id = users.id), 0) AS diamonds_earned,
    COALESCE((SELECT diamonds_spent FROM user_diamonds WHERE user_id = users.id), 0) AS diamonds_spent,
    COALESCE((SELECT diamonds_bought FROM user_diamonds WHERE user_id = users.id), 0) AS diamonds_bought,
    COALESCE((SELECT dig_progress FROM user_diamonds WHERE user_id = users.id), 0) AS dig_progress,
    COALESCE((SELECT diamonds FROM diamond_market WHERE id=1),0) AS diamond_purchase_stock,
    COALESCE((SELECT heartbeat_count FROM user_heartbeat_coins WHERE user_id=users.id),0) AS heartbeat_count
    FROM users WHERE id = ?`).get(userId);
  const bonusGcClaimed = db.prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM coin_events WHERE user_id = ? AND event = 'bonus_gc_claim'").get(userId).n;
  const info = userXpInfoFromRow(row, bonusGcClaimed);
  const heartbeats = row?.heartbeat_count || 0;
  return { ...info, eventXp: row?.event_xp || 0, jobXp: row?.job_xp || 0, jobLevelCap: row?.job_level_cap || 0,
    jobLevel: computeLevel(row?.job_xp || 0),
    bronzeBalance: heartbeats % 100, silverBalance: Math.floor(heartbeats / 100) % 100,
    heartbeatGoldEarned: Math.floor(heartbeats / 10000), ...diamondInfoForUser(userId, row, info.level), ...rubyInfoForUser(db, userId) };
}

// Admin lists use the same calculations with two queries for the whole user set.
function getAllUsersXpInfo() {
  const claims = new Map(db.prepare(`SELECT user_id, SUM(amount) AS n FROM coin_events
    WHERE event = 'bonus_gc_claim' GROUP BY user_id`).all().map(row => [row.user_id, row.n]));
  return new Map(db.prepare(`SELECT id, xp, coins_spent, xp_boost_pct, bonus_undos,
    bonus_fast_travels, bonus_heartbeat_xp, bonus_coins, admin_gifted_coins,
    xp_from_boost, bonus_gc_chance_purchased, bonus_gc_mint_purchased, pending_bonus_gc,
    COALESCE((SELECT xp FROM user_job_xp WHERE user_id=users.id),0) AS job_xp,
    COALESCE((SELECT user_count/10 FROM job_xp_policy WHERE id=1),0) AS job_level_cap
    FROM users`).all().map(row => [row.id, userXpInfoFromRow(row, claims.get(row.id) || 0)]));
}

function userXpInfoFromRow(row, bonusGcClaimed) {
  const xp   = row?.xp || 0;
  const level = computeLevel(xp);
  const coinsEarned  = coinsFromXp(xp, row?.bonus_gc_mint_purchased) + (row?.bonus_coins || 0);
  const coinsBalance = coinsEarned - (row?.coins_spent || 0);
  return {
    xp,
    level,
    title:             getTitleForLevel(level),
    jobXp: row?.job_xp || 0,
    jobLevel: computeLevel(row?.job_xp || 0),
    jobTitle: getJobTitle(computeLevel(row?.job_xp || 0)),
    jobLevelCap: row?.job_level_cap || 0,
    levelXp:           xpForLevel(level),
    nextLevelXp:       level < 100 ? xpForLevel(level + 1) : null,
    coinsEarned,
    coinsBalance,
    coinXpUntilNext:    xpUntilNextCoin(xp, row?.bonus_gc_mint_purchased),
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
    bonusGcMintPurchased:   row?.bonus_gc_mint_purchased || 0,
    gcMintPct:              coinMintPct(xp, row?.bonus_gc_mint_purchased) * 100,
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

// Normalize section IDs before deduplicating discovered choices.
function _normSec(v) {
  const n = Number(v);
  return (!isNaN(n) && n > 0) ? n : (v !== -1 && v !== 0 && v !== '-1' && v !== '0' ? v : null);
}

function _discoveredSet(graph, excluded = []) {
  const s = new Set();
  for (const [sec, data] of Object.entries(graph)) {
    const id = _normSec(sec);
    if (id !== null) s.add(id);
    for (const c of (data.choices || [])) {
      const cid = _normSec(c);
      if (cid !== null) s.add(cid);
    }
  }
  for (const sec of excluded) s.delete(_normSec(sec));
  return s;
}

// Match the client's mapped predicate, including manually added and portal-only nodes.
function _mappedSet(graph, excluded = []) {
  const s = new Set();
  for (const [sec, data] of Object.entries(graph)) {
    if (!data?.discovered || (data.choices || []).length > 0 || (data.portals || []).length > 0) {
      const id = _normSec(sec);
      if (id !== null) s.add(id);
    }
  }
  for (const sec of excluded) s.delete(_normSec(sec));
  return s;
}

// Normalize path IDs before counting visited sections.
function _visitedSet(playthroughs, excluded = []) {
  const s = new Set();
  for (const pt of playthroughs)
    for (const sec of (pt.path || [])) {
      const id = _normSec(sec);
      if (id !== null) s.add(id);
    }
  for (const sec of excluded) s.delete(_normSec(sec));
  return s;
}

// Fall back to the permanent visit ledger when live runs fall short after deletion.
function _permanentVisitedCount(userId, bookId) {
  return db.prepare(`SELECT COUNT(*) AS n FROM xp_events x WHERE user_id = ? AND event = 'visit_node' AND ref LIKE ?
    AND NOT EXISTS (SELECT 1 FROM book_reading_entries e WHERE e.book_id = ? AND e.counts_as_section = 0
      AND x.ref = e.book_id || ':' || e.section_id)`)
    .get(userId, `${bookId}:%`, bookId).n;
}

function _checkGroupMilestone(userId, seriesId, parentBookId, perBookEvent, seriesEvent, anthologyEvent, awardCoinsOnComplete = false) {
  if (seriesId) {
    const total = db.prepare(
      'SELECT COUNT(*) AS n FROM books WHERE series_id = ? AND is_container = 0'
    ).get(seriesId).n;
    if (total > 0) {
      const missing = db.prepare(`
        SELECT COUNT(*) AS n FROM books b
        WHERE b.series_id = ? AND b.is_container = 0
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
      'SELECT COUNT(*) AS n FROM books WHERE parent_book_id = ?'
    ).get(parentBookId).n;
    if (total > 0) {
      const missing = db.prepare(`
        SELECT COUNT(*) AS n FROM books b
        WHERE b.parent_book_id = ?
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
      'SELECT COUNT(*) AS n FROM books WHERE series_id = ? AND is_container = 0'
    ).get(seriesId).n;
    if (total > 0) {
      const missing = db.prepare(`
        SELECT COUNT(*) AS n FROM books b
        WHERE b.series_id = ? AND b.is_container = 0
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
      'SELECT COUNT(*) AS n FROM books WHERE parent_book_id = ?'
    ).get(parentBookId).n;
    if (total > 0) {
      const missing = db.prepare(`
        SELECT COUNT(*) AS n FROM books b
        WHERE b.parent_book_id = ?
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

// Keep every simulator history key in this shared list so new simulators receive outcome XP.
const SIM_HISTORY_KEYS = ['sim829', 'sim8', 'sim286', 'sim198', 'sim199', 'sim200', 'sim186', 'sim201', 'sim202', 'sim203', 'sim83', 'sim86', 'sim114', 'sim115', 'sim123', 'sim130', 'sim92', 'sim108', 'sim216', 'sim193', 'sim217', 'sim526', 'sim527', 'sim528', 'sim529', 'sim530', 'sim531', 'sim532', 'sim533', 'sim322', 'sim323', 'sim324', 'sim325', 'sim122', 'sim80', 'sim82', 'sim118', 'sim218', 'sim430', 'sim204', 'sim205', 'sim206', 'sim207', 'sim208', 'sim209', 'sim210', 'sim211', 'sim212', 'sim213', 'sim214', 'sim215', 'sim219', 'sim220', 'sim221', 'sim222', 'sim224', 'sim370', 'sim375', 'sim376', 'sim377', 'sim378', 'sim78', 'sim107', 'sim135', 'sim223', 'sim317', 'sim318', 'sim319', 'sim320', 'sim397', 'sim321', 'sim398', 'sim399', 'sim414', 'sim415', 'sim416', 'sim225', 'sim431', 'sim432', 'sim226', 'sim227', 'sim228', 'sim229', 'sim230', 'sim231', 'sim232', 'sim233','sim434', 'sim435', 'sim436', 'sim437', 'sim438', 'sim439', 'sim440', 'sim441', 'sim462', 'sim463', 'sim464', 'sim465', 'sim468', 'sim234', 'sim235', 'sim716', 'sim734', 'sim739', 'sim740', 'sim753', 'sim760', 'sim772', 'sim781', 'sim869', 'sim871', 'sim161', 'sim877', 'sim881', 'sim882', 'sim236', 'sim237', 'sim238', 'sim239', 'sim240', 'sim241', 'sim242', 'sim243', 'sim244', 'sim245', 'sim246', 'sim247', 'sim248', 'sim249', 'sim250', 'sim251', 'sim252', 'sim259', 'sim260', 'sim273', 'sim433', 'sim541', 'sim661', 'sim696', 'sim263', 'sim264', 'sim253', 'sim267', 'sim256', 'sim257', 'sim258', 'sim255', 'sim254', 'sim272', 'sim274', 'sim275', 'sim276', 'sim278', 'sim279', 'sim280', 'sim400', 'sim401', 'sim402', 'sim412', 'sim481', 'sim491', 'sim486', 'sim521', 'sim522', 'sim523', 'sim524', 'sim534', 'sim535', 'sim536', 'sim537', 'sim539', 'sim550', 'sim548', 'sim555', 'sim557', 'sim570', 'sim636', 'sim644', 'sim648', 'sim654', 'sim658', 'sim663'];

SIM_HISTORY_KEYS.push('sim665', 'sim671', 'sim672', 'sim674', 'sim675', 'sim676', 'sim677', 'sim678', 'sim679', 'sim680', 'sim689', 'sim690', 'sim700', 'sim706', 'sim710', 'sim718', 'sim722', 'sim723', 'sim724', 'sim728', 'sim735', 'sim757', 'sim768', 'sim769', 'sim773', 'sim783', 'sim797', 'sim807', 'sim808', 'sim809', 'sim810', 'sim812', 'sim817', 'sim832');
SIM_HISTORY_KEYS.push('sim833');
SIM_HISTORY_KEYS.push('sim838');
SIM_HISTORY_KEYS.push('sim856');
SIM_HISTORY_KEYS.push('sim857');
SIM_HISTORY_KEYS.push('sim860');
SIM_HISTORY_KEYS.push('sim873');
SIM_HISTORY_KEYS.push('sim891');
SIM_HISTORY_KEYS.push('sim895');
SIM_HISTORY_KEYS.push('sim896');
SIM_HISTORY_KEYS.push('sim903');
SIM_HISTORY_KEYS.push('sim904');
SIM_HISTORY_KEYS.push('sim906');
SIM_HISTORY_KEYS.push('sim1285');
SIM_HISTORY_KEYS.push('sim1286');
SIM_HISTORY_KEYS.push('sim1287');
SIM_HISTORY_KEYS.push('sim1288');
const RETIRED_SIM_HISTORY_KEYS = ['sim758', 'sim2116'];

function processStateXp(userId, bookId, oldState, newState, totalSections) {
  // Use discoverable_sections as the effective ceiling if set, else fall back to totalSections
  const bookRow = db.prepare(`SELECT b.total_sections, b.discoverable_sections, b.series_id, b.parent_book_id,
    CASE WHEN e.counts_as_section = 0 THEN e.section_id END AS uncounted_entry
    FROM books b LEFT JOIN book_reading_entries e ON e.book_id = b.id WHERE b.id = ?`).get(bookId);
  const excluded = bookRow?.uncounted_entry == null ? [] : [bookRow.uncounted_entry];
  const effective = bookRow?.discoverable_sections ?? totalSections;

  // Series-scoped refs deduplicate rewards propagated across books.
  const seriesRow = bookRow?.series_id
    ? db.prepare('SELECT is_open_world FROM series WHERE id = ?').get(bookRow.series_id)
    : null;
  const owSeriesId = seriesRow?.is_open_world ? bookRow.series_id : null;

  const oldGraph = oldState?.graph || {};
  const newGraph = newState?.graph || {};
  const oldPts   = oldState?.playthroughs || [];
  const newPts   = newState?.playthroughs || [];

  function awardCleanRun(run, index) {
    const previous = oldPts.find(pt => pt?.startedAt === run.startedAt);
    if (!isCleanRun(run, previous)) return;
    const related = [];
    if (owSeriesId) {
      // Open-world runs share array slots across books; usage before a portal counts too.
      const rows = db.prepare(`SELECT ub.state_data FROM user_books ub
        JOIN books b ON b.id = ub.book_id
        WHERE ub.user_id = ? AND b.series_id = ? AND b.id != ?`)
        .all(userId, owSeriesId, bookId);
      for (const row of rows) {
        let data;
        try { data = JSON.parse(row.state_data || '{}'); } catch { return; }
        const pt = data?.playthroughs?.[index];
        if (pt?.startedAt) related.push(pt);
      }
    }
    if (isCleanRun(run, previous, related)) awardXp(userId, 'clean_run', String(bookId));
  }

  // Discovered nodes - always per-book (genuinely different work in each book)
  const oldDisc = _discoveredSet(oldGraph, excluded);
  const newDisc = _discoveredSet(newGraph, excluded);
  for (const sec of newDisc)
    if (!oldDisc.has(sec)) awardXp(userId, 'discover_node', `${bookId}:${sec}`);
  if (effective > 0 && newDisc.size >= effective && oldDisc.size < effective) {
    awardXp(userId, 'discover_all', bookId);
    _checkGroupMilestone(userId, bookRow?.series_id, bookRow?.parent_book_id,
      'discover_all', 'discover_all_series', 'discover_all_anthology');
  }

  // Visited nodes - always per-book
  const oldVis = _visitedSet(oldPts, excluded);
  const newVis = _visitedSet(newPts, excluded);
  for (const sec of newVis)
    if (!oldVis.has(sec)) awardXp(userId, 'visit_node', `${bookId}:${sec}`);
  if (effective > 0 && oldVis.size < effective) {
    // Include mapped/manual nodes so they can satisfy completion milestones.
    const combined = new Set([...newVis, ...(_mappedSet(newGraph, excluded))]);
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

  // Reward fields absent from the template, not inherited fields in fresh runs.
  const templateFieldIds = new Set(
    (newState?.charSheetTemplate?.fields ?? []).map(f => f?.id).filter(id => id != null)
  );

  // Use series-scoped, startedAt-based refs to deduplicate propagated rewards without reused-index collisions.
  let _anyRunJustCompleted = false;
  for (let i = 0; i < newPts.length; i++) {
    const oldPt = oldPts[i];
    const newPt = newPts[i];
    // Untouched series placeholders must never earn this book's run XP.
    if (newPt && !newPt.startedAt) continue;
    const runKey = newPt?.startedAt ?? i;
    const ref    = owSeriesId ? `series:${owSeriesId}:${runKey}` : `${bookId}:${runKey}`;

    if (!oldPt?.completed && newPt?.completed) {
      _anyRunJustCompleted = true;
      awardCleanRun(newPt, i);
      if (newPt.result === 'death') {
        awardXp(userId, 'death_run', ref);
        // First outcomes deduplicate per book, with higher amounts for open-world completions.
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
    // Award character-sheet use only for player-added fields, not template copies.
    const hadOwnField = (oldPt?.charSheet?.fields ?? []).some(f => f?.id != null && !templateFieldIds.has(f.id));
    const hasOwnField  = (newPt?.charSheet?.fields ?? []).some(f => f?.id != null && !templateFieldIds.has(f.id));
    if (!hadOwnField && hasOwnField)
      awardXp(userId, 'charsheet_run', ref);
    for (const field of (newPt?.charSheet?.fields ?? [])) {
      if (field?.id != null && !templateFieldIds.has(field.id))
        awardXp(userId, 'add_charsheet_field', `${ref}:${field.id}`);
    }

    // Keep run_depth index-based: recreating a previously rewarded slot must not earn it again.
    const oldLen = oldPt?.path?.length ?? 0;
    const newLen = newPt?.path?.length ?? 0;
    if (oldLen < 1 && newLen >= 1)
      awardXp(userId, 'run_depth', owSeriesId ? `series:${owSeriesId}:${i}` : `${bookId}:${i}`);

    // Award each simulator outcome by its history timestamp, not once per book.
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

  // Award every increase in undo/travel counters, including batched saves.
  const _uses = (pts, key) => (pts || []).reduce((n, pt) => n + Math.max(0, Math.floor(pt?.[key] ?? 0)), 0);
  const undoDelta = _uses(newPts, 'undosUsed') - _uses(oldPts, 'undosUsed');
  const ftDelta   = _uses(newPts, 'fastTravelsUsed') - _uses(oldPts, 'fastTravelsUsed');
  const _stamp = Date.now();
  for (let i = 0; i < undoDelta; i++) awardXp(userId, 'undo', `${bookId}:${_stamp}:u:${i}:${_xpRefSeq++}`);
  for (let i = 0; i < ftDelta;   i++) awardXp(userId, 'fast_travel', `${bookId}:${_stamp}:f:${i}:${_xpRefSeq++}`);

  // Reconcile completed runs against unique award refs to recover transitions missed by racing saves.
  if (!_anyRunJustCompleted) {
    // Exclude untouched series placeholders from reconciliation too.
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
          if (awarded) {
            awardCleanRun(newPt, i);
            _anyRunJustCompleted = true;
          }
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
  // Retry certification on a complete path too, including a previously failed award
  // or a catalog correction. Already granted rewards are cheap ledger lookups.
  const rubyCandidate = [...newVis].some(section => !oldVis.has(section))
    || (bookRow?.total_sections > 0 && newVis.size >= bookRow.total_sections);
  if (rubyCandidate && !isImpersonatingContext()) {
    _rubyCompletionChecker ||= createRubyCompletionChecker(db);
    const rubyDelta = _rubyCompletionChecker(userId, bookId);
    if (rubyDelta > 0) {
      try { _appXpHook?.({ userId, rubyDelta }); } catch (_) {}
    }
  }
}

function migrateXpForUser(userId) {
  const user = db.prepare('SELECT avatar_path, public_profile FROM users WHERE id = ?').get(userId);
  if (!user) return;

  if (user.avatar_path)   awardXp(userId, 'upload_avatar', userId);
  if (user.public_profile) awardXp(userId, 'public_profile', userId);

  const books = db.prepare(`
    SELECT b.id, b.total_sections, b.discoverable_sections, b.isbn, b.issn, b.asin, b.cover_path, b.is_public, b.created_by, ub.state_data,
      CASE WHEN e.counts_as_section = 0 THEN e.section_id END AS uncounted_entry
    FROM user_books ub JOIN books b ON b.id = ub.book_id
    LEFT JOIN book_reading_entries e ON e.book_id = b.id
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
    const graph = s.graph || {};
    const pts   = s.playthroughs || [];
    const templateFieldIds = new Set(
      (s.charSheetTemplate?.fields ?? []).map(f => f?.id).filter(id => id != null)
    );

    const excluded = book.uncounted_entry == null ? [] : [book.uncounted_entry];
    const disc = _discoveredSet(graph, excluded);
    for (const sec of disc) awardXp(userId, 'discover_node', `${bid}:${sec}`);
    if (effective > 0 && disc.size >= effective) awardXp(userId, 'discover_all', bid);

    const vis = _visitedSet(pts, excluded);
    for (const sec of vis) awardXp(userId, 'visit_node', `${bid}:${sec}`);
    const visOrMapped = new Set([...vis, ...(_mappedSet(graph, excluded))]);
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
    `SELECT id, created_by FROM books WHERE is_public = 1 AND created_by IS NOT NULL`
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
    SELECT ub.user_id, ub.book_id, ub.state_data
    FROM user_books ub JOIN books b ON b.id = ub.book_id
  `).all();
  for (const row of rows) {
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
  coinMintPct, coinsFromXp, coinBalance,
  setXpFeedHook, setAppXpHook,
  awardCoins, awardXp, awardIdleHeartbeatXp, getUserXpInfo, getAllUsersXpInfo, claimBonusGc,
  getBookCreator, getBookIdentifiers,
  _discoveredSet, _visitedSet, _mappedSet, _permanentVisitedCount,
  _checkGroupMilestone, _checkGroupWonAll, processStateXp,
  migrateXpForUser, runXpMigration, migratePublicBookXp, migrateEquipmentXp,
  _insertNotif, SIM_HISTORY_KEYS, RETIRED_SIM_HISTORY_KEYS,
};
