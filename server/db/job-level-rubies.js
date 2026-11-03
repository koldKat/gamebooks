'use strict';

// Award one displayed ruby for each attained job level, including past levels.
function initializeJobLevelRubies(db) {
  return db.transaction(() => {
    db.exec(`CREATE TABLE IF NOT EXISTS job_level_ruby_rewards (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      level INTEGER NOT NULL CHECK(level>0),
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY(user_id,level));
      CREATE TRIGGER IF NOT EXISTS award_job_level_ruby AFTER INSERT ON job_level_ruby_rewards BEGIN
        INSERT INTO user_diamonds(user_id,diamonds_earned) VALUES(NEW.user_id,1)
          ON CONFLICT(user_id) DO UPDATE SET diamonds_earned=diamonds_earned+1;
      END;`);
    // The legacy diamond wallet holds the rubies displayed in the app.
    // Award through that wallet so existing notifications and floaties apply.
    const level = 'CAST((sqrt(1+8*NEW.xp/1000.0)-1)/2 AS INTEGER)';
    for (const [suffix, event, condition] of [
      ['insert', 'INSERT', `${level}>0`],
      ['update', 'UPDATE OF xp', `${level}>CAST((sqrt(1+8*OLD.xp/1000.0)-1)/2 AS INTEGER)`],
    ]) {
      db.exec(`CREATE TRIGGER IF NOT EXISTS reward_job_level_rubies_${suffix}
        AFTER ${event} ON user_job_xp WHEN ${condition} BEGIN
          INSERT OR IGNORE INTO job_level_ruby_rewards(user_id,level)
            SELECT NEW.user_id,level FROM (
              WITH RECURSIVE levels(level) AS (
                SELECT 1 UNION ALL SELECT level+1 FROM levels WHERE level<${level})
              SELECT level FROM levels);
        END;`);
    }
    // Older levels may predate promotion announcements. Retain recorded higher
    // levels too, without changing Job XP or inventing dated feed promotions.
    const result = db.prepare(`WITH RECURSIVE
      attained(user_id,max_level) AS (
        SELECT user_id,MAX(level) FROM (
          SELECT user_id,CAST((sqrt(1+8*xp/1000.0)-1)/2 AS INTEGER) AS level FROM user_job_xp
          UNION ALL SELECT user_id,level FROM job_level_events) GROUP BY user_id),
      levels(user_id,level,max_level) AS (
        SELECT user_id,1,max_level FROM attained WHERE max_level>0
        UNION ALL SELECT user_id,level+1,max_level FROM levels WHERE level<max_level)
      INSERT OR IGNORE INTO job_level_ruby_rewards(user_id,level)
        SELECT user_id,level FROM levels`).run();
    return { awarded: result.changes };
  }).immediate();
}

module.exports = { initializeJobLevelRubies };
