'use strict';

const fs = require('fs');
const path = require('path');
const { db } = require('./db/connection');
const { ATTACHMENTS_DIR } = require('./paths');

async function cleanupFeedbackAttachments(filenames) {
  const pending = filenames || db.prepare('SELECT filename FROM feedback_attachment_deletions').all().map(a => a.filename);
  const errors = [];
  for (const filename of new Set(pending)) {
    try {
      if (!filename || filename === '.' || filename === '..' || path.basename(filename) !== filename || filename.includes('\\')) {
        throw new Error('Invalid attachment filename');
      }
      // A file can still belong to another message; never remove that copy.
      if (!db.prepare('SELECT 1 FROM attachments WHERE filename = ? LIMIT 1').get(filename)) {
        try { await fs.promises.unlink(path.join(ATTACHMENTS_DIR, filename)); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      db.prepare('DELETE FROM feedback_attachment_deletions WHERE filename = ?').run(filename);
    } catch (error) { errors.push({ filename, error }); }
  }
  if (errors.length) throw new AggregateError(errors.map(e => e.error), 'Feedback attachment cleanup failed; queued for retry');
}

module.exports = { cleanupFeedbackAttachments };
