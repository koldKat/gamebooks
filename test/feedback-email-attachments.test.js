'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function load(file, deps) {
  const context = vm.createContext({ module: { exports: {} }, require: n => (n in deps ? deps[n] : require(n)), console, process, Date });
  vm.runInContext(fs.readFileSync(require.resolve(file), 'utf8'), context);
  return context.module.exports;
}

function emailModule() {
  let sent = null;
  const nodemailer = { createTransport: () => ({ sendMail: async m => { sent = m; return {}; } }) };
  const settings = { smtp_host: 'h', smtp_user: 'admin@x.com', smtp_pass: 'p', smtp_from: 'admin@x.com' };
  const email = load('../server/email', {
    path: require('node:path'),
    './db': { getAdminSetting: k => settings[k] },
    './html-escape': require('../server/html-escape'),
    './paths': { ATTACHMENTS_DIR: '/att' },
    nodemailer,
  });
  return { email, getSent: () => sent };
}

test('admin notification email embeds image attachments inline and attaches files', async () => {
  const { email, getSent } = emailModule();
  await email.sendAdminEmail('New feedback', 'text', '<p>body</p>', [
    { filename: 'att_1_9.png', original_name: 'shot.png', mime_type: 'image/png' },
    { filename: 'att_1_8.zip', original_name: 'logs.zip', mime_type: 'application/zip' },
  ]);
  const m = getSent();
  assert.ok(m, 'mail was sent');
  assert.equal(m.attachments.length, 2);
  assert.equal(m.attachments[0].path, '/att/att_1_9.png');
  assert.equal(m.attachments[0].filename, 'shot.png');
  assert.equal(m.attachments[0].contentType, 'image/png');
  assert.ok(m.attachments[0].cid, 'image gets a cid for inline embedding');
  assert.match(m.html, new RegExp('cid:' + m.attachments[0].cid.replace(/[.@]/g, '\\$&')));
  assert.equal(m.attachments[1].path, '/att/att_1_8.zip');
  assert.equal(m.attachments[1].cid, undefined, 'non-image has no inline cid');
  assert.equal(m.attachments[1].contentType, 'application/zip');
  assert.match(m.html, /logs\.zip/);
});

test('reply email carries its attachments too', async () => {
  const { email, getSent } = emailModule();
  await email.sendReplyEmail('u@x.com', 'User', 'orig', 'reply', [
    { filename: 'att_2_1.png', original_name: 'pic.png', mime_type: 'image/png' },
  ]);
  const m = getSent();
  assert.equal(m.attachments.length, 1);
  assert.ok(m.attachments[0].cid);
  assert.match(m.html, /cid:/);
});

test('no attachments still sends a normal email with an empty attachment list', async () => {
  const { email, getSent } = emailModule();
  await email.sendAdminEmail('New feedback', 'text', '<p>body</p>');
  const m = getSent();
  assert.equal(m.attachments.length, 0);
});

test('email escapes user-controlled subject and attachment display names in HTML', async () => {
  const { email, getSent } = emailModule();
  await email.sendAdminEmail('Feedback from <img src=x>', 'text', 'body', [
    { filename: 'shot.png', original_name: '\" onerror=\"alert(1)', mime_type: 'image/png' },
  ]);
  const mail = getSent();
  assert.ok(mail.html.includes('Feedback from &lt;img src=x&gt;'));
  assert.ok(mail.html.includes('alt="&quot; onerror=&quot;alert(1)"'));
  assert.equal(mail.subject, 'Feedback from <img src=x>');
});

function feedbackRoutes(isAdmin = false) {
  const linked = [];
  const calls = { admin: null, reply: null };
  const attachment = { id: 9, filename: 'shot.png', original_name: 'shot.png', mime_type: 'image/png' };
  const routes = load('../server/routes/feedback', {
    '../db': {
      getSession: () => ({ user_id: 7 }), refreshSession() {},
      createFeedbackThread: () => ({ threadId: 1, messageId: 10 }),
      isUserAdmin: () => isAdmin,
      getFeedbackThreadById: () => ({ user_id: 7, email: 'user@example.com', username: 'User', message: 'Original' }),
      addFeedbackMessage: () => 11,
      linkAttachments: (ids, kind, messageId, userId) => {
        assert.deepEqual(Array.from(ids), [9]);
        assert.equal(kind, 'feedback_message');
        assert.equal(userId, 7);
        linked.push(messageId);
      },
      getAttachments: (kind, messageId) => {
        assert.equal(kind, 'feedback_message');
        assert.ok(linked.includes(messageId), 'attachments must be linked before sending');
        return [attachment];
      },
      getUserById: () => ({ username: 'User' }),
      markThreadReadByAdmin() {}, markThreadUnreadByUser() {},
    },
    '../request-helpers': {
      authenticate: async () => 7, tokenFromReq: () => 'token',
      readBody: async () => ({ username: 'User', message: ' Message ', attachment_ids: [9, 'invalid'] }),
      send: (res, status) => { calls.status = status; },
    },
    '../email': {
      sendAdminEmail: async (...args) => { calls.admin = args; },
      sendReplyEmail: async (...args) => { calls.reply = args; },
    },
    '../html-escape': require('../server/html-escape'),
    '../sse': { userBadgePushAll() {} },
    '../feedback-cleanup': { cleanupFeedbackAttachments: async () => {} },
  });
  return { routes, calls, attachment };
}

test('feedback submission sends the linked initial-message attachments to the admin', async () => {
  const { routes, calls, attachment } = feedbackRoutes();
  await routes.handleSubmitFeedback({}, {});
  assert.equal(calls.status, 200);
  assert.deepEqual(calls.admin[3], [attachment]);
});

test('user inbox reply sends its linked attachments to the admin', async () => {
  const { routes, calls, attachment } = feedbackRoutes();
  await routes.handleUserReply({}, {}, 1);
  assert.equal(calls.status, 200);
  assert.deepEqual(calls.admin[3], [attachment]);
});

test('admin inbox reply sends its linked attachments to the user', async () => {
  const { routes, calls, attachment } = feedbackRoutes(true);
  await routes.handleUserReply({}, {}, 1);
  assert.equal(calls.status, 200);
  assert.equal(calls.reply[0], 'user@example.com');
  assert.deepEqual(calls.reply[4], [attachment]);
  assert.equal(calls.admin, null);
});
