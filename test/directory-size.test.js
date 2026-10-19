'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createDirectorySizeReader } = require('../server/directory-size');

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
  assert.equal(await createDirectorySizeReader(root)(['node_modules', '*backup*', 'literal[1].txt']), 8);
});

test('unchanged polls reuse a bounded result, expiry and changed exclusions rescan', async t => {
  const root = await fixture(t);
  const file = path.join(root, 'book.png');
  await fs.writeFile(file, '123');
  let now = 100;
  const read = createDirectorySizeReader(root, { ttlMs: 10, now: () => now });
  assert.equal(await read([]), 3);
  await fs.writeFile(file, '123456');
  now = 109;
  assert.equal(await read([]), 3);
  now = 110;
  assert.equal(await read([]), 6);
  assert.equal(await read(['*.png']), 0);
  assert.equal(await read([]), 6);
});

test('simultaneous admin polls share one scan', async t => {
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
  const first = read([]), second = read([]), third = read([]);
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
  try { assert.equal(await createDirectorySizeReader(root)([]), 100); }
  finally { clearInterval(timer); }
  assert.ok(ticks > 0);
});

test('failed scans reject waiting polls and allow a later retry', async () => {
  let attempts = 0;
  const read = createDirectorySizeReader('unused', { scan: async () => {
    if (++attempts === 1) throw new Error('worker failed');
    return 12;
  } });
  const result = await Promise.allSettled([read([]), read([])]);
  assert.ok(result.every(row => row.status === 'rejected'));
  assert.equal(await read([]), 12);
  assert.equal(attempts, 2);
});
