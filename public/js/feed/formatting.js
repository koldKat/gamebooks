import { escapeHtml } from '../core/util.js';
import { t } from '../i18n.js';

// A cheap plain-text run preview for the feed's own won/lost/battle-death
// links, same idea (and same i18n keys) as the one on the public-profile run
// list - not the full vis-network run graph, which is only built on click.
export function _runTooltip(e) {
  const parts = [];
  if (e.pathLength) parts.push(t('pub.run_tooltip_sections', { n: e.pathLength, s: e.pathLength === 1 ? '' : 's' }));
  if (e.lastSection != null) parts.push(t('pub.run_tooltip_last', { n: e.lastSection }));
  if (e.completedAt) parts.push(new Date(e.completedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }));
  return parts.join(' · ');
}

// Negative runIndex = a preSeriesRuns entry (see getFeed() in server/db/feed.js),
// displayed as "run -N" matching play.js's own convention - no +1 offset for
// those, only genuine playthroughs indices (always >= 0) get the +1.
export function _runN(runIndex) {
  return runIndex < 0 ? runIndex : runIndex + 1;
}

// first_win/first_loss/first_battle_death share this - "series run N" when the
// completion happened as part of an open-world series run (isSeriesRun, set
// server-side from whether the underlying win_run/death_run/battle_run ref
// was series-scoped), plain "run N" otherwise - matches the wording already
// used for series_run_started/series_run_completed elsewhere in the feed.
export function _firstResultRunLabel(e) {
  if (e.runIndex == null) return '';
  const word = e.isSeriesRun ? t('feed.series_run_word') : t('feed.run_word');
  return ` <span class="feed-run">${word} ${_runN(e.runIndex)}</span>`;
}

export function _seriesTag(e) {
  return e.seriesIsPublic
    ? `<a href="/series/${e.seriesId}" class="feed-series-tag" data-series-id="${e.seriesId}" data-series-name="${escapeHtml(e.seriesName)}">${escapeHtml(e.seriesName)}</a>`
    : `<span class="feed-series-tag" style="cursor:default">${escapeHtml(e.seriesName)}</span>`;
}

const ANN_COLORS = {
  red: '#f87171', orange: '#fb923c', amber: '#fbbf24', green: '#4ade80',
  teal: '#2dd4bf', blue: '#60a5fa', purple: '#a78bfa', pink: '#f472b6',
};

// [Label](/book/123) or [Label](/series/45) is a relative in-app link, not a
// hardcoded absolute domain (this app is served from several domains -
// koldkat.net, pathmap.net, bookplay.net, etc. - a baked-in domain would
// resolve on the wrong one). Rendered without target=_blank; the
// click-interceptor below already resolves it to the current origin
// correctly since it's relative. Genuine external https:// links are
// untouched and still open in a new tab.
export function formatAnnBody(str) {
  return escapeHtml(str)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>')
    .replace(/__(.+?)__/g,     '<u>$1</u>')
    .replace(/~~(.+?)~~/g,     '<s>$1</s>')
    .replace(/\{color:(red|orange|amber|green|teal|blue|purple|pink)\}(.+?)\{\/color\}/g,
      (_, color, text) => `<span style="color:${ANN_COLORS[color]}">${text}</span>`)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+|\/book\/\d+|\/series\/\d+)\)/g, (_, label, target) =>
      target.startsWith('/')
        ? `<a href="${target}">${label}</a>`
        : `<a href="${target}" target="_blank" rel="noopener noreferrer">${label}</a>`);
}
