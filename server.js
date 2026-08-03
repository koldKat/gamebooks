#!/usr/bin/env node
try { require('dotenv').config({ path: __dirname + '/.env' }); } catch (_) {}
const http   = require('http');
const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const geoip  = require('geoip-lite');
const db     = require('./server/db');
const backup = require('./server/backup');
const { renderForumIndex, renderForumCategory, renderForumThread } = require('./server/forum');
const { buildFullExportZip, buildBookExportZip, safeFilename } = require('./server/export');
const { escapeHtml, escapeJsonString } = require('./server/html-escape');

const {
  sseRegister, sseUnregister, ssePush,
  publicCatalogRegister, publicCatalogUnregister, publicCatalogPush,
  feedRegister, feedUnregister, feedPush,
  appXpRegister, appXpUnregister, appXpPush,
  userBadgeRegister, userBadgeUnregister, userBadgePush, userBadgePushAll,
} = require('./server/sse');


const { reinitTransporter, sendAdminEmail, sendReplyEmail, getTransporter } = require('./server/email');


const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const { ROOT, AVATARS_DIR, COVERS_DIR, BOOKS_DIR, ATTACHMENTS_DIR } = require('./server/paths');

if (!fs.existsSync(AVATARS_DIR))     fs.mkdirSync(AVATARS_DIR,     { recursive: true });
if (!fs.existsSync(COVERS_DIR))      fs.mkdirSync(COVERS_DIR,      { recursive: true });
if (!fs.existsSync(BOOKS_DIR))       fs.mkdirSync(BOOKS_DIR,       { recursive: true });
if (!fs.existsSync(ATTACHMENTS_DIR)) fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });

// One-time XP migration for existing users
db.runXpMigration();
db.migratePublicBookXp();
db.migrateEquipmentXp();
// Refresh any stale demo books to the current graph design
db.refreshDemoBooks();
// Purge sessions that have passed their 30-day expiry
db.purgeExpiredSessions();
// Update geoip data if older than 30 days
(function maybeUpdateGeoip() {
  const dataFile = path.join(__dirname, 'node_modules/geoip-lite/data/geoip-city.dat');
  try {
    const ageMs = Date.now() - fs.statSync(dataFile).mtimeMs;
    if (ageMs < 30 * 24 * 60 * 60 * 1000) return;
    console.log('geoip data is older than 30 days - updating...');
    const { execFile } = require('child_process');
    const script = path.join(__dirname, 'node_modules/geoip-lite/scripts/updatedb.js');
    execFile(process.execPath, [script], { env: { ...process.env, LICENSE_KEY: process.env.MAXMIND_LICENSE_KEY || 'redist', ACCOUNT_ID: process.env.MAXMIND_ACCOUNT_ID || '' } }, (err) => {
      if (err) { console.warn('geoip update failed:', err.message); return; }
      geoip.reloadDataSync();
      console.log('geoip data updated and reloaded.');
    });
  } catch (_) {}
})();

const {
  getMaintenanceMode, setMaintenanceMode, getMaintenanceMessage, maintenanceHtml,
  recordTraffic, flushTraffic, getTrafficStats, getEtagCache,
  sampleCpuPercent, getResourceAverages,
  getUptimeStart, getSessionStartAt, getAppBirthAt, getActiveTagline,
  APP_LAUNCH_EPOCH, getCodeStats, _serverHardwareInfo,
  MIME,
} = require('./server/runtime-state');


const {
  getClientIp,
  addSecurityHeaders, addForumSecurityHeaders, addAdminSecurityHeaders,
  isAllowedImage, isAllowedAttachmentType, ATTACHMENT_MAX,
  isRateLimited, recordAuthFailure,
  isLocalhost, isLocalhostReal, requireLocalhost,
  send, readBody, readRawBody, tokenFromReq,
  authenticate, authenticateOptional, isRequestImpersonating,
  runWithImpersonationContext,
  MAX_JSON_BODY, MAX_PNG_BODY, AVATAR_UPLOAD_MAX, SSE_PING_MS,
} = require('./server/request-helpers');


const {
  handleRegister, handleLogin, handleLogout, handleForgotPassword, handleResetPassword,
} = require('./server/routes/auth');


const {
  handleAcceptPartyInvite,
  handleAddBookToLibrary,
  handleAddSeriesToLibrary,
  handleCreateBook,
  handleCreateParty,
  handleCreateSeries,
  handleCreateSeriesRun,
  handleCreateStash,
  handleDeclinePartyInvite,
  handleDeleteBook,
  handleDeleteSeries,
  handleDeleteSeriesRun,
  handleDeleteStash,
  handleExportAll,
  handleExportBook,
  handleGetActiveSeriesRuns,
  handleGetAppXpStream,
  handleGetBookEnemies,
  handleGetBookRating,
  handleGetBooks,
  handleGetBookStream,
  handleGetFeedStream,
  handleGetNotebook,
  handleGetParty,
  handleGetPendingInvites,
  handleGetPublicCatalogStream,
  handleGetPublicSeriesInfo,
  handleGetSeries,
  handleGetSeriesCharacter,
  handleGetSeriesRating,
  handleGetSeriesRuns,
  handleGetStashes,
  handleGetState,
  handleGetUserStream,
  handleInviteToParty,
  handleLeaveParty,
  handleResetBookProgress,
  handleResetSeriesForUser,
  handleSaveSeriesCharacter,
  handleSaveState,
  handleSearchUsers,
  handleSetBookBgPref,
  handleSetBookRating,
  handleSetNotebook,
  handleSetSeriesRating,
  handleUpdateBook,
  handleUpdateSeries,
  handleUpdateSeriesRun,
  handleUpdateStash,
} = require('./server/routes/books');


const { handleShopPurchase } = require('./server/routes/shop');


const {
  handleGetProfile,
  handleUpdateProfile,
  handleGetPrefs,
  handleSetPrefs,
  handleUploadAvatar,
  handleUploadAttachment,
  handleUploadCover,
  handleUploadPdf,
  handleDeletePdf,
} = require('./server/routes/profile');

const {
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
} = require('./server/routes/admin');

const { handleGetSiteStats, handleGetNotifications, handleMarkNotificationsSeen } = require('./server/routes/notifications');
const {
  handleSubmitFeedback, handleGetAppXpSummary, handleGetMyFeedback, handleUserReply, handleMarkThreadRead,
  handleAdminGetFeedback, handleAdminReply, handleAdminMarkRead, handleDeleteFeedback, handleAdminDeleteFeedback,
} = require('./server/routes/feedback');
const {
  handleAdminGetAnnouncements, handleAdminCreateAnnouncement, handleAdminUpdateAnnouncement,
  handleAdminPublishAnnouncement, handleAdminUnpublishAnnouncement, handleAdminDeleteAnnouncement,
  handleAdminPinAnnouncement, handleAdminUnpinAnnouncement,
} = require('./server/routes/announcements');

const {
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
} = require('./server/routes/forum');

const { serveStatic, serveSitemap } = require('./server/static');

const {
  handlePublicUser, handlePublicRun, handlePublicSeriesRun,
  servePublicBookPage, servePublicAnthologyPage, servePublicSeriesPage,
  servePublicProfilePage, servePublicFeedPage,
} = require('./server/routes/public');

// ── Router ────────────────────────────────────────────────────────────────────

const bookIdRe        = /^\/api\/books\/(\d+)$/;
const bookStateRe     = /^\/api\/books\/(\d+)\/state$/;
const bookResetRe     = /^\/api\/books\/(\d+)\/reset$/;
const bookEnemiesRe   = /^\/api\/books\/(\d+)\/enemies$/;
const bookCoverRe       = /^\/api\/books\/(\d+)\/cover$/;
const bookCoverDeleteRe = /^\/api\/books\/(\d+)\/cover\/delete$/;
const bookPdfRe         = /^\/api\/books\/(\d+)\/pdf$/;
const adminUserIdRe       = /^\/api\/admin\/users\/(\d+)$/;
const adminUserSessRe        = /^\/api\/admin\/users\/(\d+)\/clear-sessions$/;
const adminUserImpersonateRe = /^\/api\/admin\/users\/(\d+)\/impersonate$/;
const adminUserRefundRe      = /^\/api\/admin\/users\/(\d+)\/refund$/;
const adminUserLockRe        = /^\/api\/admin\/users\/(\d+)\/lock$/;
const adminUserUnlockRe      = /^\/api\/admin\/users\/(\d+)\/unlock$/;
const adminUserGiftGcRe      = /^\/api\/admin\/users\/(\d+)\/gift-gc$/;
const adminBookIdRe       = /^\/api\/admin\/books\/(\d+)$/;
const adminBookStatsRe    = /^\/api\/admin\/books\/(\d+)\/stats$/;
const adminBookGiftRe        = /^\/api\/admin\/books\/(\d+)\/gift$/;
const adminBookRatingsRe     = /^\/api\/admin\/books\/(\d+)\/ratings$/;
const adminBookRatingDelRe   = /^\/api\/admin\/books\/(\d+)\/ratings\/(\d+)$/;
const feedbackReplyRe      = /^\/api\/feedback\/(\d+)\/reply$/;
const feedbackReadRe       = /^\/api\/feedback\/(\d+)\/read$/;
const feedbackIdRe         = /^\/api\/feedback\/(\d+)$/;
const adminFeedbackReplyRe = /^\/api\/admin\/feedback\/(\d+)\/reply$/;
const adminFeedbackReadRe  = /^\/api\/admin\/feedback\/(\d+)\/read$/;
const adminFeedbackIdRe        = /^\/api\/admin\/feedback\/(\d+)$/;
const adminAnnouncementIdRe    = /^\/api\/admin\/announcements\/(\d+)$/;
const adminAnnouncementPubRe   = /^\/api\/admin\/announcements\/(\d+)\/publish$/;
const adminAnnouncementUnpubRe = /^\/api\/admin\/announcements\/(\d+)\/unpublish$/;
const adminAnnouncementPinRe   = /^\/api\/admin\/announcements\/(\d+)\/pin$/;
const adminAnnouncementUnpinRe = /^\/api\/admin\/announcements\/(\d+)\/unpin$/;
const publicUserRe        = /^\/api\/public\/user\/([^/]+)$/;
// Run index allows a leading '-' - preSeriesRuns entries (see getPublicRun
// in server/db/feed.js) are addressed with negative indices, matching
// play.js's own "Run -N" display convention for runs that pre-date a book's
// series turning open-world.
const publicRunRe         = /^\/api\/public\/book\/(\d+)\/user\/(\d+)\/run\/(-?\d+)$/;
const publicSeriesRunRe   = /^\/api\/public\/series\/(\d+)\/user\/(\d+)\/run\/(\d+)$/;
const bookAddRe           = /^\/api\/books\/(\d+)\/add$/;
const bookRatingRe        = /^\/api\/books\/(\d+)\/rating$/;
const seriesRatingRe      = /^\/api\/series\/(\d+)\/rating$/;
const bookBgPrefRe        = /^\/api\/books\/(\d+)\/bg$/;
const bookNotebookRe      = /^\/api\/books\/(\d+)\/notebook$/;
const publicBookActivityRe = /^\/api\/public\/book\/(\d+)\/activity$/;
const publicBookPageRe      = /^\/book\/(\d+)$/;
const publicAnthologyPageRe = /^\/anthology\/(\d+)$/;
const publicSeriesPageRe    = /^\/series\/(\d+)$/;
const publicUserPageRe      = /^\/user\/([^/]+)$/;
const forumCategoryPageRe     = /^\/forum\/c\/([a-z0-9-]+)$/;
const forumThreadPageRe       = /^\/forum\/thread\/(\d+)$/;
const apiForumThreadRe        = /^\/api\/forum\/threads\/(\d+)$/;
const apiForumThreadPostsRe   = /^\/api\/forum\/threads\/(\d+)\/posts$/;
const apiForumPostRe          = /^\/api\/forum\/posts\/(\d+)$/;
const apiForumThreadLockRe    = /^\/api\/forum\/threads\/(\d+)\/lock$/;
const apiForumThreadPinRe     = /^\/api\/forum\/threads\/(\d+)\/pin$/;
const exportBookRe            = /^\/api\/export\/book\/(\d+)$/;
const stashIdRe               = /^\/api\/stashes\/(\d+)$/;
const bookStreamRe            = /^\/api\/books\/(\d+)\/stream$/;
const bookPartyRe             = /^\/api\/books\/(\d+)\/party$/;
const bookPartyInviteRe       = /^\/api\/books\/(\d+)\/party\/invite$/;
const partyInviteAcceptRe     = /^\/api\/party-invites\/(\d+)\/accept$/;
const partyInviteDeclineRe    = /^\/api\/party-invites\/(\d+)\/decline$/;

// Wraps every single request in the impersonation-context AsyncLocalStorage
// (see server/impersonation-context.js) so any XP/coin award anywhere in the
// resulting call chain - not just the routes that explicitly check
// isRequestImpersonating() - can see whether the account behind this request
// is currently impersonated.
const handler = (req, res) => runWithImpersonationContext(req, () => _routeRequest(req, res));

const _routeRequest = async (req, res) => {
  const { method } = req;

  const urlPath    = req.url.split('?')[0];

  // Traffic accounting - runs for every request, including any future routes
  const _tBytesIn  = req.socket.bytesRead;
  const _tBytesOut = req.socket.bytesWritten;
  res.on('finish', () => {
    recordTraffic(req.socket.bytesRead - _tBytesIn, req.socket.bytesWritten - _tBytesOut);
  });

  try {
    let m;

    // Maintenance mode - block all non-localhost traffic except the admin panel itself
    if (getMaintenanceMode() && !isLocalhostReal(req)) {
      const isAdminPath = urlPath.startsWith('/admin') || urlPath.startsWith('/api/admin');
      const isMaintenanceExempt = urlPath === '/api/ping' || urlPath === '/api/maintenance-message';
      if (!isAdminPath && !isMaintenanceExempt) {
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'");
        res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '300' });
        res.end(maintenanceHtml());
        return;
      }
    }

    if (method === 'GET' && urlPath === '/auth/impersonate') return handleImpersonateRedirect(req, res);
    if (method === 'GET'    && urlPath === '/api/ping')      { addSecurityHeaders(res); res.writeHead(200, {'Content-Type':'text/plain','Cache-Control':'no-store'}); return res.end('ok'); }
    if (method === 'GET'    && urlPath === '/api/maintenance-message') { addSecurityHeaders(res); res.writeHead(200, {'Content-Type':'application/json','Cache-Control':'no-store'}); return res.end(JSON.stringify({ message: getMaintenanceMessage() })); }
    if (method === 'GET'    && urlPath === '/api/demo')      return send(res, 200, db.getDemoBookState());
    if (method === 'POST'   && urlPath === '/api/register')         return await handleRegister(req, res);
    if (method === 'POST'   && urlPath === '/api/login')            return await handleLogin(req, res);
    if (method === 'POST'   && urlPath === '/api/logout')           return await handleLogout(req, res);
    if (method === 'POST'   && urlPath === '/api/forgot-password')  return await handleForgotPassword(req, res);
    if (method === 'POST'   && urlPath === '/api/reset-password')   return await handleResetPassword(req, res);
    if (method === 'GET'    && urlPath === '/api/prefs')   return await handleGetPrefs(req, res);
    if (method === 'PATCH'  && urlPath === '/api/prefs')   return await handleSetPrefs(req, res);
    if (method === 'GET'    && urlPath === '/api/feed') {
      const userId = authenticateOptional(req);
      // Same invisibility contract as handleSaveState: an admin's own polling
      // while impersonating must not earn the impersonated user real XP.
      if (userId !== null && !isRequestImpersonating(req)) db.awardIdleHeartbeatXp(userId);
      return send(res, 200, { entries: db.getFeed(), pinned: db.getPinnedAnnouncement() });
    }
    if (method === 'GET'    && urlPath === '/api/feed/stream')   return await handleGetFeedStream(req, res);
    if (method === 'GET'    && urlPath === '/api/public/stream') return await handleGetPublicCatalogStream(req, res);
    if (method === 'GET'    && urlPath === '/api/public/covers') return send(res, 200, db.getPublicCovers());
    if (method === 'GET'    && urlPath === '/api/public/books')       return send(res, 200, db.getAllPublicBooks());
    if (method === 'GET'    && urlPath === '/api/public/series')      return send(res, 200, db.getAllPublicSeries());
    if (method === 'GET'    && urlPath === '/api/public/anthologies') return send(res, 200, db.getAllPublicAnthologies());
    if (method === 'GET' && (m = urlPath.match(/^\/api\/public\/series\/(\d+)$/))) return await handleGetPublicSeriesInfo(req, res, +m[1]);
    if (method === 'GET' && (m = urlPath.match(publicUserRe)))        return await handlePublicUser(req, res, m[1]);
    if (method === 'GET' && (m = urlPath.match(publicRunRe)))         return await handlePublicRun(req, res, +m[1], +m[2], +m[3]);
    if (method === 'GET' && (m = urlPath.match(publicSeriesRunRe)))   return await handlePublicSeriesRun(req, res, +m[1], +m[2], +m[3]);
    if (method === 'GET' && (m = urlPath.match(publicBookActivityRe))) {
      const data = db.getBookActivity(+m[1]);
      if (!data) return send(res, 404, { error: 'Not found' });
      const reqUserId = authenticateOptional(req);
      if (reqUserId) {
        const u = db.getUserById(reqUserId);
        if (u?.is_admin || u?.pdf_access) {
          const bookRow = db.getBookById(+m[1]);
          if (bookRow?.pdf_path) {
            data.book = data.book || {};
            data.book.pdfPath = bookRow.pdf_path;
            data.book.pdfSize = bookRow.pdf_size ?? null;
          }
        }
      }
      return send(res, 200, data);
    }
    if (method === 'GET'    && urlPath === '/api/series')   return await handleGetSeries(req, res);
    if (method === 'POST'   && urlPath === '/api/series')   return await handleCreateSeries(req, res);
    if ((m = urlPath.match(/^\/api\/series\/(\d+)$/)) && method === 'PATCH')  return await handleUpdateSeries(req, res, +m[1]);
    if ((m = urlPath.match(/^\/api\/series\/(\d+)$/)) && method === 'DELETE') return await handleDeleteSeries(req, res, +m[1]);
    if ((m = urlPath.match(/^\/api\/series\/(\d+)\/add$/)) && method === 'POST') return await handleAddSeriesToLibrary(req, res, +m[1], Object.fromEntries(new URL(req.url, 'http://x').searchParams));
    if ((m = urlPath.match(/^\/api\/series\/(\d+)\/character$/)) && method === 'GET') return await handleGetSeriesCharacter(req, res, +m[1]);
    if ((m = urlPath.match(/^\/api\/series\/(\d+)\/character$/)) && method === 'PUT') return await handleSaveSeriesCharacter(req, res, +m[1]);
    if (urlPath === '/api/series/active-runs' && method === 'GET') return await handleGetActiveSeriesRuns(req, res);
    if ((m = urlPath.match(/^\/api\/series\/(\d+)\/runs$/)) && method === 'GET')  return await handleGetSeriesRuns(req, res, +m[1]);
    if ((m = urlPath.match(/^\/api\/series\/(\d+)\/runs$/)) && method === 'POST') return await handleCreateSeriesRun(req, res, +m[1]);
    if ((m = urlPath.match(/^\/api\/series\/(\d+)\/runs\/(\d+)$/)) && method === 'PUT')    return await handleUpdateSeriesRun(req, res, +m[1], +m[2]);
    if ((m = urlPath.match(/^\/api\/series\/(\d+)\/runs\/(\d+)$/)) && method === 'DELETE') return await handleDeleteSeriesRun(req, res, +m[1], +m[2]);
    if ((m = urlPath.match(/^\/api\/series\/(\d+)\/reset$/)) && method === 'POST') return await handleResetSeriesForUser(req, res, +m[1]);
    if (method === 'GET'    && urlPath === '/api/stashes')  return await handleGetStashes(req, res);
    if (method === 'POST'   && urlPath === '/api/stashes')  return await handleCreateStash(req, res);
    if ((m = urlPath.match(stashIdRe)) && method === 'POST') return await handleUpdateStash(req, res, +m[1]);
    if ((m = urlPath.match(stashIdRe)) && method === 'DELETE') return await handleDeleteStash(req, res, +m[1]);
    if (method === 'GET'    && urlPath === '/api/items')    return await handleGetItems(req, res);
    if ((m = urlPath.match(/^\/api\/items\/(\d+)$/)) && method === 'GET') return await handleGetItem(req, res, +m[1]);
    if (method === 'GET'    && urlPath === '/api/books')    return await handleGetBooks(req, res);
    if (method === 'POST'   && urlPath === '/api/books')    return await handleCreateBook(req, res);
    if (method === 'GET'    && urlPath === '/api/profile')        return await handleGetProfile(req, res);
    if (method === 'PATCH'  && urlPath === '/api/profile')        return await handleUpdateProfile(req, res);
    if (method === 'POST'   && urlPath === '/api/shop/purchase')  return await handleShopPurchase(req, res);
    if (method === 'POST'   && urlPath === '/api/profile/avatar')  return await handleUploadAvatar(req, res);
    if (method === 'POST'   && urlPath === '/api/attachments')     return await handleUploadAttachment(req, res);
    if ((m = urlPath.match(bookAddRe))   && method === 'POST')   return await handleAddBookToLibrary(req, res, +m[1]);
    if ((m = urlPath.match(bookIdRe))    && method === 'PATCH')  return await handleUpdateBook(req, res, +m[1]);
    if ((m = urlPath.match(bookIdRe))    && method === 'DELETE') return await handleDeleteBook(req, res, +m[1]);
    if ((m = urlPath.match(bookEnemiesRe)) && method === 'GET')  return await handleGetBookEnemies(req, res, +m[1]);
    if ((m = urlPath.match(bookStateRe)) && method === 'GET')    return await handleGetState(req, res, +m[1]);
    if ((m = urlPath.match(bookStateRe)) && method === 'PUT')    return await handleSaveState(req, res, +m[1]);
    if ((m = urlPath.match(bookResetRe)) && method === 'POST')   return await handleResetBookProgress(req, res, +m[1]);
    if ((m = urlPath.match(bookCoverRe))       && method === 'POST')   return await handleUploadCover(req, res, +m[1]);
    if ((m = urlPath.match(bookCoverDeleteRe)) && method === 'POST')   { if (!requireLocalhost(req, res)) return; db.removeBookCover(+m[1]); return send(res, 200, { ok: true }); }
    if ((m = urlPath.match(bookPdfRe))         && method === 'POST')   return await handleUploadPdf(req, res, +m[1]);
    if ((m = urlPath.match(bookPdfRe))         && method === 'DELETE') return await handleDeletePdf(req, res, +m[1]);
    if ((m = urlPath.match(bookRatingRe))    && method === 'GET')   return await handleGetBookRating(req, res, +m[1]);
    if ((m = urlPath.match(bookRatingRe))    && method === 'PATCH') return await handleSetBookRating(req, res, +m[1]);
    if ((m = urlPath.match(seriesRatingRe))  && method === 'GET')   return await handleGetSeriesRating(req, res, +m[1]);
    if ((m = urlPath.match(seriesRatingRe))  && method === 'PATCH') return await handleSetSeriesRating(req, res, +m[1]);
    if ((m = urlPath.match(bookBgPrefRe))    && method === 'PATCH') return await handleSetBookBgPref(req, res, +m[1]);
    if ((m = urlPath.match(bookNotebookRe))  && method === 'GET')   return await handleGetNotebook(req, res, +m[1]);
    if ((m = urlPath.match(bookNotebookRe))  && method === 'PUT')   return await handleSetNotebook(req, res, +m[1]);
    if ((m = urlPath.match(bookStreamRe))      && method === 'GET')    return await handleGetBookStream(req, res, +m[1]);
    if ((m = urlPath.match(bookPartyRe))       && method === 'POST')   return await handleCreateParty(req, res, +m[1]);
    if ((m = urlPath.match(bookPartyRe))       && method === 'GET')    return await handleGetParty(req, res, +m[1]);
    if ((m = urlPath.match(bookPartyRe))       && method === 'DELETE') return await handleLeaveParty(req, res, +m[1]);
    if ((m = urlPath.match(bookPartyInviteRe)) && method === 'POST')   return await handleInviteToParty(req, res, +m[1]);
    if ((m = urlPath.match(partyInviteAcceptRe))  && method === 'POST') return await handleAcceptPartyInvite(req, res, +m[1]);
    if ((m = urlPath.match(partyInviteDeclineRe)) && method === 'POST') return await handleDeclinePartyInvite(req, res, +m[1]);
    if (method === 'GET' && urlPath === '/api/export/all')              return await handleExportAll(req, res);
    if (method === 'POST' && (m = urlPath.match(exportBookRe)))        return await handleExportBook(req, res, +m[1]);
    if (method === 'GET' && urlPath === '/api/party-invites') return await handleGetPendingInvites(req, res);
    if (method === 'GET' && urlPath === '/api/users/search')  return await handleSearchUsers(req, res);
    if (method === 'GET'  && urlPath === '/api/site-stats')          return await handleGetSiteStats(req, res);
    if (method === 'GET'  && urlPath === '/api/tagline')             return send(res, 200, { tagline: getActiveTagline() });
    if (method === 'GET'  && urlPath === '/api/notifications')       return await handleGetNotifications(req, res);
    if (method === 'POST' && urlPath === '/api/notifications/seen') return await handleMarkNotificationsSeen(req, res);
    if (method === 'GET'  && urlPath === '/api/user/stream')         return await handleGetUserStream(req, res);
    if (method === 'POST' && urlPath === '/api/feedback')        return await handleSubmitFeedback(req, res);
    if (method === 'GET'  && urlPath === '/api/feedback')        return await handleGetMyFeedback(req, res);
    if (method === 'GET'  && urlPath === '/api/app-xp')          return await handleGetAppXpSummary(req, res);
    if (method === 'GET'  && urlPath === '/api/app-xp/stream')   return await handleGetAppXpStream(req, res);
    if ((m = urlPath.match(feedbackReplyRe)) && method === 'POST') return await handleUserReply(req, res, +m[1]);
    if ((m = urlPath.match(feedbackReadRe))  && method === 'POST') return await handleMarkThreadRead(req, res, +m[1]);
    if ((m = urlPath.match(feedbackIdRe))    && method === 'DELETE') return await handleDeleteFeedback(req, res, +m[1]);

    // Admin routes - localhost only
    if (method === 'GET' && (urlPath === '/admin' || urlPath === '/admin/'))
      return serveAdminPanel(req, res);
    if (method === 'GET' && urlPath === '/admin/guide')     return serveAdminFile(req, res, 'admin-guide.html');
    if (method === 'GET' && urlPath === '/admin/technical') return serveAdminFile(req, res, 'technical.html');
    // Admin panel's own ES modules (admin/js/*.js) - filename restricted to a safe
    // charset (no '..', no path separators beyond the fixed 'js/' prefix) since it
    // flows straight into a filesystem read.
    if ((m = urlPath.match(/^\/admin\/js\/([a-zA-Z0-9_-]+\.js)$/)) && method === 'GET')
      return serveAdminFile(req, res, `js/${m[1]}`);
    if (method === 'GET'  && urlPath === '/api/admin/stats')  return await handleAdminStats(req, res);
    if (method === 'GET'  && urlPath === '/api/admin/users')  return await handleAdminGetUsers(req, res);
    if (method === 'GET'  && urlPath === '/api/admin/books')  return await handleAdminGetBooks(req, res);
    if (method === 'GET'  && urlPath === '/api/admin/series') return await handleGetSeries(req, res);
    if ((m = urlPath.match(adminUserSessRe))        && method === 'POST') return await handleAdminClearSessions(req, res, +m[1]);
    if ((m = urlPath.match(adminUserLockRe))        && method === 'POST') return await handleAdminLockUser(req, res, +m[1]);
    if ((m = urlPath.match(adminUserUnlockRe))      && method === 'POST') return await handleAdminUnlockUser(req, res, +m[1]);
    if ((m = urlPath.match(adminUserGiftGcRe))      && method === 'POST') return await handleAdminGiftGc(req, res, +m[1]);
    if ((m = urlPath.match(/^\/api\/admin\/users\/(\d+)\/edit$/))        && method === 'POST') return await handleAdminUpdateUser(req, res, +m[1]);
    if ((m = urlPath.match(/^\/api\/admin\/users\/(\d+)\/author$/))      && method === 'POST') return await handleAdminSetAuthor(req, res, +m[1]);
    if ((m = urlPath.match(/^\/api\/admin\/users\/(\d+)\/contributor$/)) && method === 'POST') return await handleAdminSetContributor(req, res, +m[1]);
    if ((m = urlPath.match(/^\/api\/admin\/users\/(\d+)\/pdf-access$/))  && method === 'POST') return await handleAdminSetPdfAccess(req, res, +m[1]);
    if ((m = urlPath.match(adminUserImpersonateRe)) && method === 'POST') return await handleAdminImpersonate(req, res, +m[1]);
    if ((m = urlPath.match(adminUserRefundRe))      && method === 'POST') return await handleAdminRefundShopItem(req, res, +m[1]);
    if ((m = urlPath.match(adminUserIdRe))    && method === 'GET')    return await handleAdminGetUser(req, res, +m[1]);
    if ((m = urlPath.match(adminUserIdRe))    && method === 'DELETE') return await handleAdminDeleteUser(req, res, +m[1]);
    if ((m = urlPath.match(adminBookStatsRe))   && method === 'GET')    return await handleAdminGetBookStats(req, res, +m[1]);
    if ((m = urlPath.match(adminBookGiftRe))    && method === 'POST')   return await handleAdminGiftBook(req, res, +m[1]);
    if ((m = urlPath.match(adminBookRatingsRe)) && method === 'GET')    return await handleAdminGetBookRatings(req, res, +m[1]);
    if ((m = urlPath.match(adminBookRatingDelRe)) && method === 'DELETE') return await handleAdminDeleteRating(req, res, +m[1], +m[2]);
    if ((m = urlPath.match(adminBookIdRe))      && method === 'DELETE') return await handleAdminDeleteBook(req, res, +m[1]);
    if (method === 'GET'  && urlPath === '/api/admin/settings') return await handleAdminGetSettings(req, res);
    if (method === 'POST' && urlPath === '/api/admin/settings') return await handleAdminSetSetting(req, res);
    if (method === 'GET'  && urlPath === '/api/admin/xp-config') return await handleAdminGetXpConfig(req, res);
    if (method === 'POST' && urlPath === '/api/admin/xp-config') return await handleAdminSetXpAmount(req, res);
    if (method === 'POST' && urlPath === '/api/admin/smtp/test') return await handleAdminSmtpTest(req, res);
    if (method === 'GET'  && urlPath === '/api/admin/appsize')  return await handleAdminAppSize(req, res);
    if (method === 'GET'  && urlPath === '/api/admin/gc-supply') {
      return send(res, 200, db.getAdminGcSupply(getAppBirthAt()));
    }
    if (method === 'GET'  && urlPath === '/api/admin/heap') {
      const m = process.memoryUsage();
      return send(res, 200, { heapUsed: m.heapUsed, heapTotal: m.heapTotal, rss: m.rss });
    }
    if (method === 'GET'  && urlPath === '/api/admin/live') {
      const m      = process.memoryUsage();
      const cpuPct = sampleCpuPercent();
      const nowS = Math.floor(Date.now() / 1000);
      const sessionUptime = nowS - getSessionStartAt();
      const appAge        = nowS - getAppBirthAt();
      const { trafficIn, trafficOut } = getTrafficStats();
      const { avgCpu, avgHeapUsed, avgHeapTotal, avgRss } = getResourceAverages();
      return send(res, 200, {
        heapUsed: m.heapUsed, heapTotal: m.heapTotal, rss: m.rss, cpuPct, sessionUptime, appAge,
        trafficIn, trafficOut,
        avgCpu, avgHeapUsed, avgHeapTotal, avgRss,
      });
    }
    if (method === 'GET'  && urlPath === '/api/admin/backups')  return await handleAdminListBackups(req, res);
    if (method === 'DELETE' && urlPath === '/api/admin/backups') return await handleAdminDeleteBackups(req, res);
    if (method === 'POST' && urlPath === '/api/admin/vacuum') return await handleAdminVacuum(req, res);
    if (method === 'GET'  && urlPath === '/api/admin/feedback') return await handleAdminGetFeedback(req, res);
    if ((m = urlPath.match(adminFeedbackReplyRe)) && method === 'POST') return await handleAdminReply(req, res, +m[1]);
    if ((m = urlPath.match(adminFeedbackReadRe))  && method === 'POST')   return await handleAdminMarkRead(req, res, +m[1]);
    if ((m = urlPath.match(adminFeedbackIdRe))    && method === 'DELETE') return await handleAdminDeleteFeedback(req, res, +m[1]);

    if (method === 'GET'  && urlPath === '/api/admin/announcements')               return await handleAdminGetAnnouncements(req, res);
    if (method === 'POST' && urlPath === '/api/admin/announcements')               return await handleAdminCreateAnnouncement(req, res);
    if ((m = urlPath.match(adminAnnouncementPubRe))   && method === 'POST')       return await handleAdminPublishAnnouncement(req, res, +m[1]);
    if ((m = urlPath.match(adminAnnouncementUnpubRe)) && method === 'POST')       return await handleAdminUnpublishAnnouncement(req, res, +m[1]);
    if ((m = urlPath.match(adminAnnouncementPinRe))   && method === 'POST')       return await handleAdminPinAnnouncement(req, res, +m[1]);
    if ((m = urlPath.match(adminAnnouncementUnpinRe)) && method === 'POST')       return await handleAdminUnpinAnnouncement(req, res, +m[1]);
    if ((m = urlPath.match(adminAnnouncementIdRe))    && method === 'PATCH')      return await handleAdminUpdateAnnouncement(req, res, +m[1]);
    if ((m = urlPath.match(adminAnnouncementIdRe))    && method === 'DELETE')     return await handleAdminDeleteAnnouncement(req, res, +m[1]);

    if (method === 'GET'    && urlPath === '/api/admin/tips')                    return await handleAdminGetTips(req, res);
    if (method === 'POST'   && urlPath === '/api/admin/tips')                    return await handleAdminCreateTip(req, res);
    if ((m = urlPath.match(/^\/api\/admin\/tips\/(\d+)$/)) && method === 'PATCH')  return await handleAdminUpdateTip(req, res, +m[1]);
    if ((m = urlPath.match(/^\/api\/admin\/tips\/(\d+)$/)) && method === 'DELETE') return await handleAdminDeleteTip(req, res, +m[1]);

    if (method === 'GET'    && urlPath === '/api/admin/items')                    return await handleAdminGetItems(req, res);
    if (method === 'POST'   && urlPath === '/api/admin/items')                    return await handleAdminCreateItem(req, res);
    if ((m = urlPath.match(/^\/api\/admin\/items\/(\d+)$/)) && method === 'PATCH')  return await handleAdminUpdateItem(req, res, +m[1]);
    if ((m = urlPath.match(/^\/api\/admin\/items\/(\d+)$/)) && method === 'DELETE') return await handleAdminDeleteItem(req, res, +m[1]);

    if (method === 'GET'    && urlPath === '/api/admin/series/all')               return await handleAdminGetAllSeries(req, res);
    if (method === 'GET'    && urlPath === '/api/admin/anthologies')              return await handleAdminGetAllAnthologies(req, res);
    if ((m = urlPath.match(/^\/api\/admin\/series\/(\d+)$/)) && method === 'PATCH')  return await handleAdminUpdateSeries(req, res, +m[1]);
    if ((m = urlPath.match(/^\/api\/admin\/series\/(\d+)$/)) && method === 'DELETE') return await handleAdminDeleteSeries(req, res, +m[1]);

    if (method === 'GET' && urlPath === '/api/tips')             return send(res, 200, db.getTips());
    if (method === 'GET' && urlPath === '/api/series/autocomplete') return send(res, 200, db.getAllSeries());
    if (method === 'GET' && urlPath === '/api/config') return await handlePublicConfig(req, res);

    if (method === 'GET' && urlPath === '/sitemap.xml') return serveSitemap(req, res);
    if (method === 'GET' && urlPath === '/feed') return servePublicFeedPage(req, res);
    if (method === 'GET' && (m = urlPath.match(publicBookPageRe)))      return servePublicBookPage(req, res, +m[1]);
    if (method === 'GET' && (m = urlPath.match(publicAnthologyPageRe))) return servePublicAnthologyPage(req, res, +m[1]);
    if (method === 'GET' && (m = urlPath.match(publicSeriesPageRe)))    return servePublicSeriesPage(req, res, +m[1]);
    if (method === 'GET' && (m = urlPath.match(publicUserPageRe)))      return servePublicProfilePage(req, res, m[1]);

    // Forum pages
    if (method === 'GET' && urlPath === '/forum') return serveForumIndex(req, res);
    if (method === 'GET' && (m = urlPath.match(forumCategoryPageRe))) return serveForumCategory(req, res, m[1]);
    if (method === 'GET' && (m = urlPath.match(forumThreadPageRe))) return serveForumThread(req, res, +m[1]);

    // Forum API
    if (method === 'GET'    && urlPath === '/api/forum/latest')   return await handleForumLatest(req, res);
    if (method === 'POST'   && urlPath === '/api/forum/seen')     return await handleForumSeen(req, res);
    if (method === 'GET'    && urlPath === '/api/forum/me')       return await handleForumMe(req, res);
    if (method === 'POST'   && urlPath === '/api/forum/threads')  return await handleForumCreateThread(req, res);
    if ((m = urlPath.match(apiForumThreadPostsRe)) && method === 'POST')   return await handleForumCreatePost(req, res, +m[1]);
    if ((m = urlPath.match(apiForumThreadLockRe))  && method === 'POST')   return await handleForumToggleLock(req, res, +m[1]);
    if ((m = urlPath.match(apiForumThreadPinRe))   && method === 'POST')   return await handleForumTogglePin(req, res, +m[1]);
    if ((m = urlPath.match(apiForumThreadRe))      && method === 'PATCH')  return await handleForumEditThread(req, res, +m[1]);
    if ((m = urlPath.match(apiForumThreadRe))      && method === 'DELETE') return await handleForumDeleteThread(req, res, +m[1]);
    if ((m = urlPath.match(apiForumPostRe))        && method === 'PATCH')  return await handleForumEditPost(req, res, +m[1]);
    if ((m = urlPath.match(apiForumPostRe))        && method === 'DELETE') return await handleForumDeletePost(req, res, +m[1]);

    if (method === 'GET' && urlPath === '/demo') {
      const indexPath = path.join(ROOT, 'index.html');
      addSecurityHeaders(res);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      return fs.createReadStream(indexPath).pipe(res);
    }
    if (method === 'GET' && urlPath.startsWith('/books/')) {
      if (!isLocalhost(req)) {
        const userId = await authenticate(req, res);
        if (userId === null) return;
        const u = db.getUserById(userId);
        if (!u?.is_admin && !u?.pdf_access) return send(res, 403, { error: 'Access denied' });
      }
    }
    serveStatic(req, res);
  } catch (err) {
    if (err.code === 'PAYLOAD_TOO_LARGE') return send(res, 413, { error: 'Payload too large' });
    console.error(err);
    send(res, 500, { error: 'Internal server error' });
  }
};

function attachClientErrorHandler(server) {
  server.on('clientError', (err, socket) => {
    if (socket.destroyed) return;
    if (err.code === 'ECONNRESET' || !socket.writable || socket.errored) {
      socket.destroy();
      return;
    }
    socket.once('error', () => socket.destroy());
    try {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    } catch (_) {
      socket.destroy();
    }
  });
}

backup.start();

const httpServer = http.createServer(handler);
attachClientErrorHandler(httpServer);
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Gamebook Tracker running on port ${PORT}`);
});
