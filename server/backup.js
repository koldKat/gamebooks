'use strict';
const path       = require('path');
const fs         = require('fs');
const { execFile } = require('child_process');
const db         = require('./db');

const BACKUP_DIR  = path.join(__dirname, '..', 'backups');
const KEEP_HOURS  = 15 * 24; // keep 15 days of hourly backups
const INTERVAL_MS = 60 * 60 * 1000; // 1 hour

function pad(n) { return String(n).padStart(2, '0'); }

async function runBackup() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const now   = new Date();
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}h`;
  const snap  = path.join(BACKUP_DIR, `backup-${stamp}.sqlite`);
  const zip   = path.join(BACKUP_DIR, `backup-${stamp}.zip`);

  if (fs.existsSync(zip)) return; // already done this hour

  await db.backupDb(snap);

  try {
    await new Promise((resolve, reject) =>
      execFile('zip', ['-j', zip, snap], err => (err ? reject(err) : resolve()))
    );
  } finally {
    // Always clean up the raw snapshot, even if zipping failed - a transient
    // zip failure (e.g. disk pressure, the likeliest cause) used to leave a
    // junk .sqlite file behind, which only makes a disk-pressure problem
    // worse on every subsequent failed hourly attempt. The error itself still
    // propagates after this (finally doesn't swallow it), so start()'s
    // console.error still logs the failure.
    try { fs.unlinkSync(snap); } catch (_) {}
  }

  // Prune backups older than KEEP_HOURS
  const cutoff = Date.now() - KEEP_HOURS * 60 * 60 * 1000;
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

  console.log(`[backup] created ${zip}`);
}

function msUntilNextHour() {
  const now  = new Date();
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  return next - now;
}

function start() {
  // Run at startup
  runBackup().catch(e => console.error('[backup] startup run failed:', e));

  // Schedule hourly on the hour
  setTimeout(function tick() {
    runBackup().catch(e => console.error('[backup] scheduled run failed:', e));
    setTimeout(tick, INTERVAL_MS);
  }, msUntilNextHour());
}

module.exports = { start };
