'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup(overrides = {}) {
  const entries = [], operations = [], warnings = [];
  const fakeFs = {
    mkdir: async () => {},
    stat: async () => { throw Object.assign(new Error(), { code: 'ENOENT' }); },
    rename: async (...args) => operations.push(['rename', ...args]),
    appendFile: async (file, line, options) => {
      operations.push(['append', file, options.mode]);
      entries.push(JSON.parse(line));
    },
    ...overrides,
  };
  const context = vm.createContext({
    module: { exports: {} }, __dirname: path.resolve('server'),
    require: name => name === 'node:fs/promises' ? fakeFs : require(name),
    console: { warn: (...args) => warnings.push(args) },
  });
  vm.runInContext(fs.readFileSync(require.resolve('../server/email-delivery'), 'utf8'), context);
  return { ...context.module.exports, entries, operations, warnings };
}

test('each notification gets its own SMTP attempt and outcome, even with identical subjects', async () => {
  const log = setup();
  let sent = 0;
  const transporter = { sendMail: async () => ({ messageId: `mail-${++sent}`, accepted: ['admin@example.com'], rejected: [] }) };
  for (let i = 0; i < 11; i++) {
    await log.sendLoggedMail(transporter, { to: 'admin@example.com', subject: 'Same conversation' }, 'admin-notification');
  }
  assert.equal(sent, 11);
  assert.equal(log.entries.filter(e => e.event === 'accepted-by-smtp').length, 11);
  assert.equal(new Set(log.entries.map(e => e.attemptId)).size, 11);
  assert.ok(log.operations.every(op => op[1].endsWith('/logs/email.log') && op[2] === 0o600));
});

test('SMTP rejection is logged and preserved without logging credentials, body or reset tokens', async () => {
  const log = setup();
  const error = Object.assign(new Error('secret password and reset-token'), { code: 'EAUTH', responseCode: 535, command: 'AUTH PLAIN' });
  const transporter = { sendMail: async () => { throw error; } };
  await assert.rejects(log.sendLoggedMail(transporter, {
    to: 'admin@example.com', subject: 'Feedback', text: 'private conversation', html: 'reset-token', auth: 'secret password',
  }, 'admin-notification'), e => e === error);
  assert.equal(log.entries[1].event, 'failed');
  assert.equal(log.entries[1].responseCode, 535);
  assert.equal(log.entries[1].code, 'EAUTH');
  assert.doesNotMatch(JSON.stringify(log.entries), /secret password|reset-token|private conversation/);
});

test('missing SMTP and partial recipient rejection are recorded accurately', async () => {
  const log = setup();
  assert.equal(await log.sendLoggedMail(null, { subject: 'Feedback' }, 'admin-notification'), null);
  assert.equal(log.entries[0].event, 'skipped');
  await log.sendLoggedMail({ sendMail: async () => ({ accepted: ['a'], rejected: ['b'] }) }, { subject: 'Reply' }, 'feedback-reply');
  assert.equal(log.entries[2].event, 'partially-rejected');
  assert.equal(log.entries[2].acceptedCount, 1);
  assert.equal(log.entries[2].rejectedCount, 1);
});

test('logs rotate at five MiB and logging failure does not prevent SMTP delivery', async () => {
  const log = setup({ stat: async () => ({ size: 5 * 1024 * 1024 }) });
  await log.logEmailEvent({ event: 'test' });
  assert.equal(log.operations[0][0], 'rename');
  assert.ok(log.operations[0][2].endsWith('/logs/email.log.1'));
  const broken = setup({ mkdir: async () => { throw Object.assign(new Error(), { code: 'EACCES' }); } });
  let sent = false;
  await broken.sendLoggedMail({ sendMail: async () => { sent = true; return {}; } }, { subject: 'Reply' }, 'feedback-reply');
  assert.equal(sent, true);
  assert.equal(broken.warnings.length, 2);
});
