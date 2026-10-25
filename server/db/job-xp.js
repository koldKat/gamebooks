'use strict';

// Job XP counts events, independently of awarded XP, boosts and mining bonuses.
function initializeJobXp(db) {
  db.transaction(() => {
    db.exec(`CREATE TABLE IF NOT EXISTS job_xp_policy (
      id INTEGER PRIMARY KEY CHECK(id=1), user_count INTEGER NOT NULL CHECK(user_count>=0));
      INSERT INTO job_xp_policy(id,user_count) SELECT 1,COUNT(*) FROM users WHERE true
        ON CONFLICT(id) DO UPDATE SET user_count=excluded.user_count;
      CREATE TABLE IF NOT EXISTS user_job_xp (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        xp INTEGER NOT NULL DEFAULT 0 CHECK(xp>=0));
      INSERT OR IGNORE INTO user_job_xp(user_id,xp)
        SELECT users.id,MIN(COALESCE(user_diamonds.qualifying_events,0),
          1000*(policy.user_count/10+1)*(policy.user_count/10+2)/2-1)
        FROM users LEFT JOIN user_diamonds ON user_diamonds.user_id=users.id
        CROSS JOIN job_xp_policy AS policy WHERE policy.id=1;
      CREATE TABLE IF NOT EXISTS job_level_events (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        level INTEGER NOT NULL CHECK(level>0),
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        PRIMARY KEY(user_id,level));
      CREATE INDEX IF NOT EXISTS job_level_events_created_at ON job_level_events(created_at);
      CREATE TRIGGER IF NOT EXISTS record_job_level AFTER UPDATE OF xp ON user_job_xp
        WHEN CAST((sqrt(1+8*NEW.xp/1000.0)-1)/2 AS INTEGER) >
          CAST((sqrt(1+8*OLD.xp/1000.0)-1)/2 AS INTEGER) BEGIN
        INSERT OR IGNORE INTO job_level_events(user_id,level)
          VALUES(NEW.user_id,CAST((sqrt(1+8*NEW.xp/1000.0)-1)/2 AS INTEGER));
      END;
      CREATE TRIGGER IF NOT EXISTS job_xp_user_created AFTER INSERT ON users BEGIN
        UPDATE job_xp_policy SET user_count=user_count+1 WHERE id=1;
      END;
      CREATE TRIGGER IF NOT EXISTS job_xp_user_deleted AFTER DELETE ON users BEGIN
        UPDATE job_xp_policy SET user_count=user_count-1 WHERE id=1;
      END;
      DROP TRIGGER IF EXISTS count_diamond_xp_event;
      DROP TRIGGER IF EXISTS award_job_xp_event;
      CREATE TRIGGER award_job_xp_event AFTER INSERT ON xp_events
        WHEN NEW.event!='idle_heartbeat' BEGIN
        INSERT OR IGNORE INTO user_job_xp(user_id) VALUES(NEW.user_id);
        UPDATE user_job_xp SET xp=MIN(xp+1,1000*(bounds.ceiling+1)*(bounds.ceiling+2)/2-1)
        FROM (SELECT MAX((SELECT user_count/10 FROM job_xp_policy WHERE id=1),
          CAST((sqrt(1+8*xp/1000.0)-1)/2 AS INTEGER)) AS ceiling
          FROM user_job_xp WHERE user_id=NEW.user_id) AS bounds
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
