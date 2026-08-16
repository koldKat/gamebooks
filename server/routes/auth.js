'use strict';

// Auth route handlers: register, login, logout, forgot/reset password.

const fs    = require('fs');
const path  = require('path');
const geoip = require('geoip-lite');
const db    = require('../db');
const { COVERS_DIR } = require('../paths');
const { getClientIp, isRateLimited, recordAuthFailure, send, readBody, tokenFromReq } = require('../request-helpers');
const { getTransporter } = require('../email');
const { feedPush } = require('../sse');

const DEMO_COVER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">
  <rect width="300" height="450" fill="#1a1f2e"/>
  <rect x="1" y="1" width="298" height="448" rx="6" fill="none" stroke="#374151" stroke-width="2"/>
  <line x1="30" y1="60" x2="270" y2="60" stroke="#374151" stroke-width="1"/>
  <line x1="30" y1="390" x2="270" y2="390" stroke="#374151" stroke-width="1"/>
  <text x="150" y="250" font-family="system-ui, sans-serif" font-size="72" font-weight="900"
    text-anchor="middle" dominant-baseline="middle" fill="#f5a623" letter-spacing="4">DEMO</text>
  <text x="150" y="310" font-family="system-ui, sans-serif" font-size="14"
    text-anchor="middle" fill="#6b7280">Sample Gamebook</text>
  <circle cx="150" cy="160" r="30" fill="none" stroke="#f5a623" stroke-width="1.5" opacity="0.4"/>
  <circle cx="150" cy="160" r="8" fill="#f5a623" opacity="0.5"/>
</svg>`;

async function handleRegister(req, res) {
  const ip = getClientIp(req);
  if (isRateLimited(ip)) return send(res, 429, { error: 'Too many attempts. Try again later.' });
  const { username, password, email } = await readBody(req);
  const trimmed = username?.trim() ?? '';
  if (!trimmed || !password)
    return send(res, 400, { error: 'username and password required' });
  if (trimmed.length < 3 || trimmed.length > 64)
    return send(res, 400, { error: 'username must be 3–64 characters' });
  try {
    const user   = await db.createUser(trimmed, password, email || null);
    const bookId = db.createDemoBook(user.id);
    const coverFilename = `demo_${user.id}.svg`;
    fs.writeFileSync(path.join(COVERS_DIR, coverFilename), DEMO_COVER_SVG, 'utf8');
    db.setBookCover(user.id, bookId, coverFilename);
    const token  = db.createSession(user.id);
    send(res, 200, { token, username: user.username });
    feedPush({ type: 'feed_changed', entity: 'profile', action: 'user_joined', id: user.id });
  } catch (e) {
    recordAuthFailure(ip);
    send(res, 409, { error: e.message });
  }
}

async function handleLogin(req, res) {
  const ip = getClientIp(req);
  if (isRateLimited(ip)) return send(res, 429, { error: 'Too many attempts. Try again later.' });
  const { username, password } = await readBody(req);
  if (!username || !password)
    return send(res, 400, { error: 'username and password required' });
  const user = await db.verifyUser(username, password);
  if (!user) {
    recordAuthFailure(ip);
    return send(res, 401, { error: 'Invalid username or password' });
  }
  if (user.locked) {
    if (user.hard) {
      return send(res, 403, { error: 'Your account has been locked by an administrator. Please contact support.', locked: true, hard: true });
    }
    return send(res, 403, { error: `Too many failed attempts. Account locked for ${user.minsLeft} minute${user.minsLeft !== 1 ? 's' : ''}.`, locked: true, hard: false, minsLeft: user.minsLeft });
  }
  const geo = geoip.lookup(getClientIp(req));
  db.updateUserGeo(user.id, geo?.country || null, geo?.city || null);
  const token = db.createSession(user.id);
  send(res, 200, { token, username: user.username });
}

async function handleLogout(req, res) {
  const token = tokenFromReq(req);
  if (token) db.deleteSession(token);
  send(res, 200, { ok: true });
}

async function handleForgotPassword(req, res) {
  const ip = getClientIp(req);
  if (isRateLimited(ip)) return send(res, 429, { error: 'Too many attempts. Try again later.' });
  const { identifier } = await readBody(req);
  if (!identifier?.trim()) return send(res, 200, { ok: true });
  const result = db.createPasswordResetToken(identifier.trim());
  if (result?.noEmail) return send(res, 200, { noEmail: true });
  const transporter = getTransporter();
  if (result?.token && transporter) {
    // Never trust req.headers.host here - it's attacker-controlled, and this link gets
    // emailed to the real user, so a spoofed Host would poison the reset link itself.
    const appUrl = db.getAdminSetting('app_url') || 'https://pathmap.net';
    const resetLink = `${appUrl}/?reset_token=${result.token}`;
    const fromAddr = db.getAdminSetting('smtp_from') || db.getAdminSetting('smtp_user') || process.env.SMTP_FROM || process.env.SMTP_USER;
    const from = fromAddr ? `Gamebook Tracker <${fromAddr}>` : undefined;
    try {
      await transporter.sendMail({
        from,
        to: result.userEmail,
        subject: 'Reset your Gamebook Tracker password',
        text: `You requested a password reset.\n\nClick the link below to set a new password (valid for 1 hour):\n\n${resetLink}\n\nIf you didn't request this, you can ignore this email.`,
        html: `<p>You requested a password reset.</p><p><a href="${resetLink}">Click here to set a new password</a> (link valid for 1 hour).</p><p style="color:#6b7280;font-size:0.9em">If you didn't request this, you can ignore this email.</p>`,
      });
    } catch (e) {
      console.error('[reset-email] failed to send:', e.message);
    }
  } else if (result?.token && !transporter) {
    console.warn('[reset-email] SMTP not configured - reset link not sent for user');
  }
  send(res, 200, { ok: true });
}

async function handleResetPassword(req, res) {
  const { token, password } = await readBody(req);
  if (!token || !password) return send(res, 400, { error: 'token and password required' });
  if (!/^[0-9a-f]{64}$/.test(token)) return send(res, 400, { error: 'Invalid or expired reset link.' });
  const result = await db.consumeResetToken(token, password);
  if (result?.error) return send(res, 400, { error: 'Invalid or expired reset link.' });
  send(res, 200, { ok: true });
}

module.exports = {
  handleRegister, handleLogin, handleLogout, handleForgotPassword, handleResetPassword,
};
