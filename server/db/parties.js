'use strict';

// Play Together (parties): shared multi-user progress on a single book.

const { db } = require('./connection');
const { awardXp, processStateXp } = require('./xp');

function createParty(bookId, initiatorUserId) {
  const ub = db.prepare('SELECT id, party_id FROM user_books WHERE book_id = ? AND user_id = ?').get(bookId, initiatorUserId);
  if (!ub) return { error: 'not_tracking' };
  if (ub.party_id) return { ok: true, partyId: ub.party_id };
  const partyId = db.prepare('INSERT INTO book_parties (book_id) VALUES (?)').run(bookId).lastInsertRowid;
  db.prepare('UPDATE user_books SET party_id = ? WHERE book_id = ? AND user_id = ?').run(partyId, bookId, initiatorUserId);
  return { ok: true, partyId };
}

function inviteToParty(partyId, inviterId, inviteeId) {
  const party = db.prepare('SELECT book_id FROM book_parties WHERE id = ?').get(partyId);
  if (!party) return { error: 'party_not_found' };
  if (inviterId === inviteeId) return { error: 'cannot_invite_self' };
  const invitee = db.prepare('SELECT id FROM users WHERE id = ?').get(inviteeId);
  if (!invitee) return { error: 'user_not_found' };
  const existing = db.prepare('SELECT id, status FROM party_invites WHERE party_id = ? AND invitee_id = ?').get(partyId, inviteeId);
  if (existing && existing.status === 'pending') return { error: 'already_invited' };
  const inviteId = db.prepare(
    'INSERT INTO party_invites (party_id, inviter_id, invitee_id) VALUES (?, ?, ?)'
  ).run(partyId, inviterId, inviteeId).lastInsertRowid;
  return { ok: true, inviteId };
}

function acceptPartyInvite(inviteId, userId) {
  const invite = db.prepare('SELECT * FROM party_invites WHERE id = ? AND invitee_id = ? AND status = ?').get(inviteId, userId, 'pending');
  if (!invite) return { error: 'invite_not_found' };
  const party = db.prepare('SELECT book_id FROM book_parties WHERE id = ?').get(invite.party_id);
  if (!party) return { error: 'party_not_found' };
  const existing_ub = db.prepare('SELECT id FROM user_books WHERE book_id = ? AND user_id = ?').get(party.book_id, userId);
  const book = db.prepare('SELECT id, name, total_sections, parent_book_id, series_id, created_by FROM books WHERE id = ?').get(party.book_id);
  if (!book) return { error: 'book_not_found' };
  const existingMembers = db.prepare('SELECT user_id FROM user_books WHERE party_id = ? ORDER BY id').all(invite.party_id);

  // Copy state from any existing party member
  const sourceRow = db.prepare(
    'SELECT state_data FROM user_books WHERE party_id = ? LIMIT 1'
  ).get(invite.party_id);
  const stateJson = sourceRow?.state_data ?? JSON.stringify({ bookName: book.name, totalSections: book.total_sections, graph: {}, playthroughs: [], activePtIndex: null, positions: {} });
  let sourceState = {};
  try { sourceState = JSON.parse(stateJson); } catch {}

  // If book belongs to an anthology, ensure the container is in the user's library
  const parentBook = book.parent_book_id
    ? db.prepare('SELECT id, name, total_sections FROM books WHERE id = ?').get(book.parent_book_id)
    : null;

  db.transaction(() => {
    if (existing_ub) {
      db.prepare('UPDATE user_books SET state_data = ?, party_id = ? WHERE id = ?').run(stateJson, invite.party_id, existing_ub.id);
    } else {
      db.prepare('INSERT INTO user_books (user_id, book_id, state_data, party_id) VALUES (?, ?, ?, ?)').run(userId, party.book_id, stateJson, invite.party_id);
    }
    if (parentBook) {
      const parentExists = db.prepare('SELECT book_id FROM user_books WHERE user_id = ? AND book_id = ?').get(userId, parentBook.id);
      if (!parentExists) {
        const parentState = JSON.stringify({ bookName: parentBook.name, totalSections: parentBook.total_sections, graph: {}, playthroughs: [], activePtIndex: null, positions: {} });
        db.prepare('INSERT INTO user_books (user_id, book_id, state_data) VALUES (?, ?, ?)').run(userId, parentBook.id, parentState);
      }
    }
    // If book belongs to a series, ensure the series is in the user's library
    if (book.series_id) {
      db.prepare('INSERT OR IGNORE INTO user_series (user_id, series_id) VALUES (?, ?)').run(userId, book.series_id);
    }
    db.prepare('UPDATE party_invites SET status = ?, responded_at = strftime(\'%s\',\'now\') WHERE id = ?').run('accepted', inviteId);
  })();

  awardXp(userId, 'join_party', `${invite.party_id}:${userId}`);
  if (existingMembers.length === 1) {
    awardXp(existingMembers[0].user_id, 'create_party', invite.party_id);
    // party_formed fires once (on creator) when the first invite is accepted
    awardXp(existingMembers[0].user_id, 'party_formed', String(invite.party_id));
  }
  if (!existing_ub) {
    awardXp(userId, 'add_book', party.book_id);
    awardXp(userId, 'add_to_library', String(party.book_id));
    if (book.created_by && book.created_by !== userId)
      awardXp(book.created_by, 'book_added_by_other', `${party.book_id}:${userId}`);
  }
  if (Object.keys(sourceState).length > 0) {
    processStateXp(userId, party.book_id, {}, sourceState, book.total_sections || 0);
  }
  return {
    ok: true,
    notifyUserIds: [...new Set([userId, ...existingMembers.map(m => m.user_id)])],
    partyId: invite.party_id,
    bookId:  party.book_id,
  };
}

function declinePartyInvite(inviteId, userId) {
  const invite = db.prepare('SELECT id FROM party_invites WHERE id = ? AND invitee_id = ? AND status = ?').get(inviteId, userId, 'pending');
  if (!invite) return { error: 'invite_not_found' };
  db.prepare('UPDATE party_invites SET status = ?, responded_at = strftime(\'%s\',\'now\') WHERE id = ?').run('declined', inviteId);
  return { ok: true };
}

function leaveParty(userId, bookId) {
  const ub = db.prepare('SELECT party_id FROM user_books WHERE book_id = ? AND user_id = ?').get(bookId, userId);
  if (!ub?.party_id) return { error: 'not_in_party' };
  const partyId = ub.party_id;
  db.prepare('UPDATE user_books SET party_id = NULL WHERE book_id = ? AND user_id = ?').run(bookId, userId);
  const remaining = db.prepare('SELECT user_id FROM user_books WHERE party_id = ?').all(partyId);
  if (remaining.length <= 1) {
    if (remaining.length === 1) {
      db.prepare('UPDATE user_books SET party_id = NULL WHERE party_id = ?').run(partyId);
    }
    db.prepare('DELETE FROM book_parties WHERE id = ?').run(partyId);
  }
  return { ok: true, partyId };
}

function getPartyForBook(userId, bookId) {
  const ub = db.prepare('SELECT party_id FROM user_books WHERE book_id = ? AND user_id = ?').get(bookId, userId);
  if (!ub?.party_id) return null;
  const party = db.prepare('SELECT id, book_id, created_at FROM book_parties WHERE id = ?').get(ub.party_id);
  if (!party) return null;
  const members = db.prepare(`
    SELECT u.id, u.username, u.avatar_path
    FROM user_books ub JOIN users u ON u.id = ub.user_id
    WHERE ub.party_id = ?
  `).all(ub.party_id);
  return { partyId: party.id, bookId: party.book_id, createdAt: party.created_at, members };
}

function getPendingInvites(userId) {
  return db.prepare(`
    SELECT pi.id, pi.party_id, pi.created_at,
           u.username AS inviter_username, u.avatar_path AS inviter_avatar,
           b.id AS book_id, b.name AS book_name, b.cover_path
    FROM party_invites pi
    JOIN book_parties bp ON bp.id = pi.party_id
    JOIN books b ON b.id = bp.book_id
    JOIN users u ON u.id = pi.inviter_id
    WHERE pi.invitee_id = ? AND pi.status = 'pending'
    ORDER BY pi.created_at DESC
  `).all(userId);
}

function getPartyMemberIds(partyId, excludeUserId) {
  return db.prepare('SELECT user_id FROM user_books WHERE party_id = ? AND user_id != ?')
    .all(partyId, excludeUserId).map(r => r.user_id);
}

function fanOutState(partyId, sourceUserId, stateData) {
  const rows = db.prepare('SELECT user_id FROM user_books WHERE party_id = ? AND user_id != ?').all(partyId, sourceUserId);
  if (!rows.length) return [];
  const stateJson = JSON.stringify(stateData);
  const now = Math.floor(Date.now() / 1000);
  const upd = db.prepare('UPDATE user_books SET state_data = ?, updated_at = ? WHERE party_id = ? AND user_id = ?');
  db.transaction(() => {
    for (const row of rows) upd.run(stateJson, now, partyId, row.user_id);
  })();
  return rows.map(r => r.user_id);
}

module.exports = {
  createParty, inviteToParty, acceptPartyInvite, declinePartyInvite,
  leaveParty, getPartyForBook, getPendingInvites, getPartyMemberIds, fanOutState,
};
