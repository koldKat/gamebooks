'use strict';

// Reuse the public feed between visible changes without caching account-specific responses.
function createFeedResponseCache({ build, version, externalVersion, now = Date.now, maxAgeMs = 30_000 }) {
  let cached, key, expiresAt = 0;
  return {
    get() {
      const currentKey = `${version()}|${externalVersion()}`;
      const time = now();
      if (cached && key === currentKey && time < expiresAt) return cached;

      const result = build();
      let deadline = now() + maxAgeMs;
      // Keep the rolling 30-day window moving even when no writes occur.
      for (const entry of result.entries) {
        const expiry = (Math.floor(entry.completedAt / 1000) + 30 * 86400 + 1) * 1000;
        if (expiry > time) deadline = Math.min(deadline, expiry);
      }
      cached = result;
      key = currentKey;
      expiresAt = deadline;
      return result;
    },
    invalidate() {
      cached = undefined;
      key = undefined;
      expiresAt = 0;
    },
  };
}

let shared;
function getFeedResponse() {
  if (!shared) {
    const db = require('./db');
    const connection = require('./db/connection').db;
    const { addAnnouncementCovers } = require('./announcement-covers');
    shared = createFeedResponseCache({
      build: () => addAnnouncementCovers(db.getFeed(), db.getPinnedAnnouncement()),
      version: () => db.getFeedVersion(),
      // Direct admin/audit writes use other connections, outside the SSE hooks.
      externalVersion: () => connection.pragma('data_version', { simple: true }),
    });
  }
  return shared.get();
}

function invalidateFeedResponse() {
  shared?.invalidate();
}

module.exports = { createFeedResponseCache, getFeedResponse, invalidateFeedResponse };
