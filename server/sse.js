'use strict';

// Shared SSE registries; wire database reward hooks here so all award paths push updates.

const db = require('./db');
const { writeEvent } = require('./sse-transport');

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
    writeEvent(entry.res, data);
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
    writeEvent(res, data);
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
    writeEvent(res, data);
  }
}

db.setXpFeedHook(feedPush);

// ── Admin-only "someone else earned XP/GC" live floaters ─────────────────────
const _appXpClients = new Map();

function appXpRegister(res, { summaryOnly = false } = {}) { _appXpClients.set(res, summaryOnly); }
function appXpUnregister(res) { _appXpClients.delete(res); }

function appXpPush(payload) {
  if (_appXpClients.size === 0) return;
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const [res, summaryOnly] of _appXpClients) {
    writeEvent(res, summaryOnly ? 'data: {"summaryChanged":true}\n\n' : data);
  }
}

db.setAppXpHook(({ userId, xpDelta, coinDelta, diamondDelta, rubyDelta, jobXpDelta }) => {
  if (_appXpClients.size === 0) return; // nobody watching - skip the lookups entirely
  const adminUserId = db.getUserByUsername(db.getAdminUsername())?.id ?? null;
  if (userId === adminUserId || Number.isFinite(jobXpDelta)) {
    appXpPush({ summaryChanged: true });
    return; // Refresh aggregate bars without duplicating personal reward floaters.
  }
  const user = db.getUserById(userId);
  if (!user) return;
  appXpPush({ username: user.display_name || user.username, xpDelta, coinDelta, diamondDelta, rubyDelta });
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
    writeEvent(res, data);
  }
}

function userBadgePushAll(payload = { type: 'badge_state_changed' }) {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const set of _userBadgeClients.values()) {
    for (const res of set) {
      writeEvent(res, data);
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
