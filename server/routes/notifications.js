'use strict';

// Notification + site-stats route handlers.

const db = require('../db');
const { authenticate, send } = require('../request-helpers');
const { userBadgePush } = require('../sse');
const { _serverHardwareInfo, getAppBirthAt, getSessionStartAt, getResourceAverages } = require('../runtime-state');

const SITE_STATS_CACHE_TTL_MS = 15_000;
let _siteStatsCache = { at: 0, payload: null };

async function handleGetSiteStats(req, res) {
  const now = Math.floor(Date.now() / 1000);
  const totalTracked = now - getAppBirthAt();
  const totalDowntimeS = parseInt(db.getAdminSetting('server_total_downtime_s') || '0');
  const uptimePct = totalTracked > 0 ? (totalTracked - totalDowntimeS) / totalTracked * 100 : 100;
  const cacheFresh = _siteStatsCache.payload && (Date.now() - _siteStatsCache.at < SITE_STATS_CACHE_TTL_MS);
  const siteStats = cacheFresh ? _siteStatsCache.payload : db.getSiteStats();
  if (!cacheFresh) _siteStatsCache = { at: Date.now(), payload: siteStats };
  send(res, 200, {
    ...siteStats,
    ..._serverHardwareInfo(),
    ...getResourceAverages(),
    appAgeDays: totalTracked / 86400,
    uptimeSec: now - getSessionStartAt(),
    uptimePct: Math.round(uptimePct * 100) / 100,
    totalDowntimeS,
  });
}

async function handleGetNotifications(req, res) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  send(res, 200, db.getNotifications(userId));
}

async function handleMarkNotificationsSeen(req, res) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  db.markNotificationsSeen(userId);
  send(res, 200, { ok: true });
  userBadgePush(userId);
}

module.exports = {
  handleGetSiteStats,
  handleGetNotifications,
  handleMarkNotificationsSeen,
};
