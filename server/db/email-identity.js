'use strict';

// Normalize account emails and enforce one owner for each nonempty address.
const EMAIL_INDEX = 'users_email_normalized_unique';

function normalizeEmail(email) {
  return email ? email.trim().toLowerCase() || null : null;
}

function emailTaken(db, email, exceptUserId = null) {
  const value = normalizeEmail(email);
  return !!value && !!db.prepare(`SELECT id FROM users
    WHERE lower(trim(email)) = ? AND (? IS NULL OR id != ?) LIMIT 1`)
    .get(value, exceptUserId, exceptUserId);
}

function initializeEmailIdentity(db) {
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ${EMAIL_INDEX}
    ON users(lower(trim(email))) WHERE email IS NOT NULL AND trim(email) != ''`);
}

function isDuplicateEmail(error) {
  return error?.code === 'SQLITE_CONSTRAINT_UNIQUE' && error.message.includes(EMAIL_INDEX);
}

module.exports = {normalizeEmail, emailTaken, initializeEmailIdentity, isDuplicateEmail};
