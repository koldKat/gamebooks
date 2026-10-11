'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const Database = require('better-sqlite3');

function loadRuntime(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-locks-'));
  const file = path.join(dir, 'test.sqlite');
  const writer = new Database(file, { timeout: 0 });
  writer.pragma('journal_mode = WAL');
  writer.exec('CREATE TABLE admin_settings (key TEXT PRIMARY KEY, value TEXT)');
  const locker = new Database(file, { timeout: 0 });
  t.after(() => {
    locker.close();
    writer.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const intervals = new Map();
  const timeouts = [];
  const signals = new Map();
  const errors = [];
  let exits = 0;
  let now = Date.now();
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const db = {
    getAdminSetting: key => writer.prepare('SELECT value FROM admin_settings WHERE key = ?').get(key)?.value,
    setAdminSetting: (key, value) => writer.prepare('INSERT INTO admin_settings VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value),
    getRandomMaintenanceMessage: () => 'Back shortly.',
    getRandomTagline: () => 'Adventure awaits.',
    getAppBirthTimestamp: () => 0,
    purgeOldNotifications() {},
    purgeOldHeartbeats() {},
    walCheckpoint() {},
  };
  const context = vm.createContext({
    module: { exports: {} },
    require: name => name === './db' ? db : name === 'fs' ? { readdirSync: () => [] } : require(name),
    console: { error: (...args) => errors.push(args) },
    Date: Clock,
    Buffer,
    setInterval: (fn, ms) => intervals.set(ms, fn),
    setTimeout: (fn, ms) => timeouts.push({ fn, ms }),
    process: {
      cpuUsage: () => ({ user: 0, system: 0 }),
      memoryUsage: () => ({ heapUsed: 0, heapTotal: 0, rss: 0 }),
      on: (signal, fn) => signals.set(signal, fn),
      exit: () => { exits++; },
    },
  });
  vm.runInContext(fs.readFileSync(require.resolve('../server/runtime-state'), 'utf8'), context);
  return {
    runtime: context.module.exports, db, intervals, timeouts, signals, errors,
    lock: () => locker.exec('BEGIN IMMEDIATE'),
    unlock: () => locker.exec('ROLLBACK'),
    advance: ms => { now += ms; },
    exits: () => exits,
  };
}

test('uptime heartbeat survives an actual SQLite write lock and persists on its next tick', t => {
  const h = loadRuntime(t);
  const before = h.db.getAdminSetting('server_last_heartbeat');
  h.lock();
  h.advance(10_000);
  assert.doesNotThrow(() => h.intervals.get(10_000)());
  assert.equal(h.db.getAdminSetting('server_last_heartbeat'), before);
  assert.equal(h.errors[0][1].code, 'SQLITE_BUSY');
  h.unlock();
  h.advance(10_000);
  h.intervals.get(10_000)();
  assert.equal(Number(h.db.getAdminSetting('server_last_heartbeat')), Number(before) + 20);
});

test('traffic totals stay in memory after a locked flush and retry on the next request', t => {
  const h = loadRuntime(t);
  h.lock();
  for (let i = 0; i < 50; i++) assert.doesNotThrow(() => h.runtime.recordTraffic(2, 3));
  assert.equal(h.runtime.getTrafficStats().trafficIn, 100);
  assert.equal(h.db.getAdminSetting('traffic_in'), undefined);
  h.unlock();
  h.runtime.recordTraffic(2, 3);
  assert.equal(h.db.getAdminSetting('traffic_in'), '102');
  assert.equal(h.db.getAdminSetting('traffic_out'), '153');
});

test('nightly cleanup logs a failed task, runs the remaining tasks, and schedules the next night', t => {
  const h = loadRuntime(t);
  const calls = [];
  h.db.purgeOldNotifications = () => { calls.push('notifications'); throw Object.assign(new Error('locked'), { code: 'SQLITE_BUSY' }); };
  h.db.purgeOldHeartbeats = () => calls.push('heartbeats');
  h.db.walCheckpoint = () => calls.push('checkpoint');
  assert.doesNotThrow(() => h.timeouts[0].fn());
  assert.deepEqual(calls, ['notifications', 'heartbeats', 'checkpoint']);
  assert.equal(h.timeouts.length, 2);
  assert.equal(h.errors.length, 1);
});

test('SIGINT and SIGTERM still exit when the database cannot save shutdown bookkeeping', t => {
  const h = loadRuntime(t);
  h.lock();
  for (const signal of ['SIGINT', 'SIGTERM']) assert.doesNotThrow(() => h.signals.get(signal)());
  assert.equal(h.exits(), 2);
  assert.equal(h.errors.length, 4);
  assert.equal(h.db.getAdminSetting('server_stopped_at'), '0');
  h.unlock();
});
