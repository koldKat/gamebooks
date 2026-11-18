'use strict';

// Reward distinct publicly shared runs with permanent alternating crystal milestones.
const { isImpersonatingContext } = require('../impersonation-context');

function initializeSharedRunGems(db) {
  return db.transaction(() => {
    db.exec(`CREATE TABLE IF NOT EXISTS shared_run_gem_runs (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        ref TEXT NOT NULL, shared_at INTEGER NOT NULL DEFAULT (unixepoch()),
        PRIMARY KEY(user_id,ref));
      CREATE TABLE IF NOT EXISTS shared_run_gem_totals (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        runs INTEGER NOT NULL DEFAULT 0 CHECK(runs>=0));
      CREATE TABLE IF NOT EXISTS shared_run_gem_rewards (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        milestone INTEGER NOT NULL, currency TEXT NOT NULL CHECK(currency IN ('rubies','diamonds')),
        created_at INTEGER NOT NULL, PRIMARY KEY(user_id,milestone));
      CREATE TABLE IF NOT EXISTS shared_run_gem_migrations(name TEXT PRIMARY KEY);
      `);
    if (!db.prepare("SELECT 1 FROM shared_run_gem_migrations WHERE name='canonical-shares-v2'").get()) {
      rebuildCanonicalShares(db);
    }
    db.exec(`CREATE TRIGGER IF NOT EXISTS reward_shared_run_gems AFTER INSERT ON shared_run_gem_runs BEGIN
        INSERT INTO shared_run_gem_totals(user_id) VALUES(NEW.user_id) ON CONFLICT(user_id) DO NOTHING;
        INSERT INTO user_diamonds(user_id) VALUES(NEW.user_id) ON CONFLICT(user_id) DO NOTHING;
        INSERT INTO user_rubies(user_id) VALUES(NEW.user_id) ON CONFLICT(user_id) DO NOTHING;
        UPDATE user_diamonds SET diamonds_earned=diamonds_earned+
          (SELECT (runs+51)/100-(runs+50)/100 FROM shared_run_gem_totals WHERE user_id=NEW.user_id)
          WHERE user_id=NEW.user_id;
        UPDATE user_rubies SET rubies_earned=rubies_earned+
          (SELECT (runs+1)/100-runs/100 FROM shared_run_gem_totals WHERE user_id=NEW.user_id)
          WHERE user_id=NEW.user_id;
        UPDATE shared_run_gem_totals SET runs=runs+1 WHERE user_id=NEW.user_id;
        INSERT INTO shared_run_gem_rewards(user_id,milestone,currency,created_at)
          SELECT NEW.user_id,runs,CASE WHEN runs%100=0 THEN 'diamonds' ELSE 'rubies' END,NEW.shared_at
          FROM shared_run_gem_totals WHERE user_id=NEW.user_id AND runs%50=0;
      END;
      CREATE TRIGGER IF NOT EXISTS track_shared_run_gems AFTER INSERT ON xp_events
        WHEN NEW.event='share_run' AND NEW.ref IS NOT NULL AND NEW.ref!='' BEGIN
          INSERT OR IGNORE INTO shared_run_gem_runs(user_id,ref,shared_at)
            VALUES(NEW.user_id,NEW.ref,NEW.created_at);
        END;`);
  }).immediate();
}

// Old share XP used book:index; current runs use book:startedAt. Merge known aliases
// before counting rewards, while retaining evidence of genuinely deleted old runs.
function rebuildCanonicalShares(db) {
  const aliases = new Map(), savedPublic = [];
  const now = Math.floor(Date.now()/1000);
  const seriesRun = db.prepare('SELECT 1 FROM series_runs WHERE user_id=? AND series_id=? AND started_at*1000=?');
  const next = db.prepare(`SELECT ub.rowid AS cursor,ub.user_id,ub.book_id,
    COALESCE(b.series_id,p.series_id) AS series_id FROM user_books ub JOIN books b ON b.id=ub.book_id
    LEFT JOIN books p ON p.id=b.parent_book_id WHERE ub.rowid>? ORDER BY ub.rowid LIMIT 1`);
  const runs = db.prepare(`SELECT j.key AS run_index,json_extract(j.value,'$.startedAt') AS started_at,
      json_extract(j.value,'$.isPublic') AS is_public
    FROM user_books ub,json_each(CASE WHEN json_valid(ub.state_data) THEN ub.state_data ELSE '{}' END,?) j
    WHERE ub.rowid=? AND j.type='object' AND json_extract(j.value,'$.startedAt')>0`);
  let cursor = 0, row;
  while ((row = next.get(cursor))) {
    cursor = row.cursor;
    for (const key of ['playthroughs','preSeriesRuns']) {
      for (const run of runs.all(`$.${key}`,row.cursor)) {
        const stamp = run.started_at;
        const prefix = key === 'playthroughs' && row.series_id && seriesRun.get(row.user_id,row.series_id,stamp)
          ? `series:${row.series_id}` : String(row.book_id);
        const canonical = `${prefix}:${stamp}`;
        if (key === 'playthroughs') aliases.set(`${row.user_id}:${row.book_id}:${run.run_index}`, {canonical,stamp});
        if (prefix.startsWith('series:')) aliases.set(`${row.user_id}:${row.book_id}:${stamp}`, {canonical,stamp});
        if (run.is_public) savedPublic.push({user_id:row.user_id,ref:canonical,shared_at:now});
      }
    }
  }
  const canonical = new Map();
  function add(run) {
    const alias = aliases.get(`${run.user_id}:${run.ref}`);
    const ref = alias && run.shared_at*1000 >= alias.stamp ? alias.canonical : run.ref;
    const key = `${run.user_id}:${ref}`, previous = canonical.get(key);
    if (!previous || run.shared_at < previous.shared_at) canonical.set(key,{...run,ref});
  }
  for (const run of db.prepare('SELECT * FROM shared_run_gem_runs').all()) add(run);
  for (const run of db.prepare(`SELECT x.user_id,x.ref,x.created_at AS shared_at FROM xp_events x
    JOIN users u ON u.id=x.user_id WHERE x.event='share_run' AND x.ref IS NOT NULL AND x.ref!=''`).all()) add(run);
  for (const run of savedPublic) add(run);
  for (const run of db.prepare('SELECT user_id,series_id,started_at FROM series_runs WHERE is_public=1').all())
    add({user_id:run.user_id,ref:`series:${run.series_id}:${run.started_at*1000}`,shared_at:now});
  const previous = new Map(db.prepare(`SELECT user_id,
    SUM(currency='rubies') AS rubies,SUM(currency='diamonds') AS diamonds
    FROM shared_run_gem_rewards GROUP BY user_id`).all().map(row=>[row.user_id,row]));
  db.exec(`DROP TRIGGER IF EXISTS reward_shared_run_gems;
    DROP TRIGGER IF EXISTS track_shared_run_gems;
    DELETE FROM shared_run_gem_runs; DELETE FROM shared_run_gem_totals; DELETE FROM shared_run_gem_rewards;`);
  const insert = db.prepare('INSERT INTO shared_run_gem_runs(user_id,ref,shared_at) VALUES(?,?,?)');
  const reward = db.prepare('INSERT INTO shared_run_gem_rewards(user_id,milestone,currency,created_at) VALUES(?,?,?,?)');
  const totals = new Map();
  for (const run of [...canonical.values()].sort((a,b)=>a.shared_at-b.shared_at || a.ref.localeCompare(b.ref))) {
    insert.run(run.user_id,run.ref,run.shared_at);
    const count = (totals.get(run.user_id)||0)+1; totals.set(run.user_id,count);
    if (count%50===0) reward.run(run.user_id,count,count%100===0?'diamonds':'rubies',run.shared_at);
  }
  const saveTotal = db.prepare('INSERT INTO shared_run_gem_totals(user_id,runs) VALUES(?,?)');
  for (const [id,count] of totals) saveTotal.run(id,count);
  for (const id of new Set([...totals.keys(),...previous.keys()])) {
    const count = totals.get(id)||0, old = previous.get(id)||{rubies:0,diamonds:0};
    const rubyDelta = Math.floor((count+50)/100)-old.rubies;
    const diamondDelta = Math.floor(count/100)-old.diamonds;
    if (rubyDelta) {
      db.prepare('INSERT OR IGNORE INTO user_diamonds(user_id) VALUES(?)').run(id);
      db.prepare('UPDATE user_diamonds SET diamonds_earned=diamonds_earned+? WHERE user_id=?').run(rubyDelta,id);
    }
    if (diamondDelta) {
      db.prepare('INSERT OR IGNORE INTO user_rubies(user_id) VALUES(?)').run(id);
      db.prepare('UPDATE user_rubies SET rubies_earned=rubies_earned+? WHERE user_id=?').run(diamondDelta,id);
    }
  }
  db.prepare("INSERT INTO shared_run_gem_migrations VALUES('canonical-shares-v2')").run();
}

function awardSharedRun(db, userId, ref) {
  if (isImpersonatingContext()) return {diamondDelta:0,rubyDelta:0};
  return db.transaction(() => {
    const before = db.prepare('SELECT runs FROM shared_run_gem_totals WHERE user_id=?').get(userId)?.runs || 0;
    const added = db.prepare('INSERT OR IGNORE INTO shared_run_gem_runs(user_id,ref) VALUES(?,?)').run(userId,ref).changes;
    return {
      diamondDelta: added ? Math.floor((before+51)/100)-Math.floor((before+50)/100) : 0,
      rubyDelta: added ? Math.floor((before+1)/100)-Math.floor(before/100) : 0,
    };
  }).immediate();
}

module.exports = { initializeSharedRunGems, awardSharedRun };
