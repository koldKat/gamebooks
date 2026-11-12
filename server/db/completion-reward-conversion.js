'use strict';

// Replace direct completion gold with permanent public-item gem rewards.
const RETIRED_COMPLETION_GOLD = new Set(['book_completed','discover_all','visit_all',
  'discover_all_series','visit_all_series','discover_all_anthology','visit_all_anthology']);

function backfillCompletionGemsForBook(db, bookId, allUsers = false) {
  if (require('../impersonation-context').isImpersonatingContext()) return [];
  const {createRubyCompletionChecker}=require('./rubies');
  const discovery=createRubyCompletionChecker(db,{discovery:true});
  const mapping=createRubyCompletionChecker(db);
  return db.transaction(()=>{
    const users=allUsers?db.prepare('SELECT id AS user_id FROM users').all():db.prepare(`
      SELECT user_id FROM user_books WHERE book_id=? UNION SELECT user_id FROM xp_events
      WHERE event IN ('discover_node','visit_node') AND ref LIKE ?`).all(bookId,`${bookId}:%`);
    return users.map(({user_id})=>({userId:user_id,diamondDelta:discovery(user_id,bookId),
      rubyDelta:mapping(user_id,bookId)})).filter(row=>row.diamondDelta||row.rubyDelta);
  }).immediate();
}

function initializeCompletionRewardConversion(db) {
  return db.transaction(() => {
    const name='public-completion-gems-v1';
    db.exec(`CREATE TRIGGER IF NOT EXISTS reject_retired_completion_gold
      BEFORE INSERT ON coin_events WHEN NEW.event IN
      (${[...RETIRED_COMPLETION_GOLD].map(event=>`'${event}'`).join(',')})
      BEGIN SELECT RAISE(IGNORE); END;`);
    if (db.prepare('SELECT 1 FROM currency_migrations WHERE name=?').get(name)) return null;
    const events=[...RETIRED_COMPLETION_GOLD];
    const awards=db.prepare(`SELECT user_id,SUM(amount) AS amount FROM coin_events
      WHERE event IN (${events.map(()=>'?').join(',')}) GROUP BY user_id`).all(...events);
    let goldRemoved=0,rubiesAdded=0,diamondsAdded=0;
    for (const {user_id,amount} of awards) {
      db.prepare('UPDATE users SET bonus_coins=bonus_coins-? WHERE id=?').run(amount,user_id);
      db.prepare(`INSERT INTO coin_events(user_id,event,ref,amount)
        VALUES(?,'completion_gold_reversal',?,?)`).run(user_id,name,-amount);
      goldRemoved+=amount;
    }
    const {backfillDiscoveryRubiesForUser}=require('./book-discovery-rubies');
    const {backfillRubiesForUser}=require('./rubies');
    for (const {id} of db.prepare('SELECT id FROM users').all()) {
      rubiesAdded+=backfillDiscoveryRubiesForUser(db,id);
      diamondsAdded+=backfillRubiesForUser(db,id);
    }
    db.prepare('INSERT INTO currency_migrations(name) VALUES(?)').run(name);
    return {goldRemoved,rubiesAdded,diamondsAdded,players:awards};
  }).immediate();
}

module.exports={RETIRED_COMPLETION_GOLD,initializeCompletionRewardConversion,backfillCompletionGemsForBook};
