'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createDirectorySizeReader } = require('../server/directory-size');
require('../server/background-stats').start();

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'directory-size-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

test('size preserves glob exclusions, nested files, and skips symbolic links', async t => {
  const root = await fixture(t);
  await fs.mkdir(path.join(root, 'nested'));
  await fs.mkdir(path.join(root, 'node_modules'));
  await fs.writeFile(path.join(root, 'nested', 'book.png'), '12345');
  await fs.writeFile(path.join(root, 'app.js'), '123');
  await fs.writeFile(path.join(root, 'backup.zip'), '123456789');
  await fs.writeFile(path.join(root, 'literal[1].txt'), '123456');
  await fs.writeFile(path.join(root, 'node_modules', 'ignored.js'), '12345');
  await fs.symlink(root, path.join(root, 'cycle'));
  assert.equal(await createDirectorySizeReader(root).refresh(['node_modules', '*backup*', 'literal[1].txt']), 8);
});

test('reads reuse an hourly result and persist its timestamp across restarts', async t => {
  const root = await fixture(t);
  const file = path.join(root, 'book.png');
  await fs.writeFile(file, '123');
  let saved = null, checkedAt = 0, now = 100;
  const options = { loadCached: () => saved, loadCheckedAt: () => checkedAt, now: () => now,
    saveCached: (bytes, at) => { saved = String(bytes); checkedAt = at; } };
  const read = createDirectorySizeReader(root, options);
  assert.equal(await read.refresh([]), 3);
  await fs.writeFile(file, '123456');
  now += 3599999;
  assert.equal(await read([]), 3);
  assert.equal(await createDirectorySizeReader(root, options)([]), 3);
  now++;
  assert.equal(await read([]), 3);
  assert.equal(await read.refresh([]), 6);
  assert.equal(await createDirectorySizeReader(root, options)([]), 6);
  assert.equal(checkedAt, now);
  assert.equal(saved, '6');
});

test('simultaneous expired admin reads share one scan', async t => {
  const root = await fixture(t);
  await fs.writeFile(path.join(root, 'app.js'), '123');
  let scans = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const read = createDirectorySizeReader(root, { scan: async () => {
    scans++;
    await gate;
    return 3;
  } });
  const first = read.refresh([]), second = read.refresh([]), third = read.refresh([]);
  assert.equal(scans, 1);
  release();
  assert.deepEqual(await Promise.all([first, second, third]), [3, 3, 3]);
  assert.equal(scans, 1);
});

test('file scans yield so other server work can run', async t => {
  const root = await fixture(t);
  await Promise.all(Array.from({ length: 100 }, (_, i) => fs.writeFile(path.join(root, String(i)), '1')));
  let ticks = 0;
  const timer = setInterval(() => ticks++, 1);
  try { assert.equal(await createDirectorySizeReader(root).refresh([]), 100); }
  finally { clearInterval(timer); }
  assert.ok(ticks > 0);
});

test('uncached and expired reads return immediately while a single slow scan runs', async () => {
  let release, scans = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const read = createDirectorySizeReader('unused', { scan: async () => { scans++; await gate; return 42; } });
  assert.equal(await read([]), null);
  assert.equal(await read([]), null);
  assert.equal(scans, 1);
  release();
  await read.refresh([]);
  assert.equal(await read([]), 42);
});

test('failed scans preserve the saved value and allow a manual retry', async () => {
  let attempts = 0;
  const read = createDirectorySizeReader('unused', { loadCached: () => '7', loadCheckedAt: () => 100, now: () => 100, scan: async () => {
    if (++attempts === 1) throw new Error('worker failed');
    return 12;
  } });
  const result = await Promise.allSettled([read.refresh([]), read.refresh([])]);
  assert.ok(result.every(row => row.status === 'rejected'));
  assert.equal(await read([]), 7);
  assert.equal(attempts, 1);
  assert.equal(await read.refresh([]), 12);
  assert.equal(attempts, 2);
});
