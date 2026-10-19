'use strict';

// Update shared canvas coordinates without replacing any player's run state.
const { db } = require('./connection');

function patchBookPositions(userId, bookId, positions) {
  return db.transaction(() => {
    const own = db.prepare('SELECT party_id FROM user_books WHERE user_id = ? AND book_id = ?').get(userId, bookId);
    if (!own) return null;
    const rows = own.party_id
      ? db.prepare('SELECT id, state_data FROM user_books WHERE book_id = ? AND party_id = ?').all(bookId, own.party_id)
      : db.prepare('SELECT id, state_data FROM user_books WHERE book_id = ? AND user_id = ?').all(bookId, userId);
    const update = db.prepare('UPDATE user_books SET state_data = ? WHERE id = ?');
    for (const row of rows) {
      const state = JSON.parse(row.state_data);
      state.positions = { ...(state.positions || {}), ...positions };
      update.run(JSON.stringify(state), row.id);
    }
    return { partyId: own.party_id };
  })();
}

module.exports = { patchBookPositions };
