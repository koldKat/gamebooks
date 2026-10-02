import { escapeHtml } from '../core/util.js';
import { t } from '../i18n.js';
import { formatAnnBody } from './formatting.js';
import { createDayRenderer } from './groups.js';

export function renderFeedContents(entries, pinned, feedHeaderHtml) {
  const renderDayItems = createDayRenderer();
  const now       = new Date();
  const todayStr  = now.toDateString();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  const yestStr   = yesterday.toDateString();

  function dayLabel(ts) {
    const d = new Date(ts);
    const s = d.toDateString();
    if (s === todayStr)  return t('feed.day_today');
    if (s === yestStr)   return t('feed.day_yesterday');
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  // Group by day label (already sorted desc)
  const groups = [];
  let lastLabel = null;
  for (const e of entries) {
    const label = dayLabel(e.completedAt);
    if (label !== lastLabel) { groups.push({ label, items: [] }); lastLabel = label; }
    groups[groups.length - 1].items.push(e);
  }

  // Use distinct public books for day-card covers; never expose private-book art.
  function _dayCovers(items) {
    const counts = new Map(); // bookId -> { n, cover, firstIndex }
    let order = 0;
    for (const e of items) {
      if (!e.bookId || !e.bookIsPublic) continue;
      const cover = e.coverUrl || e.parentCoverUrl;
      if (!cover) continue;
      const cur = counts.get(e.bookId) || { n: 0, cover, firstIndex: order++ };
      cur.n++;
      counts.set(e.bookId, cur);
    }
    return [...counts.values()]
      .sort((a, b) => b.n - a.n || a.firstIndex - b.firstIndex)
      .map(c => c.cover);
  }

  let html = '';
  if (pinned) {
    html += `<div class="feed-pinned-card"><div class="feed-pinned-legend"><svg class="feed-pin-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>${escapeHtml(pinned.title)}</div><div class="feed-pinned-body">${formatAnnBody(pinned.body)}</div></div>`;
  }
  html += feedHeaderHtml;
  const _lastDayCoverLists = [];
  for (const g of groups) {
    const covers = _dayCovers(g.items);
    let attr = '';
    let stackHtml = '';
    let cardCls = 'feed-day-card';
    if (covers.length) {
      attr = ` data-day-index="${_lastDayCoverLists.length}"`;
      stackHtml = `<div class="feed-day-cover-stack"></div>`;
      _lastDayCoverLists.push(covers);
    } else {
      // Use the glass-card treatment when no eligible day cover exists.
      cardCls += ' feed-day-card--glass';
    }
    html += `<div class="${cardCls}"${attr}>${stackHtml}<div class="feed-day-content"><div class="feed-day-header">${g.label}</div>`;
    html += renderDayItems(g.items);
    html += `</div></div>`;
  }
  return { html, dayCoverLists: _lastDayCoverLists };
}
