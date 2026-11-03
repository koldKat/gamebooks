'use strict';
const path       = require('path');
const fs         = require('fs');
const { execFile } = require('child_process');
const db         = require('./db');
const { purgeDeletedFeedbackThreads } = require('./db/feedback');
const { cleanupFeedbackAttachments } = require('./feedback-cleanup');

const BACKUP_DIR  = path.join(__dirname, '..', 'backups');
const KEEP_DAYS = 30;

function pad(n) { return String(n).padStart(2, '0'); }

function pruneBackups() {
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  for (const file of fs.readdirSync(BACKUP_DIR)) {
    if (!file.startsWith('backup-') || !file.endsWith('.zip')) continue;
    const full = path.join(BACKUP_DIR, file);
    try {
      if (fs.statSync(full).mtimeMs < cutoff) {
        fs.unlinkSync(full);
        console.log(`\x1b[33m[backup] deleted ${full}\x1b[0m`);
      }
    } catch (_) {}
  }
}

async function runBackup() {
  purgeDeletedFeedbackThreads();
  try { await cleanupFeedbackAttachments(); }
  catch (error) { console.error('[feedback] attachment cleanup queued for retry:', error); }
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const now   = new Date();
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const snap  = path.join(BACKUP_DIR, `backup-${stamp}.sqlite`);
  const zip   = path.join(BACKUP_DIR, `backup-${stamp}.zip`);

  // Existing hourly archives also satisfy today's backup after the schedule change.
  const alreadyBackedUp = fs.readdirSync(BACKUP_DIR).some(file =>
    file === path.basename(zip) ||
    (file.startsWith(`backup-${stamp}_`) && file.endsWith('.zip'))
  );
  if (alreadyBackedUp) {
    pruneBackups();
    return;
  }

  await db.backupDb(snap);

  try {
    await new Promise((resolve, reject) =>
      execFile('zip', ['-j', zip, snap], err => (err ? reject(err) : resolve()))
    );
  } catch (error) {
    try { fs.unlinkSync(zip); } catch (_) {}
    throw error;
  } finally {
    // Remove raw snapshots even when compression fails; propagate the error.
    try { fs.unlinkSync(snap); } catch (_) {}
  }

  pruneBackups();
  console.log(`[backup] created ${zip}`);
}

function msUntilNextDay() {
  const now  = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next - now;
}

function start() {
  // Catch up on startup if today's backup does not exist.
  runBackup().catch(e => console.error('[backup] startup run failed:', e));

  // Recalculate local midnight each day, including daylight-saving changes.
  setTimeout(function tick() {
    runBackup().catch(e => console.error('[backup] scheduled run failed:', e));
    setTimeout(tick, msUntilNextDay());
  }, msUntilNextDay());
}

module.exports = { start, BACKUP_DIR };
