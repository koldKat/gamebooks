'use strict';

// Feedback thread-based messaging (user<->admin support threads) + attachments.

const { db } = require('./connection');

db.exec(`CREATE TABLE IF NOT EXISTS feedback_attachment_deletions (
  filename TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
)`);

const _getThreadMsgs     = db.prepare('SELECT * FROM feedback_messages WHERE thread_id = ? ORDER BY created_at ASC');
const _getMsgAttachments = db.prepare('SELECT id, filename, original_name, mime_type, size FROM attachments WHERE kind = ? AND linked_id = ? ORDER BY created_at ASC');

function getAttachments(kind, linkedId) {
  return _getMsgAttachments.all(kind, linkedId);
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
  return threads.map(t => ({
    ...t,
    messages: _getThreadMsgs.all(t.id).map(m => ({
      ...m,
      attachments: getAttachments('feedback_message', m.id),
    })),
  }));
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

function getAllThreads() {
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

function deleteFeedbackThreadForUser(id, userId) {
  if (!Number.isInteger(userId)) return { ok: false, filenames: [] };
  return _deleteThread(id, userId);
}

function purgeDeletedFeedbackThreads() {
  const ids = db.prepare('SELECT id FROM feedback WHERE deleted_by_user = 1 OR deleted_by_admin = 1').all();
  for (const { id } of ids) deleteFeedbackThread(id);
  return ids.length;
}

module.exports = {
  getAttachments, createAttachment, linkAttachments,
  createFeedbackThread, addFeedbackMessage, getThreadsForUser, getAllThreads,
  getFeedbackThreadById, markThreadReadByUser, markThreadReadByAdmin, markThreadUnreadByUser,
  deleteFeedbackThread, deleteFeedbackThreadForUser, purgeDeletedFeedbackThreads,
};
