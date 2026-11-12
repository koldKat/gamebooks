'use strict';

// Retain distinct days of seasonal XP earnings independently of reward-log cleanup.
const events = require('../../public/js/seasonal-events/calendar.json');
const { activeSeasons, seasonalDay } = require('../../public/js/seasonal-events/schedule.js');
const { seasonalXpSeasons } = require('../seasonal-events');
const { ensureJobSeasonEligibility } = require('./seasonal-contributions');
const dayKey = date => new Date(seasonalDay(date)).toISOString().slice(0, 10);

function recordSeasonParticipation(db, userId, event, date = new Date(), ref = null) {
  const seasons = seasonalXpSeasons(event, date, { db, ref });
  if (!seasons.length) return;
  const day = dayKey(date);
  const insert = db.prepare(`INSERT OR IGNORE INTO seasonal_participation_days
    (season_id,starts_on,ends_on,event_name,user_id,earned_on)
    SELECT ?,?,?,?,?,? WHERE NOT EXISTS (
      SELECT 1 FROM seasonal_participation_payouts WHERE season_id=? AND starts_on=?)`);
  for (const season of seasons) {
    insert.run(season.id, season.window.start, season.window.end,
      season.title.replace(/ event active$/, ''), userId, day, season.id, season.window.start);
  }
}

function initializeSeasonParticipation(db, now = new Date()) {
  ensureJobSeasonEligibility(db);
  db.transaction(() => {
    db.exec(`CREATE TABLE IF NOT EXISTS seasonal_participation_policy (
        id INTEGER PRIMARY KEY CHECK(id=1), started_on TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS seasonal_participation_days (
        season_id TEXT NOT NULL, starts_on TEXT NOT NULL, ends_on TEXT NOT NULL,
        event_name TEXT NOT NULL, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        earned_on TEXT NOT NULL, PRIMARY KEY(season_id,starts_on,user_id,earned_on));
      CREATE TABLE IF NOT EXISTS seasonal_participation_payouts (
        season_id TEXT NOT NULL, starts_on TEXT NOT NULL, ends_on TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('paid','skipped')),
        total_gc INTEGER NOT NULL, recipients INTEGER NOT NULL,
        processed_at INTEGER NOT NULL, PRIMARY KEY(season_id,starts_on));
      CREATE TABLE IF NOT EXISTS seasonal_participation_recipients (
        season_id TEXT NOT NULL, starts_on TEXT NOT NULL, user_id INTEGER NOT NULL,
        username TEXT NOT NULL, qualifying_days INTEGER NOT NULL, paid_gc INTEGER NOT NULL,
        PRIMARY KEY(season_id,starts_on,user_id));
      CREATE INDEX IF NOT EXISTS seasonal_participation_ends ON seasonal_participation_days(ends_on);`);
    if (!db.pragma('table_info(seasonal_participation_payouts)').some(column => column.name === 'event_name')) {
      db.exec("ALTER TABLE seasonal_participation_payouts ADD COLUMN event_name TEXT NOT NULL DEFAULT ''");
    }
    if (db.prepare('SELECT 1 FROM seasonal_participation_policy WHERE id=1').get()) return;
    db.prepare('INSERT INTO seasonal_participation_policy VALUES(1,?)').run(dayKey(now));
    // Include already logged participation in festivals active at first deployment.
    // Older, finished festivals are not paid retroactively.
    for (const season of activeSeasons(events, now).filter(s => s.xpMultiplier > 1)) {
      const floor = Date.parse(season.window.start + 'T00:00:00Z') / 1000 - 86400;
      const names = season.xpEvents;
      const filter = names.includes('*') ? '' : ` AND event IN (${names.map(() => '?').join(',')})`;
      const rows = db.prepare(`SELECT user_id,event,ref,created_at FROM xp_events
        WHERE created_at>=? AND created_at<=?${filter}`);
      for (const row of rows.all(floor, Math.floor(now.getTime() / 1000), ...(names.includes('*') ? [] : names))) {
        const date = new Date(row.created_at * 1000);
        if (seasonalXpSeasons(row.event, date).some(s => s.id === season.id)) {
          recordSeasonParticipation(db, row.user_id, row.event, date, row.ref);
        }
      }
    }
  }).immediate();
  // Doubled job XP may still be earned while ordinary XP is capped.
  db.function('seasonal_job_windows', () => {
    const date = new Date(), day = dayKey(date);
    return JSON.stringify(seasonalXpSeasons('job_xp', date).map(season => ({
      id: season.id, start: season.window.start, end: season.window.end,
      name: season.title.replace(/ event active$/, ''), day,
    })));
  });
  db.exec(`DROP TRIGGER IF EXISTS seasonal_job_participation;
    CREATE TRIGGER seasonal_job_participation AFTER UPDATE OF xp ON user_job_xp
    WHEN NEW.xp>OLD.xp AND NEW.seasonal_bonus_eligible=1 BEGIN
      INSERT OR IGNORE INTO seasonal_participation_days
        (season_id,starts_on,ends_on,event_name,user_id,earned_on)
      SELECT json_extract(value,'$.id'),json_extract(value,'$.start'),json_extract(value,'$.end'),
        json_extract(value,'$.name'),NEW.user_id,json_extract(value,'$.day')
      FROM json_each(seasonal_job_windows())
      WHERE NOT EXISTS (SELECT 1 FROM seasonal_participation_payouts p
        WHERE p.season_id=json_extract(value,'$.id') AND p.starts_on=json_extract(value,'$.start'));
    END;`);
}

module.exports = { initializeSeasonParticipation, recordSeasonParticipation, dayKey };
