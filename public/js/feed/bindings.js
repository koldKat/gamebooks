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
      // The group label (rendered via renderGroupLabel) embeds each
      // member's clickable .feed-user-pub username directly inside this
      // button - a click there should open their profile only, not also
      // toggle the group. Bail here rather than stopPropagation()ing in the
      // username's own handler, so document-level click cleanup (context
      // menus etc.) still runs normally for that click.
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
  // An announcement can link a book or series via formatAnnBody()'s
  // [Label](/book/123) / [Label](/series/45) syntax - same real, crawlable
  // /book/:id and /series/:id pages used elsewhere (e.g. the no-JS feed SEO
  // page), but intercepted here so clicking it from inside the app opens
  // the in-app detail dialog instead of navigating away, same as
  // .feed-series-tag above.
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
