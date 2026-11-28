'use strict';

// Explain a player's lifetime crystal earnings from permanent reward records.
function getAdminCrystalRewardSources(db, userId) {
  // Legacy storage names are reversed: user_diamonds contains displayed rubies.
  const ruby = db.prepare('SELECT * FROM user_diamonds WHERE user_id=?').get(userId) || {};
  const diamond = db.prepare('SELECT * FROM user_rubies WHERE user_id=?').get(userId) || {};
  const count = (table, condition = '') => db.prepare(
    `SELECT COUNT(*) AS n FROM ${table} WHERE user_id=? ${condition}`
  ).get(userId).n;
  const milestone = (table, column) => db.prepare(
    `SELECT ${column} AS n FROM ${table} WHERE user_id=?`
  ).get(userId)?.n || 0;
  const runs = milestone('completed_run_gem_totals', 'runs');
  const votes = milestone('vote_gem_totals', 'votes');
  const battles = milestone('sim_battle_gem_totals', 'battles');
  const shares = milestone('shared_run_gem_totals', 'runs');
  const row = (source, amount) => ({ source, amount });
  const rubies = [
    row('Book discovery', count('book_discovery_ruby_rewards')),
    row('Anthology discovery', count('collection_completion_gems', "AND kind='anthology' AND milestone='discovery'")),
    row('Series discovery', count('collection_completion_gems', "AND kind='series' AND milestone='discovery'")),
    row('Job levels', count('job_level_ruby_rewards')),
    row('Rating milestones', Math.floor((votes + 50) / 100)),
    row('Completed-run milestones', Math.floor((runs + 50) / 100)),
    row('Simulator battle milestones', Math.floor((battles + 50) / 100)),
    row('Public-share milestones', Math.floor((shares + 50) / 100)),
    row('Player XP milestones', count('player_xp_gem_rewards', "AND currency='rubies'")),
    row('Lucky Coins', ruby.lucky_diamonds_earned || 0),
  ];
  const diamonds = [
    row('Book mapping', count('ruby_rewards', "AND kind='book'")),
    row('Anthology mapping', count('ruby_rewards', "AND kind='anthology'")),
    row('Series mapping', count('collection_completion_gems', "AND kind='series' AND milestone='mapping'")),
    row('Rating milestones', Math.floor(votes / 100)),
    row('Completed-run milestones', Math.floor(runs / 100)),
    row('Simulator battle milestones', Math.floor(battles / 100)),
    row('Public-share milestones', Math.floor(shares / 100)),
    row('Player XP milestones', count('player_xp_gem_rewards', "AND currency='diamonds'")),
    row('Lucky Coins', diamond.rubies_lucky_coins || 0),
    row('Companions', diamond.rubies_collectibles || 0),
  ];
  // Digging has a carry, but no separate lifetime mined counter. Never estimate
  // historical mining from today's upgrades or pretend old adjustments have a source.
  rubies.push(row('Digging / historical adjustments', (ruby.diamonds_earned || 0) - rubies.reduce((sum, entry) => sum + entry.amount, 0)));
  const remainder = (diamond.rubies_earned || 0) - diamonds.reduce((sum, entry) => sum + entry.amount, 0);
  if (remainder) diamonds.push(row('Historical adjustments', remainder));
  return { rubies, diamonds };
}

function getAdminCrystalRewardHistory(db, userId) {
  const rows = db.prepare(`
    SELECT * FROM (
    SELECT 'diamonds' AS currency, 'Book mapping' AS source,
      COALESCE(b.name,'Deleted book #' || r.book_id) AS name, r.created_at * 1000 AS timestamp
      FROM ruby_rewards r LEFT JOIN books b ON b.id=r.book_id WHERE r.user_id=@userId AND r.kind='book'
    UNION ALL
    SELECT 'diamonds','Anthology mapping',COALESCE(b.name,'Deleted anthology #' || r.book_id),r.created_at * 1000
      FROM ruby_rewards r LEFT JOIN books b ON b.id=r.book_id WHERE r.user_id=@userId AND r.kind='anthology'
    UNION ALL
    SELECT 'rubies','Book discovery',COALESCE(b.name,'Deleted book #' || r.book_id),r.created_at * 1000
      FROM book_discovery_ruby_rewards r LEFT JOIN books b ON b.id=r.book_id WHERE r.user_id=@userId
    UNION ALL
    SELECT CASE r.milestone WHEN 'mapping' THEN 'diamonds' ELSE 'rubies' END,
      CASE r.kind WHEN 'series' THEN 'Series ' ELSE 'Anthology ' END || r.milestone,
      CASE r.kind WHEN 'series' THEN COALESCE(s.name,'Deleted series #' || r.collection_id)
        ELSE COALESCE(b.name,'Deleted anthology #' || r.collection_id) END,r.created_at * 1000
      FROM collection_completion_gems r
      LEFT JOIN series s ON r.kind='series' AND s.id=r.collection_id
      LEFT JOIN books b ON r.kind='anthology' AND b.id=r.collection_id
      WHERE r.user_id=@userId AND (r.milestone='discovery' OR r.kind='series')
    UNION ALL
    SELECT 'rubies','Job level','Level ' || level,created_at * 1000 FROM job_level_ruby_rewards WHERE user_id=@userId
    UNION ALL
    SELECT 'diamonds','Companion claim',item_id,claimed_at FROM user_collectibles
      WHERE user_id=@userId AND claimed_at IS NOT NULL AND claims>0
    UNION ALL
    SELECT currency,'Public-share milestone',milestone || ' shared runs',created_at * 1000
      FROM shared_run_gem_rewards WHERE user_id=@userId
    UNION ALL
    SELECT currency,'Player XP milestone',printf('%,d XP',milestone),created_at * 1000
      FROM player_xp_gem_rewards WHERE user_id=@userId
    )
    ORDER BY timestamp DESC,source,
      CASE WHEN source='Player XP milestone' THEN CAST(REPLACE(name,',','') AS INTEGER) END DESC,
      name
  `).all({ userId });
  const result = { rubies: [], diamonds: [] };
  for (const reward of rows) {
    const list = result[reward.currency];
    if (list.length >= 20) continue;
    if (reward.source === 'Companion claim') {
      reward.name = reward.name.replace(/-/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
    }
    list.push({ source: reward.source, name: reward.name, timestamp: reward.timestamp, amount: 1 });
  }
  return result;
}

module.exports = { getAdminCrystalRewardSources, getAdminCrystalRewardHistory };
