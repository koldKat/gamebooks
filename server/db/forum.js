'use strict';

// Forum data layer (threads/posts/categories). Not to be confused with the
// top-level server/forum.js, which renders the forum's SSR HTML pages.

const { db } = require('./connection');
const { awardXp } = require('./xp');
const { getAttachments } = require('./feedback');

function forumGetLatestPostAt() {
  const row = db.prepare('SELECT MAX(last_post_at) AS t FROM forum_threads').get();
  return row?.t ?? 0;
}

function getForumSeenAt(userId) {
  return db.prepare('SELECT forum_seen_at FROM users WHERE id = ?').get(userId)?.forum_seen_at ?? 0;
}

function setForumSeen(userId) {
  db.prepare('UPDATE users SET forum_seen_at = ? WHERE id = ?').run(Math.floor(Date.now() / 1000), userId);
}

function forumGetCategories() {
  return db.prepare(`
    SELECT c.id, c.name, c.slug, c.description, c.sort_order,
           COUNT(t.id) AS thread_count,
           MAX(t.last_post_at) AS last_post_at
    FROM forum_categories c
    LEFT JOIN forum_threads t ON t.category_id = c.id
    GROUP BY c.id
    ORDER BY c.sort_order ASC
  `).all();
}

function forumGetCategory(slug) {
  return db.prepare('SELECT * FROM forum_categories WHERE slug = ?').get(slug);
}

function forumGetThreadsByCategory(categoryId) {
  return db.prepare(`
    SELECT t.id, t.title, t.reply_count, t.is_locked, t.is_pinned,
           t.created_at, t.last_post_at, u.username
    FROM forum_threads t
    LEFT JOIN users u ON u.id = t.user_id
    WHERE t.category_id = ?
    ORDER BY t.is_pinned DESC, t.last_post_at DESC
  `).all(categoryId);
}

function forumGetThread(id) {
  const thread = db.prepare(`
    SELECT t.id, t.title, t.body, t.user_id, t.created_at, t.edited_at,
           t.reply_count, t.is_locked, t.is_pinned, t.category_id,
           u.username, u.avatar_path, u.xp, u.public_profile,
           c.slug AS category_slug, c.name AS category_name
    FROM forum_threads t
    LEFT JOIN users u ON u.id = t.user_id
    LEFT JOIN forum_categories c ON c.id = t.category_id
    WHERE t.id = ?
  `).get(id);
  if (!thread) return null;
  thread.attachments = getAttachments('forum_thread', thread.id);
  const posts = db.prepare(`
    SELECT p.id, p.body, p.created_at, p.edited_at, p.is_deleted, p.user_id,
           u.username, u.avatar_path, u.xp, u.public_profile
    FROM forum_posts p
    LEFT JOIN users u ON u.id = p.user_id
    WHERE p.thread_id = ?
    ORDER BY p.created_at ASC
  `).all(id).map(p => ({ ...p, attachments: getAttachments('forum_post', p.id) }));
  return { thread, posts };
}

function forumGetThreadsForSitemap() {
  return db.prepare('SELECT id, last_post_at FROM forum_threads ORDER BY last_post_at DESC').all();
}

function forumCreateThread(userId, title, body, categoryId) {
  const r = db.prepare(
    'INSERT INTO forum_threads (title, body, user_id, category_id) VALUES (?, ?, ?, ?)'
  ).run(title.trim(), body.trim(), userId, categoryId || null);
  awardXp(userId, 'forum_thread', r.lastInsertRowid);
  return r.lastInsertRowid;
}

function forumCreatePost(threadId, userId, body) {
  const thread = db.prepare('SELECT is_locked FROM forum_threads WHERE id = ?').get(threadId);
  if (!thread) return { error: 'not_found' };
  if (thread.is_locked) return { error: 'locked' };
  const now = Math.floor(Date.now() / 1000);
  let postId;
  db.transaction(() => {
    const r = db.prepare('INSERT INTO forum_posts (thread_id, user_id, body) VALUES (?, ?, ?)').run(threadId, userId, body.trim());
    postId = r.lastInsertRowid;
    db.prepare('UPDATE forum_threads SET reply_count = reply_count + 1, last_post_at = ? WHERE id = ?').run(now, threadId);
  })();
  awardXp(userId, 'forum_post', postId);
  return { id: postId };
}

function forumDeleteThread(threadId, userId, isAdmin) {
  const t = db.prepare('SELECT user_id FROM forum_threads WHERE id = ?').get(threadId);
  if (!t) return { error: 'not_found' };
  if (!isAdmin && t.user_id !== userId) return { error: 'forbidden' };

  // Hard delete - unlike forumDeletePost (soft delete) and feedback threads
  // (soft delete), this actually removes rows, so it must also cascade the
  // thread's own attachments and every post's attachments, and hand back the
  // filenames so the caller can unlink them from disk.
  const filenames = db.prepare(
    `SELECT filename FROM attachments WHERE (kind = 'forum_thread' AND linked_id = ?)
        OR (kind = 'forum_post' AND linked_id IN (SELECT id FROM forum_posts WHERE thread_id = ?))`
  ).all(threadId, threadId).map(r => r.filename);

  db.transaction(() => {
    db.prepare(
      `DELETE FROM attachments WHERE (kind = 'forum_thread' AND linked_id = ?)
          OR (kind = 'forum_post' AND linked_id IN (SELECT id FROM forum_posts WHERE thread_id = ?))`
    ).run(threadId, threadId);
    db.prepare('DELETE FROM forum_posts WHERE thread_id = ?').run(threadId);
    db.prepare('DELETE FROM forum_threads WHERE id = ?').run(threadId);
  })();

  return { ok: true, filenames };
}

function forumDeletePost(postId, userId, isAdmin) {
  const p = db.prepare('SELECT user_id, thread_id, is_deleted FROM forum_posts WHERE id = ?').get(postId);
  if (!p || p.is_deleted) return { error: 'not_found' };
  if (!isAdmin && p.user_id !== userId) return { error: 'forbidden' };
  db.transaction(() => {
    db.prepare('UPDATE forum_posts SET is_deleted = 1, body = ? WHERE id = ?').run('[deleted]', postId);
    db.prepare('UPDATE forum_threads SET reply_count = MAX(0, reply_count - 1) WHERE id = ?').run(p.thread_id);
    const latest = db.prepare(
      'SELECT MAX(created_at) AS t FROM forum_posts WHERE thread_id = ? AND is_deleted = 0'
    ).get(p.thread_id);
    const thread = db.prepare('SELECT created_at FROM forum_threads WHERE id = ?').get(p.thread_id);
    const newLastPostAt = latest?.t || thread?.created_at || Math.floor(Date.now() / 1000);
    db.prepare('UPDATE forum_threads SET last_post_at = ? WHERE id = ?').run(newLastPostAt, p.thread_id);
  })();
  return { ok: true };
}

function forumToggleLock(threadId) {
  const t = db.prepare('SELECT is_locked FROM forum_threads WHERE id = ?').get(threadId);
  if (!t) return { error: 'not_found' };
  const newVal = t.is_locked ? 0 : 1;
  db.prepare('UPDATE forum_threads SET is_locked = ? WHERE id = ?').run(newVal, threadId);
  return { locked: !!newVal };
}

function forumTogglePin(threadId) {
  const t = db.prepare('SELECT is_pinned FROM forum_threads WHERE id = ?').get(threadId);
  if (!t) return { error: 'not_found' };
  const newVal = t.is_pinned ? 0 : 1;
  db.prepare('UPDATE forum_threads SET is_pinned = ? WHERE id = ?').run(newVal, threadId);
  return { pinned: !!newVal };
}

function forumEditThread(threadId, userId, isAdmin, title, body) {
  const t = db.prepare('SELECT user_id FROM forum_threads WHERE id = ?').get(threadId);
  if (!t) return { error: 'not_found' };
  if (!isAdmin && t.user_id !== userId) return { error: 'forbidden' };
  const now = Math.floor(Date.now() / 1000);
  db.prepare('UPDATE forum_threads SET title = ?, body = ?, edited_at = ? WHERE id = ?').run(title.trim(), body.trim(), now, threadId);
  return { ok: true, edited_at: now };
}

function forumEditPost(postId, userId, isAdmin, body) {
  const p = db.prepare('SELECT user_id, is_deleted FROM forum_posts WHERE id = ?').get(postId);
  if (!p || p.is_deleted) return { error: 'not_found' };
  if (!isAdmin && p.user_id !== userId) return { error: 'forbidden' };
  const now = Math.floor(Date.now() / 1000);
  db.prepare('UPDATE forum_posts SET body = ?, edited_at = ? WHERE id = ?').run(body.trim(), now, postId);
  return { ok: true, edited_at: now };
}

function forumIsAdmin(userId) {
  return !!db.prepare('SELECT is_admin FROM users WHERE id = ?').get(userId)?.is_admin;
}

module.exports = {
  forumGetLatestPostAt, getForumSeenAt, setForumSeen,
  forumGetCategories, forumGetCategory, forumGetThreadsByCategory,
  forumGetThread, forumGetThreadsForSitemap,
  forumCreateThread, forumCreatePost,
  forumEditThread, forumEditPost,
  forumDeleteThread, forumDeletePost,
  forumToggleLock, forumTogglePin, forumIsAdmin,
};
