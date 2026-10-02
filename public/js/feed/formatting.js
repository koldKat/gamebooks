import { escapeHtml } from '../core/util.js';
import { t } from '../i18n.js';

// Build lightweight run-preview tooltips; create the graph only on click.
export function _runTooltip(e) {
  const parts = [];
  if (e.pathLength) parts.push(t('pub.run_tooltip_sections', { n: e.pathLength, s: e.pathLength === 1 ? '' : 's' }));
  if (e.lastSection != null) parts.push(t('pub.run_tooltip_last', { n: e.lastSection }));
  if (e.completedAt) parts.push(new Date(e.completedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }));
  return parts.join(' · ');
}

// Negative pre-series run indices display unchanged; non-negative indices display +1.
export function _runN(runIndex) {
  return runIndex < 0 ? runIndex : runIndex + 1;
}

// Use series-run wording only when the server marks the achievement as series-scoped.
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

// Keep in-app links relative to the current origin; external links still open in a new tab.
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
