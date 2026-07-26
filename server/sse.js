'use strict';

// All server-sent-event broadcast registries: party progress sync, the public
// catalog live-update stream, the activity feed stream, admin-only "someone else
// earned XP/GC" floaters, and per-user badge-state pushes (notifications/forum
// unread counts). Wires two of these into db.js's XP/coin award hooks at require
// time so awards anywhere in the app immediately reach connected clients.

const db = require('./db');

// ── SSE party registry: partyId → Set of { userId, res } ─────────────────────
const _sseClients = new Map();
const _publicCatalogClients = new Set();
const _feedClients = new Set();
const _userBadgeClients = new Map();

function sseRegister(partyId, userId, res) {
  if (!_sseClients.has(partyId)) _sseClients.set(partyId, new Set());
  const entry = { userId, res };
  _sseClients.get(partyId).add(entry);
  return entry;
}

function sseUnregister(partyId, entry) {
  const set = _sseClients.get(partyId);
  if (!set) return;
  set.delete(entry);
  if (set.size === 0) _sseClients.delete(partyId);
}

function ssePush(partyId, excludeUserId, payload) {
  const set = _sseClients.get(partyId);
  if (!set) return;
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const entry of set) {
    if (entry.userId === excludeUserId) continue;
    try { entry.res.write(data); } catch (_) {}
  }
}

function publicCatalogRegister(res) {
  _publicCatalogClients.add(res);
}

function publicCatalogUnregister(res) {
  _publicCatalogClients.delete(res);
}

function publicCatalogPush(payload) {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of _publicCatalogClients) {
    try { res.write(data); } catch (_) {}
  }
}

function feedRegister(res) {
  _feedClients.add(res);
}

function feedUnregister(res) {
  _feedClients.delete(res);
}

function feedPush(payload = { type: 'feed_changed' }) {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of _feedClients) {
    try { res.write(data); } catch (_) {}
  }
}

db.setXpFeedHook(feedPush);

// ── Admin-only "someone else earned XP/GC" live floaters ─────────────────────
const _appXpClients = new Set();

function appXpRegister(res) { _appXpClients.add(res); }
function appXpUnregister(res) { _appXpClients.delete(res); }

function appXpPush(payload) {
  if (_appXpClients.size === 0) return;
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of _appXpClients) {
    try { res.write(data); } catch (_) {}
  }
}

db.setAppXpHook(({ userId, xpDelta, coinDelta }) => {
  if (_appXpClients.size === 0) return; // nobody watching - skip the lookups entirely
  const adminUserId = db.getUserByUsername(db.getAdminUsername())?.id ?? null;
  if (userId === adminUserId) return; // admin's own gains already show in their personal bar
  const user = db.getUserById(userId);
  if (!user) return;
  appXpPush({ username: user.display_name || user.username, xpDelta, coinDelta });
});

function userBadgeRegister(userId, res) {
  if (!_userBadgeClients.has(userId)) _userBadgeClients.set(userId, new Set());
  _userBadgeClients.get(userId).add(res);
}

function userBadgeUnregister(userId, res) {
  const set = _userBadgeClients.get(userId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) _userBadgeClients.delete(userId);
}

function userBadgePush(userId, payload = { type: 'badge_state_changed' }) {
  const set = _userBadgeClients.get(userId);
  if (!set) return;
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) {
    try { res.write(data); } catch (_) {}
  }
}

function userBadgePushAll(payload = { type: 'badge_state_changed' }) {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const set of _userBadgeClients.values()) {
    for (const res of set) {
      try { res.write(data); } catch (_) {}
    }
  }
}

module.exports = {
  sseRegister, sseUnregister, ssePush,
  publicCatalogRegister, publicCatalogUnregister, publicCatalogPush,
  feedRegister, feedUnregister, feedPush,
  appXpRegister, appXpUnregister, appXpPush,
  userBadgeRegister, userBadgeUnregister, userBadgePush, userBadgePushAll,
};
