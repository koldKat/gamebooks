'use strict';

// Serve saved source metrics while the shared background scanner refreshes them.
function scanCodeStats(root) {
  return require('./background-stats').scan({ kind: 'code', root });
}
function createCodeStats({ root, loadCached, saveCached, scan = scanCodeStats }) {
  let cached = { linesOfCode: 0, codeBytes: 0, jsModules: 0 };
  try {
    const saved = JSON.parse(loadCached());
    if (saved && Object.keys(cached).every(key => Number.isSafeInteger(saved[key]) && saved[key] >= 0)) cached = saved;
  } catch (_) {}
  let pending;
  return {
    get: () => ({ ...cached }),
    refresh() {
      if (!pending) pending = Promise.resolve().then(() => scan(root)).then(stats => {
        saveCached(JSON.stringify(stats));
        cached = stats;
      }).finally(() => { pending = null; });
      return pending;
    },
  };
}
module.exports = { scanCodeStats, createCodeStats };
