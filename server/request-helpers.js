'use strict';

// Foundational HTTP request/response helpers shared by every route handler:
// security headers, upload/attachment magic-byte sniffing, auth-failure rate
// limiting, body reading, and session authentication (authenticate/authenticateOptional).

const path  = require('path');
const geoip = require('geoip-lite');
const db    = require('./db');
const { runInImpersonationContext } = require('./impersonation-context');

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return xff.split(',')[0].trim();
  const xri = req.headers['x-real-ip'];
  if (xri) return xri.trim();
  return (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
}

// ── Security helpers ──────────────────────────────────────────────────────────

function addSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy',
    "default-src 'none'; " +
    "script-src 'self'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: blob:; " +
    "connect-src 'self'; " +
    "font-src 'self'; " +
    "manifest-src 'self'; " +
    "frame-src 'self' https://www.youtube.com; " +
    "frame-ancestors 'self'; " +
    "form-action 'self'; " +
    "base-uri 'self';"
  );
}

// Forum pages use inline scripts - allow unsafe-inline
function addForumSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy',
    "default-src 'none'; " +
    "script-src 'unsafe-inline'; " +
    "style-src 'unsafe-inline'; " +
    "img-src 'self'; " +
    "connect-src 'self'; " +
    "form-action 'self'; " +
    "base-uri 'self'; " +
    "frame-ancestors 'self';"
  );
}

// Admin panel is localhost-only - no CSP needed (inline scripts in admin HTML)
function addAdminSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

// Allowed image types by magic bytes (JPEG, PNG, GIF, WebP)
function isAllowedImage(buf) {
  if (buf.length < 4) return false;
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return true; // JPEG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return true; // PNG
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return true; // GIF
  if (buf.length >= 12 &&                                                        // WebP
      buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return true;
  return false;
}

const ATTACHMENT_MAX = 64 * 1024 * 1024; // 64 MB

function isAllowedAttachmentType(buf, filename) {
  const ext = path.extname(filename).toLowerCase();
  const TEXT_EXTS = new Set(['.txt', '.md', '.csv', '.json', '.xml']);
  if (TEXT_EXTS.has(ext)) return true;
  if (buf.length < 4) return false;
  if (isAllowedImage(buf)) return true;
  // AVIF: box type 'ftyp' at bytes 4-7, major brand 'avif'/'avis' at bytes 8-11
  if (buf.length >= 12 &&
      buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70 &&
      buf[8] === 0x61 && buf[9] === 0x76 && buf[10] === 0x69 && (buf[11] === 0x66 || buf[11] === 0x73)) return true;
  // PDF
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return true;
  // ZIP / DOCX / etc.
  if (buf[0] === 0x50 && buf[1] === 0x4B) return true;
  // 7z
  if (buf.length >= 6 && buf[0] === 0x37 && buf[1] === 0x7A && buf[2] === 0xBC && buf[3] === 0xAF && buf[4] === 0x27 && buf[5] === 0x1C) return true;
  // RAR
  if (buf.length >= 6 && buf[0] === 0x52 && buf[1] === 0x61 && buf[2] === 0x72 && buf[3] === 0x21 && buf[4] === 0x1A && buf[5] === 0x07) return true;
  // GZIP (.gz, .tar.gz)
  if (buf[0] === 0x1F && buf[1] === 0x8B) return true;
  return false;
}

// Rate limiter: max 10 failed auth attempts per IP per 15 minutes
const _authFailures = new Map(); // ip -> { count, resetAt }
const AUTH_LIMIT      = 10;
const AUTH_WINDOW_MS  = 15 * 60 * 1000;

function isRateLimited(ip) {
  const now   = Date.now();
  const entry = _authFailures.get(ip);
  if (!entry || entry.resetAt <= now) return false;
  return entry.count >= AUTH_LIMIT;
}

function recordAuthFailure(ip) {
  const now   = Date.now();
  const entry = _authFailures.get(ip);
  if (!entry || entry.resetAt <= now) {
    _authFailures.set(ip, { count: 1, resetAt: now + AUTH_WINDOW_MS });
  } else {
    entry.count++;
  }
}

// Periodically evict expired rate-limit entries to avoid memory growth
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of _authFailures) {
    if (entry.resetAt <= now) _authFailures.delete(ip);
  }
}, AUTH_WINDOW_MS);

// ── Helpers ───────────────────────────────────────────────────────────────────

function isLocalhost(req) {
  const addr = req.socket.remoteAddress;
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

// Honours X-Real-IP from nginx - used by the maintenance gate so proxied
// external requests aren't mistaken for localhost connections.
function isLocalhostReal(req) {
  const sock = req.socket.remoteAddress;
  const isLocalSock = sock === '127.0.0.1' || sock === '::1' || sock === '::ffff:127.0.0.1';
  if (!isLocalSock) return false;
  const realIp = req.headers['x-real-ip'];
  if (!realIp) return true;
  return realIp === '127.0.0.1' || realIp === '::1';
}

function requireLocalhost(req, res) {
  if (isLocalhost(req)) return true;
  res.writeHead(403, { 'Content-Type': 'text/plain' });
  res.end('Forbidden');
  return false;
}

function send(res, status, body) {
  addSecurityHeaders(res);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

const MAX_JSON_BODY      = 1 * 1024 * 1024; // 1 MB
const MAX_PNG_BODY       = 8 * 1024 * 1024; // 8 MB
const AVATAR_UPLOAD_MAX  = 300 * 1024;       // 300 KB
const SSE_PING_MS        = 30_000;

function readBody(req, maxBytes = MAX_JSON_BODY) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', chunk => {
      total += chunk.length;
      if (total > maxBytes) {
        req.destroy();
        return reject(Object.assign(new Error('Payload too large'), { code: 'PAYLOAD_TOO_LARGE' }));
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); } catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

function readRawBody(req, maxBytes = MAX_PNG_BODY) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', chunk => {
      total += chunk.length;
      if (maxBytes && total > maxBytes) {
        req.destroy();
        return reject(Object.assign(new Error('Payload too large'), { code: 'PAYLOAD_TOO_LARGE' }));
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function tokenFromReq(req) {
  const auth = req.headers['authorization'] || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  const qs = new URL(req.url, 'http://x').searchParams.get('token');
  return qs || null;
}

async function authenticate(req, res) {
  const token = tokenFromReq(req);
  if (!token) { send(res, 401, { error: 'Unauthorized' }); return null; }
  const session = db.getSession(token);
  if (!session) { send(res, 401, { error: 'Unauthorized' }); return null; }
  db.refreshSession(token);
  if (!session.is_impersonation) {
    db.updateUserLastActive(session.user_id);
    const geo = geoip.lookup(getClientIp(req));
    db.updateUserActiveGeo(session.user_id, geo?.country || null, geo?.city || null);
    db.updateUserLastDomain(session.user_id, req.headers.host || null);
  }
  return session.user_id;
}

function authenticateOptional(req) {
  const token = tokenFromReq(req);
  if (!token) return null;
  const session = db.getSession(token);
  if (!session) return null;
  db.refreshSession(token);
  if (!session.is_impersonation) {
    db.updateUserLastActive(session.user_id);
    const geo = geoip.lookup(getClientIp(req));
    db.updateUserActiveGeo(session.user_id, geo?.country || null, geo?.city || null);
    db.updateUserLastDomain(session.user_id, req.headers.host || null);
  }
  return session.user_id;
}

// Separate from authenticate()/authenticateOptional() - those already skip
// updateUserLastActive for impersonation sessions, but their return value
// (a bare userId) has no room to also tell a specific route handler "this
// request is impersonated" when it needs that for its own side effects
// (e.g. handleSaveState skipping the user_books.updated_at bump so browsing
// while impersonating can't leak into admin's "last active" column via its
// COALESCE fallback to that timestamp). Changing authenticate()'s signature
// would ripple through every route handler in the app for one call site.
function isRequestImpersonating(req) {
  const token = tokenFromReq(req);
  if (!token) return false;
  const session = db.getSession(token);
  return !!session?.is_impersonation;
}

// The actual AsyncLocalStorage lives in its own module (not here) since
// server/db/xp.js needs to read it too, and xp.js is required BY db.js,
// which this file itself requires - putting the store here would make xp.js
// require this file back, a circular require. See impersonation-context.js.
// This wrapper is the one call site (server.js's request handler) needs:
// it resolves "is this request impersonated" once and runs the rest of that
// request's handling inside the context, so every XP/coin award anywhere in
// the resulting call chain can see it without being passed `req` at all.
function runWithImpersonationContext(req, fn) {
  return runInImpersonationContext(isRequestImpersonating(req), fn);
}

module.exports = {
  getClientIp,
  addSecurityHeaders, addForumSecurityHeaders, addAdminSecurityHeaders,
  isAllowedImage, isAllowedAttachmentType, ATTACHMENT_MAX,
  isRateLimited, recordAuthFailure,
  isLocalhost, isLocalhostReal, requireLocalhost,
  send, readBody, readRawBody, tokenFromReq,
  authenticate, authenticateOptional, isRequestImpersonating,
  runWithImpersonationContext,
  MAX_JSON_BODY, MAX_PNG_BODY, AVATAR_UPLOAD_MAX, SSE_PING_MS,
};
