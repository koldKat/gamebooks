'use strict';

const RUBY_INTERVAL = 500000;
const DIAMOND_INTERVAL = 1000000;

// Wallet table names predate the crystal rename. Keep each threshold permanently
// so an XP correction followed by a recovery cannot award it a second time.
function rewardStatements(userId, xp) {
  const highestPaid = `COALESCE((SELECT MAX(milestone) FROM player_xp_gem_rewards WHERE user_id=${userId}),0)`;
  const milestonesCrossed = interval => `CAST(${xp}/${interval} AS INTEGER)-${highestPaid}/${interval}`;
  const diamonds = milestonesCrossed(DIAMOND_INTERVAL);
  const rubies = `(${milestonesCrossed(RUBY_INTERVAL)})-(${diamonds})`;
  const walletCredit = (table, earned, amount) => `
    INSERT INTO ${table}(user_id,${earned})
      SELECT ${userId},${amount} WHERE ${xp}>${highestPaid} AND (${amount})>0
      ON CONFLICT(user_id) DO UPDATE SET ${earned}=${earned}+excluded.${earned};`;
  return [
    walletCredit('user_diamonds', 'diamonds_earned', rubies),
    walletCredit('user_rubies', 'rubies_earned', diamonds),
    `INSERT INTO player_xp_gem_rewards(user_id,milestone,currency)
      SELECT ${userId},milestone,CASE WHEN milestone%${DIAMOND_INTERVAL}=0 THEN 'diamonds' ELSE 'rubies' END
      FROM (
        WITH RECURSIVE crossed(milestone) AS (
          SELECT ${highestPaid}+${RUBY_INTERVAL} WHERE ${xp}>=${highestPaid}+${RUBY_INTERVAL}
          UNION ALL
          SELECT milestone+${RUBY_INTERVAL} FROM crossed WHERE milestone+${RUBY_INTERVAL}<=${xp}
        )
        SELECT milestone FROM crossed
      );`,
  ];
}

function initializePlayerXpGems(db) {
  db.transaction(() => {
    db.exec(`CREATE TABLE IF NOT EXISTS player_xp_gem_rewards (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      milestone INTEGER NOT NULL CHECK(milestone>0 AND milestone%${RUBY_INTERVAL}=0),
      currency TEXT NOT NULL CHECK(currency=CASE WHEN milestone%${DIAMOND_INTERVAL}=0 THEN 'diamonds' ELSE 'rubies' END),
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY(user_id,milestone));
      DROP TRIGGER IF EXISTS reward_player_xp_gems;
      DROP TRIGGER IF EXISTS reward_initial_player_xp_gems;

      UPDATE user_diamonds
      SET diamonds_earned=diamonds_earned-revoked.amount
      FROM (
        SELECT user_id, COUNT(*) AS amount FROM player_xp_gem_rewards
        WHERE currency='rubies' AND milestone%${RUBY_INTERVAL}!=0
        GROUP BY user_id
      ) AS revoked
      WHERE user_diamonds.user_id=revoked.user_id;
      DELETE FROM player_xp_gem_rewards
      WHERE currency='rubies' AND milestone%${RUBY_INTERVAL}!=0;

      CREATE TRIGGER reward_player_xp_gems AFTER UPDATE OF xp ON users
        WHEN CAST(NEW.xp/${RUBY_INTERVAL} AS INTEGER)>CAST(OLD.xp/${RUBY_INTERVAL} AS INTEGER) BEGIN
        ${rewardStatements('NEW.id', 'NEW.xp').join('\n')}
      END;
      CREATE TRIGGER reward_initial_player_xp_gems AFTER INSERT ON users
        WHEN NEW.xp>=${RUBY_INTERVAL} BEGIN
        ${rewardStatements('NEW.id', 'NEW.xp').join('\n')}
      END;`);
    const players = db.prepare(`SELECT id,xp FROM users
      WHERE xp>=${RUBY_INTERVAL}+COALESCE((
        SELECT MAX(milestone) FROM player_xp_gem_rewards WHERE user_id=users.id
      ),0)`).all();
    if (!players.length) return;
    const credit = rewardStatements('@id', '@xp').map(sql => db.prepare(sql));
    for (const player of players) {
      for (const statement of credit) statement.run(player);
    }
  }).immediate();
}

module.exports = { initializePlayerXpGems };
