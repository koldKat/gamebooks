'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const settle = () => new Promise(resolve => setImmediate(resolve));

function harness({ zipFails = false } = {}) {
  let now = new Date(2026, 9, 7, 11).getTime();
  const files = new Map(), snapshots = [], commands = [], timers = [], errors = [];
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const deps = {
    path,
    fs: {
      mkdirSync() {},
      existsSync: file => files.has(file) || file === '/app/reading-images',
      readdirSync: () => [...files.keys()].map(file => path.basename(file)),
      statSync: file => ({ mtimeMs: files.get(file) }),
      unlinkSync: file => files.delete(file),
    },
    child_process: { execFile: (command, args, callback) => {
      commands.push({ command, args: Array.from(args) });
      files.set(args[1], now);
      callback(zipFails ? Error('zip failed') : null);
    } },
    './db': { backupDb: async file => { snapshots.push(file); files.set(file, now); } },
    './db/feedback': { purgeDeletedFeedbackThreads() {} },
    './feedback-cleanup': { cleanupFeedbackAttachments: async () => {} },
  };
  const context = {
    module: { exports: {} }, __dirname: '/app/server', Date: Clock,
    require: name => deps[name],
    setTimeout: (callback, delay) => timers.push({ callback, delay }),
    console: { log() {}, error: (...args) => errors.push(args) },
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../server/backup'), 'utf8'), context);
  return {
    ...context.module.exports, files, snapshots, commands, timers, errors,
    setNow: date => { now = date.getTime(); },
  };
}

test('hourly backups contain only SQLite and restarts skip an existing hourly archive', async () => {
  const h = harness();
  h.start();
  await settle();
  assert.deepEqual(h.snapshots, ['/app/backups/backup-2026-10-07_11h.sqlite']);
  assert.deepEqual(h.commands, [{ command: 'zip', args: [
    '-j', '/app/backups/backup-2026-10-07_11h.zip', '/app/backups/backup-2026-10-07_11h.sqlite',
  ] }]);
  assert.equal(h.files.has(h.snapshots[0]), false);
  h.start();
  await settle();
  assert.equal(h.snapshots.length, 1);
  assert.equal(h.commands.length, 1);
});

test('failed compression removes partial output and allows a same-hour retry', async () => {
  const h = harness({ zipFails: true });
  const old = '/app/backups/backup-old.zip';
  h.files.set(old, new Date(2026, 8, 1).getTime());
  h.start();
  await settle();
  assert.equal(h.files.has('/app/backups/backup-2026-10-07_11h.zip'), false);
  assert.equal(h.files.has('/app/backups/backup-2026-10-07_11h.sqlite'), false);
  assert.equal(h.errors.length, 1);
  assert.equal(h.files.has(old), true, 'retain recovery archive when creating a replacement fails');
  h.start();
  await settle();
  assert.equal(h.snapshots.length, 2);
});

test('retention keeps seven days and prunes even when this hour already exists', async () => {
  const h = harness();
  const now = new Date(2026, 9, 7, 11).getTime();
  const cutoff = now - 7 * 24 * 60 * 60 * 1000;
  const old = '/app/backups/backup-old.zip';
  const boundary = '/app/backups/backup-boundary.zip';
  const recent = '/app/backups/backup-recent.zip';
  const manual = '/app/backups/manual.zip';
  const snapshot = '/app/backups/backup-manual.sqlite';
  const current = '/app/backups/backup-2026-10-07_11h.zip';
  for (const [file, mtime] of [[old, cutoff - 1], [boundary, cutoff],
    [recent, cutoff + 1], [manual, cutoff - 1], [snapshot, cutoff - 1], [current, now]]) {
    h.files.set(file, mtime);
  }
  h.start();
  await settle();
  assert.equal(h.files.has(old), false);
  for (const file of [boundary, recent, manual, snapshot, current]) {
    assert.equal(h.files.has(file), true, file);
  }
  assert.equal(h.snapshots.length, 0);
  assert.equal(h.commands.length, 0);
});
