// Admin startup, tooltips, and tab switching.

import { loadTips } from './tips.js';
import { loadAdminAnthologies } from './anthologies.js';
import { loadAdminSeries } from './series.js';
import { loadFeedback } from './feedback.js';
import { loadAnnouncements } from './announcements.js';
import { loadInventory } from './inventory.js';
import { loadTools, loadAll, loadActiveTab, registerTabLoaders, loadLive, loadStats, loadAdminGc, loadAppSize } from './dashboard.js';
// dashboard.js imports users-books.js for its top-level event bindings.

(function () {
  const tip = document.getElementById('admin-tooltip');
  const position = e => {
    tip.style.left = `${Math.max(12, Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 12))}px`;
    tip.style.top = `${Math.max(12, Math.min(e.clientY + 18, window.innerHeight - tip.offsetHeight - 12))}px`;
  };
  document.addEventListener('mouseover', e => {
    const el = e.target.closest('[data-tooltip]');
    tip.style.display = el ? 'block' : 'none';
    if (el) { tip.textContent = el.dataset.tooltip; position(e); }
  });
  document.addEventListener('mousemove', e => {
    if (tip.style.display === 'block') {
      position(e);
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
    loadActiveTab();
  });
});

// ── Boot ──────────────────────────────────────────────────────────────────────

registerTabLoaders({ series: loadAdminSeries, anthologies: loadAdminAnthologies, tips: loadTips, inventory: loadInventory, feedback: loadFeedback, announcements: loadAnnouncements, tools: loadTools });
loadAll();
loadLive();
const pollVisible = callback => () => { if (!document.hidden) callback(); };
setInterval(pollVisible(loadLive),    1000);
setInterval(pollVisible(loadStats),  60000);
setInterval(pollVisible(loadAdminGc), 60000);
setInterval(pollVisible(loadAppSize), 60000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  loadLive();
  loadStats();
  loadAdminGc();
  loadAppSize();
});
