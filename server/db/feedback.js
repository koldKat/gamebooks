'use strict';

// Feedback thread-based messaging (user<->admin support threads) + attachments.

const { db } = require('./connection');

db.exec(`CREATE TABLE IF NOT EXISTS feedback_attachment_deletions (
  filename TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
)`);

const _getMsgAttachments = db.prepare('SELECT id, filename, original_name, mime_type, size FROM attachments WHERE kind = ? AND linked_id = ? ORDER BY created_at ASC');

function getAttachments(kind, linkedId) {
  return _getMsgAttachments.all(kind, linkedId);
}

function getAttachmentsForLinks(kind, linkedIds) {
  const byLink = new Map();
  if (!linkedIds.length) return byLink;
  for (const { linked_id, ...attachment } of db.prepare(`
    SELECT id, filename, original_name, mime_type, size, linked_id FROM attachments
    WHERE kind = ? AND linked_id IN (SELECT value FROM json_each(?))
    ORDER BY created_at ASC, id ASC
  `).all(kind, JSON.stringify(linkedIds))) {
    if (!byLink.has(linked_id)) byLink.set(linked_id, []);
    byLink.get(linked_id).push(attachment);
  }
  return byLink;
}

function createAttachment(filename, originalName, mimeType, size, uploadedBy) {
  return db.prepare(
    'INSERT INTO attachments (filename, original_name, mime_type, size, uploaded_by) VALUES (?, ?, ?, ?, ?)'
  ).run(filename, originalName, mimeType, size, uploadedBy).lastInsertRowid;
}

const _linkAttachment = db.prepare(
  'UPDATE attachments SET kind = ?, linked_id = ? WHERE id = ? AND uploaded_by = ? AND linked_id IS NULL'
);
function linkAttachments(ids, kind, linkedId, uploadedBy) {
  if (!ids?.length) return;
  db.transaction(() => { for (const id of ids) _linkAttachment.run(kind, linkedId, id, uploadedBy); })();
}

function _attachMessages(threads) {
  if (!threads.length) return [];
  const messages = db.prepare(`SELECT * FROM feedback_messages
    WHERE thread_id IN (SELECT value FROM json_each(?)) ORDER BY created_at ASC, id ASC
  `).all(JSON.stringify(threads.map(t => t.id)));
  const attachments = getAttachmentsForLinks('feedback_message', messages.map(m => m.id));
  const byThread = new Map();
  for (const message of messages) {
    if (!byThread.has(message.thread_id)) byThread.set(message.thread_id, []);
    byThread.get(message.thread_id).push({ ...message, attachments: attachments.get(message.id) || [] });
  }
  return threads.map(t => ({ ...t, messages: byThread.get(t.id) || [] }));
}

function createFeedbackThread(userId, username, email, body) {
  const threadId = db.prepare(
    'INSERT INTO feedback (user_id, username, email, message, admin_unread, user_unread) VALUES (?, ?, ?, ?, 1, 0)'
  ).run(userId, username, email || null, body).lastInsertRowid;
  const messageId = db.prepare(
    'INSERT INTO feedback_messages (thread_id, sender, body) VALUES (?, ?, ?)'
  ).run(threadId, 'user', body).lastInsertRowid;
  return { threadId, messageId };
}

function addFeedbackMessage(threadId, sender, body) {
  const r = db.prepare('INSERT INTO feedback_messages (thread_id, sender, body) VALUES (?, ?, ?)').run(threadId, sender, body);
  if (sender === 'user') {
    db.prepare('UPDATE feedback SET admin_unread = admin_unread + 1, deleted_by_admin = 0 WHERE id = ?').run(threadId);
  } else {
    db.prepare('UPDATE feedback SET user_unread = user_unread + 1, deleted_by_user = 0 WHERE id = ?').run(threadId);
  }
  return r.lastInsertRowid;
}

function getThreadsForUser(userId) {
  const threads = db.prepare(
    `SELECT f.*
     FROM feedback f
     WHERE f.user_id = ? AND f.deleted_by_user = 0
     ORDER BY COALESCE(
       (SELECT MAX(m.created_at) FROM feedback_messages m WHERE m.thread_id = f.id),
       f.created_at
     ) DESC, f.created_at DESC`
  ).all(userId);
  return _attachMessages(threads);
}

function getAllThreads(options) {
  if (options) {
    const pageSize = Math.max(1,Math.min(50,parseInt(options.pageSize,10)||20));
    const query = String(options.query || '').trim().toLowerCase();
    const where = `f.deleted_by_admin=0 AND (?='' OR instr(lower(f.username),?)>0 OR instr(lower(COALESCE(f.email,'')),?)>0
      OR EXISTS (SELECT 1 FROM feedback_messages m WHERE m.thread_id=f.id AND instr(lower(m.body),?)>0))`;
    const total = db.prepare(`SELECT COUNT(*) AS n FROM feedback f WHERE ${where}`).get(query,query,query,query).n;
    const page = Math.min(Math.max(0,parseInt(options.page,10)||0),Math.max(0,Math.ceil(total/pageSize)-1));
    const threads = db.prepare(`SELECT f.* FROM feedback f WHERE ${where}
      ORDER BY COALESCE((SELECT MAX(m.created_at) FROM feedback_messages m WHERE m.thread_id=f.id),f.created_at) DESC,f.id DESC
      LIMIT ? OFFSET ?`).all(query,query,query,query,pageSize,page*pageSize);
    const unread = db.prepare('SELECT COUNT(*) AS n FROM feedback WHERE deleted_by_admin=0 AND admin_unread>0').get().n;
    return { threads: _attachMessages(threads), unread, pagination: { page,pageSize,total } };
  }
  const threads = db.prepare(
    `SELECT f.*
     FROM feedback f
     WHERE f.deleted_by_admin = 0
     ORDER BY COALESCE(
       (SELECT MAX(m.created_at) FROM feedback_messages m WHERE m.thread_id = f.id),
       f.created_at
     ) DESC, f.created_at DESC`
  ).all();
  return _attachMessages(threads);
}

function getFeedbackThreadById(id) {
  return db.prepare('SELECT * FROM feedback WHERE id = ?').get(id);
}

function markThreadReadByUser(threadId, userId) {
  db.prepare('UPDATE feedback SET user_unread = 0 WHERE id = ? AND user_id = ?').run(threadId, userId);
}

function markThreadReadByAdmin(threadId) {
  db.prepare('UPDATE feedback SET admin_unread = 0 WHERE id = ?').run(threadId);
}

function markThreadUnreadByUser(threadId) {
  db.prepare('UPDATE feedback SET user_unread = 1 WHERE id = ?').run(threadId);
}

const _deleteThread = db.transaction((id, userId) => {
  const thread = db.prepare('SELECT user_id FROM feedback WHERE id = ?').get(id);
  if (!thread || (userId !== undefined && thread.user_id !== userId)) return { ok: false, filenames: [] };
  const filenames = db.prepare(`SELECT filename FROM attachments
    WHERE kind = 'feedback_message' AND linked_id IN
      (SELECT id FROM feedback_messages WHERE thread_id = ?)`).all(id).map(a => a.filename);
  const queue = db.prepare('INSERT OR IGNORE INTO feedback_attachment_deletions (filename) VALUES (?)');
  for (const filename of filenames) queue.run(filename);
  db.prepare(`DELETE FROM attachments WHERE kind = 'feedback_message' AND linked_id IN
    (SELECT id FROM feedback_messages WHERE thread_id = ?)`).run(id);
  db.prepare('DELETE FROM feedback_messages WHERE thread_id = ?').run(id);
  db.prepare('DELETE FROM feedback WHERE id = ?').run(id);
  return { ok: true, filenames };
});

function deleteFeedbackThread(id) {
  return _deleteThread(id);
}

// Deleting hides the thread for one side only; it is truly removed (and its attachment
// files queued for cleanup) once BOTH sides have deleted it.
const _softDeleteByUser = db.transaction((id, userId) => {
  const thread = db.prepare('SELECT user_id, deleted_by_admin FROM feedback WHERE id = ?').get(id);
  if (!thread || thread.user_id !== userId) return { ok: false, filenames: [] };
  db.prepare('UPDATE feedback SET deleted_by_user = 1, user_unread = 0 WHERE id = ?').run(id);
  return thread.deleted_by_admin ? _deleteThread(id) : { ok: true, filenames: [] };
});

const _softDeleteByAdmin = db.transaction(id => {
  const thread = db.prepare('SELECT deleted_by_user FROM feedback WHERE id = ?').get(id);
  if (!thread) return { ok: false, filenames: [] };
  db.prepare('UPDATE feedback SET deleted_by_admin = 1, admin_unread = 0 WHERE id = ?').run(id);
  return thread.deleted_by_user ? _deleteThread(id) : { ok: true, filenames: [] };
});

function deleteFeedbackForUser(id, userId) {
  if (!Number.isInteger(userId)) return { ok: false, filenames: [] };
  return _softDeleteByUser(id, userId);
}

function deleteFeedbackForAdmin(id) {
  return _softDeleteByAdmin(id);
}

function purgeDeletedFeedbackThreads() {
  const ids = db.prepare('SELECT id FROM feedback WHERE deleted_by_user = 1 AND deleted_by_admin = 1').all();
  for (const { id } of ids) deleteFeedbackThread(id);
  return ids.length;
}

module.exports = {
  getAttachments, getAttachmentsForLinks, createAttachment, linkAttachments,
  createFeedbackThread, addFeedbackMessage, getThreadsForUser, getAllThreads,
  getFeedbackThreadById, markThreadReadByUser, markThreadReadByAdmin, markThreadUnreadByUser,
  deleteFeedbackThread, deleteFeedbackForUser, deleteFeedbackForAdmin, purgeDeletedFeedbackThreads,
};
