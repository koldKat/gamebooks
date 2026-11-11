'use strict';

const path = require('node:path');
const { Worker } = require('node:worker_threads');

function scanDirectory(root, patterns) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'directory-size-worker.js'), {
      workerData: { root, patterns }, resourceLimits: { maxOldGenerationSizeMb: 64 },
    });
    worker.once('message', resolve);
    worker.once('error', reject);
    worker.once('exit', code => { if (code !== 0) reject(new Error('Directory scan exited: ' + code)); });
  });
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
    return read.refresh(patterns);
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

  return read;
}

module.exports = { createDirectorySizeReader };
