'use strict';

// Record SMTP delivery outcomes without storing message bodies or credentials.
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const directory = path.join(__dirname, '..', 'logs');
const filename = path.join(directory, 'email.log');
let pending = Promise.resolve();

function logEmailEvent(details) {
  const entry = { at: new Date().toISOString() };
  for (const key of ['event', 'kind', 'attemptId', 'subject', 'to', 'messageId', 'code', 'command', 'reason']) {
    if (details[key] != null) entry[key] = String(details[key]).slice(0, 300);
  }
  for (const key of ['responseCode', 'acceptedCount', 'rejectedCount']) {
    if (Number.isFinite(details[key])) entry[key] = details[key];
  }
  pending = pending.then(async () => {
    await fs.mkdir(directory, { recursive: true });
    try {
      if ((await fs.stat(filename)).size >= 5 * 1024 * 1024) {
        await fs.rename(filename, filename + '.1');
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await fs.appendFile(filename, JSON.stringify(entry) + '\n', { mode: 0o600 });
  }).catch(error => {
    console.warn('[email-log] Could not write delivery log:', error.code || error.name);
  });
  return pending;
}

async function sendLoggedMail(transporter, mail, kind) {
  const details = { kind, attemptId: randomUUID(), subject: mail.subject, to: mail.to };
  if (!transporter) {
    await logEmailEvent({ ...details, event: 'skipped', reason: 'SMTP unavailable' });
    return null;
  }
  await logEmailEvent({ ...details, event: 'attempt' });
  try {
    const result = await transporter.sendMail(mail);
    await logEmailEvent({
      ...details,
      event: result?.rejected?.length ? 'partially-rejected' : 'accepted-by-smtp',
      messageId: result?.messageId,
      acceptedCount: result?.accepted?.length,
      rejectedCount: result?.rejected?.length,
    });
    return result;
  } catch (error) {
    await logEmailEvent({
      ...details, event: 'failed', code: error.code || error.name,
      responseCode: error.responseCode, command: error.command,
    });
    throw error;
  }
}

module.exports = { logEmailEvent, sendLoggedMail };
