const fs       = require('fs');
const path     = require('path');
const crypto   = require('crypto');
const util     = require('util');

const scrypt = util.promisify(crypto.scrypt);

const {
  db, hasColumn,
  _toSortableString, _foldForSearch, _naturalCompare, _naturalCompareByName,
  _getPdfSize,
} = require('./db/connection');
const { getRandomTagline, getRandomLevelUpTemplate, getRandomJoinTemplate } = require('./db/content');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    salt          TEXT    NOT NULL,
    created_at    INTEGER DEFAULT (strftime('%s', 'now'))
  );
`);

// Migrations
try { db.exec(`ALTER TABLE users ADD COLUMN avatar_path    TEXT    DEFAULT NULL`);             } catch (_) {}
try { db.exec(`ALTER TABLE users ADD COLUMN xp             INTEGER NOT NULL DEFAULT 0`);       } catch (_) {}
try { db.exec(`ALTER TABLE users ADD COLUMN last_country   TEXT    DEFAULT NULL`);             } catch (_) {}
try { db.exec(`ALTER TABLE users ADD COLUMN last_city      TEXT    DEFAULT NULL`);             } catch (_) {}
try { db.exec(`ALTER TABLE users ADD COLUMN ui_prefs       TEXT    DEFAULT NULL`);             } catch (_) {}
try { db.exec(`ALTER TABLE users ADD COLUMN active_country TEXT    DEFAULT NULL`);             } catch (_) {}
try { db.exec(`ALTER TABLE users ADD COLUMN active_city    TEXT    DEFAULT NULL`);             } catch (_) {}
try { db.exec(`ALTER TABLE users ADD COLUMN active_loc_at  INTEGER DEFAULT NULL`);             } catch (_) {}

try { db.exec(`ALTER TABLE books ADD COLUMN isbn           TEXT    DEFAULT NULL`);             } catch (_) {}
try { db.exec(`ALTER TABLE books ADD COLUMN issn           TEXT    DEFAULT NULL`);             } catch (_) {}
try { db.exec(`ALTER TABLE books ADD COLUMN asin           TEXT    DEFAULT NULL`);             } catch (_) {}
try { db.exec(`ALTER TABLE books ADD COLUMN cover_path     TEXT    DEFAULT NULL`);             } catch (_) {}
try { db.exec(`ALTER TABLE user_books ADD COLUMN rating    REAL    DEFAULT NULL`);             } catch (_) {}
try { db.exec(`ALTER TABLE user_books ADD COLUMN notebook  TEXT    DEFAULT NULL`);             } catch (_) {}
try { db.exec(`ALTER TABLE books ADD COLUMN pages       INTEGER DEFAULT NULL`);               } catch (_) {}
try { db.exec(`ALTER TABLE books ADD COLUMN authors     TEXT    DEFAULT NULL`);               } catch (_) {}
try { db.exec(`ALTER TABLE books ADD COLUMN description          TEXT    DEFAULT NULL`);               } catch (_) {}
try { db.exec(`ALTER TABLE books ADD COLUMN discoverable_sections INTEGER DEFAULT NULL`);               } catch (_) {}
try { db.exec(`ALTER TABLE books ADD COLUMN created_by         INTEGER DEFAULT NULL`);               } catch (_) {}
try { db.exec(`ALTER TABLE users ADD COLUMN coins_spent          INTEGER NOT NULL DEFAULT 0`);        } catch (_) {}
try { db.exec(`ALTER TABLE users ADD COLUMN xp_boost_pct         INTEGER NOT NULL DEFAULT 0`);        } catch (_) {}
try { db.exec(`ALTER TABLE users ADD COLUMN bonus_undos           INTEGER NOT NULL DEFAULT 0`);        } catch (_) {}
try { db.exec(`ALTER TABLE users ADD COLUMN bonus_fast_travels    INTEGER NOT NULL DEFAULT 0`);        } catch (_) {}
try { db.exec(`ALTER TABLE users ADD COLUMN bonus_heartbeat_xp    INTEGER NOT NULL DEFAULT 0`);        } catch (_) {}
try { db.exec(`ALTER TABLE users ADD COLUMN bonus_coins           INTEGER NOT NULL DEFAULT 0`);        } catch (_) {}
try { db.exec(`ALTER TABLE users ADD COLUMN admin_gifted_coins    INTEGER NOT NULL DEFAULT 0`);        } catch (_) {}
try { db.exec(`ALTER TABLE users ADD COLUMN xp_from_boost         INTEGER NOT NULL DEFAULT 0`);        } catch (_) {}
try { db.exec(`ALTER TABLE users ADD COLUMN xp_boost_carry        REAL    NOT NULL DEFAULT 0`);        } catch (_) {}
try { db.exec(`ALTER TABLE users ADD COLUMN heartbeat_carry              REAL    NOT NULL DEFAULT 0`);        } catch (_) {}
try { db.exec(`ALTER TABLE users ADD COLUMN heartbeat_minutes_banked   INTEGER NOT NULL DEFAULT 0`);        } catch (_) {}
try { db.exec(`ALTER TABLE users ADD COLUMN bonus_gc_chance_purchased INTEGER NOT NULL DEFAULT 0`);        } catch (_) {}
try { db.exec(`ALTER TABLE users ADD COLUMN pending_bonus_gc          INTEGER NOT NULL DEFAULT 0`);        } catch (_) {}
try { db.exec(`ALTER TABLE users ADD COLUMN bonus_gc_generated        INTEGER NOT NULL DEFAULT 0`);        } catch (_) {}
// Backfill: bonus_gc_generated only started counting the moment the column was added,
// but coin_events' bonus_gc_claim rows (and any still-pending flag) predate it. A claim
// always implies a prior generation, and a currently-pending coin implies one more that
// hasn't been claimed yet, so claimed + pending is a safe floor for the true historical
// total. MAX() keeps this idempotent across restarts - it only ever raises the floor,
// never overwrites real counts accumulated since the column existed.
try {
  db.exec(`
    UPDATE users SET bonus_gc_generated = MAX(bonus_gc_generated, COALESCE((
      SELECT SUM(amount) FROM coin_events WHERE coin_events.user_id = users.id AND event = 'bonus_gc_claim'
    ), 0) + pending_bonus_gc)
  `);
} catch (_) {}
try { db.exec(`UPDATE users SET xp = CAST(xp AS INTEGER), xp_from_boost = CAST(xp_from_boost AS INTEGER) WHERE xp != CAST(xp AS INTEGER) OR xp_from_boost != CAST(xp_from_boost AS INTEGER)`); } catch (_) {}
try { db.exec(`ALTER TABLE books ADD COLUMN is_public             INTEGER NOT NULL DEFAULT 0`);        } catch (_) {}
try { db.exec(`ALTER TABLE forum_threads ADD COLUMN category_id   INTEGER DEFAULT NULL`);               } catch (_) {}
try { db.exec(`ALTER TABLE forum_threads ADD COLUMN edited_at     INTEGER DEFAULT NULL`);               } catch (_) {}
try { db.exec(`ALTER TABLE forum_posts   ADD COLUMN edited_at     INTEGER DEFAULT NULL`);               } catch (_) {}
try { db.exec(`ALTER TABLE user_books    ADD COLUMN party_id      INTEGER DEFAULT NULL`);               } catch (_) {}
db.exec(`CREATE INDEX IF NOT EXISTS idx_user_books_party_id ON user_books(party_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_user_books_book_id ON user_books(book_id)`);
try { db.exec(`ALTER TABLE user_books    ADD COLUMN bg_hidden     INTEGER NOT NULL DEFAULT 0`);         } catch (_) {}
try { db.exec(`ALTER TABLE user_books    ADD COLUMN bg_pos_y      REAL    NOT NULL DEFAULT 50`);        } catch (_) {}
try { db.exec(`ALTER TABLE users        ADD COLUMN is_author      INTEGER NOT NULL DEFAULT 0`);        } catch (_) {}
try { db.exec(`ALTER TABLE users        ADD COLUMN display_name   TEXT    DEFAULT NULL`);               } catch (_) {}
try { db.exec(`ALTER TABLE books        ADD COLUMN pdf_path       TEXT    DEFAULT NULL`);               } catch (_) {}
try { db.exec(`ALTER TABLE books        ADD COLUMN published_at   INTEGER DEFAULT NULL`);               } catch (_) {}
try { db.exec(`ALTER TABLE users        ADD COLUMN last_active_at INTEGER DEFAULT NULL`);               } catch (_) {}
try { db.exec(`ALTER TABLE users        ADD COLUMN is_contributor INTEGER NOT NULL DEFAULT 0`);         } catch (_) {}
try { db.exec(`ALTER TABLE users        ADD COLUMN pdf_access     INTEGER NOT NULL DEFAULT 0`);         } catch (_) {}
try { db.exec(`ALTER TABLE users        ADD COLUMN forum_seen_at  INTEGER NOT NULL DEFAULT 0`);         } catch (_) {}

// One-time migration: drop era and rarity columns from items table
{
  const done = db.prepare(`SELECT value FROM admin_settings WHERE key = 'items_drop_era_rarity'`).get();
  if (!done) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE items_new (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          name        TEXT    NOT NULL,
          type        TEXT    NOT NULL DEFAULT 'weapon',
          svg_data    TEXT    NOT NULL DEFAULT '',
          description TEXT    DEFAULT NULL,
          active      INTEGER NOT NULL DEFAULT 1,
          created_at  INTEGER DEFAULT (strftime('%s','now'))
        );
        INSERT INTO items_new (id, name, type, svg_data, description, active, created_at)
          SELECT id, name, type, svg_data, description, active, created_at FROM items;
        DROP TABLE items;
        ALTER TABLE items_new RENAME TO items;
      `);
      db.prepare(`INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('items_drop_era_rarity', '1')`).run();
    })();
  }
}

// One-time migration: set is_public = 1 for all pre-existing non-demo books (runs once only)
{
  const done = db.prepare(`SELECT value FROM admin_settings WHERE key = 'is_public_migrated'`).get();
  if (!done) {
    db.exec(`UPDATE books SET is_public = 1 WHERE is_demo = 0 AND is_public = 0`);
    db.prepare(`INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('is_public_migrated', '1')`).run();
  }
}

// One-time migration: assign created_by from the earliest user_books entry per book
{
  const missing = db.prepare('SELECT id FROM books WHERE created_by IS NULL').all();
  if (missing.length > 0) {
    const getEarliest = db.prepare('SELECT user_id FROM user_books WHERE book_id = ? ORDER BY created_at ASC LIMIT 1');
    const setCreator  = db.prepare('UPDATE books SET created_by = ? WHERE id = ?');
    db.transaction(() => {
      for (const book of missing) {
        const ub = getEarliest.get(book.id);
        if (ub) setCreator.run(ub.user_id, book.id);
      }
    })();
  }
}

try { db.exec(`ALTER TABLE users ADD COLUMN public_profile INTEGER NOT NULL DEFAULT 0`); } catch (_) {}
try { db.exec(`ALTER TABLE users ADD COLUMN hide_from_feed INTEGER NOT NULL DEFAULT 0`); } catch (_) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS xp_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    event      TEXT    NOT NULL,
    ref        TEXT    NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE UNIQUE INDEX IF NOT EXISTS ux_xp_events ON xp_events(user_id, event, ref);
  CREATE INDEX IF NOT EXISTS idx_xp_events_event_created ON xp_events(event, created_at);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS coin_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    event      TEXT    NOT NULL,
    ref        TEXT    NOT NULL,
    amount     INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE UNIQUE INDEX IF NOT EXISTS ux_coin_events ON coin_events(user_id, event, ref);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS feedback (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL,
    username         TEXT    NOT NULL,
    email            TEXT,
    message          TEXT    NOT NULL,
    created_at       INTEGER DEFAULT (strftime('%s', 'now')),
    is_read          INTEGER DEFAULT 0,
    admin_reply      TEXT,
    replied_at       INTEGER,
    reply_read       INTEGER DEFAULT 0,
    deleted_by_user  INTEGER DEFAULT 0,
    deleted_by_admin INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);
try { db.exec(`ALTER TABLE feedback ADD COLUMN deleted_by_user  INTEGER DEFAULT 0`); } catch (_) {}
try { db.exec(`ALTER TABLE feedback ADD COLUMN deleted_by_admin INTEGER DEFAULT 0`); } catch (_) {}
try { db.exec(`ALTER TABLE feedback ADD COLUMN admin_unread INTEGER DEFAULT 0`); } catch (_) {}
try { db.exec(`ALTER TABLE feedback ADD COLUMN user_unread  INTEGER DEFAULT 0`); } catch (_) {}
try { db.exec(`ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER DEFAULT 0`); } catch (_) {}
try { db.exec(`ALTER TABLE users ADD COLUMN locked_until INTEGER DEFAULT NULL`); } catch (_) {}
try { db.exec(`ALTER TABLE users ADD COLUMN is_protected INTEGER DEFAULT 0`); } catch (_) {}
try { db.exec(`ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0`); } catch (_) {}
try { db.exec(`ALTER TABLE users ADD COLUMN email TEXT DEFAULT NULL`); } catch (_) {}

db.exec(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token      TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);`);

// Series & anthology support
db.exec(`CREATE TABLE IF NOT EXISTS series (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE,
  description TEXT,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  INTEGER DEFAULT (strftime('%s','now'))
);`);
try { db.exec(`ALTER TABLE books ADD COLUMN series_id      INTEGER REFERENCES series(id) ON DELETE SET NULL`); } catch (_) {}
try { db.exec(`ALTER TABLE books ADD COLUMN series_number  TEXT    DEFAULT NULL`); } catch (_) {}
try { db.exec(`ALTER TABLE books ADD COLUMN is_container   INTEGER NOT NULL DEFAULT 0`); } catch (_) {}
try { db.exec(`ALTER TABLE books ADD COLUMN parent_book_id INTEGER REFERENCES books(id) ON DELETE SET NULL`); } catch (_) {}
try { db.exec(`ALTER TABLE books ADD COLUMN book_order     INTEGER DEFAULT NULL`); } catch (_) {}
try { db.exec(`ALTER TABLE books ADD COLUMN has_battle_sim INTEGER NOT NULL DEFAULT 0`); } catch (_) {}
db.exec(`CREATE INDEX IF NOT EXISTS idx_books_series_id ON books(series_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_books_parent_book_id ON books(parent_book_id)`);
try { db.exec(`ALTER TABLE series ADD COLUMN is_public     INTEGER NOT NULL DEFAULT 0`); } catch (_) {}
try { db.exec(`ALTER TABLE series ADD COLUMN published_at  INTEGER DEFAULT NULL`); } catch (_) {}
try { db.exec(`ALTER TABLE series ADD COLUMN is_open_world INTEGER NOT NULL DEFAULT 0`); } catch (_) {}

// One-time migration: backfill has_battle_sim for the books whose sim module
// existed before this column did (was previously a hardcoded ID list that's
// since been removed - boot.js's per-book setSimNVisible() calls are still
// needed since each sim is its own bespoke module boot.js dispatches to by
// ID, but this column is now the single source of truth for "does this book
// have one" used by the covers-wall badge/filter).
{
  const done = db.prepare(`SELECT value FROM admin_settings WHERE key = 'has_battle_sim_migrated'`).get();
  if (!done) {
    const ids = [829, 8, 286, 198, 199, 200, 186, 201, 202];
    const setFlag = db.prepare('UPDATE books SET has_battle_sim = 1 WHERE id = ?');
    db.transaction(() => { for (const id of ids) setFlag.run(id); })();
    db.prepare(`INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('has_battle_sim_migrated', '1')`).run();
  }
}
// Same one-off flag for book 203 (Island of the Lizard King) - the migration
// above only ever runs once, so each new sim added after it needs its own
// small idempotent UPDATE rather than re-running the whole backfill.
try { db.prepare('UPDATE books SET has_battle_sim = 1 WHERE id = 203').run(); } catch (_) {}
// Same one-off flag for book 83 (Войната на Понтиак / War of Pontiac).
try { db.prepare('UPDATE books SET has_battle_sim = 1 WHERE id = 83').run(); } catch (_) {}
// Same one-off flag for book 86 (Гората на демона / Forest of the Demon).
try { db.prepare('UPDATE books SET has_battle_sim = 1 WHERE id = 86').run(); } catch (_) {}
// Same one-off flag for book 114 (Огнена пустиня / Fiery Desert).
try { db.prepare('UPDATE books SET has_battle_sim = 1 WHERE id = 114').run(); } catch (_) {}
// Same one-off flag for book 115 (Окото на дявола / Eye of the Devil).
try { db.prepare('UPDATE books SET has_battle_sim = 1 WHERE id = 115').run(); } catch (_) {}
// Same one-off flag for book 123 (Прокълнатата земя / Damned Land).
try { db.prepare('UPDATE books SET has_battle_sim = 1 WHERE id = 123').run(); } catch (_) {}
// Same one-off flag for book 130 (Тайната на светещия мъх / Secret of the Glowing Moss).
try { db.prepare('UPDATE books SET has_battle_sim = 1 WHERE id = 130').run(); } catch (_) {}
// Same one-off flag for book 92 (Замъкът на таласъмите / Castle of the Goblins).
try { db.prepare('UPDATE books SET has_battle_sim = 1 WHERE id = 92').run(); } catch (_) {}
// Same one-off flag for book 108 (Ледените пирати / The Ice Pirates).
try { db.prepare('UPDATE books SET has_battle_sim = 1 WHERE id = 108').run(); } catch (_) {}
// Same one-off flag for book 216 (Sword of the Samurai).
try { db.prepare('UPDATE books SET has_battle_sim = 1 WHERE id = 216').run(); } catch (_) {}
// Same one-off flag for book 193 (Flight from the Dark, Lone Wolf book 1).
try { db.prepare('UPDATE books SET has_battle_sim = 1 WHERE id = 193').run(); } catch (_) {}
// Same one-off flag for book 217 (Trial of Champions).
try { db.prepare('UPDATE books SET has_battle_sim = 1 WHERE id = 217').run(); } catch (_) {}
// Same one-off flag for book 526 (GrailQuest 1: The Castle of Darkness).
try { db.prepare('UPDATE books SET has_battle_sim = 1 WHERE id = 526').run(); } catch (_) {}
// Same one-off flag for book 322 (Fire on the Water, Lone Wolf book 2).
try { db.prepare('UPDATE books SET has_battle_sim = 1 WHERE id = 322').run(); } catch (_) {}
// Same one-off flag for book 324 (The Chasm of Doom, Lone Wolf book 4).
try { db.prepare('UPDATE books SET has_battle_sim = 1 WHERE id = 324').run(); } catch (_) {}
// Same one-off flag for book 323 (The Caverns of Kalte, Lone Wolf book 3).
try { db.prepare('UPDATE books SET has_battle_sim = 1 WHERE id = 323').run(); } catch (_) {}
// Same one-off flag for book 325 (Shadow on the Sand, Lone Wolf book 5).
try { db.prepare('UPDATE books SET has_battle_sim = 1 WHERE id = 325').run(); } catch (_) {}
// Same one-off flag for book 122 (Проклятието на меча / Curse of the Sword).
try { db.prepare('UPDATE books SET has_battle_sim = 1 WHERE id = 122').run(); } catch (_) {}
// Same one-off flag for book 80 (Бойците на Орм / The Fighters of Orm).
try { db.prepare('UPDATE books SET has_battle_sim = 1 WHERE id = 80').run(); } catch (_) {}
// Same one-off flag for book 82 (Варварският бог / The Barbarian God).
try { db.prepare('UPDATE books SET has_battle_sim = 1 WHERE id = 82').run(); } catch (_) {}
// Same one-off flag for book 118 (Полет от мрака - Bulgarian edition of
// Lone Wolf book 1, Flight from the Dark, separate from book 193's English one).
try { db.prepare('UPDATE books SET has_battle_sim = 1 WHERE id = 118').run(); } catch (_) {}
// Same one-off flag for book 218 (Robot Commando).
try { db.prepare('UPDATE books SET has_battle_sim = 1 WHERE id = 218').run(); } catch (_) {}
// Same one-off flag for book 219 (Masks of Mayhem).
try { db.prepare('UPDATE books SET has_battle_sim = 1 WHERE id = 219').run(); } catch (_) {}
// Same one-off flag for book 220 (Creature of Havoc).
try { db.prepare('UPDATE books SET has_battle_sim = 1 WHERE id = 220').run(); } catch (_) {}
// Same one-off flag for book 221 (Beneath Nightmare Castle).
try { db.prepare('UPDATE books SET has_battle_sim = 1 WHERE id = 221').run(); } catch (_) {}
// Same one-off flag for book 430 (Пламък над водата - Bulgarian edition of
// Lone Wolf book 2, Fire on the Water, separate from book 322's English one).
try { db.prepare('UPDATE books SET has_battle_sim = 1 WHERE id = 430').run(); } catch (_) {}
// Same one-off flag for book 204 (Scorpion Swamp).
try { db.prepare('UPDATE books SET has_battle_sim = 1 WHERE id = 204').run(); } catch (_) {}
// Same one-off flag for book 205 (Caverns of the Snow Witch).
try { db.prepare('UPDATE books SET has_battle_sim = 1 WHERE id = 205').run(); } catch (_) {}
// Same one-off flag for book 206 (House of Hell).
try { db.prepare('UPDATE books SET has_battle_sim = 1 WHERE id = 206').run(); } catch (_) {}
// Same one-off flag for book 207 (Talisman of Death).
try { db.prepare('UPDATE books SET has_battle_sim = 1 WHERE id = 207').run(); } catch (_) {}
// Same one-off flag for book 208 (Space Assassin).
try { db.prepare('UPDATE books SET has_battle_sim = 1 WHERE id = 208').run(); } catch (_) {}
// Same one-off flag for book 209 (Freeway Fighter).
try { db.prepare('UPDATE books SET has_battle_sim = 1 WHERE id = 209').run(); } catch (_) {}
// Same one-off flag for book 210 (Temple of Terror).
try { db.prepare('UPDATE books SET has_battle_sim = 1 WHERE id = 210').run(); } catch (_) {}
// Same one-off flag for book 211 (The Rings of Kether).
try { db.prepare('UPDATE books SET has_battle_sim = 1 WHERE id = 211').run(); } catch (_) {}
// Same one-off flag for book 212 (Seas of Blood).
try { db.prepare('UPDATE books SET has_battle_sim = 1 WHERE id = 212').run(); } catch (_) {}
// Same one-off flag for book 213 (Appointment with F.E.A.R.).
try { db.prepare('UPDATE books SET has_battle_sim = 1 WHERE id = 213').run(); } catch (_) {}
// Same one-off flag for book 214 (Rebel Planet).
try { db.prepare('UPDATE books SET has_battle_sim = 1 WHERE id = 214').run(); } catch (_) {}
// Same one-off flag for book 215 (Demons of the Deep).
try { db.prepare('UPDATE books SET has_battle_sim = 1 WHERE id = 215').run(); } catch (_) {}

// One-time migration: book 829's sim was the first one built, before the
// pt.simNNN naming convention existed, so its state lived under pt.battleSim
// instead. Renamed to pt.sim829 for consistency with every other sim (and so
// server/db/xp.js's SIM_HISTORY_KEYS can drop the one-off 'battleSim' entry) -
// this moves any already-saved battleSim data over so existing players don't
// lose their in-progress fight or battle history.
{
  const done = db.prepare(`SELECT value FROM admin_settings WHERE key = 'sim829_key_renamed'`).get();
  if (!done) {
    const rows = db.prepare('SELECT id, state_data FROM user_books WHERE book_id = 829').all();
    const upd  = db.prepare('UPDATE user_books SET state_data = ? WHERE id = ?');
    db.transaction(() => {
      for (const row of rows) {
        let s;
        try { s = JSON.parse(row.state_data); } catch { continue; }
        let changed = false;
        for (const pt of [...(s.playthroughs || []), ...(s.preSeriesRuns || [])]) {
          if (pt && pt.battleSim && !pt.sim829) { pt.sim829 = pt.battleSim; delete pt.battleSim; changed = true; }
        }
        if (changed) upd.run(JSON.stringify(s), row.id);
      }
    })();
    db.prepare(`INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('sim829_key_renamed', '1')`).run();
  }
}

db.exec(`CREATE TABLE IF NOT EXISTS series_characters (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  series_id  INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  char_data  TEXT NOT NULL DEFAULT '{"fields":[]}',
  updated_at INTEGER DEFAULT (strftime('%s','now')),
  UNIQUE(user_id, series_id)
)`);

db.exec(`CREATE TABLE IF NOT EXISTS series_runs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  series_id    INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  run_index    INTEGER NOT NULL,
  char_data    TEXT NOT NULL DEFAULT '{"fields":[]}',
  started_at   INTEGER DEFAULT (strftime('%s','now')),
  last_book_id INTEGER DEFAULT NULL,
  last_section TEXT    DEFAULT NULL,
  completed    INTEGER NOT NULL DEFAULT 0,
  result       TEXT    DEFAULT NULL,
  UNIQUE(user_id, series_id, run_index)
)`);
try { db.exec(`ALTER TABLE series_runs ADD COLUMN last_book_id INTEGER DEFAULT NULL`); } catch (_) {}
try { db.exec(`ALTER TABLE series_runs ADD COLUMN last_section TEXT DEFAULT NULL`); } catch (_) {}
try { db.exec(`ALTER TABLE series_runs ADD COLUMN completed INTEGER NOT NULL DEFAULT 0`); } catch (_) {}
try { db.exec(`ALTER TABLE series_runs ADD COLUMN result TEXT DEFAULT NULL`); } catch (_) {}
try { db.exec(`ALTER TABLE series_runs ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0`); } catch (_) {}
try { db.exec(`ALTER TABLE series_runs ADD COLUMN completed_at INTEGER DEFAULT NULL`); } catch (_) {}
try { db.exec(`ALTER TABLE xp_events ADD COLUMN template_id INTEGER DEFAULT NULL`); } catch (_) {}
try { db.exec(`ALTER TABLE users ADD COLUMN join_template_id INTEGER DEFAULT NULL`); } catch (_) {}
try { db.exec(`ALTER TABLE user_series ADD COLUMN rating REAL DEFAULT NULL`); } catch (_) {}
// Which of the app's domains (koldkat.net / pathmap.net / bookplay.net / etc.) this
// user was last seen on, from the Host header - refreshed alongside active_country/
// active_city in authenticate()/authenticateOptional() (server.js). Unlike geo, the
// domain rarely changes mid-session, so a single "last seen" value is enough - no
// separate active/last pair needed.
try { db.exec(`ALTER TABLE users ADD COLUMN last_domain TEXT DEFAULT NULL`); } catch (_) {}
try { db.exec(`ALTER TABLE user_books  ADD COLUMN rated_at INTEGER DEFAULT NULL`); } catch (_) {}
try { db.exec(`ALTER TABLE user_series ADD COLUMN rated_at INTEGER DEFAULT NULL`); } catch (_) {}
// One-time backfill for existing ratings given before rated_at existed - matched to
// the rate_book/rate_series XP award, which only ever has ONE row per user+book/series
// (blocked from re-firing by xp_events' own UNIQUE(user_id, event, ref) index), so this
// only recovers each rating's FIRST-ever timestamp, not a later re-rating's. Re-run-safe
// (only fills rows still NULL), so this runs on every boot but is a no-op after the first.
try {
  db.exec(`
    UPDATE user_books SET rated_at = (
      SELECT xe.created_at FROM xp_events xe
      WHERE xe.user_id = user_books.user_id AND xe.event = 'rate_book' AND xe.ref = CAST(user_books.book_id AS TEXT)
    ) WHERE rating IS NOT NULL AND rated_at IS NULL
  `);
} catch (_) {}
try {
  db.exec(`
    UPDATE user_series SET rated_at = (
      SELECT xe.created_at FROM xp_events xe
      WHERE xe.user_id = user_series.user_id AND xe.event = 'rate_series' AND xe.ref = CAST(user_series.series_id AS TEXT)
    ) WHERE rating IS NOT NULL AND rated_at IS NULL
  `);
} catch (_) {}

// Reference enemy stat blocks for the battle simulator, scoped per book
db.exec(`CREATE TABLE IF NOT EXISTS book_enemies (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id    INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  attack     INTEGER DEFAULT NULL,
  defense    INTEGER DEFAULT NULL,
  hp         INTEGER DEFAULT NULL,
  pb         INTEGER DEFAULT NULL,
  created_at INTEGER DEFAULT (strftime('%s','now'))
)`);

// Per-book audit/import checklist - one row per book, real booleans (not
// loose integers) for each standing-checklist item so a claim like "book N
// is done" is queryable and falsifiable instead of just asserted in a memory
// file or chat. Every column starts at 0/NULL and is only flipped to 1
// immediately after that specific check has actually been performed on that
// specific book - never batch-set, never inferred from "probably fine".
db.exec(`CREATE TABLE IF NOT EXISTS book_import_checklist (
  book_id                INTEGER PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
  extraction_method      TEXT,
  unimportable           INTEGER NOT NULL DEFAULT 0 CHECK(unimportable IN (0,1)),
  paragraph_implosion_ck INTEGER NOT NULL DEFAULT 0 CHECK(paragraph_implosion_ck IN (0,1)),
  paragraph_explosion_ck INTEGER NOT NULL DEFAULT 0 CHECK(paragraph_explosion_ck IN (0,1)),
  section_glue_ck        INTEGER NOT NULL DEFAULT 0 CHECK(section_glue_ck IN (0,1)),
  links_conservative_ck  INTEGER NOT NULL DEFAULT 0 CHECK(links_conservative_ck IN (0,1)),
  graph_connectivity_ck  INTEGER NOT NULL DEFAULT 0 CHECK(graph_connectivity_ck IN (0,1)),
  frontmatter_done       INTEGER NOT NULL DEFAULT 0 CHECK(frontmatter_done IN (0,1)),
  sim_applicable         INTEGER CHECK(sim_applicable IN (0,1)),
  enemy_roster_reported  INTEGER NOT NULL DEFAULT 0 CHECK(enemy_roster_reported IN (0,1)),
  sim_registered         INTEGER NOT NULL DEFAULT 0 CHECK(sim_registered IN (0,1)),
  prose_full_read        INTEGER NOT NULL DEFAULT 0 CHECK(prose_full_read IN (0,1)),
  notes                  TEXT,
  updated_at             INTEGER DEFAULT (strftime('%s','now'))
)`);

// A book's *secondary* anthology memberships - purely additive on top of its
// one primary parent_book_id, which stays the sole source of truth for
// series inheritance, discover-all/visit-all XP milestones, and every other
// place a book's "real" anthology matters. This table only ever affects
// which anthologies list a book among their children for display - a story
// reprinted in a "best of" compilation shares its actual progress/state
// automatically (state is keyed by book_id, not by which anthology you
// browsed in from), so no state-tracking machinery needed touching at all.
db.exec(`CREATE TABLE IF NOT EXISTS book_anthology_memberships (
  book_id      INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  anthology_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  book_order   INTEGER DEFAULT NULL,
  created_at   INTEGER DEFAULT (strftime('%s','now')),
  PRIMARY KEY (book_id, anthology_id)
)`);

// Canonical playable section text for the "live reading" feature (POC,
// gated to a single hardcoded user - see server/routes/books.js's
// handleGetBookSection). Distinct from state.graph (per-user, hand-built as
// a player reads their own physical/PDF copy) - this is admin-supplied
// source content shared by every reader of the book, imported once via a
// one-off script per book (no admin UI yet). `choices` is a JSON array of
// target section ids (numbers, or -1/0 for death/win), parsed once at
// import time from the source HTML's own <a href="#section-N"> links -
// never derived at request time.
db.exec(`CREATE TABLE IF NOT EXISTS book_sections (
  book_id    INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  section_id TEXT    NOT NULL,
  html       TEXT    NOT NULL,
  choices    TEXT    NOT NULL DEFAULT '[]',
  PRIMARY KEY (book_id, section_id)
)`);
try { db.exec(`ALTER TABLE books ADD COLUMN has_live_reading INTEGER DEFAULT 0`); } catch (_) {}

// Best-effort text pulled from a book's own PDF front matter (everything
// before its first numbered section) - staging area for later manual
// review, not served to players. intro_text/rules_text is a heuristic
// split on a rules-header keyword; when no such keyword is found the
// whole front matter lands in intro_text and rules_text stays null.
db.exec(`CREATE TABLE IF NOT EXISTS book_frontmatter (
  book_id     INTEGER PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
  intro_text  TEXT,
  rules_text  TEXT,
  extracted_at INTEGER DEFAULT (strftime('%s', 'now'))
)`);

// One-time backfill: assign a permanent template to every level_up event that doesn't have one yet
{
  const unassigned = db.prepare(`SELECT id FROM xp_events WHERE event = 'level_up' AND template_id IS NULL`).all();
  if (unassigned.length > 0) {
    const tmplIds = db.prepare(`SELECT id FROM level_up_templates WHERE active = 1`).all().map(r => r.id);
    if (tmplIds.length > 0) {
      const upd = db.prepare(`UPDATE xp_events SET template_id = ? WHERE id = ?`);
      const backfill = db.transaction(() => {
        for (const row of unassigned) {
          const tmplId = tmplIds[Math.floor(Math.random() * tmplIds.length)];
          upd.run(tmplId, row.id);
        }
      });
      backfill();
    }
  }
}

// One-time backfill: assign a permanent join template to every existing user that doesn't have one
{
  const unassigned = db.prepare(`SELECT id FROM users WHERE join_template_id IS NULL`).all();
  if (unassigned.length > 0) {
    const tmplIds = db.prepare(`SELECT id FROM join_templates WHERE active = 1`).all().map(r => r.id);
    if (tmplIds.length > 0) {
      const upd = db.prepare(`UPDATE users SET join_template_id = ? WHERE id = ?`);
      db.transaction(() => {
        for (const row of unassigned) {
          upd.run(tmplIds[Math.floor(Math.random() * tmplIds.length)], row.id);
        }
      })();
    }
  }
}

db.exec(`UPDATE books SET published_at = created_at WHERE is_public = 1 AND published_at IS NULL`);
db.exec(`UPDATE series SET published_at = created_at WHERE is_public = 1 AND published_at IS NULL`);

db.exec(`CREATE TABLE IF NOT EXISTS user_series (
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  series_id INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  added_at  INTEGER DEFAULT (strftime('%s','now')),
  PRIMARY KEY (user_id, series_id)
);`);

db.exec(`CREATE TABLE IF NOT EXISTS user_stashes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);`);

db.exec(`CREATE TABLE IF NOT EXISTS stash_books (
  stash_id INTEGER NOT NULL REFERENCES user_stashes(id) ON DELETE CASCADE,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id  INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  PRIMARY KEY (stash_id, book_id),
  UNIQUE (user_id, book_id)
);`);

db.exec(`CREATE TABLE IF NOT EXISTS stash_series (
  stash_id  INTEGER NOT NULL REFERENCES user_stashes(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  series_id INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  PRIMARY KEY (stash_id, series_id),
  UNIQUE (user_id, series_id)
);`);

db.exec(`CREATE TABLE IF NOT EXISTS stash_excluded_books (
  stash_id INTEGER NOT NULL REFERENCES user_stashes(id) ON DELETE CASCADE,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id  INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  PRIMARY KEY (stash_id, book_id)
);`);

// Migrate: seed user_series for series creators only
db.exec(`
  INSERT OR IGNORE INTO user_series (user_id, series_id)
  SELECT created_by, id FROM series WHERE created_by IS NOT NULL
`);

// One-time: mark the two protected accounts, and the actual admin account.
// Matched by id, not username - usernames are user-editable (updateUsername
// in server/db/auth.js), so matching by name here would risk either losing
// the flag on a rename (harmless, since is_protected/is_admin already
// persisted stays set), or worse, silently granting it to an unrelated
// future user who registers the vacated username on the next server start
// (this runs unconditionally on every boot, gated only by the row's own
// flag being 0). id 1 is koldKat (the actual admin account), id 17 is
// sashii. Same reasoning as server/db/auth.js's canSeeAppXp().
db.prepare(`UPDATE users SET is_protected = 1 WHERE id IN (1, 17) AND is_protected = 0`).run();
db.prepare(`UPDATE users SET is_admin = 1 WHERE id = 1 AND is_admin = 0`).run();

// feedback.user_id is nullable (migrated) - no migration needed here.

db.exec(`
  CREATE TABLE IF NOT EXISTS feedback_messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id  INTEGER NOT NULL,
    sender     TEXT    NOT NULL,
    body       TEXT    NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    FOREIGN KEY (thread_id) REFERENCES feedback(id) ON DELETE CASCADE
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS attachments (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    filename      TEXT    NOT NULL,
    original_name TEXT    NOT NULL,
    mime_type     TEXT    NOT NULL DEFAULT '',
    size          INTEGER NOT NULL DEFAULT 0,
    kind          TEXT,
    linked_id     INTEGER,
    uploaded_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_attachments_kind_linked ON attachments (kind, linked_id)`);

// One-time migration: move flat feedback rows into feedback_messages
{
  const hasMsgs = db.prepare('SELECT COUNT(*) as n FROM feedback_messages').get().n;
  if (hasMsgs === 0) {
    const rows = db.prepare('SELECT id, message, admin_reply, created_at FROM feedback').all();
    if (rows.length > 0) {
      const ins = db.prepare('INSERT INTO feedback_messages (thread_id, sender, body, created_at) VALUES (?, ?, ?, ?)');
      db.transaction(() => {
        for (const row of rows) {
          if (row.message) ins.run(row.id, 'user',  row.message,       row.created_at);
          if (row.admin_reply) ins.run(row.id, 'admin', row.admin_reply, (row.created_at || 0) + 1);
        }
      })();
    }
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS admin_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS announcements (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    title        TEXT    NOT NULL,
    body         TEXT    NOT NULL,
    is_draft     INTEGER NOT NULL DEFAULT 1,
    pinned       INTEGER NOT NULL DEFAULT 0,
    created_at   INTEGER DEFAULT (strftime('%s', 'now')),
    published_at INTEGER DEFAULT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS forum_threads (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    title        TEXT    NOT NULL,
    body         TEXT    NOT NULL,
    user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    last_post_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    reply_count  INTEGER NOT NULL DEFAULT 0,
    is_locked    INTEGER NOT NULL DEFAULT 0,
    is_pinned    INTEGER NOT NULL DEFAULT 0
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS forum_posts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id  INTEGER NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    body       TEXT    NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    is_deleted INTEGER NOT NULL DEFAULT 0
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS forum_categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    slug        TEXT    NOT NULL UNIQUE,
    description TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    expires_at INTEGER DEFAULT (strftime('%s', 'now') + 1209600),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS books (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT    NOT NULL,
    total_sections INTEGER NOT NULL DEFAULT 0,
    isbn           TEXT    DEFAULT NULL,
    issn           TEXT    DEFAULT NULL,
    asin           TEXT    DEFAULT NULL,
    cover_path     TEXT    DEFAULT NULL,
    is_demo        INTEGER NOT NULL DEFAULT 0,
    created_at     INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at     INTEGER DEFAULT (strftime('%s', 'now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS user_books (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    book_id    INTEGER NOT NULL,
    state_data TEXT    NOT NULL DEFAULT '{}',
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (user_id) REFERENCES users(id)  ON DELETE CASCADE,
    FOREIGN KEY (book_id) REFERENCES books(id)  ON DELETE CASCADE,
    UNIQUE (user_id, book_id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS book_parties (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id    INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS party_invites (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    party_id     INTEGER NOT NULL,
    inviter_id   INTEGER NOT NULL,
    invitee_id   INTEGER NOT NULL,
    status       TEXT    NOT NULL DEFAULT 'pending',
    created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    responded_at INTEGER DEFAULT NULL,
    FOREIGN KEY (party_id)   REFERENCES book_parties(id) ON DELETE CASCADE,
    FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (invitee_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (party_id, invitee_id)
  );
`);

// One-time migration: move per-user state_data out of books into user_books,
// drop user_id from books, and add is_demo column.
// NOTE: we must NOT insert into user_books before DROP TABLE books, because
// DROP TABLE triggers ON DELETE CASCADE on user_books.book_id and wipes the
// rows we just inserted. Instead, we stash the data in a TEMP table first,
// do the books table swap, then populate user_books afterwards.
if (hasColumn('books', 'user_id')) {
  db.transaction(() => {
    // Stash per-user state in a temp table (temp tables are not affected by FK cascades)
    db.exec(`CREATE TEMP TABLE ub_migration_backup AS
             SELECT user_id, id AS book_id, COALESCE(state_data, '{}') AS state_data,
                    created_at, updated_at FROM books`);
    // Build new books table without user_id / state_data
    db.exec(`CREATE TABLE books_new (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      name           TEXT    NOT NULL,
      total_sections INTEGER NOT NULL DEFAULT 0,
      isbn           TEXT    DEFAULT NULL,
      issn           TEXT    DEFAULT NULL,
      asin           TEXT    DEFAULT NULL,
      cover_path     TEXT    DEFAULT NULL,
      is_demo        INTEGER NOT NULL DEFAULT 0,
      created_at     INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at     INTEGER DEFAULT (strftime('%s', 'now'))
    )`);
    db.exec(`INSERT INTO books_new
               (id, name, total_sections, isbn, issn, asin, cover_path, is_demo, created_at, updated_at)
             SELECT id, name, total_sections,
                    NULLIF(isbn, ''), NULLIF(issn, ''), NULLIF(asin, ''),
                    cover_path,
                    CASE WHEN state_data LIKE '%"isDemoBook":true%' THEN 1 ELSE 0 END,
                    created_at, updated_at
             FROM books`);
    // Drop old books table (cascades would wipe user_books, but it's still empty)
    db.exec(`DROP TABLE books`);
    db.exec(`ALTER TABLE books_new RENAME TO books`);
    // Now populate user_books from the stashed data
    db.exec(`INSERT OR IGNORE INTO user_books (user_id, book_id, state_data, created_at, updated_at)
             SELECT user_id, book_id, state_data, created_at, updated_at FROM ub_migration_backup`);
    db.exec(`DROP TABLE ub_migration_backup`);
  })();
}

if (!hasColumn('sessions', 'expires_at')) {
  try { db.exec(`ALTER TABLE sessions ADD COLUMN expires_at INTEGER`); } catch (_) {}
}
if (!hasColumn('sessions', 'is_impersonation')) {
  try { db.exec(`ALTER TABLE sessions ADD COLUMN is_impersonation INTEGER NOT NULL DEFAULT 0`); } catch (_) {}
}
if (hasColumn('sessions', 'expires_at')) {
  db.exec(`UPDATE sessions SET expires_at = COALESCE(expires_at, created_at + 1209600, strftime('%s','now') + 1209600)`);
}

const {
  hashPassword, verifyPassword, generateToken,
  getUserById, getUserByUsername, isUserAdmin, canSeeAppXp, getAdminUsername, getRandomMaintenanceMessage, searchUsers,
  adminUpdateUser, updateUsername, updatePassword, updateAvatar, getUserPrefs, setUserPrefs,
  createUser, setUserEmail, getUserEmail,
  createPasswordResetToken, validateResetToken, consumeResetToken,
  verifyUser,
  createSession, getSession, refreshSession, purgeExpiredSessions,
  purgeOldNotifications, purgeOldHeartbeats, walCheckpoint, deleteSession,
} = require('./db/auth');

const {
  getTips, getAllTipsAdmin, createTip, updateTip, deleteTip,
  getAllLevelUpTemplatesAdmin, createLevelUpTemplate, updateLevelUpTemplate, deleteLevelUpTemplate,
  getAllItemsAdmin, getActiveItems, getActiveItemsMeta, getItemById, getItemsByIds, createItem, updateItem, deleteItem,
  getAllSeriesAdmin, getAllAnthologiesAdmin,
  adminGetUser, adminGetUserBooks, adminGetBookStats, adminGetStats, getSiteStats, getAppXpSummary, adminGetUsers,
  updateUserGeo, updateUserActiveGeo, updateUserLastDomain, updateUserLastActive,
  adminLockUser, adminUnlockUser, adminDeleteUser, adminClearUserSessions,
  adminGetBooks, adminDeleteBook, adminGetBookRatings, adminDeleteRating, adminVacuum,
  getAdminSetting, setAdminSetting, getAllAdminSettings,
  createAnnouncement, updateAnnouncement, publishAnnouncement, unpublishAnnouncement,
  deleteAnnouncement, getAnnouncements, getPinnedAnnouncement, pinAnnouncement, unpinAnnouncement,
  purchaseShopItem, adminRefundShopItem, giftBook,
  getShopItems, setShopItemCost,
} = require('./db/admin');

const {
  createImpersonationToken, consumeImpersonationToken,
  getXpAmount, getXpConfig, setXpAmount,
  TITLES, computeLevel, xpForLevel, getTitleForLevel,
  setXpFeedHook, setAppXpHook,
  awardCoins, awardXp, awardIdleHeartbeatXp, getUserXpInfo, claimBonusGc,
  getBookCreator, getBookIdentifiers,
  _discoveredSet, _visitedSet, _permanentVisitedCount,
  _buildDemoState, createDemoBook, refreshDemoBooks, getDemoBookState,
  _checkGroupMilestone, _checkGroupWonAll, processStateXp,
  migrateXpForUser, runXpMigration, migratePublicBookXp, migrateEquipmentXp,
} = require('./db/xp');

const {
  getBooks, getStashes, createStash, updateStash, deleteStash,
  setBookBgPref, getBookBgPref, awardPdfXp, setBookPdf, removeBookCover, removeBookPdf, setBookCover,
  getBookContainerFields, getOrCreateSeries, getAllSeries, getBookEnemies, addSeriesToLibrary,
  addAnthologyMember, removeAnthologyMember, getAnthologyExtraMembers, _pruneRedundantAnthologyMembership, getBookSection, _canLiveRead,
  getSeriesById, updateSeries, getSeriesCharacter, saveSeriesCharacter, getSeriesRuns,
  updateSeriesRunPosition, completeSeriesRun, updateSeriesRunPublic, migratePreSeriesRuns,
  reverseSeriesOpenWorld, createSeriesRun, getActiveSeriesRunsForUser, deleteSeriesRun,
  patchSeriesRunDeletion, resetSeriesForUser, updateSeriesRun, deleteSeries, deleteSeriesRow,
  countSeriesOtherUsers, countBooksInSeries, getNextSeriesUser, transferSeriesOwnership,
  removeSeriesEntryOnly, removeSeriesFromLibrary, createSeries, getPublicSeriesInfo,
  normalizeAuthors, createBook, getBookState, getActiveBookInSeries, getBookById, saveBookState, resetBookProgress,
  updateBook, getNotebook, setNotebook, deleteBook, addBookToLibrary,
  _getUserBookId, _getAggregateRating, canUserRateBook, canUserRateSeries,
  getBookRating, setBookRating, _getAggregateSeriesRating, getSeriesRating, setSeriesRating,
} = require('./db/books');

const {
  getFeed,
  setPublicProfile, setHideFromFeed, setAuthor, setContributor, setPdfAccess, setDisplayName,
  getPublicProfile, getProfileStats,
  getPublicCovers, getBooksForSitemap, getAnthologiesForSitemap, getSeriesForSitemap, getPublicProfilesForSitemap,
  getPublicBookMeta, getAllPublicBooks, getPublicBooksInSeries, getAllPublicSeries, getAllPublicAnthologies,
  getBookActivity, getPublicRun, getPublicSeriesRun,
} = require('./db/feed');

const {
  getAttachments, createAttachment, linkAttachments,
  createFeedbackThread, addFeedbackMessage, getThreadsForUser, getAllThreads,
  getFeedbackThreadById, markThreadReadByUser, markThreadReadByAdmin, markThreadUnreadByUser,
  deleteFeedbackThread, deleteFeedbackThreadForUser,
} = require('./db/feedback');

const {
  forumGetLatestPostAt, getForumSeenAt, setForumSeen,
  forumGetCategories, forumGetCategory, forumGetThreadsByCategory,
  forumGetThread, forumGetThreadsForSitemap,
  forumCreateThread, forumCreatePost,
  forumEditThread, forumEditPost,
  forumDeleteThread, forumDeletePost,
  forumToggleLock, forumTogglePin, forumIsAdmin,
} = require('./db/forum');

const {
  createParty, inviteToParty, acceptPartyInvite, declinePartyInvite,
  leaveParty, getPartyForBook, getPendingInvites, getPartyMemberIds, fanOutState,
} = require('./db/parties');

const {
  getNotifications, markNotificationsSeen,
  getAllBooksForExport, getBookForExport,
  getAdminGcSupply, adminGiftGc,
  getAppBirthTimestamp,
  backupDb,
} = require('./db/misc');

// One-time backfill: sim213/sim214 were missing from server/db/xp.js's
// SIM_HISTORY_KEYS from the day each shipped (the same gap that previously
// hit sim201-203 and sim209-211, see that list's own comment) - anyone who
// fought in either sim before the fix earned no battlesim_win/battlesim_loss
// XP for it. Scans every already-recorded history entry (not just ones
// newer than some snapshot, unlike the live incremental path in
// processStateXp) and awards through the same awardXp() used live, so the
// ref format (`${simKey}:${entry.ts}`) matches exactly - if this somehow
// ran twice, xp_events' UNIQUE constraint + INSERT OR IGNORE makes every
// individual award idempotent regardless of the outer admin_settings gate.
{
  const done = db.prepare(`SELECT value FROM admin_settings WHERE key = 'sim213_214_xp_backfilled'`).get();
  if (!done) {
    const rows = db.prepare('SELECT user_id, state_data FROM user_books WHERE book_id IN (213, 214)').all();
    for (const row of rows) {
      let s;
      try { s = JSON.parse(row.state_data); } catch { continue; }
      for (const pt of [...(s.playthroughs || []), ...(s.preSeriesRuns || [])]) {
        for (const simKey of ['sim213', 'sim214']) {
          const history = pt?.[simKey]?.history;
          if (!Array.isArray(history)) continue;
          for (const entry of history) {
            if (!entry) continue;
            if (entry.outcome === 'win')  awardXp(row.user_id, 'battlesim_win',  `${simKey}:${entry.ts}`);
            if (entry.outcome === 'loss') awardXp(row.user_id, 'battlesim_loss', `${simKey}:${entry.ts}`);
          }
        }
      }
    }
    db.prepare(`INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('sim213_214_xp_backfilled', '1')`).run();
  }
}

module.exports = {
  getUserById, updateUsername, updatePassword, updateAvatar,
  createUser, verifyUser, setUserEmail, getUserEmail, createPasswordResetToken, validateResetToken, consumeResetToken,
  createSession, getSession, refreshSession, deleteSession, purgeExpiredSessions, purgeOldNotifications, purgeOldHeartbeats, walCheckpoint,
  getBooks, getStashes, createStash, updateStash, deleteStash, createBook, getBookById, getBookState, getActiveBookInSeries, saveBookState, resetBookProgress, updateBook, deleteBook, setBookCover, removeBookCover, setBookPdf, removeBookPdf, awardPdfXp, addBookToLibrary,
  getAllSeries, getSeriesById, getOrCreateSeries, createSeries, updateSeries, deleteSeries, deleteSeriesRow, addSeriesToLibrary, removeSeriesEntryOnly, removeSeriesFromLibrary, countSeriesOtherUsers, countBooksInSeries, getNextSeriesUser, transferSeriesOwnership, getBookContainerFields, getBookEnemies,
  addAnthologyMember, removeAnthologyMember, getAnthologyExtraMembers, _pruneRedundantAnthologyMembership, getBookSection, _canLiveRead,
  getSeriesCharacter, saveSeriesCharacter,
  getSeriesRuns, createSeriesRun, updateSeriesRun, deleteSeriesRun, patchSeriesRunDeletion, resetSeriesForUser, getActiveSeriesRunsForUser, updateSeriesRunPosition, completeSeriesRun, updateSeriesRunPublic, migratePreSeriesRuns, reverseSeriesOpenWorld,
  getNotebook, setNotebook,
  getBookCreator, getBookIdentifiers,
  adminGetUser, adminGetUserBooks, adminGetBookStats,
  updateUserGeo, updateUserActiveGeo, updateUserLastDomain, updateUserLastActive,
  adminGetStats, getSiteStats, adminGetUsers, adminDeleteUser, adminClearUserSessions, adminLockUser, adminUnlockUser,
  adminGetBooks, adminDeleteBook, adminGetBookRatings, adminDeleteRating, adminRefundShopItem, adminVacuum, giftBook, purchaseShopItem,
  getShopItems, setShopItemCost,
  getFeed,
  createDemoBook, refreshDemoBooks, getDemoBookState,
  setPublicProfile, setHideFromFeed, setAuthor, setContributor, setPdfAccess, setDisplayName, adminUpdateUser, getPublicProfile, getProfileStats, getPublicRun, getPublicSeriesRun, getPublicCovers, getAllPublicBooks, getAllPublicSeries, getAllPublicAnthologies, getPublicBooksInSeries, getBookActivity, getPublicBookMeta, getPublicSeriesInfo, getBooksForSitemap, getAnthologiesForSitemap, getSeriesForSitemap, getPublicProfilesForSitemap,
  getBookRating, setBookRating, getSeriesRating, setSeriesRating, canUserRateBook, canUserRateSeries, setBookBgPref, getBookBgPref,
  awardXp, awardCoins, awardIdleHeartbeatXp, getUserXpInfo, claimBonusGc, processStateXp, runXpMigration, migratePublicBookXp, migrateEquipmentXp, setXpFeedHook, setAppXpHook,
  getXpAmount, getXpConfig, setXpAmount,
  createFeedbackThread, addFeedbackMessage, getThreadsForUser, getAllThreads,
  getFeedbackThreadById, markThreadReadByUser, markThreadReadByAdmin, markThreadUnreadByUser,
  deleteFeedbackThread, deleteFeedbackThreadForUser,
  createAttachment, linkAttachments, getAttachments,
  getAdminSetting, setAdminSetting, getAllAdminSettings,
  getTips, getAllTipsAdmin, createTip, updateTip, deleteTip,
  getRandomLevelUpTemplate, getAllLevelUpTemplatesAdmin, createLevelUpTemplate, updateLevelUpTemplate, deleteLevelUpTemplate,
  getRandomJoinTemplate, getRandomTagline,
  getAllItemsAdmin, getActiveItems, getActiveItemsMeta, getItemById, getItemsByIds, createItem, updateItem, deleteItem,
  getAllSeriesAdmin, getAllAnthologiesAdmin, getAppXpSummary,
  getNotifications, markNotificationsSeen,
  createImpersonationToken, consumeImpersonationToken,
  createAnnouncement, updateAnnouncement, publishAnnouncement, unpublishAnnouncement,
  deleteAnnouncement, getAnnouncements, getPinnedAnnouncement, pinAnnouncement, unpinAnnouncement,
  getUserPrefs, setUserPrefs,
  _discoveredSet, _visitedSet,
  forumGetLatestPostAt, getForumSeenAt, setForumSeen,
  forumGetCategories, forumGetCategory, forumGetThreadsByCategory,
  forumGetThread, forumGetThreadsForSitemap,
  forumCreateThread, forumCreatePost,
  forumEditThread, forumEditPost,
  forumDeleteThread, forumDeletePost,
  forumToggleLock, forumTogglePin, forumIsAdmin,
  getAllBooksForExport, getBookForExport,
  getUserByUsername, isUserAdmin, canSeeAppXp, getAdminUsername, getRandomMaintenanceMessage, searchUsers,
  createParty, inviteToParty, acceptPartyInvite, declinePartyInvite,
  leaveParty, getPartyForBook, getPendingInvites, fanOutState, getPartyMemberIds,
  getAppBirthTimestamp,
  getAdminGcSupply, adminGiftGc,
  backupDb,
};
