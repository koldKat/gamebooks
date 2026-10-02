// Admin startup, tooltips, and tab switching.

import { loadTips } from './tips.js';
import { loadAdminAnthologies } from './anthologies.js';
import { loadAdminSeries } from './series.js';
import { loadFeedback } from './feedback.js';
import { loadAnnouncements } from './announcements.js';
import { loadInventory } from './inventory.js';
import { loadTools, loadAll, loadLive, loadStats, loadAdminGc, loadAppSize } from './dashboard.js';
// dashboard.js imports users-books.js for its top-level event bindings.

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
