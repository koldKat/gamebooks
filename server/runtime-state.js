'use strict';

// Process-lifetime runtime state: maintenance mode, traffic byte counters,
// CPU/memory rolling averages, uptime/session tracking, code/hardware stats.
// Exposed via accessor functions since this is mutable module-level state read
// and written from many places (the main request loop, the Router's inline admin
// endpoints, and routes/admin.js's stats/settings handlers) - not just here.

const fs = require('fs');
const os = require('os');
const db = require('./db');

// ── Maintenance mode ──────────────────────────────────────────────────────────
let _maintenanceMode = db.getAdminSetting('maintenance_mode') === '1';
let _maintenanceMessage = '';
function _rotateMaintenanceMessage() { _maintenanceMessage = db.getRandomMaintenanceMessage(); }
_rotateMaintenanceMessage();
setInterval(_rotateMaintenanceMessage, 60_000);

function getMaintenanceMode() { return _maintenanceMode; }
function setMaintenanceMode(v) { _maintenanceMode = v; }
function getMaintenanceMessage() { return _maintenanceMessage; }

function maintenanceHtml() {
  const msg = _maintenanceMessage || 'Back shortly.';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Maintenance</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#111827;color:#d1d5db;font-family:'Segoe UI',system-ui,sans-serif;
       display:flex;align-items:center;justify-content:center;min-height:100vh;padding:1.5rem}
  .card{background:#1f2937;border:1px solid #374151;border-radius:12px;
        max-width:420px;width:100%;padding:2.5rem 2rem;text-align:center}
  .icon{width:3rem;height:3rem;margin:0 auto 1rem;display:block}
  h1{font-size:1.4rem;font-weight:700;color:#f5a623;margin-bottom:0.6rem}
  #msg{font-size:0.95rem;color:#9ca3af;line-height:1.6;transition:opacity 0.4s}
  #msg.fade{opacity:0}
  .dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#4b5563;margin:0 2px;
       animation:pulse 1.4s ease-in-out infinite}
  .dot:nth-child(2){animation-delay:.2s}
  .dot:nth-child(3){animation-delay:.4s}
  @keyframes pulse{0%,80%,100%{opacity:.3}40%{opacity:1}}
</style>
</head>
<body>
<div class="card">
  <svg class="icon" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="2" y="2" width="28" height="28" rx="5" fill="#374151" stroke="#6b7280" stroke-width="1.5"/>
    <circle cx="10" cy="9"  r="2.2" fill="#f5a623"/>
    <circle cx="22" cy="9"  r="2.2" fill="#f5a623"/>
    <circle cx="10" cy="16" r="2.2" fill="#f5a623"/>
    <circle cx="22" cy="16" r="2.2" fill="#f5a623"/>
    <circle cx="10" cy="23" r="2.2" fill="#f5a623"/>
    <circle cx="22" cy="23" r="2.2" fill="#f5a623"/>
  </svg>
  <h1>Turn to section 503</h1>
  <p id="msg">${msg.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
  <p style="margin-top:1.2rem;font-size:0.8rem;color:#4b5563">
    Re-rolling
    <span class="dot"></span><span class="dot"></span><span class="dot"></span>
  </p>
</div>
<script>
  (function(){
    var PING_INTERVAL = 8000;
    var MSG_INTERVAL  = 60000;
    var msgEl = document.getElementById('msg');
    function check(){
      fetch('/api/ping', {cache:'no-store'})
        .then(function(r){ if(r.status !== 503) location.reload(); })
        .catch(function(){});
    }
    function rotateMsg(){
      fetch('/api/maintenance-message', {cache:'no-store'})
        .then(function(r){ return r.ok ? r.json() : null; })
        .then(function(d){
          if(!d || !d.message) return;
          msgEl.classList.add('fade');
          setTimeout(function(){
            msgEl.textContent = d.message;
            msgEl.classList.remove('fade');
          }, 400);
        })
        .catch(function(){});
    }
    setInterval(check, PING_INTERVAL);
    setInterval(rotateMsg, MSG_INTERVAL);
  })();
</script>
</body>
</html>`;
}

// ── Traffic counters ──────────────────────────────────────────────────────────
let _trafficIn  = Number(db.getAdminSetting('traffic_in'))  || 0;
let _trafficOut = Number(db.getAdminSetting('traffic_out')) || 0;
let _trafficDirty = 0;
const TRAFFIC_FLUSH_EVERY = 50;

const _etagCache = new Map(); // filePath -> { size, etag }

let _lastCpuTime  = Date.now();
let _lastCpuUsage = process.cpuUsage();

function flushTraffic() {
  db.setAdminSetting('traffic_in',  String(_trafficIn));
  db.setAdminSetting('traffic_out', String(_trafficOut));
}

// Called once per request (on 'finish') by the main request loop.
function recordTraffic(bytesIn, bytesOut) {
  _trafficIn  += bytesIn;
  _trafficOut += bytesOut;
  if (++_trafficDirty >= TRAFFIC_FLUSH_EVERY) { _trafficDirty = 0; flushTraffic(); }
}

function getTrafficStats() { return { trafficIn: _trafficIn, trafficOut: _trafficOut }; }

function getEtagCache() { return _etagCache; }

// ── Session-average metrics (Welford running mean, 1-second samples) ──────────
let _avgSampleCount = 0;
let _avgCpu      = 0;
let _avgHeapUsed = 0;
let _avgHeapTotal = 0;
let _avgRss      = 0;

// Shared by the setInterval sampler below and the on-demand /api/admin/live endpoint -
// both need "CPU % used since last sample" using the same running _lastCpuTime/_lastCpuUsage.
function sampleCpuPercent() {
  const now      = Date.now();
  const cpuNow   = process.cpuUsage();
  const elapsedUs = (now - _lastCpuTime) * 1000;
  const deltaCpuUs = (cpuNow.user - _lastCpuUsage.user) + (cpuNow.system - _lastCpuUsage.system);
  const cpu = elapsedUs > 0 ? Math.round(deltaCpuUs / (elapsedUs * os.cpus().length) * 1000) / 10 : 0;
  _lastCpuTime  = now;
  _lastCpuUsage = cpuNow;
  return cpu;
}

setInterval(() => {
  const cpu = sampleCpuPercent();
  const m = process.memoryUsage();
  _avgSampleCount++;
  const n = _avgSampleCount;
  _avgCpu       += (cpu        - _avgCpu)       / n;
  _avgHeapUsed  += (m.heapUsed  - _avgHeapUsed)  / n;
  _avgHeapTotal += (m.heapTotal - _avgHeapTotal) / n;
  _avgRss       += (m.rss       - _avgRss)       / n;
}, 1000);

function getResourceAverages() {
  return {
    avgCpu:       Math.round(_avgCpu * 10) / 10,
    avgHeapUsed:  Math.round(_avgHeapUsed),
    avgHeapTotal: Math.round(_avgHeapTotal),
    avgRss:       Math.round(_avgRss),
    avgSamples:   _avgSampleCount,
  };
}

// ── Uptime tracking ───────────────────────────────────────────────────────────
const _uptimeStart = Math.floor(Date.now() / 1000);
(function initUptimeTracking() {
  if (!db.getAdminSetting('server_first_tracked_at')) {
    db.setAdminSetting('server_first_tracked_at', String(_uptimeStart));
  }
  // On clean shutdown server_stopped_at is written; on crash fall back to last heartbeat
  const stoppedAt = parseInt(db.getAdminSetting('server_stopped_at') || '0');
  const lastHb    = parseInt(db.getAdminSetting('server_last_heartbeat') || '0');
  const ref        = stoppedAt > 0 ? stoppedAt : lastHb;
  const gap        = ref > 0 ? _uptimeStart - ref : 0;
  // Always accumulate whatever gap actually occurred, not just gaps over the
  // "real restart" threshold below - a crash-restart loop (the process dying and
  // immediately relaunching, e.g. under a supervisor, repeatedly for hours) produces
  // a series of individually-small gaps that each look like a trivial reload on their
  // own, but genuinely summed to real user-facing downtime. Discarding sub-5s gaps
  // entirely silently ate an entire multi-hour outage exactly this way - confirmed by
  // the process's real start time not matching what session-uptime reported.
  if (gap > 0) {
    const prevDowntime = parseInt(db.getAdminSetting('server_total_downtime_s') || '0');
    db.setAdminSetting('server_total_downtime_s', String(prevDowntime + gap));
  }
  if (gap > 5) {
    // Real restart - begin a new session. This threshold is deliberately kept (unlike
    // the downtime accumulation above) so a quick deploy reload doesn't reset the
    // "how long has this deployment been stable" session clock every time.
    db.setAdminSetting('server_session_start_at', String(_uptimeStart));
  } else if (!db.getAdminSetting('server_session_start_at')) {
    // First ever start
    db.setAdminSetting('server_session_start_at', String(_uptimeStart));
  }
  db.setAdminSetting('server_stopped_at', '0');
  db.setAdminSetting('server_last_heartbeat', String(_uptimeStart));
})();
const _sessionStartAt  = parseInt(db.getAdminSetting('server_session_start_at') || String(_uptimeStart));
const _appBirthAt      = db.getAppBirthTimestamp(); // MIN(created_at) across users + books
const _activeTagline   = db.getRandomTagline();
// 10s (was 30s) - tightens the maximum blind spot on any single gap measurement,
// including within a crash-restart loop where each cycle might not survive much longer
// than the old interval.
setInterval(() => {
  db.setAdminSetting('server_last_heartbeat', String(Math.floor(Date.now() / 1000)));
}, 10_000);

function getUptimeStart()     { return _uptimeStart; }
function getSessionStartAt()  { return _sessionStartAt; }
function getAppBirthAt()      { return _appBirthAt; }
function getActiveTagline()   { return _activeTagline; }

function _msUntil0130() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(1, 30, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next - now;
}
setTimeout(function _nightly() {
  db.purgeOldNotifications();
  db.purgeOldHeartbeats();
  db.walCheckpoint();
  setTimeout(_nightly, _msUntil0130());
}, _msUntil0130());

process.on('SIGINT',  () => { flushTraffic(); db.setAdminSetting('server_stopped_at', String(Math.floor(Date.now() / 1000))); process.exit(); });
process.on('SIGTERM', () => { flushTraffic(); db.setAdminSetting('server_stopped_at', String(Math.floor(Date.now() / 1000))); process.exit(); });

const APP_LAUNCH_EPOCH = Math.floor(new Date('2026-03-26T00:40:05Z').getTime() / 1000);

let _codeStats = { linesOfCode: 0, codeBytes: 0, jsModules: 0 };
(function computeCodeStats() {
  function walkJsFiles(dir) {
    let out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${entry.name}`;
      if (entry.isDirectory()) out = out.concat(walkJsFiles(p));
      else if (entry.name.endsWith('.js')) out.push(p);
    }
    return out;
  }
  try {
    const serverJsFiles = walkJsFiles('server');
    const publicJsFiles = walkJsFiles('public/js');
    const adminJsFiles  = walkJsFiles('admin/js');
    const files = [
      'server.js',
      ...serverJsFiles,
      ...publicJsFiles,
      ...adminJsFiles,
      ...fs.readdirSync('public/css').filter(f => f.endsWith('.css')).map(f => `public/css/${f}`),
      'public/index.html',
      'public/guide.html',
      ...fs.readdirSync('admin').filter(f => f.endsWith('.html')).map(f => `admin/${f}`),
    ];
    let lines = 0, bytes = 0;
    for (const f of files) {
      try { const c = fs.readFileSync(f, 'utf8'); lines += c.split('\n').length; bytes += Buffer.byteLength(c, 'utf8'); } catch (_) {}
    }
    _codeStats.linesOfCode = lines;
    _codeStats.codeBytes   = bytes;
    _codeStats.jsModules   = 1 + serverJsFiles.length + publicJsFiles.length + adminJsFiles.length;
  } catch (_) {}
})();

function getCodeStats() { return _codeStats; }

// No API exists to look up a CPU's release date - this is a manual lookup for the
// known deployment host. Update the entry if the hardware ever changes.
const CPU_RELEASE_DATES = {
  'i7-4785T': '2014-05-11',
};

function _serverHardwareInfo() {
  const cpus  = os.cpus();
  const model = cpus[0]?.model?.trim() || 'Unknown';
  // os.cpus()[i].speed reports the CURRENT running frequency, not the advertised
  // spec - parse the "@ X.XXGHz" suffix from the model string instead.
  const ghzMatch   = model.match(/@\s*([\d.]+)\s*GHz/i);
  const advertisedGhz = ghzMatch ? parseFloat(ghzMatch[1]) : null;
  const releaseKey = Object.keys(CPU_RELEASE_DATES).find(k => model.includes(k));
  const releaseDate = releaseKey ? CPU_RELEASE_DATES[releaseKey] : null;
  const ageYears = releaseDate
    ? Math.floor((Date.now() - new Date(releaseDate).getTime()) / (365.25 * 86400 * 1000))
    : null;
  // Trim registered/trademark marks and the trailing "CPU @ X.XXGHz" (already
  // shown in its own row) - the raw string is long enough to overflow the stats grid.
  const displayModel = model
    .replace(/\(R\)|\(TM\)/gi, '')
    .replace(/\s*CPU\s*@.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    cpuModel:      displayModel,
    cpuArch:       os.arch(),
    cpuGhz:        advertisedGhz,
    cpuAgeYears:   ageYears,
    cpuCores:      cpus.length,
    totalRamBytes: os.totalmem(),
  };
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg':  'image/svg+xml',
  '.pdf':  'application/pdf',
  '.txt':  'text/plain; charset=utf-8',
  '.xml':  'application/xml; charset=utf-8',
  '.csv':  'text/csv; charset=utf-8',
  '.md':   'text/markdown; charset=utf-8',
  '.zip':  'application/zip',
  '.7z':   'application/x-7z-compressed',
  '.rar':  'application/vnd.rar',
  '.gz':   'application/gzip',
  '.tar':  'application/x-tar',
  '.woff2': 'font/woff2',
  '.woff':  'font/woff',
};

module.exports = {
  getMaintenanceMode, setMaintenanceMode, getMaintenanceMessage, maintenanceHtml,
  recordTraffic, flushTraffic, getTrafficStats, getEtagCache,
  sampleCpuPercent, getResourceAverages,
  getUptimeStart, getSessionStartAt, getAppBirthAt, getActiveTagline,
  APP_LAUNCH_EPOCH, getCodeStats, _serverHardwareInfo,
  MIME,
};
