'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parentPort, workerData } = require('node:worker_threads');

const ignored = workerData.patterns.map(pattern => new RegExp('^' + pattern
  .replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$'));

function walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return 0; }
  let bytes = 0;
  for (const entry of entries) {
    if (ignored.some(rx => rx.test(entry.name))) continue;
    const filename = path.join(dir, entry.name);
    if (entry.isDirectory()) bytes += walk(filename);
    else if (entry.isFile()) {
      try { bytes += fs.statSync(filename).size; } catch {}
    }
  }
  return bytes;
}

parentPort.postMessage(walk(workerData.root));
