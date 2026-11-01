'use strict';

// Lucky Coin milestones alternate rubies (50,150,...) and diamonds (100,200,...).
// Wallet names retain the legacy gem identifiers; market stock is independent.
function initializeLuckyCoinDiamonds(db) {
  db.transaction(() => {
    const columns = new Set(db.prepare('PRAGMA table_info(user_diamonds)').all().map(row => row.name));
    if (!columns.has('lucky_coins_claimed')) {
      db.exec(`ALTER TABLE user_diamonds ADD COLUMN lucky_coins_claimed INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE user_diamonds ADD COLUMN lucky_diamonds_earned INTEGER NOT NULL DEFAULT 0;
        INSERT INTO user_diamonds(user_id,lucky_coins_claimed)
          SELECT user_id,SUM(amount) FROM coin_events
          WHERE event='bonus_gc_claim' AND amount>0 GROUP BY user_id
          ON CONFLICT(user_id) DO UPDATE SET
            lucky_coins_claimed=excluded.lucky_coins_claimed;`);
    }
    if (!db.prepare('PRAGMA table_info(user_rubies)').all().some(row => row.name === 'rubies_lucky_coins')) {
      db.exec('ALTER TABLE user_rubies ADD COLUMN rubies_lucky_coins INTEGER NOT NULL DEFAULT 0 CHECK(rubies_lucky_coins>=0)');
    }
    // Reconcile against permanent credited counters, never mutable balances or
    // a fresh ledger sum. Restarts and ledger cleanup cannot duplicate rewards.
    db.exec(`UPDATE user_diamonds SET
        diamonds_earned=diamonds_earned+(lucky_coins_claimed+50)/100-lucky_diamonds_earned,
        lucky_diamonds_earned=(lucky_coins_claimed+50)/100
      WHERE (lucky_coins_claimed+50)/100>lucky_diamonds_earned;
      INSERT INTO user_rubies(user_id,rubies_earned,rubies_lucky_coins)
        SELECT user_id,lucky_coins_claimed/100,lucky_coins_claimed/100 FROM user_diamonds
        WHERE lucky_coins_claimed>=100
        ON CONFLICT(user_id) DO UPDATE SET
          rubies_earned=rubies_earned+MAX(0,excluded.rubies_lucky_coins-rubies_lucky_coins),
          rubies_lucky_coins=MAX(rubies_lucky_coins,excluded.rubies_lucky_coins);
      DROP TRIGGER IF EXISTS reward_lucky_coin_diamond;
      CREATE TRIGGER reward_lucky_coin_diamond AFTER INSERT ON coin_events
      WHEN NEW.event='bonus_gc_claim' AND NEW.amount>0 BEGIN
        INSERT INTO user_diamonds(user_id) VALUES(NEW.user_id) ON CONFLICT(user_id) DO NOTHING;
        INSERT INTO user_rubies(user_id) VALUES(NEW.user_id) ON CONFLICT(user_id) DO NOTHING;
        UPDATE user_rubies SET
          rubies_earned=rubies_earned+((SELECT lucky_coins_claimed FROM user_diamonds WHERE user_id=NEW.user_id)+NEW.amount)/100
            -(SELECT lucky_coins_claimed/100 FROM user_diamonds WHERE user_id=NEW.user_id),
          rubies_lucky_coins=rubies_lucky_coins+((SELECT lucky_coins_claimed FROM user_diamonds WHERE user_id=NEW.user_id)+NEW.amount)/100
            -(SELECT lucky_coins_claimed/100 FROM user_diamonds WHERE user_id=NEW.user_id)
          WHERE user_id=NEW.user_id;
        UPDATE user_diamonds SET
          diamonds_earned=diamonds_earned+(lucky_coins_claimed+NEW.amount+50)/100-(lucky_coins_claimed+50)/100,
          lucky_diamonds_earned=lucky_diamonds_earned+(lucky_coins_claimed+NEW.amount+50)/100-(lucky_coins_claimed+50)/100,
          lucky_coins_claimed=lucky_coins_claimed+NEW.amount WHERE user_id=NEW.user_id;
      END;`);
  }).immediate();
}

module.exports = { initializeLuckyCoinDiamonds };
