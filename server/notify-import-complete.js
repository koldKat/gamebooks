'use strict';

// Usage after successful offline finalization: node server/notify-import-complete.js BOOK_ID AUDIT_fixed.md
const fs = require('node:fs');
const path = require('node:path');

async function notifyImportComplete(bookId, auditPath) {
  if (!Number.isSafeInteger(bookId) || bookId <= 0 || !auditPath || !path.basename(auditPath).endsWith('_fixed.md')) {
    throw new Error('Provide a book ID and its completed _fixed.md audit');
  }
  const audit = fs.readFileSync(auditPath, 'utf8');
  if (!audit.startsWith(`# Book ${bookId} - `) || !/^Status: COMPLETE\b/m.test(audit) || /^- \[ \]/m.test(audit)) {
    throw new Error('Audit does not prove completion for this book');
  }
  const response = await fetch(`http://127.0.0.1:3000/api/admin/books/${bookId}/import-complete`, {
    method: 'POST', signal: AbortSignal.timeout(10000),
  });
  const result = await response.json();
  if (!response.ok || !result.ok || result.bookId !== bookId) {
    throw new Error(result.error || 'Import completion notification failed');
  }
  return result;
}

if (require.main === module) {
  notifyImportComplete(Number(process.argv[2]), process.argv[3])
    .then(result => console.log(JSON.stringify(result)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { notifyImportComplete };
