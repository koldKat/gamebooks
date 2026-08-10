'use strict';

// Feedback (support thread) route handlers, both user- and admin-facing.

const db = require('../db');
const { authenticate, send, readBody, requireLocalhost, tokenFromReq } = require('../request-helpers');
const { sendAdminEmail, sendReplyEmail } = require('../email');
const { escapeHtml } = require('../html-escape');
const { userBadgePushAll } = require('../sse');

async function handleSubmitFeedback(req, res) {
  // Accept both authenticated and anonymous submissions
  let userId = null;
  const token = tokenFromReq(req);
  if (token) {
    const session = db.getSession(token);
    if (session) { db.refreshSession(token); userId = session.user_id; }
  }
  const { username, email, message, attachment_ids } = await readBody(req);
  if (!message?.trim()) return send(res, 400, { error: 'message required' });
  const { threadId, messageId } = db.createFeedbackThread(userId, username, email || null, message.trim());
  const safeAttIds0 = Array.isArray(attachment_ids) ? attachment_ids.filter(Number.isInteger) : [];
  if (userId && safeAttIds0.length) db.linkAttachments(safeAttIds0, 'feedback_message', messageId, userId);
  send(res, 200, { id: threadId });
  userBadgePushAll();
  sendAdminEmail(
    `New feedback from ${username || 'anonymous'}`,
    `From: ${username || 'anonymous'}${email ? ` <${email}>` : ''}\n\n${message.trim()}`,
    `<strong>From:</strong> ${escapeHtml(username || 'anonymous')}${email ? ` &lt;${escapeHtml(email)}&gt;` : ''}\n\n${escapeHtml(message.trim())}`
  );
}

async function handleGetAppXpSummary(req, res) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  if (!db.canSeeAppXp(userId)) return send(res, 403, { error: 'Admin only' });
  send(res, 200, db.getAppXpSummary());
}

async function handleGetMyFeedback(req, res) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  if (db.isUserAdmin(userId)) {
    // Admin sees all threads; map admin_unread → user_unread so the inbox badge works
    const threads = db.getAllThreads().map(t => ({ ...t, user_unread: t.admin_unread || 0 }));
    return send(res, 200, threads);
  }
  send(res, 200, db.getThreadsForUser(userId));
}

async function handleUserReply(req, res, id) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const isAdmin = db.isUserAdmin(userId);
  const thread = db.getFeedbackThreadById(id);
  if (!thread || (!isAdmin && thread.user_id !== userId)) return send(res, 404, { error: 'Not found' });
  const { message, attachment_ids } = await readBody(req);
  if (!message?.trim()) return send(res, 400, { error: 'message required' });
  const safeAttIds1 = Array.isArray(attachment_ids) ? attachment_ids.filter(Number.isInteger) : [];
  if (isAdmin) {
    const msgId = db.addFeedbackMessage(id, 'admin', message.trim());
    if (safeAttIds1.length) db.linkAttachments(safeAttIds1, 'feedback_message', msgId, userId);
    db.markThreadReadByAdmin(id);
    if (thread.email) sendReplyEmail(thread.email, thread.username, thread.message, message.trim()).catch(() => {});
    db.markThreadUnreadByUser(id);
  } else {
    const msgId = db.addFeedbackMessage(id, 'user', message.trim());
    if (safeAttIds1.length) db.linkAttachments(safeAttIds1, 'feedback_message', msgId, userId);
    const user = db.getUserById(userId);
      sendAdminEmail(
      `Feedback reply from ${user?.username || 'user'}`,
      `${user?.username || 'user'} replied to thread #${id}:\n\n${message.trim()}`,
      `<strong>${escapeHtml(user?.username || 'user')}</strong> replied to thread #${id}:\n\n${escapeHtml(message.trim())}`
    );
  }
  send(res, 200, { ok: true });
  userBadgePushAll();
}

async function handleMarkThreadRead(req, res, id) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  if (db.isUserAdmin(userId)) db.markThreadReadByAdmin(id);
  else db.markThreadReadByUser(id, userId);
  send(res, 200, { ok: true });
  userBadgePushAll();
}

async function handleAdminGetFeedback(req, res) {
  if (!requireLocalhost(req, res)) return;
  send(res, 200, db.getAllThreads());
}

async function handleAdminReply(req, res, id) {
  if (!requireLocalhost(req, res)) return;
  const { reply } = await readBody(req);
  if (!reply?.trim()) return send(res, 400, { error: 'reply required' });
  db.addFeedbackMessage(id, 'admin', reply.trim());
  db.markThreadReadByAdmin(id);
  const thread = db.getFeedbackThreadById(id);
  if (thread?.email) sendReplyEmail(thread.email, thread.username, thread.message, reply.trim()).catch(() => {});
  send(res, 200, { ok: true });
  userBadgePushAll();
}

async function handleAdminMarkRead(req, res, id) {
  if (!requireLocalhost(req, res)) return;
  db.markThreadReadByAdmin(id);
  send(res, 200, { ok: true });
}

async function handleDeleteFeedback(req, res, id) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  db.deleteFeedbackThreadForUser(id, userId);
  send(res, 200, { ok: true });
  userBadgePushAll();
}

async function handleAdminDeleteFeedback(req, res, id) {
  if (!requireLocalhost(req, res)) return;
  db.deleteFeedbackThread(id);
  send(res, 200, { ok: true });
  userBadgePushAll();
}


module.exports = {
  handleSubmitFeedback,
  handleGetAppXpSummary,
  handleGetMyFeedback,
  handleUserReply,
  handleMarkThreadRead,
  handleAdminGetFeedback,
  handleAdminReply,
  handleAdminMarkRead,
  handleDeleteFeedback,
  handleAdminDeleteFeedback,
};
