'use strict';

// Notification + site-stats route handlers.

const db = require('../db');
const { authenticate, send } = require('../request-helpers');
const { userBadgePush } = require('../sse');
const {
  getTrafficStats, getResourceAverages, getCodeStats, _serverHardwareInfo, getAppBirthAt,
} = require('../runtime-state');

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
  send(res, 200, {
    ...db.getSiteStats(),
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
