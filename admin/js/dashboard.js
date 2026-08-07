// Stats cards (top of the Users tab) + Tools tab (SMTP, maintenance mode, app
// version, XP config, notepad, DB backups, size-ignore patterns) + the Live
// resource-usage poll (heap/RSS/CPU/traffic). loadAll() is the shared
// "refresh everything on the main view" entry point, which is why it needs to
// import loadUsers/loadBooks from users-books.js.
// To remove: delete this file and its <script type="module"> import in
// admin/index.html; remove the Stats cards and Tools tab HTML/CSS.

import { api, fmtBytes, fmtDuration, esc, showAlert, showConfirm, flashSaved } from './core.js?v=1';
import { loadUsers, loadBooks } from './users-books.js?v=6';

export function loadAll() { loadStats(); loadAdminGc(); loadUsers(); loadBooks(); loadAppSize(); }

// ── Main view - Stats ─────────────────────────────────────────────────────────

function fmtN(n) { return (n ?? 0).toLocaleString(); }

function applyStats(d) {
  function withTotal(n) {
    if (!d.totalSections) return fmtN(n);
    return `${fmtN(n)} <span class="pct">/ ${fmtN(d.totalSections)}</span> <span class="pct" style="color:#f5a623">(${Math.round(n / d.totalSections * 100)}%)</span>`;
  }
  document.getElementById('s-users').textContent      = fmtN(d.users);
  document.getElementById('s-books').textContent       = fmtN(d.books);
  document.getElementById('s-anthologies').textContent = fmtN(d.anthologies);
  document.getElementById('s-series').textContent      = fmtN(d.series);
  document.getElementById('s-pdfs').textContent        = fmtN(d.pdfCount);
  document.getElementById('s-sessions').textContent   = fmtN(d.sessions);
  document.getElementById('s-mapped').innerHTML       = withTotal(d.mappedSections);
  document.getElementById('s-discovered').innerHTML   = withTotal(d.discoveredSections);
  document.getElementById('s-pts-active').textContent = fmtN(d.activePlaythroughs);
  document.getElementById('s-pts-total').textContent  = fmtN(d.playthroughs);
  document.getElementById('s-wins').textContent         = fmtN(d.wins);
  document.getElementById('s-deaths').textContent       = fmtN(d.deaths);
  document.getElementById('s-dbsize').textContent       = fmtBytes(d.dbSize);
  document.getElementById('s-coins-earned').textContent = fmtN(d.totalCoinsEarned);
  document.getElementById('s-coins-avail').textContent  = fmtN(d.totalCoinsAvailable);
  document.getElementById('s-coins-spent').textContent   = fmtN(d.totalCoinsSpent);
  document.getElementById('s-uptime-pct').textContent    = d.uptimePct != null ? d.uptimePct.toFixed(2) + '%' : '-';
  document.getElementById('s-downtime').textContent      = fmtDuration(d.totalDowntimeS);
  const badge = document.getElementById('feedback-unread-badge');
  badge.textContent   = d.feedbackUnread > 0 ? String(d.feedbackUnread) : '';
  badge.style.display = d.feedbackUnread > 0 ? '' : 'none';
}

export async function loadStats() {
  try { applyStats(await api('GET', '/api/admin/stats')); }
  catch (e) { console.error('Stats:', e); }
}

export async function loadAdminGc() {
  try {
    const s = await api('GET', '/api/admin/gc-supply');
    document.getElementById('s-admin-gc-earned').textContent = fmtN(s.earned);
    document.getElementById('s-admin-gc-avail').textContent  = fmtN(s.available);
  } catch (e) { console.error('Admin GC:', e); }
}

document.getElementById('vacuum-btn').addEventListener('click', () => {
  showConfirm(
    'Vacuum the database? This rebuilds the file and reclaims unused space. The server will be briefly busy.',
    async () => {
      const btn = document.getElementById('vacuum-btn');
      btn.disabled = true;
      btn.textContent = 'Vacuuming…';
      try {
        applyStats(await api('POST', '/api/admin/vacuum'));
      } catch (e) {
        console.error('Vacuum:', e);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Vacuum Database';
      }
    },
    { label: 'Vacuum', variant: 'warn' },
  );
});

// ── Tools tab ──────────────────────────────────────────────────────────────────

function _applyMaintenanceToggle(on) {
  const cb = document.getElementById('maintenance-toggle');
  const lbl = document.getElementById('maintenance-label');
  cb.checked = on;
  cb.style.background = on ? '#dc2626' : '#374151';
  lbl.textContent = on ? 'ON - site is down for visitors' : 'Off';
  lbl.style.color = on ? '#f87171' : '#d1d5db';
}

export async function loadTools() {
  try {
    const s = await api('GET', '/api/admin/settings');
    document.getElementById('tools-version-input').value = s.app_version          ?? '';
    document.getElementById('tools-notepad').value       = s.notepad              ?? '';
    document.getElementById('tools-size-ignore').value   = s.size_ignore_patterns ?? '';
    document.getElementById('smtp-host').value           = s.smtp_host   ?? '';
    document.getElementById('smtp-port').value           = s.smtp_port   ?? '465';
    document.getElementById('smtp-user').value           = s.smtp_user   ?? '';
    document.getElementById('smtp-from').value           = s.smtp_from   ?? '';
    document.getElementById('smtp-app-url').value        = s.app_url     ?? '';
    document.getElementById('smtp-secure').checked       = s.smtp_secure === 'true';
    document.getElementById('smtp-pass-hint').textContent = s.smtp_pass_set ? '(set)' : '(not set)';
    const statusEl = document.getElementById('smtp-status');
    statusEl.textContent  = s.smtp_active ? 'active' : 'not configured';
    statusEl.style.color  = s.smtp_active ? '#6ee7b7' : '#6b7280';
    statusEl.style.background = s.smtp_active ? '#064e3b' : '#1f2937';
    _applyMaintenanceToggle(!!s.maintenance_mode);
  } catch (e) { console.error('Tools:', e); }
  await loadXpConfig();
  await loadBackups();
}

let _xpConfigData = [];
async function loadXpConfig() {
  try {
    const { config } = await api('GET', '/api/admin/xp-config');
    _xpConfigData = config;
    const table = document.getElementById('xp-config-table');
    // Remove old rows (keep header row - first 2 children)
    while (table.children.length > 2) table.removeChild(table.lastChild);
    for (const row of config) {
      const label = document.createElement('div');
      label.textContent = row.event;
      label.style.cssText = 'color:#d1d5db;font-family:monospace;font-size:0.78rem';
      const input = document.createElement('input');
      input.type = 'text';
      input.inputMode = 'numeric';
      input.value = row.amount;
      input.dataset.event = row.event;
      input.style.cssText = 'width:5rem;text-align:left;background:#111827;border:1px solid #374151;border-radius:4px;color:#d1d5db;padding:0.15rem 0.4rem;font-size:0.78rem';
      table.appendChild(input);
      table.appendChild(label);
    }
  } catch (e) { console.error('XP config:', e); }
}

async function loadBackups() {
  const emptyEl = document.getElementById('backups-empty');
  const listEl  = document.getElementById('backups-list');
  const totalEl = document.getElementById('backups-total');
  listEl.innerHTML  = '';
  emptyEl.style.display = '';
  emptyEl.textContent   = 'Loading…';
  totalEl.textContent   = '';
  document.getElementById('backups-delete-btn').disabled = true;
  document.getElementById('backups-select-all').textContent = 'Select all';
  try {
    const backups = await api('GET', '/api/admin/backups');
    if (!backups.length) {
      emptyEl.textContent = 'No backup files found.';
      return;
    }
    emptyEl.style.display = 'none';
    const totalBytes = backups.reduce((s, b) => s + b.size, 0);
    totalEl.textContent = `${backups.length} file${backups.length !== 1 ? 's' : ''} - ${fmtBytes(totalBytes)} total`;
    listEl.innerHTML = backups.map(b => `
      <div style="display:flex;align-items:center;gap:0.65rem;padding:0.38rem 0;border-bottom:1px solid #111827">
        <input type="checkbox" data-rel="${esc(b.rel)}" style="flex-shrink:0;cursor:pointer;accent-color:#f5a623;width:14px;height:14px">
        <div style="flex:1;min-width:0">
          <div style="font-size:0.85rem;color:#d1d5db;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(b.name)}</div>
          <div style="font-size:0.7rem;color:#4b5563;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(b.rel)}</div>
        </div>
        <div style="font-size:0.8rem;color:#6b7280;flex-shrink:0;font-variant-numeric:tabular-nums">${fmtBytes(b.size)}</div>
      </div>`).join('');
    listEl.querySelectorAll('input[type=checkbox]').forEach(cb =>
      cb.addEventListener('change', _updateBackupDeleteBtn));
    _updateBackupDeleteBtn();
  } catch (e) {
    emptyEl.textContent = 'Error loading backups.';
    console.error('Backups:', e);
  }
}

function _updateBackupDeleteBtn() {
  const n   = document.querySelectorAll('#backups-list input[type=checkbox]:checked').length;
  const btn = document.getElementById('backups-delete-btn');
  btn.disabled    = n === 0;
  btn.textContent = n > 0 ? `Delete selected (${n})` : 'Delete selected';
}

export async function loadAppSize() {
  try {
    const { bytes } = await api('GET', '/api/admin/appsize');
    document.getElementById('s-appsize').textContent = fmtBytes(bytes);
  } catch (e) {
    document.getElementById('s-appsize').textContent = 'Error';
    console.error('App size:', e);
  }
}

export async function loadLive() {
  try {
    const d = await api('GET', '/api/admin/live');
    document.getElementById('s-heap-used').textContent  = fmtBytes(d.heapUsed);
    document.getElementById('s-heap-total').textContent = fmtBytes(d.heapTotal);
    document.getElementById('s-rss').textContent        = fmtBytes(d.rss);
    document.getElementById('s-cpu').textContent             = d.cpuPct.toFixed(1) + '%';
    document.getElementById('s-session-uptime').textContent  = fmtDuration(d.sessionUptime);
    document.getElementById('s-app-age').textContent         = fmtDuration(d.appAge);
    document.getElementById('s-traffic-in').textContent  = fmtBytes(d.trafficIn);
    document.getElementById('s-traffic-out').textContent = fmtBytes(d.trafficOut);
  } catch (e) { console.error('Live:', e); }
}

document.getElementById('smtp-save-btn').addEventListener('click', async () => {
  const btn = document.getElementById('smtp-save-btn');
  btn.disabled = true;
  try {
    const fields = [
      { key: 'smtp_host',   id: 'smtp-host' },
      { key: 'smtp_port',   id: 'smtp-port' },
      { key: 'smtp_user',   id: 'smtp-user' },
      { key: 'smtp_from',   id: 'smtp-from' },
      { key: 'smtp_pass',   id: 'smtp-pass' },
      { key: 'app_url',     id: 'smtp-app-url' },
    ];
    for (const f of fields)
      await api('POST', '/api/admin/settings', { key: f.key, value: document.getElementById(f.id).value });
    await api('POST', '/api/admin/settings', { key: 'smtp_secure', value: document.getElementById('smtp-secure').checked ? 'true' : 'false' });
    document.getElementById('smtp-pass').value = '';
    flashSaved(document.getElementById('smtp-saved'));
    await loadTools();
  } catch (e) { showAlert('Failed to save SMTP settings.'); }
  btn.disabled = false;
});

document.getElementById('smtp-test-btn').addEventListener('click', async () => {
  const btn = document.getElementById('smtp-test-btn');
  const resultEl = document.getElementById('smtp-test-result');
  btn.disabled = true;
  resultEl.textContent = 'Sending…';
  resultEl.style.color = '#9ca3af';
  try {
    await api('POST', '/api/admin/smtp/test', {});
    resultEl.textContent = 'Test email sent ✓';
    resultEl.style.color = '#6ee7b7';
  } catch (e) {
    resultEl.textContent = e.message || 'Failed';
    resultEl.style.color = '#f87171';
  }
  btn.disabled = false;
});

document.getElementById('maintenance-toggle').addEventListener('change', async function() {
  const on = this.checked;
  _applyMaintenanceToggle(on);
  try {
    await api('POST', '/api/admin/settings', { key: 'maintenance_mode', value: on ? '1' : '0' });
    flashSaved(document.getElementById('maintenance-saved'));
  } catch (e) { showAlert('Failed to save maintenance mode.'); _applyMaintenanceToggle(!on); }
});

document.getElementById('tools-version-save').addEventListener('click', async () => {
  const btn = document.getElementById('tools-version-save');
  const val = document.getElementById('tools-version-input').value.trim();
  btn.disabled = true;
  try {
    await api('POST', '/api/admin/settings', { key: 'app_version', value: val });
    flashSaved(document.getElementById('tools-version-saved'));
  } catch (e) { showAlert('Failed to save version.'); }
  btn.disabled = false;
});

document.getElementById('xp-config-save').addEventListener('click', async () => {
  const btn = document.getElementById('xp-config-save');
  btn.disabled = true;
  try {
    const inputs = document.querySelectorAll('#xp-config-table input[data-event]');
    for (const input of inputs) {
      const amount = parseFloat(input.value);
      if (!isNaN(amount) && amount >= 0) {
        await api('POST', '/api/admin/xp-config', { event: input.dataset.event, amount });
      }
    }
    flashSaved(document.getElementById('xp-config-saved'));
  } catch (e) { showAlert('Failed to save XP config.'); }
  btn.disabled = false;
});

document.getElementById('tools-notepad-save').addEventListener('click', async () => {
  const btn = document.getElementById('tools-notepad-save');
  const val = document.getElementById('tools-notepad').value;
  btn.disabled = true;
  try {
    await api('POST', '/api/admin/settings', { key: 'notepad', value: val });
    flashSaved(document.getElementById('tools-notepad-saved'));
  } catch (e) { showAlert('Failed to save notepad.'); }
  btn.disabled = false;
});

let _backupsAllSelected = false;
document.getElementById('backups-select-all').addEventListener('click', () => {
  _backupsAllSelected = !_backupsAllSelected;
  document.querySelectorAll('#backups-list input[type=checkbox]').forEach(cb => {
    cb.checked = _backupsAllSelected;
  });
  document.getElementById('backups-select-all').textContent = _backupsAllSelected ? 'Deselect all' : 'Select all';
  _updateBackupDeleteBtn();
});

document.getElementById('backups-delete-btn').addEventListener('click', () => {
  const paths = [...document.querySelectorAll('#backups-list input[type=checkbox]:checked')]
    .map(cb => cb.dataset.rel);
  if (!paths.length) return;
  showConfirm(
    `Delete ${paths.length} backup file${paths.length !== 1 ? 's' : ''}? This cannot be undone.`,
    async () => {
      try {
        await api('DELETE', '/api/admin/backups', { paths });
        _backupsAllSelected = false;
        await loadBackups();
      } catch (e) { showAlert('Failed to delete backups.'); }
    },
    { label: 'Delete', variant: 'danger' },
  );
});

document.getElementById('tools-size-ignore-save').addEventListener('click', async () => {
  const btn = document.getElementById('tools-size-ignore-save');
  const val = document.getElementById('tools-size-ignore').value;
  btn.disabled = true;
  try {
    await api('POST', '/api/admin/settings', { key: 'size_ignore_patterns', value: val });
    flashSaved(document.getElementById('tools-size-ignore-saved'));
  } catch (e) { showAlert('Failed to save patterns.'); }
  btn.disabled = false;
});
