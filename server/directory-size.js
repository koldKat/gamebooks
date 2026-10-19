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

function createDirectorySizeReader(root, { ttlMs = 5 * 60_000, now = Date.now, scan = scanDirectory } = {}) {
  let cached = null;
  let pending = null;

  async function read(patterns) {
    const key = JSON.stringify(patterns);
    if (cached?.key === key && now() < cached.expiresAt) return cached.bytes;
    if (pending) {
      await pending;
      return read(patterns);
    }
    pending = (async () => {
      const bytes = await scan(root, patterns);
      cached = { key, bytes, expiresAt: now() + ttlMs };
      return bytes;
    })();
    try { return await pending; }
    finally { pending = null; }
  }

  return read;
}

module.exports = { createDirectorySizeReader };
