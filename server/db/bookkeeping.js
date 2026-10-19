'use strict';

const { db } = require('./connection');

// Synchronous, optional session/presence writes must not delay authentication.
function tryBookkeepingWrite(write) {
  const timeout = db.pragma('busy_timeout', { simple: true });
  try {
    db.pragma('busy_timeout = 0');
    write();
    return true;
  } catch (error) {
    if (/^SQLITE_(?:BUSY|LOCKED)(?:_|$)/.test(error.code || '')) return false;
    throw error;
  } finally {
    db.pragma(`busy_timeout = ${timeout}`);
  }
}

module.exports = { tryBookkeepingWrite };
