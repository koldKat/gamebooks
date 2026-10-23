'use strict';

const { createHash } = require('node:crypto');

function createBulkGcGifts({ db, getSupply, computeLevel, gift }) {
  function preview(coinsPerLevel, appBirthAt) {
    if (!Number.isSafeInteger(coinsPerLevel) || coinsPerLevel < 1) return { error: 'invalid_rate' };
    const users = db.prepare('SELECT id,xp FROM users ORDER BY id').all();
    const recipients = users.map(user => ({ id: user.id, amount: computeLevel(user.xp) * coinsPerLevel }))
      .filter(user => user.amount > 0);
    const total = recipients.reduce((sum, user) => sum + user.amount, 0);
    if (!Number.isSafeInteger(total) || recipients.some(user => !Number.isSafeInteger(user.amount))) return { error: 'invalid_rate' };
    return { coinsPerLevel, total, recipients: recipients.length, zeroLevelUsers: users.length - recipients.length,
      available: getSupply(appBirthAt).available,
      previewHash: createHash('sha256').update(JSON.stringify([coinsPerLevel, recipients])).digest('hex'),
      users: recipients };
  }

  const send = db.transaction((input, appBirthAt) => {
    const { coinsPerLevel, message = '', requestId, previewHash } = input;
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(requestId)
      || typeof message !== 'string' || message.length > 1000) return { error: 'invalid_request' };
    const key = 'gc_bulk_gift:' + requestId;
    const previous = db.prepare('SELECT value FROM admin_settings WHERE key=?').get(key);
    if (previous) {
      const saved = JSON.parse(previous.value);
      if (saved.coinsPerLevel !== coinsPerLevel || saved.message !== message || saved.previewHash !== previewHash) return { error: 'request_conflict' };
      return { ...saved.result, repeated: true };
    }
    const plan = preview(coinsPerLevel, appBirthAt);
    if (plan.error) return plan;
    if (plan.previewHash !== previewHash) return { error: 'preview_changed' };
    if (!plan.recipients) return { error: 'no_recipients' };
    if (plan.total > plan.available) return { error: 'insufficient_supply', available: plan.available };
    for (const user of plan.users) {
      if (!gift(user.id, user.amount, message.trim() || null)) throw Error('Gift recipient disappeared');
    }
    const result = { ok: true, total: plan.total, recipients: plan.recipients,
      available: plan.available - plan.total, userIds: plan.users.map(user => user.id) };
    db.prepare('INSERT INTO admin_settings(key,value) VALUES(?,?)').run(key,
      JSON.stringify({ coinsPerLevel, message, previewHash, result }));
    return result;
  });
  return { preview, send: (input, appBirthAt) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'invalid_request' };
    return send.immediate(input, appBirthAt);
  } };
}

module.exports = { createBulkGcGifts };
