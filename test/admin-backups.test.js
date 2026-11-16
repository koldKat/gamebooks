'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness() {
  const source = fs.readFileSync(path.join(__dirname, '../server/routes/admin.js'), 'utf8');
  const deleted = [];
  const scanned = [];
  const files = [
    'backup-2026-11-16.zip', 'backup-2026-11-15_09h.zip',
    'backup.test.js', 'backup-schedule.test.js', 'backup-2026-11-16.sqlite',
    'unrelated.zip', 'backup-old.zip',
  ];
  const context = vm.createContext({
    path, PROJECT_ROOT: '/app',
    require: () => ({ BACKUP_DIR: '/app/backups' }),
    fs: {
      readdirSync(dir) {
        scanned.push(dir);
        return files.map(name => ({ name, isFile: () => true }));
      },
      statSync: () => ({ size: 42, mtimeMs: 123 }),
      lstatSync: () => ({ isFile: () => true }),
      unlinkSync: file => deleted.push(file),
    },
    requireLocalhost: () => true,
    readBody: async req => req.body,
    send: (res, status, body) => Object.assign(res, { status, body }),
  });
  vm.runInContext(source.slice(source.indexOf('const { BACKUP_DIR }'), source.indexOf('async function handleAdminSetSetting')), context);
  return { context, scanned, deleted };
}

test('admin lists only database ZIP archives from the backup directory', async () => {
  const h = harness();
  const res = {};
  await h.context.handleAdminListBackups({}, res);
  assert.equal(res.status, 200);
  assert.deepEqual(Array.from(res.body, row => row.rel), [
    'backups/backup-2026-11-16.zip', 'backups/backup-2026-11-15_09h.zip',
  ]);
  assert.deepEqual(h.scanned, ['/app/backups']);
});

test('admin cannot delete source files or ZIP files outside the backup directory', async () => {
  const h = harness();
  const res = {};
  await h.context.handleAdminDeleteBackups({ body: { paths: [
    'test/backup.test.js', 'test/backup-schedule.test.js',
    'test/backup-2026-11-16.zip', 'backups/../backup-2026-11-16.zip',
    'backups/unrelated.zip', 'backups/backup-2026-11-16.sqlite',
    'backups/backup-2026-11-16.zip',
  ] } }, res);
  assert.equal(res.body.errors.length, 6);
  assert.deepEqual(h.deleted, ['/app/backups/backup-2026-11-16.zip']);
});
