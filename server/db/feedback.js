'use strict';

// Feedback thread-based messaging (user<->admin support threads) + attachments.

const { db } = require('./connection');

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

function deleteFeedbackThread(id) {
  db.prepare('UPDATE feedback SET deleted_by_admin = 1 WHERE id = ?').run(id);
}

function deleteFeedbackThreadForUser(id, userId) {
  db.prepare('UPDATE feedback SET deleted_by_user = 1 WHERE id = ? AND user_id = ?').run(id, userId);
}

module.exports = {
  getAttachments, createAttachment, linkAttachments,
  createFeedbackThread, addFeedbackMessage, getThreadsForUser, getAllThreads,
  getFeedbackThreadById, markThreadReadByUser, markThreadReadByAdmin, markThreadUnreadByUser,
  deleteFeedbackThread, deleteFeedbackThreadForUser,
};
