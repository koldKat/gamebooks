'use strict';

function initializeSquireRole(db) {
  if (!db.prepare('PRAGMA table_info(users)').all().some(column => column.name === 'is_squire')) {
    db.exec('ALTER TABLE users ADD COLUMN is_squire INTEGER NOT NULL DEFAULT 0');
  }
}

// Squire is an independent label. It grants no permissions and changes no other role.
function createSquireSetter(db, notify) {
  const find = db.prepare('SELECT is_squire FROM users WHERE id=?');
  const update = db.prepare('UPDATE users SET is_squire=? WHERE id=?');
  const change = db.transaction((userId, value) => {
    const user = find.get(userId);
    if (!user) return { found: false, changed: false };
    const changed = user.is_squire !== Number(value);
    if (changed) {
      update.run(Number(value), userId);
      if (value) notify(userId, { role: 'squire', label: 'Squire' });
    }
    return { found: true, changed };
  });
  return (userId, value) => {
    if (typeof value !== 'boolean') throw new TypeError('isSquire must be a boolean');
    return change.immediate(userId, value);
  };
}

module.exports = { initializeSquireRole, createSquireSetter };
