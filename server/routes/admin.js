'use strict';

// Admin panel route handlers: admin file serving, user/book/settings/backups
// management, shop refunds, GC gifting, SMTP test, app-size/backup listing.

const fs   = require('fs');
const path = require('path');
const db   = require('../db');
const {
  requireLocalhost, send, readBody, addSecurityHeaders, addAdminSecurityHeaders, authenticate,
} = require('../request-helpers');
const { feedPush, userBadgePush, publicCatalogPush } = require('../sse');
const { reinitTransporter, getTransporter } = require('../email');
const {
  setMaintenanceMode, getTrafficStats, getAppBirthAt,
} = require('../runtime-state');

// This module lives at server/routes/admin.js - the project root is two levels up.
const PROJECT_ROOT = path.join(__dirname, '..', '..');

// ── Admin handlers ────────────────────────────────────────────────────────────

function serveAdminFile(req, res, filename) {
  if (!requireLocalhost(req, res)) return;
  const filePath = path.join(PROJECT_ROOT, 'admin', filename);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      addAdminSecurityHeaders(res);
      res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found');
    }
    addAdminSecurityHeaders(res);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

function serveAdminPanel(req, res) {
  serveAdminFile(req, res, 'index.html');
}

function _buildAdminStatsPayload() {
  const now           = Math.floor(Date.now() / 1000);
  const totalDowntime = parseInt(db.getAdminSetting('server_total_downtime_s') || '0');
  const totalTracked  = now - getAppBirthAt();
  const uptimePct     = totalTracked > 0 ? ((totalTracked - totalDowntime) / totalTracked * 100) : 100;
  const { trafficIn, trafficOut } = getTrafficStats();
  return {
    ...db.adminGetStats(),
    trafficIn,
    trafficOut,
    sessionUptime:  now - parseInt(db.getAdminSetting('server_session_start_at') || String(now)),
    uptimePct:      Math.round(uptimePct * 100) / 100,
    totalDowntimeS: totalDowntime,
    totalTrackedS:  totalTracked,
  };
}

async function handleAdminStats(req, res) {
  if (!requireLocalhost(req, res)) return;
  send(res, 200, _buildAdminStatsPayload());
}

async function handleAdminGetUser(req, res, userId) {
  if (!requireLocalhost(req, res)) return;
  const user = db.adminGetUser(userId);
  if (!user) return send(res, 404, { error: 'Not found' });
  send(res, 200, { user, books: db.adminGetUserBooks(userId) });
}

async function handleAdminGetBookStats(req, res, bookId) {
  if (!requireLocalhost(req, res)) return;
  const stats = db.adminGetBookStats(bookId);
  if (!stats) return send(res, 404, { error: 'Not found' });
  send(res, 200, stats);
}

async function handleAdminGetUsers(req, res) {
  if (!requireLocalhost(req, res)) return;
  send(res, 200, db.adminGetUsers());
}

async function handleAdminDeleteUser(req, res, userId) {
  if (!requireLocalhost(req, res)) return;
  const target = db.getUserById(userId);
  if (target?.is_protected || target?.is_author || target?.is_contributor) return send(res, 403, { error: 'This account cannot be deleted' });
  if (!db.adminDeleteUser(userId)) return send(res, 404, { error: 'Not found' });
  send(res, 200, { ok: true });
}

async function handleAdminClearSessions(req, res, userId) {
  if (!requireLocalhost(req, res)) return;
  const cleared = db.adminClearUserSessions(userId);
  send(res, 200, { cleared });
}

async function handleAdminLockUser(req, res, userId) {
  if (!requireLocalhost(req, res)) return;
  if (!db.adminLockUser(userId)) return send(res, 403, { error: 'This account cannot be locked' });
  send(res, 200, { ok: true });
}

async function handleAdminUnlockUser(req, res, userId) {
  if (!requireLocalhost(req, res)) return;
  db.adminUnlockUser(userId);
  send(res, 200, { ok: true });
}

async function handleAdminUpdateUser(req, res, userId) {
  if (!requireLocalhost(req, res)) return;
  const body = await readBody(req);
  const result = await db.adminUpdateUser(userId, body);
  if (!result.ok) return send(res, 400, { error: result.error });
  send(res, 200, { ok: true });
}

async function handleAdminSetAuthor(req, res, userId) {
  if (!requireLocalhost(req, res)) return;
  const { isAuthor, displayName } = await readBody(req);
  db.setAuthor(userId, !!isAuthor);
  if (displayName !== undefined) db.setDisplayName(userId, displayName);
  send(res, 200, { ok: true });
}

async function handleAdminSetContributor(req, res, userId) {
  if (!requireLocalhost(req, res)) return;
  const { isContributor } = await readBody(req);
  db.setContributor(userId, !!isContributor);
  send(res, 200, { ok: true });
}

async function handleAdminSetPdfAccess(req, res, userId) {
  if (!requireLocalhost(req, res)) return;
  const { pdfAccess } = await readBody(req);
  db.setPdfAccess(userId, !!pdfAccess);
  send(res, 200, { ok: true });
}

async function handleAdminImpersonate(req, res, userId) {
  if (!requireLocalhost(req, res)) return;
  const user = db.adminGetUser(userId);
  if (!user) return send(res, 404, { error: 'Not found' });
  const otp = db.createImpersonationToken(userId);
  const origin = `${req.socket.encrypted ? 'https' : 'http'}://${req.headers.host}`;
  send(res, 200, { url: `${origin}/auth/impersonate?token=${otp}` });
}

function handleImpersonateRedirect(req, res) {
  const origin = `${req.socket.encrypted ? 'https' : 'http'}://${req.headers.host}`;
  const token = new URL(req.url, origin).searchParams.get('token');
  const userId = token ? db.consumeImpersonationToken(token) : null;

  if (!userId) {
    addSecurityHeaders(res);
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end('<!DOCTYPE html><html><body style="background:#111827;color:#f87171;font-family:monospace;padding:2rem">Invalid or expired impersonation link.</body></html>');
  }
  const sessionToken = db.createSession(userId, { impersonation: true });
  res.writeHead(302, { 'Location': `/?_imp=${encodeURIComponent(sessionToken)}`, 'Cache-Control': 'no-store' });
  res.end();
}

async function handleAdminGetBooks(req, res) {
  if (!requireLocalhost(req, res)) return;
  send(res, 200, db.adminGetBooks());
}

async function handleAdminDeleteBook(req, res, bookId) {
  if (!requireLocalhost(req, res)) return;
  const book = db.getBookContainerFields(bookId);
  const result = db.adminDeleteBook(bookId);
  if (result === false) return send(res, 404, { error: 'Not found' });
  if (result?.error === 'has_readers') return send(res, 409, result);
  send(res, 200, { ok: true });
  if (book?.is_public) publicCatalogPush({ type: 'public_catalog_changed', entity: 'book', id: bookId, action: 'delete' });
  feedPush({ type: 'feed_changed', entity: 'book', action: 'delete', id: bookId });
}

async function handleAdminGetBookRatings(req, res, bookId) {
  if (!requireLocalhost(req, res)) return;
  send(res, 200, db.adminGetBookRatings(bookId));
}

async function handleAdminDeleteRating(req, res, bookId, userBookId) {
  if (!requireLocalhost(req, res)) return;
  if (!db.adminDeleteRating(userBookId)) return send(res, 404, { error: 'Not found' });
  send(res, 200, { ok: true });
}

async function handleAdminRefundShopItem(req, res, userId) {
  if (!requireLocalhost(req, res)) return;
  const { item, all } = await readBody(req);
  const result = db.adminRefundShopItem(userId, item, !!all);
  if (result.error === 'invalid_item')     return send(res, 400, { error: 'Invalid item' });
  if (result.error === 'not_found')        return send(res, 404, { error: 'User not found' });
  if (result.error === 'nothing_to_refund') return send(res, 409, { error: 'Nothing to refund' });
  send(res, 200, { ok: true });
}

async function handleAdminGiftGc(req, res, userId) {
  if (!requireLocalhost(req, res)) return;
  const { amount, message } = await readBody(req);
  if (!Number.isInteger(amount) || amount < 1) return send(res, 400, { error: 'amount must be a positive integer' });
  const supply = db.getAdminGcSupply(getAppBirthAt());
  if (amount > supply.available) return send(res, 409, { error: 'Insufficient admin GC supply', available: supply.available });
  const result = db.adminGiftGc(userId, amount, message || null);
  if (!result) return send(res, 404, { error: 'User not found' });
  userBadgePush(userId);
  send(res, 200, result);
}

async function handleAdminGiftBook(req, res, bookId) {
  if (!requireLocalhost(req, res)) return;
  const { sourceUserId, targetUserId } = await readBody(req);
  if (!Number.isInteger(targetUserId) || targetUserId < 1)
    return send(res, 400, { error: 'targetUserId required' });
  const result = db.giftBook(bookId, sourceUserId || null, targetUserId);
  if (result.error === 'book_not_found') return send(res, 404, { error: 'Book not found' });
  if (result.error === 'user_not_found') return send(res, 404, { error: 'User not found' });
  if (result.error === 'already_tracking') return send(res, 409, { error: 'User already has this book' });
  send(res, 200, { ok: true });
}

const SIZE_IGNORE_DEFAULTS = [
  'package-lock.json',
  'node_modules',
  '.gitignore',
  '*backup*',
  '.claude',
  'memory',
].join('\n');

function globMatch(name, pattern) {
  const rx = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
  return new RegExp(`^${rx}$`).test(name);
}

function calcDirSize(dir, patterns) {
  let total = 0;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return 0; }
  for (const entry of entries) {
    if (patterns.some(p => globMatch(entry.name, p))) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += calcDirSize(fullPath, patterns);
    } else if (entry.isFile()) {
      try { total += fs.statSync(fullPath).size; } catch {}
    }
  }
  return total;
}

async function handleAdminGetSettings(req, res) {
  if (!requireLocalhost(req, res)) return;
  const settings = db.getAllAdminSettings();
  send(res, 200, {
    notepad:              settings.notepad              ?? '',
    app_version:          settings.app_version          ?? '0.8.8.1',
    size_ignore_patterns: settings.size_ignore_patterns ?? SIZE_IGNORE_DEFAULTS,
    smtp_host:            settings.smtp_host            ?? '',
    smtp_port:            settings.smtp_port            ?? '465',
    smtp_secure:          settings.smtp_secure          ?? 'true',
    smtp_user:            settings.smtp_user            ?? '',
    smtp_from:            settings.smtp_from            ?? '',
    smtp_pass_set:        !!(settings.smtp_pass),
    smtp_active:          !!getTransporter(),
    maintenance_mode:     settings.maintenance_mode === '1',
    app_url:              settings.app_url             ?? '',
  });
}

async function handleAdminAppSize(req, res) {
  if (!requireLocalhost(req, res)) return;
  const raw      = db.getAdminSetting('size_ignore_patterns') ?? SIZE_IGNORE_DEFAULTS;
  const patterns = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const bytes    = calcDirSize(PROJECT_ROOT, patterns);
  send(res, 200, { bytes });
}

function findBackupFiles(dir, ignorePatterns) {
  const results = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return results; }
  for (const entry of entries) {
    if (ignorePatterns.some(p => globMatch(entry.name, p))) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findBackupFiles(fullPath, ignorePatterns));
    } else if (entry.isFile() && globMatch(entry.name, '*backup*')) {
      try {
        const stat = fs.statSync(fullPath);
        results.push({ rel: path.relative(PROJECT_ROOT, fullPath), name: entry.name, size: stat.size, mtime: stat.mtimeMs });
      } catch {}
    }
  }
  return results;
}

async function handleAdminListBackups(req, res) {
  if (!requireLocalhost(req, res)) return;
  const raw      = db.getAdminSetting('size_ignore_patterns') ?? SIZE_IGNORE_DEFAULTS;
  // Exclude the *backup* pattern itself so backup files aren't skipped
  const patterns = raw.split('\n').map(l => l.trim()).filter(l => l && l !== '*backup*');
  const backups  = findBackupFiles(PROJECT_ROOT, patterns);
  backups.sort((a, b) => b.mtime - a.mtime);
  send(res, 200, backups);
}

async function handleAdminDeleteBackups(req, res) {
  if (!requireLocalhost(req, res)) return;
  const { paths } = await readBody(req);
  if (!Array.isArray(paths)) return send(res, 400, { error: 'paths array required' });
  const appRoot = PROJECT_ROOT.endsWith(path.sep) ? PROJECT_ROOT : PROJECT_ROOT + path.sep;
  const deleted = [], errors = [];
  for (const rel of paths) {
    if (typeof rel !== 'string') continue;
    const full = path.resolve(PROJECT_ROOT, rel);
    if (!full.startsWith(appRoot)) { errors.push({ rel, error: 'Outside app directory' }); continue; }
    if (!globMatch(path.basename(full), '*backup*')) { errors.push({ rel, error: 'Not a backup file' }); continue; }
    try { fs.unlinkSync(full); deleted.push(rel); }
    catch (e) { errors.push({ rel, error: e.message }); }
  }
  send(res, 200, { deleted, errors });
}

async function handleAdminSetSetting(req, res) {
  if (!requireLocalhost(req, res)) return;
  const { key, value } = await readBody(req);
  if (!key || typeof value !== 'string') return send(res, 400, { error: 'Invalid' });
  if (key === 'smtp_pass' && value === '') return send(res, 200, { ok: true }); // blank = keep existing
  db.setAdminSetting(key, value);
  if (key.startsWith('smtp_')) reinitTransporter();
  if (key === 'maintenance_mode') setMaintenanceMode(value === '1');
  if (key === 'app_version') feedPush({ type: 'config_changed', version: value });
  send(res, 200, { ok: true });
}

async function handleAdminGetXpConfig(req, res) {
  if (!requireLocalhost(req, res)) return;
  send(res, 200, { config: db.getXpConfig() });
}

async function handleAdminSetXpAmount(req, res) {
  if (!requireLocalhost(req, res)) return;
  const { event, amount } = await readBody(req);
  if (typeof event !== 'string' || !event) return send(res, 400, { error: 'Invalid event' });
  if (typeof amount !== 'number' || amount < 0) return send(res, 400, { error: 'Invalid amount' });
  db.setXpAmount(event, amount);
  send(res, 200, { ok: true });
}

async function handleAdminSmtpTest(req, res) {
  if (!requireLocalhost(req, res)) return;
  const transporter = getTransporter();
  if (!transporter) return send(res, 400, { error: 'SMTP not configured or credentials missing.' });
  const to      = db.getAdminSetting('smtp_user') || process.env.SMTP_USER;
  const fromAddr = db.getAdminSetting('smtp_from') || to;
  const from    = fromAddr ? `Gamebook Tracker <${fromAddr}>` : undefined;
  if (!to) return send(res, 400, { error: 'No SMTP user set.' });
  try {
    await transporter.sendMail({ from, to, subject: 'Gamebook Tracker - SMTP test', text: 'SMTP is configured correctly.' });
    send(res, 200, { ok: true });
  } catch (e) { send(res, 500, { error: e.message }); }
}

async function handlePublicConfig(req, res) {
  const version = db.getAdminSetting('app_version') ?? '0.8.8.1';
  send(res, 200, { version, adminUsername: db.getAdminUsername() });
}

async function handleAdminVacuum(req, res) {
  if (!requireLocalhost(req, res)) return;
  db.adminVacuum();
  send(res, 200, _buildAdminStatsPayload());
}


// ── Admin Tips handlers ───────────────────────────────────────────────────────

async function handleAdminGetTips(req, res) {
  if (!requireLocalhost(req, res)) return;
  send(res, 200, db.getAllTipsAdmin());
}

async function handleAdminCreateTip(req, res) {
  if (!requireLocalhost(req, res)) return;
  const { text, type } = await readBody(req);
  if (!text?.trim() || !['real','silly'].includes(type)) return send(res, 400, { error: 'text and type (real|silly) required' });
  const tip = db.createTip(text.trim(), type);
  if (!tip) return send(res, 409, { error: 'Tip text already exists' });
  send(res, 200, tip);
}

async function handleAdminUpdateTip(req, res, id) {
  if (!requireLocalhost(req, res)) return;
  const { text, type, active } = await readBody(req);
  const ok = db.updateTip(id, text, type, active);
  if (!ok) return send(res, 404, { error: 'Not found' });
  send(res, 200, { ok: true });
}

async function handleAdminDeleteTip(req, res, id) {
  if (!requireLocalhost(req, res)) return;
  db.deleteTip(id);
  send(res, 200, { ok: true });
}

// ── Admin Inventory handlers ──────────────────────────────────────────────────

const _validItemTypes     = new Set(['weapon', 'armor', 'consumable', 'tool', 'jewelry', 'miscellaneous']);

async function handleGetItems(req, res) {
  const userId = await authenticate(req, res);
  if (!userId) return;
  const params = new URL(req.url, 'http://x').searchParams;
  const idsParam = params.get('ids');
  if (idsParam) {
    const ids = idsParam.split(',').map(s => +s.trim()).filter(n => Number.isInteger(n) && n > 0);
    return send(res, 200, db.getItemsByIds(ids));
  }
  const meta = params.get('meta') === '1';
  send(res, 200, meta ? db.getActiveItemsMeta() : db.getActiveItems());
}

async function handleGetItem(req, res, id) {
  const userId = await authenticate(req, res);
  if (!userId) return;
  const item = db.getItemById(id);
  if (!item) return send(res, 404, { error: 'Not found' });
  send(res, 200, item);
}

async function handleAdminGetItems(req, res) {
  if (!requireLocalhost(req, res)) return;
  send(res, 200, db.getAllItemsAdmin());
}

async function handleAdminCreateItem(req, res) {
  if (!requireLocalhost(req, res)) return;
  const { name, type = 'weapon', svg_data, description } = await readBody(req);
  if (!name?.trim())     return send(res, 400, { error: 'name required' });
  if (!svg_data?.trim()) return send(res, 400, { error: 'svg_data required' });
  if (!_validItemTypes.has(type))    return send(res, 400, { error: 'invalid type' });
  const item = db.createItem(name.trim(), type, svg_data.trim(), description?.trim() || null);
  if (!item) return send(res, 409, { error: 'Item already exists' });
  send(res, 200, item);
}

async function handleAdminUpdateItem(req, res, id) {
  if (!requireLocalhost(req, res)) return;
  const body = await readBody(req);
  if (body.name != null && !body.name.trim()) return send(res, 400, { error: 'name required' });
  if (body.svg_data != null && !body.svg_data.trim()) return send(res, 400, { error: 'svg_data required' });
  if (body.type != null && !_validItemTypes.has(body.type)) return send(res, 400, { error: 'invalid type' });
  if (typeof body.name === 'string') body.name = body.name.trim();
  if (typeof body.svg_data === 'string') body.svg_data = body.svg_data.trim();
  if (typeof body.description === 'string') body.description = body.description.trim() || null;
  const ok = db.updateItem(id, body);
  if (!ok) return send(res, 404, { error: 'Not found' });
  send(res, 200, { ok: true });
}

async function handleAdminDeleteItem(req, res, id) {
  if (!requireLocalhost(req, res)) return;
  db.deleteItem(id);
  send(res, 200, { ok: true });
}

// ── Admin Series handlers ─────────────────────────────────────────────────────

async function handleAdminGetAllSeries(req, res) {
  if (!requireLocalhost(req, res)) return;
  send(res, 200, db.getAllSeriesAdmin());
}

async function handleAdminGetAllAnthologies(req, res) {
  if (!requireLocalhost(req, res)) return;
  send(res, 200, db.getAllAnthologiesAdmin());
}

async function handleAdminUpdateSeries(req, res, id) {
  if (!requireLocalhost(req, res)) return;
  const series = db.getSeriesById(id);
  if (!series) return send(res, 404, { error: 'not found' });
  const { name, description, is_public, is_open_world } = await readBody(req);
  if (!name?.trim()) return send(res, 400, { error: 'name required' });
  db.updateSeries(id, name.trim(), description || null, !!is_public, is_open_world !== undefined ? !!is_open_world : null);
  send(res, 200, { ok: true });
  const adminUserId = db.getUserByUsername(db.getAdminUsername())?.id ?? null;
  if (adminUserId && !series.description && description?.trim()) db.awardXp(adminUserId, 'add_series_description', id);
  if (adminUserId && !series.is_public && is_public === true) db.awardXp(adminUserId, 'make_series_public', id);
  if (series.is_public || is_public === true) publicCatalogPush({ type: 'public_catalog_changed', entity: 'series', id, action: 'update' });
  feedPush({ type: 'feed_changed', entity: 'series', action: 'update', id });
}

async function handleAdminDeleteSeries(req, res, id) {
  if (!requireLocalhost(req, res)) return;
  const series = db.getSeriesById(id);
  db.deleteSeries(id);
  send(res, 200, { ok: true });
  if (series?.is_public) publicCatalogPush({ type: 'public_catalog_changed', entity: 'series', id, action: 'delete' });
  feedPush({ type: 'feed_changed', entity: 'series', action: 'delete', id });
}


module.exports = {
  handleAdminGetTips,
  handleAdminCreateTip,
  handleAdminUpdateTip,
  handleAdminDeleteTip,
  handleGetItems,
  handleGetItem,
  handleAdminGetItems,
  handleAdminCreateItem,
  handleAdminUpdateItem,
  handleAdminDeleteItem,
  handleAdminGetAllSeries,
  handleAdminGetAllAnthologies,
  handleAdminUpdateSeries,
  handleAdminDeleteSeries,
  handleAdminStats,
  handleAdminGetUser,
  handleAdminGetBookStats,
  handleAdminGetUsers,
  handleAdminDeleteUser,
  handleAdminClearSessions,
  handleAdminLockUser,
  handleAdminUnlockUser,
  handleAdminUpdateUser,
  handleAdminSetAuthor,
  handleAdminSetContributor,
  handleAdminSetPdfAccess,
  handleAdminImpersonate,
  handleImpersonateRedirect,
  handleAdminGetBooks,
  handleAdminDeleteBook,
  handleAdminGetBookRatings,
  handleAdminDeleteRating,
  handleAdminRefundShopItem,
  handleAdminGiftGc,
  handleAdminGiftBook,
  handleAdminGetSettings,
  handleAdminAppSize,
  handleAdminListBackups,
  handleAdminDeleteBackups,
  handleAdminSetSetting,
  handleAdminGetXpConfig,
  handleAdminSetXpAmount,
  handleAdminSmtpTest,
  handlePublicConfig,
  handleAdminVacuum,
  serveAdminFile,
  serveAdminPanel,
};
