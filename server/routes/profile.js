'use strict';

// Profile route handlers: get/update profile, prefs, avatar/attachment/cover/pdf uploads.

const fs   = require('fs');
const path = require('path');
const db   = require('../db');
const { AVATARS_DIR, COVERS_DIR, BOOKS_DIR, ATTACHMENTS_DIR } = require('../paths');
const {
  authenticate, authenticateOptional, send, readBody, readRawBody,
  isAllowedImage, isAllowedAttachmentType, ATTACHMENT_MAX, AVATAR_UPLOAD_MAX, isLocalhost,
} = require('../request-helpers');
const { feedPush, userBadgePush, publicCatalogPush } = require('../sse');

// ── Profile handlers ──────────────────────────────────────────────────────────

async function handleGetProfile(req, res) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const user = db.getUserById(userId);
  if (!user) return send(res, 404, { error: 'Not found' });
  send(res, 200, {
    id:            userId,
    username:      user.username,
    isAdmin:       user.is_admin === 1,
    displayName:   user.display_name || null,
    isAuthor:      user.is_author === 1,
    isContributor: user.is_contributor === 1,
    pdfAccess:     user.pdf_access === 1,
    avatarUrl:     user.avatar_path ? `/avatars/${user.avatar_path}` : null,
    publicProfile: user.public_profile === 1,
    hideFeed:      user.hide_from_feed === 1,
    email:         user.email || null,
    ...db.getUserXpInfo(userId),
    ...db.getProfileStats(userId),
  });
}

async function handleUpdateProfile(req, res) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const { username, currentPassword, newPassword, publicProfile, hideFeed, displayName, email } = await readBody(req);
  const errors = {};

  if (username !== undefined) {
    const trimmed = (username || '').trim();
    if (!trimmed) { errors.username = 'Username cannot be empty.'; }
    else {
      try {
        await db.updateUsername(userId, trimmed);
        // Update the stored username in all active sessions (best-effort via caller)
      } catch (e) {
        errors.username = e.message;
      }
    }
  }

  if (newPassword !== undefined) {
    if (!newPassword) { errors.password = 'New password cannot be empty.'; }
    else if (!currentPassword) { errors.password = 'Current password is required.'; }
    else {
      try {
        await db.updatePassword(userId, currentPassword, newPassword);
      } catch (e) {
        errors.password = e.message;
      }
    }
  }

  if (publicProfile !== undefined) {
    db.setPublicProfile(userId, publicProfile);
    if (publicProfile) db.awardXp(userId, 'public_profile', userId);
  }

  if (hideFeed !== undefined) db.setHideFromFeed(userId, hideFeed);

  if (email !== undefined) {
    const emailTrimmed = (email || '').trim();
    const emailValid = !emailTrimmed || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed);
    if (!emailValid) { errors.email = 'Invalid email address.'; }
    else {
      const r = db.setUserEmail(userId, emailTrimmed || null);
      if (r?.error === 'email_taken') errors.email = 'That email address is already in use.';
    }
  }

  const currentUser = db.getUserById(userId);
  if (displayName !== undefined && currentUser?.is_author) {
    db.setDisplayName(userId, displayName);
  }

  if (Object.keys(errors).length) return send(res, 400, { errors });

  const updated = db.getUserById(userId);
  send(res, 200, {
    username:      updated.username,
    isAdmin:       updated.is_admin === 1,
    displayName:   updated.display_name || null,
    isAuthor:      updated.is_author === 1,
    isContributor: updated.is_contributor === 1,
    avatarUrl:     updated.avatar_path ? `/avatars/${updated.avatar_path}` : null,
    publicProfile: updated.public_profile === 1,
    hideFeed:      updated.hide_from_feed === 1,
    email:         updated.email || null,
    ...db.getUserXpInfo(userId),
  });
  if (publicProfile !== undefined || hideFeed !== undefined || displayName !== undefined) {
    feedPush({ type: 'feed_changed', entity: 'profile', action: 'update', id: userId });
  }
}

async function handleGetPrefs(req, res) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  send(res, 200, db.getUserPrefs(userId));
}

async function handleSetPrefs(req, res) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const body = await readBody(req);
  if (!body || typeof body !== 'object') return send(res, 400, { error: 'Invalid body' });
  // Merge with existing prefs so a partial PATCH doesn't wipe other keys
  const current = db.getUserPrefs(userId);
  const next = { ...current, ...body };
  // For map-shaped prefs, merge by key instead of replacing the whole map -
  // the client sends a full map snapshot on every toggle, so two PATCHes
  // fired back-to-back (e.g. collapsing two series in a row) can race and
  // whichever map snapshot is smaller ends up overwriting the other,
  // silently dropping the most recently toggled key.
  for (const key of ['bookExpanded', 'seriesExpanded', 'stashExpanded', 'landingCoverPos']) {
    if (body[key] && typeof body[key] === 'object' && !Array.isArray(body[key])) {
      next[key] = { ...(current[key] && typeof current[key] === 'object' ? current[key] : {}), ...body[key] };
    }
  }
  db.setUserPrefs(userId, next);
  send(res, 200, db.getUserPrefs(userId));
  // Push to this user's other open tabs/devices so a pref change (e.g. the
  // feed's cover toggles) doesn't sit stale until their next full page load.
  userBadgePush(userId);

  const currentBookIds = new Set((Array.isArray(current.favoriteBookIds) ? current.favoriteBookIds : []).map(Number).filter(Number.isInteger));
  const nextBookIds = new Set((Array.isArray(next.favoriteBookIds) ? next.favoriteBookIds : []).map(Number).filter(Number.isInteger));
  for (const id of nextBookIds) {
    if (currentBookIds.has(id)) continue;
    if (db.getBookIdentifiers(id)) db.awardXp(userId, 'favorite_cover', `book:${id}`);
  }

  const currentSeriesIds = new Set((Array.isArray(current.favoriteSeriesIds) ? current.favoriteSeriesIds : []).map(Number).filter(Number.isInteger));
  const nextSeriesIds = new Set((Array.isArray(next.favoriteSeriesIds) ? next.favoriteSeriesIds : []).map(Number).filter(Number.isInteger));
  for (const id of nextSeriesIds) {
    if (currentSeriesIds.has(id)) continue;
    if (db.getSeriesById(id)) db.awardXp(userId, 'favorite_cover', `series:${id}`);
  }
}

async function handleUploadAvatar(req, res) {
  const userId = await authenticate(req, res);
  if (userId === null) return;

  let buf;
  try { buf = await readRawBody(req, AVATAR_UPLOAD_MAX); }
  catch (e) {
    if (e.code === 'PAYLOAD_TOO_LARGE') return send(res, 413, { error: 'File too large (max 256 KB)' });
    throw e;
  }
  if (!buf.length) return send(res, 400, { error: 'Empty body' });
  if (!isAllowedImage(buf)) return send(res, 415, { error: 'Unsupported image type' });

  const filename = `${userId}_${Date.now()}.jpg`;
  const filepath = path.join(AVATARS_DIR, filename);
  fs.writeFileSync(filepath, buf);

  // Remove old avatar file if present (with path traversal guard)
  const old = db.getUserById(userId);
  if (old && old.avatar_path && old.avatar_path !== filename) {
    const toDelete = path.join(AVATARS_DIR, old.avatar_path);
    if (toDelete.startsWith(AVATARS_DIR + path.sep)) {
      try { fs.unlinkSync(toDelete); } catch (_) {}
    }
  }

  const isFirst = !old?.avatar_path;
  db.updateAvatar(userId, filename);
  send(res, 200, { avatarUrl: `/avatars/${filename}` });
  if (isFirst) db.awardXp(userId, 'upload_avatar', userId);
  feedPush({ type: 'feed_changed', entity: 'profile', action: 'avatar', id: userId });
}

async function handleUploadAttachment(req, res) {
  const userId = await authenticate(req, res);
  if (userId === null) return;

  let buf;
  try { buf = await readRawBody(req, ATTACHMENT_MAX); }
  catch (e) {
    if (e.code === 'PAYLOAD_TOO_LARGE') return send(res, 413, { error: 'File too large' });
    throw e;
  }
  if (!buf.length) return send(res, 400, { error: 'Empty body' });

  let rawName = 'file';
  try { if (req.headers['x-filename']) rawName = decodeURIComponent(req.headers['x-filename']); }
  catch { return send(res, 400, { error: 'Invalid filename header' }); }
  const originalName = path.basename(rawName).slice(0, 255);
  const rawExt = path.extname(originalName).toLowerCase();
  const ext = rawExt.replace(/[^.a-z0-9]/g, '').slice(0, 10);

  if (!isAllowedAttachmentType(buf, originalName))
    return send(res, 415, { error: 'File type not allowed' });

  // If magic bytes say JPEG but the extension differs (e.g. client compressed PNG→JPEG),
  // normalize the extension so the file is served with the correct MIME type.
  let fileExt = ext;
  if (buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) fileExt = '.jpg';

  const filename = `att_${userId}_${Date.now()}${fileExt}`;
  fs.writeFileSync(path.join(ATTACHMENTS_DIR, filename), buf);

  const mimeType = MIME[fileExt] || 'application/octet-stream';
  const id = db.createAttachment(filename, originalName, mimeType, buf.length, userId);
  send(res, 200, { id, url: `/attachments/${filename}`, name: originalName });
}

async function handleUploadCover(req, res, bookId) {
  const fromLocalhost = isLocalhost(req);
  let userId = null;
  if (fromLocalhost) {
    const adminUser = db.getUserByUsername('koldKat');
    userId = adminUser?.id ?? null;
  } else {
    userId = await authenticate(req, res);
    if (userId === null) return;
  }

  let buf;
  try { buf = await readRawBody(req, AVATAR_UPLOAD_MAX); }
  catch (e) {
    if (e.code === 'PAYLOAD_TOO_LARGE') return send(res, 413, { error: 'File too large (max 256 KB)' });
    throw e;
  }
  if (!buf.length) return send(res, 400, { error: 'Empty body' });
  if (!isAllowedImage(buf)) return send(res, 415, { error: 'Unsupported image type' });

  const filename = `${userId}_${bookId}_${Date.now()}.jpg`;
  const filepath = path.join(COVERS_DIR, filename);
  fs.writeFileSync(filepath, buf);

  db.setBookCover(userId, bookId, filename, fromLocalhost);
  send(res, 200, { coverUrl: `/covers/${filename}` });
  if (!fromLocalhost) db.awardXp(userId, 'upload_cover', bookId);
  const book = db.getBookById(bookId);
  if (book?.is_public) publicCatalogPush({ type: 'public_catalog_changed', entity: 'book', id: bookId, action: 'update' });
}

async function handleUploadPdf(req, res, bookId) {
  let userId = null;
  if (!isLocalhost(req)) {
    userId = await authenticate(req, res);
    if (userId === null) return;
    const user = db.getUserById(userId);
    if (!user?.is_protected && !user?.is_admin) return send(res, 403, { error: 'Admin only' });
  } else {
    userId = authenticateOptional(req);
  }

  let buf;
  try { buf = await readRawBody(req, 256 * 1024 * 1024); }
  catch (e) {
    if (e.code === 'PAYLOAD_TOO_LARGE') return send(res, 413, { error: 'File too large (max 256 MB)' });
    throw e;
  }
  if (!buf.length) return send(res, 400, { error: 'Empty body' });
  if (buf[0] !== 0x25 || buf[1] !== 0x50 || buf[2] !== 0x44 || buf[3] !== 0x46)
    return send(res, 415, { error: 'File must be a PDF' });

  const isFirstPdf = !db.getBookById(bookId)?.pdf_path;
  const filename = `${bookId}_${Date.now()}.pdf`;
  fs.writeFileSync(path.join(BOOKS_DIR, filename), buf);
  db.setBookPdf(bookId, filename);
  if (isFirstPdf) db.awardPdfXp(bookId, userId);
  send(res, 200, { pdfUrl: `/books/${filename}` });
}

async function handleDeletePdf(req, res, bookId) {
  if (!isLocalhost(req)) {
    const userId = await authenticate(req, res);
    if (userId === null) return;
    const user = db.getUserById(userId);
    if (!user?.is_protected && !user?.is_admin) return send(res, 403, { error: 'Admin only' });
  }
  db.removeBookPdf(bookId);
  send(res, 200, { ok: true });
}

module.exports = {
  handleGetProfile,
  handleUpdateProfile,
  handleGetPrefs,
  handleSetPrefs,
  handleUploadAvatar,
  handleUploadAttachment,
  handleUploadCover,
  handleUploadPdf,
  handleDeletePdf,
};
