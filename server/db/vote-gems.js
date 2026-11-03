'use strict';

// Reward permanent, distinct rating votes with alternating ruby/diamond milestones.
const { isImpersonatingContext } = require('../impersonation-context');

function initializeVoteGems(db) {
  db.transaction(() => {
    db.exec(`CREATE TABLE IF NOT EXISTS vote_gem_votes (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK(kind IN ('book','series')),
        ref TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        PRIMARY KEY(user_id,kind,ref));
      CREATE TABLE IF NOT EXISTS vote_gem_totals (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        votes INTEGER NOT NULL DEFAULT 0 CHECK(votes>=0));
      CREATE TABLE IF NOT EXISTS vote_gem_migrations(name TEXT PRIMARY KEY);`);
    if (!db.prepare("SELECT 1 FROM vote_gem_migrations WHERE name='initial-votes-v1'").get()) {
      // Current votes and surviving first-rating XP events overlap; the permanent
      // key combines them once and retains previously removed ratings when known.
      db.exec(`INSERT OR IGNORE INTO vote_gem_votes(user_id,kind,ref)
          SELECT ub.user_id,'book',CAST(CAST(ub.book_id AS INTEGER) AS TEXT) FROM user_books ub
          JOIN users u ON u.id=ub.user_id WHERE ub.rating IS NOT NULL;
        INSERT OR IGNORE INTO vote_gem_votes(user_id,kind,ref)
          SELECT us.user_id,'series',CAST(CAST(us.series_id AS INTEGER) AS TEXT) FROM user_series us
          JOIN users u ON u.id=us.user_id WHERE us.rating IS NOT NULL;
        INSERT OR IGNORE INTO vote_gem_votes(user_id,kind,ref)
          SELECT xe.user_id,CASE xe.event WHEN 'rate_book' THEN 'book' ELSE 'series' END,CAST(CAST(xe.ref AS INTEGER) AS TEXT)
          FROM xp_events xe JOIN users u ON u.id=xe.user_id
          WHERE xe.event IN ('rate_book','rate_series') AND CAST(xe.ref AS INTEGER)>0;
        INSERT INTO vote_gem_totals(user_id,votes)
          SELECT user_id,COUNT(*) FROM vote_gem_votes GROUP BY user_id;
        INSERT INTO user_diamonds(user_id,diamonds_earned)
          SELECT user_id,(votes+50)/100 FROM vote_gem_totals WHERE votes>=50
          ON CONFLICT(user_id) DO UPDATE SET diamonds_earned=diamonds_earned+excluded.diamonds_earned;
        INSERT INTO user_rubies(user_id,rubies_earned)
          SELECT user_id,votes/100 FROM vote_gem_totals WHERE votes>=100
          ON CONFLICT(user_id) DO UPDATE SET rubies_earned=rubies_earned+excluded.rubies_earned;
        INSERT INTO vote_gem_migrations(name) VALUES('initial-votes-v1');`);
    }
    // Legacy wallet names are reversed: user_diamonds holds displayed rubies,
    // user_rubies holds displayed diamonds, as with claimed Lucky Coins.
    db.exec(`CREATE TRIGGER IF NOT EXISTS reward_rating_vote_gems AFTER INSERT ON vote_gem_votes BEGIN
        INSERT INTO vote_gem_totals(user_id) VALUES(NEW.user_id) ON CONFLICT(user_id) DO NOTHING;
        INSERT INTO user_diamonds(user_id) VALUES(NEW.user_id) ON CONFLICT(user_id) DO NOTHING;
        INSERT INTO user_rubies(user_id) VALUES(NEW.user_id) ON CONFLICT(user_id) DO NOTHING;
        UPDATE user_diamonds SET diamonds_earned=diamonds_earned+
          (SELECT (votes+51)/100-(votes+50)/100 FROM vote_gem_totals WHERE user_id=NEW.user_id)
          WHERE user_id=NEW.user_id;
        UPDATE user_rubies SET rubies_earned=rubies_earned+
          (SELECT (votes+1)/100-votes/100 FROM vote_gem_totals WHERE user_id=NEW.user_id)
          WHERE user_id=NEW.user_id;
        UPDATE vote_gem_totals SET votes=votes+1 WHERE user_id=NEW.user_id;
      END;`);
  }).immediate();
}

function awardRatingVote(db, userId, kind, ref) {
  if (isImpersonatingContext()) return { diamondDelta: 0, rubyDelta: 0 };
  if (!['book', 'series'].includes(kind)) throw new RangeError('Invalid vote kind');
  if (!Number.isSafeInteger(Number(ref)) || Number(ref) < 1) throw new RangeError('Invalid vote reference');
  return db.transaction(() => {
    const balance = () => db.prepare(`SELECT
      COALESCE((SELECT diamonds_earned FROM user_diamonds WHERE user_id=?),0) AS diamondDelta,
      COALESCE((SELECT rubies_earned FROM user_rubies WHERE user_id=?),0) AS rubyDelta`).get(userId,userId);
    const before = balance();
    db.prepare('INSERT OR IGNORE INTO vote_gem_votes(user_id,kind,ref) VALUES(?,?,?)').run(userId,kind,String(Number(ref)));
    const after = balance();
    return { diamondDelta: after.diamondDelta-before.diamondDelta, rubyDelta: after.rubyDelta-before.rubyDelta };
  }).immediate();
}

module.exports = { initializeVoteGems, awardRatingVote };
