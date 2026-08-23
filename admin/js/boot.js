// Entry point: the global tooltip, tab-switching, and the initial page-load
// boot sequence. Every tab's own logic lives in its own admin/js/*.js module
// (imported here purely for their side effects - registering tab-click
// handlers - and the handful of load*() functions this file calls directly).
// To remove: this is the last file standing after every tab was extracted -
// removing it means reverting to an inline <script> in admin/index.html.

import { loadTips } from './tips.js?v=1467';
import { loadAdminAnthologies } from './anthologies.js?v=1467';
import { loadAdminSeries } from './series.js?v=1467';
import { loadFeedback } from './feedback.js?v=1467';
import { loadAnnouncements } from './announcements.js?v=1467';
import { loadInventory } from './inventory.js?v=1467';
import { loadTools, loadAll, loadLive, loadStats, loadAdminGc, loadAppSize } from './dashboard.js?v=1467';
// users-books.js has no exports this file calls directly, but its top-level
// code (gift modal DOM wiring, Users/Books sort-header + search self-wiring)
// must still run - imported transitively via dashboard.js's own import of it.

// ── Tooltip ───────────────────────────────────────────────────────────────────

(function () {
  const tip = document.getElementById('admin-tooltip');
  document.addEventListener('mouseover', e => {
    const el = e.target.closest('[data-tooltip]');
    tip.style.display = el ? 'block' : 'none';
    if (el) tip.textContent = el.dataset.tooltip;
  });
  document.addEventListener('mousemove', e => {
    if (tip.style.display === 'block') {
      tip.style.left = `${e.clientX + 14}px`;
      tip.style.top  = `${e.clientY + 18}px`;
    }
  });
  document.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
})();

// ── Tabs ──────────────────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'feedback')      loadFeedback();
    if (btn.dataset.tab === 'tools')         loadTools();
    if (btn.dataset.tab === 'announcements') loadAnnouncements();
    if (btn.dataset.tab === 'series')        loadAdminSeries();
    if (btn.dataset.tab === 'anthologies')   loadAdminAnthologies();
    if (btn.dataset.tab === 'tips')          loadTips();
    if (btn.dataset.tab === 'inventory')     loadInventory();
  });
});

// ── Boot ──────────────────────────────────────────────────────────────────────

loadAll();
loadLive();
setInterval(loadLive,    1000);
setInterval(loadStats,  60000);
setInterval(loadAdminGc, 60000);
setInterval(loadAppSize, 60000);
