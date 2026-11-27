'use strict';

const { initializeJobLevelTemplates } = require('./job-level-templates');
const { seasonalXpMultiplier } = require('../seasonal-events');
const { ensureJobSeasonEligibility } = require('./seasonal-contributions');

// Job XP counts events, independently of awarded XP, boosts and mining bonuses.
function initializeJobXp(db, { xpMultiplier = () => seasonalXpMultiplier('job_xp') } = {}) {
  db.function('seasonal_job_xp_multiplier', { deterministic:false }, () => xpMultiplier());
  db.transaction(() => {
    db.exec(`CREATE TABLE IF NOT EXISTS user_job_xp (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      xp INTEGER NOT NULL DEFAULT 0 CHECK(xp>=0))`);
    ensureJobSeasonEligibility(db);
    db.exec(`CREATE TABLE IF NOT EXISTS job_xp_policy (
      id INTEGER PRIMARY KEY CHECK(id=1), user_count INTEGER NOT NULL CHECK(user_count>=0),
      total_player_xp INTEGER NOT NULL DEFAULT 0);`);
    if (!db.prepare('PRAGMA table_info(job_xp_policy)').all().some(column => column.name === 'total_player_xp')) {
      db.exec('ALTER TABLE job_xp_policy ADD COLUMN total_player_xp INTEGER NOT NULL DEFAULT 0');
    }
    db.exec(`INSERT INTO job_xp_policy(id,user_count,total_player_xp)
        SELECT 1,COUNT(*),COALESCE(SUM(xp),0) FROM users WHERE true
        ON CONFLICT(id) DO UPDATE SET user_count=excluded.user_count,total_player_xp=excluded.total_player_xp;
      DROP VIEW IF EXISTS job_xp_limits;
      CREATE VIEW job_xp_limits AS
        SELECT app_level AS level_cap,1000*(app_level+1)*(app_level+2)/2-1 AS max_xp
        FROM (
          SELECT CAST((sqrt(1+8.0*MAX(0,total_player_xp)/(1000.0*MAX(1,user_count)))-1)/2 AS INTEGER) AS app_level
          FROM job_xp_policy WHERE id=1
        );
      INSERT OR IGNORE INTO user_job_xp(user_id,xp)
        SELECT users.id,MIN(COALESCE(user_diamonds.qualifying_events,0),limits.max_xp)
        FROM users LEFT JOIN user_diamonds ON user_diamonds.user_id=users.id
        CROSS JOIN job_xp_limits AS limits;
      CREATE TABLE IF NOT EXISTS job_level_events (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        level INTEGER NOT NULL CHECK(level>0),
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        PRIMARY KEY(user_id,level));
      CREATE INDEX IF NOT EXISTS job_level_events_created_at ON job_level_events(created_at);
      DROP TRIGGER IF EXISTS job_xp_user_created;
      DROP TRIGGER IF EXISTS job_xp_user_deleted;
      CREATE TRIGGER job_xp_user_created AFTER INSERT ON users BEGIN
        UPDATE job_xp_policy SET user_count=user_count+1,total_player_xp=total_player_xp+COALESCE(NEW.xp,0) WHERE id=1;
      END;
      CREATE TRIGGER job_xp_user_deleted AFTER DELETE ON users BEGIN
        UPDATE job_xp_policy SET user_count=user_count-1,total_player_xp=total_player_xp-COALESCE(OLD.xp,0) WHERE id=1;
      END;
      CREATE TRIGGER IF NOT EXISTS job_xp_user_xp_changed AFTER UPDATE OF xp ON users
        WHEN NEW.xp IS NOT OLD.xp BEGIN
        UPDATE job_xp_policy SET total_player_xp=total_player_xp+COALESCE(NEW.xp,0)-COALESCE(OLD.xp,0) WHERE id=1;
      END;
      DROP TRIGGER IF EXISTS count_diamond_xp_event;
      DROP TRIGGER IF EXISTS award_job_xp_event;
      CREATE TRIGGER award_job_xp_event AFTER INSERT ON xp_events
        WHEN NEW.event!='idle_heartbeat'
          AND COALESCE((SELECT xp FROM user_job_xp WHERE user_id=NEW.user_id),0)
            < (SELECT max_xp FROM job_xp_limits)
        BEGIN
        INSERT OR IGNORE INTO user_job_xp(user_id) VALUES(NEW.user_id);
        UPDATE user_job_xp SET xp=MIN(xp+CASE WHEN seasonal_bonus_eligible=1 THEN seasonal_job_xp_multiplier() ELSE 1 END,
          (SELECT max_xp FROM job_xp_limits))
        WHERE user_id=NEW.user_id;
        INSERT INTO user_diamonds(user_id) VALUES(NEW.user_id) ON CONFLICT(user_id) DO NOTHING;
        UPDATE user_diamonds SET qualifying_events=qualifying_events+1,
          diamonds_earned=diamonds_earned+(dig_progress+rate.units)/1000000,
          dig_progress=(dig_progress+rate.units)%1000000
        FROM (SELECT 1000+level+MIN(purchased,level) AS units FROM (
          SELECT CAST((sqrt(1+8*j.xp/1000.0)-1)/2 AS INTEGER) AS level,
            u.bonus_diamond_dig_purchased AS purchased
          FROM user_job_xp j JOIN users u ON u.id=j.user_id WHERE j.user_id=NEW.user_id
        )) AS rate WHERE user_id=NEW.user_id;
      END;`);
    initializeJobLevelTemplates(db);
  }).immediate();
}

const JOB_TITLES = [
  'Laborer', 'Digger', 'Sifter', 'Panner', 'Quarrier', 'Prospector', 'Miner',
  'Excavator', 'Ore Grader', 'Stonecutter', 'Gem Sorter', 'Gem Polisher',
  'Gem Cutter', 'Lapidary', 'Jeweler', 'Gemsmith', 'Mine Foreman', 'Master Miner',
  'Master Lapidary', 'Master Jeweler', 'Gem Guildmaster',
];
function getJobTitle(level) {
  return JOB_TITLES[Math.min(Math.max(0, level), JOB_TITLES.length - 1)];
}
module.exports = { initializeJobXp, getJobTitle };
