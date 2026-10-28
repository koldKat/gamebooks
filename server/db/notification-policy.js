'use strict';

// Keep administrative messages only while automatic reward notices are paused.
// Use the same predicate for historical reads and future inserts.
function adminNotificationSql(type, payload) {
  return `(${type} IN ('gc_gift', 'role_assigned', 'gem_rate_adjustment')
    OR (${type} = 'coin_gain' AND json_extract(${payload}, '$.reason') = 'shop_refund'))`;
}

function initializeNotificationPolicy(db) {
  db.exec(`CREATE TRIGGER IF NOT EXISTS notifications_admin_only
    BEFORE INSERT ON notifications
    WHEN NOT COALESCE(${adminNotificationSql('NEW.type', 'NEW.payload')}, 0)
    BEGIN SELECT RAISE(IGNORE); END;`);
}

module.exports = { adminNotificationSql, initializeNotificationPolicy };
