'use strict';

// Serialize optional scans after startup on one low-priority, bounded worker.
const path = require('node:path');
const { Worker } = require('node:worker_threads');
let ready = false;
let running = false;
const queue = [];
function pump() {
  if (!ready || running || !queue.length) return;
  running = true;
  const job = queue.shift();
  let result, failure;
  let worker;
  try {
    worker = new Worker(path.join(__dirname, 'background-stats-worker.js'), {
      workerData: job.data,
      resourceLimits: { maxOldGenerationSizeMb: 24, maxYoungGenerationSizeMb: 4, stackSizeMb: 2 },
    });
  } catch (error) { running = false; job.reject(error); pump(); return; }
  worker.once('message', value => { result = value; });
  worker.once('error', error => { failure = error; });
  worker.once('exit', code => {
    running = false;
    if (failure || code || result === undefined) job.reject(failure || new Error('Statistics scan failed: ' + code));
    else job.resolve(result);
    pump();
  });
}
function scan(data) {
  return new Promise((resolve, reject) => { queue.push({ data, resolve, reject }); pump(); });
}
function start() {
  if (ready) return;
  ready = true;
  pump();
}
module.exports = { scan, start };
