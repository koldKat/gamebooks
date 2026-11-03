'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture(existing = []) {
  let now = new Date(2026, 10, 3, 12, 30).getTime();
  const files = new Map(existing.map(([name, age]) => [name, now - age * 86400000]));
  const timers = [];
  const snapshots = [];
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const fakeFs = {
    mkdirSync() {},
    readdirSync() { return [...files.keys()]; },
    statSync(file) { return { mtimeMs: files.get(path.basename(file)) }; },
    unlinkSync(file) { files.delete(path.basename(file)); },
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../server/backup.js'), 'utf8'), {
    module, __dirname: path.join(__dirname, '../server'), Date: Clock,
    console: { log() {}, error(error) { throw error; } },
    setTimeout(callback, delay) { timers.push({ callback, delay }); },
    require(name) {
      if (name === 'path') return path;
      if (name === 'fs') return fakeFs;
      if (name === './db') return { async backupDb(file) { snapshots.push(file); files.set(path.basename(file), now); } };
      if (name === './db/feedback') return { purgeDeletedFeedbackThreads() {} };
      if (name === './feedback-cleanup') return { async cleanupFeedbackAttachments() {} };
      if (name === 'child_process') return { execFile(command, args, callback) { assert.equal(command, 'zip'); files.set(path.basename(args[1]), now); callback(null); } };
      throw new Error(name);
    },
  });
  return { start: module.exports.start, files, timers, snapshots, advance(ms) { now += ms; } };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('backs up once per day, including across restarts, and schedules midnight', async () => {
  const f = fixture();
  f.start();
  await settle();
  assert.equal(f.snapshots.length, 1);
  assert.ok(f.files.has('backup-2026-11-03.zip'));
  assert.equal(f.timers[0].delay, 11.5 * 3600000);
  f.start();
  await settle();
  assert.equal(f.snapshots.length, 1);
  f.advance(f.timers[0].delay);
  f.timers[0].callback();
  await settle();
  assert.equal(f.snapshots.length, 2);
  assert.ok(f.files.has('backup-2026-11-04.zip'));
  assert.equal(f.timers.at(-1).delay, 24 * 3600000);
});

test('retains 30 days and recognizes an existing hourly archive for today', async () => {
  const f = fixture([
    ['backup-2026-11-03_09h.zip', 0],
    ['backup-2026-10-04.zip', 30],
    ['backup-2026-10-03.zip', 31],
    ['unrelated.zip', 60],
  ]);
  f.start();
  await settle();
  assert.equal(f.snapshots.length, 0);
  assert.ok(f.files.has('backup-2026-10-04.zip'));
  assert.ok(!f.files.has('backup-2026-10-03.zip'));
  assert.ok(f.files.has('unrelated.zip'));
});
