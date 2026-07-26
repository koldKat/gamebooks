'use strict';

// Forum route handlers: SSR page serving + thread/post CRUD API endpoints.
// Rendering itself lives in top-level server/forum.js; this is just the HTTP glue.

const fs = require('fs');
const path = require('path');
const db = require('../db');
const { authenticate, send, readBody, requireLocalhost, addForumSecurityHeaders } = require('../request-helpers');
const { userBadgePush, userBadgePushAll } = require('../sse');
const { renderForumIndex, renderForumCategory, renderForumThread } = require('../forum');
const { sendAdminEmail } = require('../email');
const { escapeHtml } = require('../html-escape');
const { ATTACHMENTS_DIR } = require('../paths');

// ── Forum handlers ────────────────────────────────────────────────────────────

function serveForumIndex(req, res) {
  const categories = db.forumGetCategories();
  const html = renderForumIndex(categories);
  addForumSecurityHeaders(res);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(html);
}

function serveForumCategory(req, res, slug) {
  const category = db.forumGetCategory(slug);
  const threads  = category ? db.forumGetThreadsByCategory(category.id) : [];
  const html = renderForumCategory(category || null, threads);
  addForumSecurityHeaders(res);
  res.writeHead(category ? 200 : 404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(html);
}

function serveForumThread(req, res, threadId) {
  const data = db.forumGetThread(threadId);
  if (!data) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found');
  }
  const html = renderForumThread(data.thread, data.posts);
  addForumSecurityHeaders(res);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(html);
}

async function handleForumLatest(req, res) {
  const lastPostAt = db.forumGetLatestPostAt();
  const token = (req.headers['authorization'] || '').replace('Bearer ', '');
  const session = token ? db.getSession(token) : null;
  if (session) db.refreshSession(token);
  const userSeen = session ? db.getForumSeenAt(session.user_id) : 0;
  send(res, 200, { lastPostAt, userSeen });
}

async function handleForumSeen(req, res) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  db.setForumSeen(userId);
  send(res, 200, { ok: true });
  userBadgePush(userId);
}

async function handleForumMe(req, res) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const user = db.getUserById(userId);
  if (!user) return send(res, 404, { error: 'Not found' });
  send(res, 200, { id: userId, username: user.username, isAdmin: db.forumIsAdmin(userId) });
}

async function handleForumCreateThread(req, res) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const { title, body, category_id, attachment_ids } = await readBody(req);
  if (!title?.trim()) return send(res, 400, { error: 'Title required' });
  if (!body?.trim())  return send(res, 400, { error: 'Body required' });
  if (title.length > 200)  return send(res, 400, { error: 'Title too long' });
  if (body.length > 20000) return send(res, 400, { error: 'Body too long' });
  if (category_id != null && !Number.isInteger(category_id))
    return send(res, 400, { error: 'Invalid category' });
  const id = db.forumCreateThread(userId, title.trim(), body.trim(), category_id || null);
  const safeAttIds2 = Array.isArray(attachment_ids) ? attachment_ids.filter(Number.isInteger) : [];
  if (safeAttIds2.length) db.linkAttachments(safeAttIds2, 'forum_thread', id, userId);
  send(res, 200, { id });
  userBadgePushAll();
  const poster = db.getUserById(userId);
  const excerpt3 = body.trim().slice(0, 500) + (body.length > 500 ? '…' : '');
  sendAdminEmail(
    `New forum thread: ${title.trim()}`,
    `Posted by ${poster?.username || 'user'}:\n\n${excerpt3}`,
    `<strong>Posted by ${escapeHtml(poster?.username || 'user')}</strong>\n\n${escapeHtml(excerpt3)}`
  );
}

async function handleForumCreatePost(req, res, threadId) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const { body, attachment_ids } = await readBody(req);
  if (!body?.trim())        return send(res, 400, { error: 'Body required' });
  if (body.length > 20000)  return send(res, 400, { error: 'Body too long' });
  const result = db.forumCreatePost(threadId, userId, body.trim());
  if (result.error === 'not_found') return send(res, 404, { error: 'Thread not found' });
  if (result.error === 'locked')    return send(res, 403, { error: 'Thread is locked' });
  const safeAttIds3 = Array.isArray(attachment_ids) ? attachment_ids.filter(Number.isInteger) : [];
  if (result.id && safeAttIds3.length) db.linkAttachments(safeAttIds3, 'forum_post', result.id, userId);
  send(res, 200, { id: result.id });
  userBadgePushAll();
  const replier = db.getUserById(userId);
  const excerpt4 = body.trim().slice(0, 500) + (body.length > 500 ? '…' : '');
  sendAdminEmail(
    `New forum reply from ${replier?.username || 'user'}`,
    `${replier?.username || 'user'} replied in thread #${threadId}:\n\n${excerpt4}`,
    `<strong>${escapeHtml(replier?.username || 'user')}</strong> replied in thread #${threadId}:\n\n${escapeHtml(excerpt4)}`
  );
}

async function handleForumEditThread(req, res, threadId) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const { title, body } = await readBody(req);
  if (!title?.trim()) return send(res, 400, { error: 'Title required' });
  if (!body?.trim())  return send(res, 400, { error: 'Body required' });
  if (title.length > 200)  return send(res, 400, { error: 'Title too long' });
  if (body.length > 20000) return send(res, 400, { error: 'Body too long' });
  const isAdmin = db.forumIsAdmin(userId);
  const result = db.forumEditThread(threadId, userId, isAdmin, title, body);
  if (result.error === 'not_found') return send(res, 404, { error: 'Not found' });
  if (result.error === 'forbidden') return send(res, 403, { error: 'Forbidden' });
  send(res, 200, { ok: true, edited_at: result.edited_at });
}

async function handleForumEditPost(req, res, postId) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const { body } = await readBody(req);
  if (!body?.trim())       return send(res, 400, { error: 'Body required' });
  if (body.length > 20000) return send(res, 400, { error: 'Body too long' });
  const isAdmin = db.forumIsAdmin(userId);
  const result = db.forumEditPost(postId, userId, isAdmin, body);
  if (result.error === 'not_found') return send(res, 404, { error: 'Not found' });
  if (result.error === 'forbidden') return send(res, 403, { error: 'Forbidden' });
  send(res, 200, { ok: true, edited_at: result.edited_at });
}

async function handleForumDeleteThread(req, res, threadId) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const isAdmin = db.forumIsAdmin(userId);
  const result = db.forumDeleteThread(threadId, userId, isAdmin);
  if (result.error === 'not_found')   return send(res, 404, { error: 'Not found' });
  if (result.error === 'forbidden')   return send(res, 403, { error: 'Forbidden' });
  for (const filename of result.filenames || []) {
    try { fs.unlinkSync(path.join(ATTACHMENTS_DIR, filename)); } catch (_) {}
  }
  send(res, 200, { ok: true });
}

async function handleForumDeletePost(req, res, postId) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const isAdmin = db.forumIsAdmin(userId);
  const result = db.forumDeletePost(postId, userId, isAdmin);
  if (result.error === 'not_found')   return send(res, 404, { error: 'Not found' });
  if (result.error === 'forbidden')   return send(res, 403, { error: 'Forbidden' });
  send(res, 200, { ok: true });
}

async function handleForumToggleLock(req, res, threadId) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  if (!db.forumIsAdmin(userId)) return send(res, 403, { error: 'Forbidden' });
  const result = db.forumToggleLock(threadId);
  if (result.error === 'not_found') return send(res, 404, { error: 'Not found' });
  send(res, 200, { locked: result.locked });
}

async function handleForumTogglePin(req, res, threadId) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  if (!db.forumIsAdmin(userId)) return send(res, 403, { error: 'Forbidden' });
  const result = db.forumTogglePin(threadId);
  if (result.error === 'not_found') return send(res, 404, { error: 'Not found' });
  send(res, 200, { pinned: result.pinned });
}


module.exports = {
  handleForumLatest,
  handleForumSeen,
  handleForumMe,
  handleForumCreateThread,
  handleForumCreatePost,
  handleForumEditThread,
  handleForumEditPost,
  handleForumDeleteThread,
  handleForumDeletePost,
  handleForumToggleLock,
  handleForumTogglePin,
  serveForumIndex,
  serveForumCategory,
  serveForumThread,
};
