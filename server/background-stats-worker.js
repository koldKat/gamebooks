'use strict';

// Read-only informational scans; never load the app or its database here.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { parentPort, workerData } = require('node:worker_threads');

// On Linux pid 0 means this calling thread, leaving the request thread alone.
// Keep an inherited lower priority. Raising nice 19 to 15 requires privileges.
if (os.getPriority(0) < 15) os.setPriority(0, 15);
if (os.getPriority(0) < 15) throw new Error('Statistics worker must run at nice 15 or lower priority');
const sleeper = new Int32Array(new SharedArrayBuffer(4));
let operations = 0;
// Metadata-only size scans need small yields, not minutes of artificial delay.
const pauseEvery = workerData.kind === 'size' ? 256 : 16;
const pauseMs = workerData.kind === 'size' ? 5 : 50;
function pause() {
  if (++operations % pauseEvery === 0) Atomics.wait(sleeper, 0, 0, pauseMs);
}
function walk(dir, visit, ignore = () => false) {
  let handle;
  try { handle = fs.opendirSync(dir); }
  catch (error) { if (['ENOENT', 'EACCES'].includes(error.code)) return; throw error; }
  try {
    let entry;
    while ((entry = handle.readSync())) {
      pause();
      if (ignore(entry.name)) continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file, visit, ignore);
      else if (entry.isFile()) visit(file);
    }
  } finally { handle.closeSync(); }
}
function directorySize() {
  const ignored = workerData.patterns.map(pattern => new RegExp('^' + pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$'));
  let bytes = 0;
  walk(workerData.root, file => {
    try { bytes += fs.statSync(file).size; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }, name => ignored.some(rx => rx.test(name)));
  return bytes;
}
function codeStats() {
  const stats = { linesOfCode: 0, codeBytes: 0, jsModules: 0,
    jsModulesBreakdown: { frontend: 0, backend: 0, battleSims: 0, tests: 0 },
    linesOfCodeBreakdown: { frontend: 0, backend: 0, battleSims: 0 } };
  const buffer = Buffer.alloc(16 * 1024);
  function count(file) {
    let fd;
    try { fd = fs.openSync(file, 'r'); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    let lines = 1, bytes = 0;
    try {
      let size;
      while ((size = fs.readSync(fd, buffer, 0, buffer.length, null))) {
        pause();
        bytes += size;
        for (let i = 0; i < size; i++) if (buffer[i] === 10) lines++;
      }
    } finally { fs.closeSync(fd); }
    stats.linesOfCode += lines; stats.codeBytes += bytes;
    const relative = path.relative(workerData.root, file).split(path.sep).join('/');
    const simulator = /^public\/(?:mobile\/)?js\/battlesim\//.test(relative)
      || /^public\/js\/i18n\/(?:[^/]+\/)?battlesim(?:\/|\.m?js$)/.test(relative)
      || relative === 'public/css/components/battlesim.css';
    const area = simulator ? 'battleSims'
      : relative === 'server.js' || relative.startsWith('server/') ? 'backend' : 'frontend';
    stats.linesOfCodeBreakdown[area] += lines;
    if (/\.(?:[cm]?js)$/.test(file)) {
      stats.jsModules++;
      stats.jsModulesBreakdown[area]++;
    }
  }
  function countTest(file) {
    if (!/\.(?:[cm]?js)$/.test(file)) return;
    stats.jsModules++;
    stats.jsModulesBreakdown.tests++;
  }
  function walkModules(dir, inTests = false) {
    walk(dir, file => {
      const relative = path.relative(dir, file).split(path.sep).join('/');
      if (inTests || /(?:^|\/)(?:test|tests|__tests__)\//.test(relative)
        || /\.(?:test|spec)\.(?:[cm]?js)$/.test(file)) countTest(file);
      else if (/\.(?:[cm]?js)$/.test(file)) count(file);
    });
  }
  for (const dir of ['server', 'public/js', 'admin/js', 'public/mobile/js']) {
    walkModules(path.join(workerData.root, dir));
  }
  for (const dir of ['test', 'tests', '__tests__']) walkModules(path.join(workerData.root, dir), true);
  for (const dir of ['public/css', 'public/mobile/css', 'server/styles', 'docs/styles']) {
    walk(path.join(workerData.root, dir), file => {
      if (file.endsWith('.css')) count(file);
    });
  }
  for (const dir of ['admin']) {
    let handle;
    try { handle = fs.opendirSync(path.join(workerData.root, dir)); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    try {
      let entry;
      while ((entry = handle.readSync())) {
        pause();
        if (entry.isFile() && entry.name.endsWith('.html')
          && !['admin-guide.html', 'technical.html'].includes(entry.name)) count(path.join(workerData.root, dir, entry.name));
      }
    } finally { handle.closeSync(); }
  }
  for (const file of ['server.js', 'public/index.html', 'public/mobile/index.html']) count(path.join(workerData.root, file));
  return stats;
}
parentPort.postMessage(workerData.kind === 'code' ? codeStats() : directorySize());
