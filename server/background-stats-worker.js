'use strict';

// Read-only informational scans; never load the app or its database here.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { parentPort, workerData } = require('node:worker_threads');

// On Linux pid 0 means this calling thread, leaving the request thread alone.
os.setPriority(0, 15);
if (os.getPriority(0) !== 15) throw new Error('Statistics worker must run at nice 15');
const sleeper = new Int32Array(new SharedArrayBuffer(4));
let operations = 0;
function pause() {
  if (++operations % 16 === 0) Atomics.wait(sleeper, 0, 0, 50);
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
  const stats = { linesOfCode: 0, codeBytes: 0, jsModules: 0 };
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
    if (/\.(?:m?js)$/.test(file)) stats.jsModules++;
  }
  for (const dir of ['server', 'public/js', 'admin/js', 'public/mobile/js']) {
    walk(path.join(workerData.root, dir), file => {
      if (/\.(?:m?js)$/.test(file) && !/\.(?:test|spec)\.(?:m?js)$/.test(file)) count(file);
    }, name => ['test', 'tests', '__tests__'].includes(name));
  }
  for (const dir of ['public/css', 'public/mobile/css', 'admin']) {
    let handle;
    try { handle = fs.opendirSync(path.join(workerData.root, dir)); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    try {
      let entry;
      while ((entry = handle.readSync())) {
        pause();
        if (entry.isFile() && (dir === 'admin'
          ? entry.name.endsWith('.html') && !['admin-guide.html', 'technical.html'].includes(entry.name)
          : entry.name.endsWith('.css'))) count(path.join(workerData.root, dir, entry.name));
      }
    } finally { handle.closeSync(); }
  }
  for (const file of ['server.js', 'public/index.html', 'public/mobile/index.html']) count(path.join(workerData.root, file));
  return stats;
}
parentPort.postMessage(workerData.kind === 'code' ? codeStats() : directorySize());
