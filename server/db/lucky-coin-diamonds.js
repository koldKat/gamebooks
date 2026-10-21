'use strict';

// Claim rewards are independent of mining speed and Exchange Shop stock.
function initializeLuckyCoinDiamonds(db) {
  db.transaction(() => {
    const columns = new Set(db.prepare('PRAGMA table_info(user_diamonds)').all().map(row => row.name));
    if (!columns.has('lucky_coins_claimed')) {
      db.exec(`ALTER TABLE user_diamonds ADD COLUMN lucky_coins_claimed INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE user_diamonds ADD COLUMN lucky_diamonds_earned INTEGER NOT NULL DEFAULT 0;
        INSERT INTO user_diamonds(user_id,lucky_coins_claimed,lucky_diamonds_earned,diamonds_earned)
          SELECT user_id,SUM(amount),SUM(amount)/100,SUM(amount)/100 FROM coin_events
          WHERE event='bonus_gc_claim' AND amount>0 GROUP BY user_id
          ON CONFLICT(user_id) DO UPDATE SET
            lucky_coins_claimed=excluded.lucky_coins_claimed,
            lucky_diamonds_earned=excluded.lucky_diamonds_earned,
            diamonds_earned=user_diamonds.diamonds_earned+excluded.lucky_diamonds_earned;`);
    }
    db.exec(`CREATE TRIGGER IF NOT EXISTS reward_lucky_coin_diamond AFTER INSERT ON coin_events
      WHEN NEW.event='bonus_gc_claim' AND NEW.amount>0 BEGIN
        INSERT INTO user_diamonds(user_id) VALUES(NEW.user_id) ON CONFLICT(user_id) DO NOTHING;
        UPDATE user_diamonds SET
          diamonds_earned=diamonds_earned+(lucky_coins_claimed+NEW.amount)/100-lucky_coins_claimed/100,
          lucky_diamonds_earned=lucky_diamonds_earned+(lucky_coins_claimed+NEW.amount)/100-lucky_coins_claimed/100,
          lucky_coins_claimed=lucky_coins_claimed+NEW.amount WHERE user_id=NEW.user_id;
      END;`);
  }).immediate();
}

module.exports = { initializeLuckyCoinDiamonds };
