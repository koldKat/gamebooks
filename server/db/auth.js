'use strict';

// Auth: password hashing, users CRUD, sessions, password reset tokens, lockouts.
// Also carries a few stray functions (getRandomMaintenanceMessage, purgeOldNotifications,
// purgeOldHeartbeats, walCheckpoint) that lived in this section of the original
// server/db.js even though they aren't strictly auth-related - kept here verbatim
// rather than relocated, to keep this extraction a pure copy/paste with no risk of
// subtly changing behavior.

const crypto = require('crypto');
const util   = require('util');
const scrypt = util.promisify(crypto.scrypt);

const { db, _foldForSearch, _naturalCompare } = require('./connection');

// ── Auth helpers ──────────────────────────────────────────────────────────────

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return { hash: hash.toString('hex'), salt };
}

async function verifyPassword(password, storedHash, salt) {
  const hash = await scrypt(password, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(storedHash, 'hex'), hash);
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ── Users ─────────────────────────────────────────────────────────────────────

function getUserById(userId) {
  return db.prepare('SELECT id, username, email, is_admin, avatar_path, public_profile, hide_from_feed, is_author, is_contributor, pdf_access, display_name FROM users WHERE id = ?').get(userId) || null;
}

function getUserByUsername(username) {
  return db.prepare('SELECT id, username, avatar_path FROM users WHERE username = ?').get(username) || null;
}

function isUserAdmin(userId) {
  return !!db.prepare('SELECT is_admin FROM users WHERE id = ?').get(userId)?.is_admin;
}

function getAdminUsername() {
  return db.prepare('SELECT username FROM users WHERE is_admin = 1 ORDER BY id LIMIT 1').get()?.username ?? '';
}

function getRandomMaintenanceMessage() {
  return db.prepare('SELECT message FROM maintenance_messages WHERE active = 1 ORDER BY RANDOM() LIMIT 1').get()?.message ?? 'Back shortly.';
}

function searchUsers(query, excludeUserId, limit = 8) {
  const qFold = _foldForSearch(query).trim();
  if (!qFold) return [];
  return db.prepare(
    'SELECT id, username, avatar_path FROM users WHERE id != ?'
  ).all(excludeUserId)
    .filter(u => _foldForSearch(u.username).includes(qFold))
    .sort((a, b) => _naturalCompare(a.username, b.username))
    .slice(0, limit);
}

async function adminUpdateUser(userId, fields) {
  const user = db.prepare('SELECT id, is_author FROM users WHERE id = ?').get(userId);
  if (!user) return { ok: false, error: 'User not found' };

  if (fields.username !== undefined) {
    const trimmed = (fields.username || '').trim();
    if (!trimmed) return { ok: false, error: 'Username cannot be empty' };
    try {
      db.prepare('UPDATE users SET username = ? WHERE id = ?').run(trimmed, userId);
    } catch (e) {
      if (e.message.includes('UNIQUE')) return { ok: false, error: 'Username already taken' };
      throw e;
    }
  }
  if (fields.displayName !== undefined) {
    db.prepare('UPDATE users SET display_name = ? WHERE id = ?')
      .run(user.is_author ? (fields.displayName?.trim() || null) : null, userId);
  }
  if (fields.publicProfile !== undefined)
    db.prepare('UPDATE users SET public_profile = ? WHERE id = ?').run(fields.publicProfile ? 1 : 0, userId);
  if (fields.hideFeed !== undefined)
    db.prepare('UPDATE users SET hide_from_feed = ? WHERE id = ?').run(fields.hideFeed ? 1 : 0, userId);
  if (fields.password?.trim()) {
    const { hash, salt } = await hashPassword(fields.password.trim());
    db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?').run(hash, salt, userId);
  }
  if (fields.email !== undefined) {
    const r = setUserEmail(userId, (fields.email || '').trim() || null);
    if (r?.error === 'email_taken') return { ok: false, error: 'That email address is already in use by another account.' };
  }
  return { ok: true };
}

async function updateUsername(userId, newUsername) {
  try {
    const result = db.prepare('UPDATE users SET username = ? WHERE id = ?').run(newUsername, userId);
    return result.changes > 0;
  } catch (e) {
    if (e.message.includes('UNIQUE')) throw new Error('Username already taken');
    throw e;
  }
}

async function updatePassword(userId, currentPassword, newPassword) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return false;
  const ok = await verifyPassword(currentPassword, user.password_hash, user.salt);
  if (!ok) throw new Error('Current password is incorrect');
  const { hash, salt } = await hashPassword(newPassword);
  db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?').run(hash, salt, userId);
  return true;
}

function updateAvatar(userId, avatarPath) {
  db.prepare('UPDATE users SET avatar_path = ? WHERE id = ?').run(avatarPath, userId);
}

function getUserPrefs(userId) {
  const row = db.prepare('SELECT ui_prefs FROM users WHERE id = ?').get(userId);
  try { return JSON.parse(row?.ui_prefs || 'null') || {}; } catch { return {}; }
}

function setUserPrefs(userId, prefs) {
  db.prepare('UPDATE users SET ui_prefs = ? WHERE id = ?').run(JSON.stringify(prefs), userId);
}

async function createUser(username, password, email) {
  const { hash, salt } = await hashPassword(password);
  const emailVal = email ? email.trim().toLowerCase() : null;
  const tmplIds = db.prepare(`SELECT id FROM join_templates WHERE active = 1`).all().map(r => r.id);
  const tmplId  = tmplIds.length ? tmplIds[Math.floor(Math.random() * tmplIds.length)] : null;
  try {
    const result = db.prepare(
      'INSERT INTO users (username, password_hash, salt, email, join_template_id) VALUES (?, ?, ?, ?, ?)'
    ).run(username, hash, salt, emailVal, tmplId);
    return { id: result.lastInsertRowid, username };
  } catch (e) {
    if (e.message.includes('UNIQUE')) throw new Error('Username already taken');
    throw e;
  }
}

function setUserEmail(userId, email) {
  const val = email ? email.trim().toLowerCase() : null;
  if (val) {
    const existing = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(val, userId);
    if (existing) return { error: 'email_taken' };
  }
  db.prepare('UPDATE users SET email = ? WHERE id = ?').run(val, userId);
  return { ok: true };
}

function getUserEmail(userId) {
  return db.prepare('SELECT email FROM users WHERE id = ?').get(userId)?.email || null;
}

function createPasswordResetToken(identifier) {
  const trimmed = (identifier || '').trim();
  if (!trimmed) return null;
  // Look up by username first, then by email
  const user = db.prepare('SELECT id, email FROM users WHERE username = ?').get(trimmed)
    || db.prepare('SELECT id, email FROM users WHERE lower(email) = ?').get(trimmed.toLowerCase());
  if (!user) return null;
  if (!user.email) return { noEmail: true };
  // Delete any existing token for this user
  db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(user.id);
  const token = require('crypto').randomBytes(32).toString('hex');
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  db.prepare('INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, user.id, expiresAt);
  return { token, userEmail: user.email };
}

function validateResetToken(token) {
  const now = Math.floor(Date.now() / 1000);
  return db.prepare('SELECT user_id FROM password_reset_tokens WHERE token = ? AND expires_at > ?').get(token, now) || null;
}

async function consumeResetToken(token, newPassword) {
  const now = Math.floor(Date.now() / 1000);
  const row = db.prepare('SELECT user_id FROM password_reset_tokens WHERE token = ? AND expires_at > ?').get(token, now);
  if (!row) return { error: 'invalid_token' };
  // Delete before the async hash so a second concurrent request can't slip through.
  const del = db.prepare('DELETE FROM password_reset_tokens WHERE token = ?').run(token);
  if (del.changes === 0) return { error: 'invalid_token' };
  const { hash, salt } = await hashPassword(newPassword);
  db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?').run(hash, salt, row.user_id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.user_id);
  return { ok: true };
}

const MAX_FAILED_ATTEMPTS = 5;
const TEMP_LOCK_SECONDS   = 15 * 60;

async function verifyUser(username, password) {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return null;

  const now = Math.floor(Date.now() / 1000);

  // Check lock status (protected users can never be locked)
  if (!user.is_protected && user.locked_until) {
    if (user.locked_until === -1) {
      return { locked: true, hard: true };
    }
    if (user.locked_until > now) {
      const minsLeft = Math.ceil((user.locked_until - now) / 60);
      return { locked: true, hard: false, minsLeft };
    }
    // Temp lock expired - clear it
    db.prepare('UPDATE users SET locked_until = NULL, failed_login_attempts = 0 WHERE id = ?').run(user.id);
  }

  const ok = await verifyPassword(password, user.password_hash, user.salt);

  if (ok) {
    db.prepare('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?').run(user.id);
    return { id: user.id, username: user.username };
  }

  // Failed attempt - protected users never get locked
  if (!user.is_protected) {
    const attempts = (user.failed_login_attempts || 0) + 1;
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      db.prepare('UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?').run(attempts, now + TEMP_LOCK_SECONDS, user.id);
      return { locked: true, hard: false, minsLeft: TEMP_LOCK_SECONDS / 60, justLocked: true };
    }
    db.prepare('UPDATE users SET failed_login_attempts = ? WHERE id = ?').run(attempts, user.id);
  }

  return null;
}

// ── Sessions ──────────────────────────────────────────────────────────────────

function createSession(userId, { impersonation = false } = {}) {
  const token = generateToken();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at, is_impersonation) VALUES (?, ?, strftime(\'%s\',\'now\') + 1209600, ?)').run(token, userId, impersonation ? 1 : 0);
  return token;
}

function getSession(token) {
  return db.prepare('SELECT user_id, is_impersonation FROM sessions WHERE token = ? AND expires_at > strftime(\'%s\',\'now\')').get(token);
}

function refreshSession(token) {
  db.prepare('UPDATE sessions SET expires_at = strftime(\'%s\',\'now\') + 1209600 WHERE token = ?').run(token);
}

function purgeExpiredSessions() {
  return db.prepare('DELETE FROM sessions WHERE expires_at <= strftime(\'%s\',\'now\')').run().changes;
}

function purgeOldNotifications() {
  const cutoff = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
  return db.prepare('DELETE FROM notifications WHERE seen = 1 AND created_at < ?').run(cutoff).changes;
}

function purgeOldHeartbeats() {
  const cutoff = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
  db.transaction(() => {
    db.prepare(`
      UPDATE users SET heartbeat_minutes_banked = heartbeat_minutes_banked + (
        SELECT COUNT(*) FROM xp_events
        WHERE xp_events.user_id = users.id
          AND xp_events.event = 'idle_heartbeat'
          AND xp_events.created_at < ?
      )
    `).run(cutoff);
    db.prepare(`DELETE FROM xp_events WHERE event = 'idle_heartbeat' AND created_at < ?`).run(cutoff).changes;
  })();
}

function walCheckpoint() {
  db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').run();
}

function deleteSession(token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

module.exports = {
  hashPassword, verifyPassword, generateToken,
  getUserById, getUserByUsername, isUserAdmin, getAdminUsername, getRandomMaintenanceMessage, searchUsers,
  adminUpdateUser, updateUsername, updatePassword, updateAvatar, getUserPrefs, setUserPrefs,
  createUser, setUserEmail, getUserEmail,
  createPasswordResetToken, validateResetToken, consumeResetToken,
  verifyUser,
  createSession, getSession, refreshSession, purgeExpiredSessions,
  purgeOldNotifications, purgeOldHeartbeats, walCheckpoint, deleteSession,
};
