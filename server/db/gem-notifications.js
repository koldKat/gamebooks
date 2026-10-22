'use strict';

// Earned counters cover every award source. Trades change bought/spent counters
// instead, so purchases and repeat completion checks cannot create gain notices.
function initializeGemNotifications(db) {
  db.transaction(() => {
    for (const [table, currency] of [['user_diamonds', 'diamond'], ['user_rubies', 'ruby']]) {
      const plural = currency === 'ruby' ? 'rubies' : 'diamonds';
      const earned = `${plural}_earned`;
      const balance = `NEW.${earned}+NEW.${plural}_bought-NEW.${plural}_spent`;
      db.exec(`CREATE TRIGGER IF NOT EXISTS notify_${currency}_earned_insert
        AFTER INSERT ON ${table} WHEN NEW.${earned}>0 BEGIN
          INSERT INTO notifications(user_id,type,payload) VALUES(NEW.user_id,'${currency}_gain',
            json_object('amount',NEW.${earned},'balance',${balance}));
        END;
        CREATE TRIGGER IF NOT EXISTS notify_${currency}_earned_update
        AFTER UPDATE OF ${earned} ON ${table} WHEN NEW.${earned}>OLD.${earned} BEGIN
          INSERT INTO notifications(user_id,type,payload) VALUES(NEW.user_id,'${currency}_gain',
            json_object('amount',NEW.${earned}-OLD.${earned},'balance',${balance}));
        END;`);
    }
  }).immediate();
}

module.exports = { initializeGemNotifications };
