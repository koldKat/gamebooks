'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const Database = require('better-sqlite3');

function load(file, dependencies, globals = {}) {
  const context = vm.createContext({ module: { exports: {} }, require: name => dependencies[name] || require(name), console, ...globals });
  vm.runInContext(fs.readFileSync(require.resolve(file), 'utf8'), context);
  return context.module.exports;
}

function fixture() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`CREATE TABLE feedback (id INTEGER PRIMARY KEY, user_id INTEGER, deleted_by_user INTEGER DEFAULT 0, deleted_by_admin INTEGER DEFAULT 0);
    CREATE TABLE feedback_messages (id INTEGER PRIMARY KEY, thread_id INTEGER REFERENCES feedback(id) ON DELETE CASCADE, created_at INTEGER);
    CREATE TABLE attachments (id INTEGER PRIMARY KEY, filename TEXT, original_name TEXT, mime_type TEXT, size INTEGER, kind TEXT, linked_id INTEGER, created_at INTEGER);
    INSERT INTO feedback (id,user_id) VALUES (1,7),(2,8),(3,NULL);
    INSERT INTO feedback_messages VALUES (10,1,0),(11,1,1),(20,2,0);
    INSERT INTO attachments VALUES (1,'first.png','','',1,'feedback_message',10,0),(2,'reply.png','','',1,'feedback_message',11,0),
      (3,'other.png','','',1,'feedback_message',20,0),(4,'forum.png','','',1,'forum_post',10,0),(5,'unlinked.png','','',1,NULL,NULL,0);
    ALTER TABLE attachments ADD COLUMN uploaded_by INTEGER;`);
  const api = load('../server/db/feedback', { './connection': { db } });
  return { db, api };
}

test('hard deletion removes the whole conversation and only its attachment rows', () => {
  const { db, api } = fixture();
  try {
    assert.equal(api.deleteFeedbackThreadForUser(1, 8).ok, false);
    assert.equal(api.deleteFeedbackThreadForUser(3, null).ok, false);
    const result = api.deleteFeedbackThreadForUser(1, 7);
    assert.equal(result.ok, true);
    assert.deepEqual(Array.from(result.filenames), ['first.png', 'reply.png']);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM feedback WHERE id=1').get().n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM feedback_messages WHERE thread_id=1').get().n, 0);
    assert.deepEqual(db.prepare('SELECT id FROM attachments ORDER BY id').all().map(a => a.id), [3,4,5]);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM feedback_attachment_deletions').get().n, 2);
    assert.equal(api.deleteFeedbackThread(1).ok, false);
    assert.equal(api.deleteFeedbackThread(3).ok, true);
  } finally { db.close(); }
});

test('deletion failures roll back thread, messages, attachment rows and cleanup queue', () => {
  const { db, api } = fixture();
  try {
    db.exec("CREATE TRIGGER prevent_delete BEFORE DELETE ON feedback BEGIN SELECT RAISE(ABORT,'blocked'); END");
    assert.throws(() => api.deleteFeedbackThread(1), /blocked/);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM feedback_messages WHERE thread_id=1').get().n, 2);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM attachments').get().n, 5);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM feedback_attachment_deletions').get().n, 0);
  } finally { db.close(); }
});

test('legacy deletion flags are purged rather than remaining hidden', () => {
  const { db, api } = fixture();
  try {
    db.exec('UPDATE feedback SET deleted_by_user=1 WHERE id=1; UPDATE feedback SET deleted_by_admin=1 WHERE id=2');
    assert.equal(api.purgeDeletedFeedbackThreads(), 2);
    assert.deepEqual(db.prepare('SELECT id FROM feedback').all(), [{ id: 3 }]);
    assert.equal(api.purgeDeletedFeedbackThreads(), 0);
  } finally { db.close(); }
});

test('attachment cleanup deletes files, tolerates missing files and retries failures', async () => {
  const { db, api } = fixture();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'feedback-delete-test-'));
  try {
    fs.writeFileSync(path.join(directory, 'first.png'), 'image');
    fs.writeFileSync(path.join(directory, 'forum.png'), 'other');
    const result = api.deleteFeedbackThread(1);
    let fail = true;
    const cleanup = load('../server/feedback-cleanup', {
      './db/connection': { db }, './paths': { ATTACHMENTS_DIR: directory },
      fs: { promises: { unlink: async file => {
        if (fail && file.endsWith('first.png')) throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
        return fs.promises.unlink(file);
      } } },
    }).cleanupFeedbackAttachments;
    await assert.rejects(cleanup(result.filenames), /queued for retry/);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM feedback_attachment_deletions').get().n, 1);
    fail = false;
    await cleanup();
    assert.equal(fs.existsSync(path.join(directory, 'first.png')), false);
    assert.equal(fs.existsSync(path.join(directory, 'forum.png')), true);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM feedback_attachment_deletions').get().n, 0);
    await cleanup();
  } finally { db.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});

test('cleanup protects shared files and rejects paths outside the attachment directory', async () => {
  const { db } = fixture();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'feedback-delete-test-'));
  try {
    fs.writeFileSync(path.join(directory, 'forum.png'), 'shared');
    db.prepare('INSERT INTO feedback_attachment_deletions(filename) VALUES (?)').run('forum.png');
    const cleanup = load('../server/feedback-cleanup', { './db/connection': { db }, './paths': { ATTACHMENTS_DIR: directory } }).cleanupFeedbackAttachments;
    await cleanup();
    assert.equal(fs.existsSync(path.join(directory, 'forum.png')), true);
    db.prepare('INSERT INTO feedback_attachment_deletions(filename) VALUES (?)').run('../outside.png');
    await assert.rejects(cleanup(), /queued for retry/);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM feedback_attachment_deletions').get().n, 1);
  } finally { db.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});

test('feedback delete routes enforce owner/admin access and await file removal', async () => {
  let userId = 7, admin = false, local = true, status, cleaned = [], deleted = [], cleanupFails = false, badgePushes = 0;
  const routes = load('../server/routes/feedback', {
    '../db': {
      isUserAdmin: () => admin,
      deleteFeedbackThread: id => { deleted.push(['admin', id]); return { ok: true, filenames: ['file.png'] }; },
      deleteFeedbackThreadForUser: (id, owner) => { deleted.push(['owner', id, owner]); return { ok: owner === 7 && id === 1, filenames: ['file.png'] }; },
    },
    '../request-helpers': { authenticate: async () => userId, requireLocalhost: () => local, send: (res, code) => { status = code; } },
    '../email': {}, '../html-escape': {}, '../sse': { userBadgePushAll() { badgePushes++; } },
    '../feedback-cleanup': { cleanupFeedbackAttachments: async files => { cleaned.push(...files); if (cleanupFails) throw Error('cleanup failed'); } },
  });
  await routes.handleDeleteFeedback({}, {}, 2);
  assert.equal(status, 404);
  assert.equal(cleaned.length, 0);
  await routes.handleDeleteFeedback({}, {}, 1);
  assert.equal(status, 200);
  assert.deepEqual(cleaned, ['file.png']);
  admin = true;
  await routes.handleDeleteFeedback({}, {}, 2);
  assert.deepEqual(deleted.at(-1), ['admin', 2]);
  cleanupFails = true;
  status = null;
  const pushesBeforeFailure = badgePushes;
  await assert.rejects(routes.handleDeleteFeedback({}, {}, 1), /cleanup failed/);
  assert.equal(status, null);
  assert.equal(badgePushes, pushesBeforeFailure + 1);
  local = false;
  const count = deleted.length;
  await routes.handleAdminDeleteFeedback({}, {}, 2);
  assert.equal(deleted.length, count);
  userId = null;
  await routes.handleDeleteFeedback({}, {}, 1);
  assert.equal(deleted.length, count);
});

test('queued cleanup failure does not prevent the existing backup job', async () => {
  let backedUp = 0, purged = 0, logged = 0;
  const backup = load('../server/backup', {
    './db': { backupDb: async () => { backedUp++; } },
    './db/feedback': { purgeDeletedFeedbackThreads: () => { purged++; } },
    './feedback-cleanup': { cleanupFeedbackAttachments: async () => { throw Error('permission denied'); } },
    fs: { mkdirSync() {}, existsSync: () => false, unlinkSync() {}, readdirSync: () => [] },
    child_process: { execFile: (cmd, args, ...rest) => rest.at(-1)(null) },
  }, { __dirname: '/app/server', setTimeout() {}, console: { error() { logged++; }, log() {} } });
  backup.start();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(purged, 1);
  assert.equal(backedUp, 1);
  assert.equal(logged, 1);
});

test('inbox keeps failed deletes visible and captures the confirmed thread ID', async () => {
  const elements = new Map(), alerts = [], requests = [];
  let confirm, ok = false, badges = 0;
  const element = id => {
    if (!elements.has(id)) elements.set(id, { style: {}, classList: { add() {}, remove() {} }, listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; }, querySelectorAll() { return []; } });
    return elements.get(id);
  };
  const context = vm.createContext({
    document: { getElementById: element },
    apiFetch: async url => { requests.push(url); return { ok }; },
    getUsername: () => 'Tester', t: key => key, escapeHtml: s => s,
    showConfirm: (text, action) => { confirm = action; }, showAlert: text => alerts.push(text),
    refreshInboxBadge: () => { badges++; },
  });
  const source = fs.readFileSync(require.resolve('../public/js/community/inbox.js'), 'utf8').replace(/^import .*;$/gm, '').replace('export function initInbox', 'function initInbox');
  vm.runInContext(source, context);
  context.initInbox(() => null);
  vm.runInContext('_inboxThreads=[{id:7},{id:8}];_currentThreadId=7;', context);
  element('inbox-conv-delete-btn').listeners.click();
  await confirm();
  assert.equal(alerts.length, 1);
  assert.equal(vm.runInContext('_inboxThreads.length', context), 2);
  assert.equal(badges, 0);
  ok = true;
  element('inbox-conv-delete-btn').listeners.click();
  vm.runInContext('_currentThreadId=8;', context);
  await confirm();
  assert.equal(requests.at(-1), '/api/feedback/7');
  assert.equal(vm.runInContext('_currentThreadId', context), 8);
  assert.equal(vm.runInContext('_inboxThreads.length', context), 1);
  assert.equal(badges, 1);
});
