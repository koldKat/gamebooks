'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createCodeStats, scanCodeStats } = require('../server/code-stats');
const background = require('../server/background-stats');

test('scans wait for startup, run off the request thread, and exclude tests and guides', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'code-stats-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const included = ['server.js', 'server/example.js', 'public/js/example.mjs', 'admin/js/example.js',
    'public/mobile/js/example.js', 'public/css/example.css', 'public/mobile/css/example.css',
    'public/index.html', 'public/mobile/index.html', 'admin/index.html'];
  const excluded = ['server/tests/ignored.js', 'server/test/ignored.js', 'server/__tests__/ignored.js',
    'server/example.test.js', 'public/js/example.spec.mjs', 'public/guide.html', 'admin/admin-guide.html', 'admin/technical.html'];
  for (const file of [...included, ...excluded]) {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await fs.writeFile(path.join(root, file), 'hello\nworld');
  }
  let finished = false;
  const oldPriority = os.getPriority(0);
  const pending = scanCodeStats(root).then(result => { finished = true; return result; });
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(finished, false);
  background.start();
  const result = await pending;
  assert.deepEqual(result, { linesOfCode: included.length * 2, codeBytes: included.length * 11, jsModules: 5 });
  assert.equal(os.getPriority(0), oldPriority, 'worker priority must not change the request thread');
});

test('cached stats remain available during refresh, persist, and survive failed scans', async () => {
  const saved = { linesOfCode: 10, codeBytes: 20, jsModules: 2 };
  let release, calls = 0, stored;
  const gate = new Promise(resolve => { release = resolve; });
  const stats = createCodeStats({ root: 'unused', loadCached: () => JSON.stringify(saved), saveCached: value => { stored = value; },
    scan: async () => { calls++; await gate; return { ...saved, codeBytes: 30 }; } });
  assert.deepEqual(stats.get(), saved);
  const first = stats.refresh(), second = stats.refresh();
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.deepEqual(stats.get(), saved);
  release(); await Promise.all([first, second]);
  assert.equal(JSON.parse(stored).codeBytes, 30);
  const failed = createCodeStats({ root: 'unused', loadCached: () => stored, saveCached() {}, scan: async () => { throw new Error('disk failed'); } });
  await assert.rejects(failed.refresh(), /disk failed/);
  assert.equal(failed.get().codeBytes, 30);
});
