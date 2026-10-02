import { openPublicProfile, openPublicSeriesRun, openPublicRun } from '../account/public-profile.js';
import { openCoverActivity, openSeriesActivity } from '../covers.js';

export function bindFeedInteractions(el, _expandedKeys) {
  // Collapse toggles
  el.querySelectorAll('.feed-group-toggle').forEach(btn => {
    // Restore previously expanded state
    if (_expandedKeys.has(btn.dataset.groupKey)) {
      const target = document.getElementById(btn.dataset.target);
      if (target) { target.hidden = false; btn.setAttribute('aria-expanded', 'true'); btn.querySelector('.feed-group-chevron').textContent = '▼'; }
    }
    btn.addEventListener('click', e => {
      // Username clicks open profiles without toggling the group; leave document cleanup propagation intact.
      if (e.target.closest('.feed-user-pub')) return;
      const target = document.getElementById(btn.dataset.target);
      if (!target) return;
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!expanded));
      btn.querySelector('.feed-group-chevron').textContent = expanded ? '▶' : '▼';
      target.hidden = expanded;
    });
  });

  el.querySelectorAll('.feed-user-pub').forEach(btn => {
    btn.addEventListener('click', () => openPublicProfile(btn.dataset.username));
  });
  el.querySelectorAll('.feed-verb-pub').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.seriesRun === '1') openPublicSeriesRun(+btn.dataset.bookId, +btn.dataset.userId, +btn.dataset.runIndex, null);
      else openPublicRun(+btn.dataset.bookId, +btn.dataset.userId, +btn.dataset.runIndex, null);
    });
  });
  el.querySelectorAll('.feed-book-btn').forEach(btn => {
    btn.addEventListener('click', () => openCoverActivity(+btn.dataset.bookId, btn.dataset.bookName));
  });
  el.querySelectorAll('.feed-anthology-tag').forEach(a => {
    if (!a.dataset.anthologyId) return;
    a.addEventListener('click', e => { e.preventDefault(); openCoverActivity(+a.dataset.anthologyId, a.dataset.anthologyName); });
  });
  el.querySelectorAll('.feed-series-tag').forEach(a => {
    if (!a.dataset.seriesId) return;
    a.addEventListener('click', e => { e.preventDefault(); openSeriesActivity(+a.dataset.seriesId, a.dataset.seriesName); });
  });
  // Intercept book/series links to open detail dialogs while preserving crawlable URLs.
  el.querySelectorAll('.feed-ann-body a, .feed-pinned-body a').forEach(a => {
    let u;
    try { u = new URL(a.href); } catch { return; }
    if (u.origin !== location.origin) return;
    const bookM = u.pathname.match(/^\/book\/(\d+)$/);
    if (bookM) { a.addEventListener('click', e => { e.preventDefault(); openCoverActivity(+bookM[1], a.textContent); }); return; }
    const seriesM = u.pathname.match(/^\/series\/(\d+)$/);
    if (seriesM) { a.addEventListener('click', e => { e.preventDefault(); openSeriesActivity(+seriesM[1], a.textContent); }); return; }
  });

}
