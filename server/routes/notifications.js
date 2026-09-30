'use strict';

// Notification + site-stats route handlers.

const db = require('../db');
const { authenticate, send } = require('../request-helpers');
const { userBadgePush } = require('../sse');
const {
  getTrafficStats, getResourceAverages, getCodeStats, _serverHardwareInfo, getAppBirthAt,
} = require('../runtime-state');

const SITE_STATS_CACHE_TTL_MS = 15_000;
let _siteStatsCache = { at: 0, payload: null };

async function handleGetSiteStats(req, res) {
  const now          = Math.floor(Date.now() / 1000);
  const totalTracked = now - getAppBirthAt();
  const totalDowntime = parseInt(db.getAdminSetting('server_total_downtime_s') || '0');
  const sessionStart  = parseInt(db.getAdminSetting('server_session_start_at') || String(now));
  const uptimeSec     = now - sessionStart;
  const uptimePct     = totalTracked > 0 ? ((totalTracked - totalDowntime) / totalTracked * 100) : 100;
  const codeStats = getCodeStats();
  const { trafficIn, trafficOut } = getTrafficStats();
  const { avgCpu, avgHeapUsed, avgHeapTotal, avgRss, avgSamples } = getResourceAverages();
  const cacheFresh = _siteStatsCache.payload && (Date.now() - _siteStatsCache.at < SITE_STATS_CACHE_TTL_MS);
  const siteStats = cacheFresh ? _siteStatsCache.payload : db.getSiteStats();
  if (!cacheFresh) _siteStatsCache = { at: Date.now(), payload: siteStats };
  send(res, 200, {
    ...siteStats,
    ..._serverHardwareInfo(),
    linesOfCode: codeStats.linesOfCode,
    codeBytes:   codeStats.codeBytes,
    jsModules:   codeStats.jsModules,
    appAgeDays:  totalTracked / 86400,
    uptimeSec,
    uptimePct:      Math.round(uptimePct * 100) / 100,
    totalDowntimeS: totalDowntime,
    trafficIn,
    trafficOut,
    avgCpu,
    avgHeapUsed,
    avgHeapTotal,
    avgRss,
    avgSamples,
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
