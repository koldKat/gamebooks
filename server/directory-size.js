'use strict';

const backgroundStats = require('./background-stats');

function scanDirectory(root, patterns) {
  return backgroundStats.scan({ kind: 'size', root, patterns });
}

function createDirectorySizeReader(root, { scan = scanDirectory, loadCached = () => null, loadCheckedAt = () => 0,
  saveCached = () => {}, now = Date.now, ttlMs = 60 * 60 * 1000 } = {}) {
  const saved = loadCached();
  let cached = saved !== null && saved !== undefined && Number.isSafeInteger(Number(saved)) && Number(saved) >= 0
    ? Number(saved) : null;
  let pending = null;
  let checkedAt = Number(loadCheckedAt()) || 0;

  async function read(patterns) {
    const age = now() - checkedAt;
    if (cached !== null && age >= 0 && age < ttlMs) return cached;
    // Stale information is preferable to making an admin request wait for disk I/O.
    read.refresh(patterns).catch(error => console.error('[app-size] scan failed:', error));
    return cached;
  }

  read.refresh = async function (patterns) {
    if (pending) return pending;
    pending = (async () => {
      const bytes = await scan(root, patterns);
      if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error('Invalid directory size');
      const completedAt = now();
      await saveCached(bytes, completedAt);
      cached = bytes;
      checkedAt = completedAt;
      return bytes;
    })();
    try { return await pending; }
    finally { pending = null; }
  };

  read.cached = () => cached;
  return read;
}

module.exports = { createDirectorySizeReader };
