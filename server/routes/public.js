'use strict';

// Unauthenticated profile/run APIs and public SSR pages.

const fs   = require('fs');
const path = require('path');
const db   = require('../db');
const { ROOT } = require('../paths');
const { send, addSecurityHeaders } = require('../request-helpers');
const { escapeHtml, escapeJsonString } = require('../html-escape');
const { publicName } = require('../public-name');
const { renderPublicPage, renderCatalogue } = require('../public-seo');
const { serveNotFoundPage } = require('../not-found');

async function handlePublicUser(req, res, username) {
  const profile = db.getPublicProfile(decodeURIComponent(username));
  if (!profile) return send(res, 404, { error: 'Not found' });
  send(res, 200, profile);
}

async function handlePublicRun(req, res, bookId, userId, runIndex) {
  const data = db.getPublicRun(bookId, userId, runIndex);
  if (!data) return send(res, 404, { error: 'Not found' });
  send(res, 200, data);
}

async function handlePublicSeriesRun(req, res, seriesId, userId, runIndex) {
  const data = db.getPublicSeriesRun(seriesId, userId, runIndex);
  if (!data) return send(res, 404, { error: 'Not found' });
  send(res, 200, data);
}

function servePublicCataloguePage(req, res) {
  const query = new URL(req.url, 'http://localhost').searchParams;
  const pageText = query.get('page') || '1';
  const type = query.get('type') || 'books';
  if (!/^[1-9]\d*$/.test(pageText) || !Number.isSafeInteger(Number(pageText)) || !['books', 'series'].includes(type)) {
    return serveNotFoundPage(req, res);
  }
  const items = type === 'series' ? db.getAllPublicSeries() : db.getAllPublicBooks();
  const collator = new Intl.Collator('en', {numeric: true, sensitivity: 'base'});
  items.sort((a, b) => collator.compare(a.name, b.name) || a.id - b.id);
  const html = renderCatalogue(items, {type, page: Number(pageText)});
  if (!html) return serveNotFoundPage(req, res);
  addSecurityHeaders(res);
  res.writeHead(html ? 200 : 404, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300'});
  res.end(html || 'Not found');
}

function servePublicContentPage(req, res, meta, kind) {
  if (!meta || (kind === 'anthology' && !meta.isContainer)) {
    return serveNotFoundPage(req, res);
  }
  if (kind === 'book' && meta.isContainer) {
    res.writeHead(301, {Location: '/anthology/' + meta.id}); return res.end();
  }
  fs.readFile(path.join(ROOT, 'index.html'), 'utf8', (err, html) => {
    if (err) {res.writeHead(500, {'Content-Type': 'text/plain'}); return res.end('Unable to load page');}
    addSecurityHeaders(res);
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache'});
    res.end(renderPublicPage(html, meta, kind));
  });
}

function servePublicBookPage(req, res, bookId) {
  servePublicContentPage(req, res, db.getPublicBookMeta(bookId), 'book');
}

function servePublicAnthologyPage(req, res, anthologyId) {
  servePublicContentPage(req, res, db.getPublicBookMeta(anthologyId), 'anthology');
}

function servePublicSeriesPage(req, res, seriesId) {
  servePublicContentPage(req, res, db.getPublicSeriesInfo(seriesId), 'series');
}

// ── Public profile SSR page ───────────────────────────────────────────────────

function servePublicProfilePage(req, res, username) {
  const profile = db.getPublicProfile(decodeURIComponent(username));
  const indexPath = path.join(ROOT, 'index.html');
  fs.readFile(indexPath, 'utf8', (err, html) => {
    if (err) return serveNotFoundPage(req, res);
    if (!profile) {
      return serveNotFoundPage(req, res);
    }

    const SITE      = 'https://pathmap.net';
    const dn        = publicName(profile.displayName || profile.username);
    const profileUrl = `${SITE}/user/${encodeURIComponent(profile.username)}`;
    const title     = `${dn} - Gamebook Tracker`;
    const desc      = `${dn} is level ${profile.level} on Gamebook Tracker, tracking ${profile.totalBooks} gamebook${profile.totalBooks !== 1 ? 's' : ''}.`;
    const imageUrl  = profile.avatarUrl ? `${SITE}${profile.avatarUrl}` : `${SITE}/og-image.png`;
    const imageType = profile.avatarUrl ? 'image/jpeg' : 'image/png';

    const escape  = escapeHtml;
    const jsonEsc = escapeJsonString;

    const ldParts = [
      `"@context":"https://schema.org"`,
      `"@type":"Person"`,
      `"name":"${jsonEsc(dn)}"`,
      `"url":"${jsonEsc(profileUrl)}"`,
      `"identifier":"${jsonEsc(publicName(profile.username))}"`,
      profile.avatarUrl ? `"image":"${jsonEsc(SITE + profile.avatarUrl)}"` : null,
    ].filter(Boolean).join(',');
    const jsonLd = `<script type="application/ld+json">{${ldParts}}</script>`;

    const injected = html
      .replace(
        /<meta property="og:type"[\s\S]*?<meta property="og:locale"[^>]*>/,
        `<meta property="og:type"        content="profile">
  <meta property="og:url"         content="${escape(profileUrl)}">
  <meta property="og:title"       content="${escape(title)}">
  <meta property="og:description" content="${escape(desc)}">
  <meta property="og:image"       content="${escape(imageUrl)}">
  <meta property="og:image:type"  content="${imageType}">
  <meta property="og:site_name"   content="Gamebook Tracker">
  <meta property="og:locale"      content="en_US">
  <meta property="profile:username" content="${escape(publicName(profile.username))}">`
      )
      .replace(
        /<meta name="twitter:card"[\s\S]*?<meta name="twitter:image"[^>]*>/,
        `<meta name="twitter:card"        content="summary">
  <meta name="twitter:url"         content="${escape(profileUrl)}">
  <meta name="twitter:title"       content="${escape(title)}">
  <meta name="twitter:description" content="${escape(desc)}">
  <meta name="twitter:image"       content="${escape(imageUrl)}">`
      )
      .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${escape(profileUrl)}">`)
      .replace(/<title>[^<]*<\/title>/, `<title>${escape(title)}</title>`)
      .replace(/<meta name="description"[^>]*>/, () => `<meta name="description" content="${escape(desc)}">`)
      .replace('</head>', `${jsonLd}\n</head>`);

    addSecurityHeaders(res);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(injected);
  });
}

// ── Public feed SSR page ──────────────────────────────────────────────────────

function servePublicFeedPage(req, res) {
  const SITE    = 'https://pathmap.net';
  const escape     = escapeHtml;
  const ANN_COLORS = {
    red: '#f87171', orange: '#fb923c', amber: '#fbbf24', green: '#4ade80',
    teal: '#2dd4bf', blue: '#60a5fa', purple: '#a78bfa', pink: '#f472b6',
  };
  const fmtAnnBody = s => escape(s)
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
  const pinned  = db.getPinnedAnnouncement();
  const entries = db.getFeed();

  // Group entries by day label
  const now       = new Date();
  const todayStr  = now.toDateString();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  const yestStr   = yesterday.toDateString();
  function dayLabel(ts) {
    const d = new Date(ts);
    const s = d.toDateString();
    if (s === todayStr) return 'Today';
    if (s === yestStr)  return 'Yesterday';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  const groups = [];
  let lastLabel = null;
  for (const e of entries) {
    const label = dayLabel(e.completedAt);
    if (label !== lastLabel) { groups.push({ label, items: [] }); lastLabel = label; }
    groups[groups.length - 1].items.push(e);
  }

  function renderEntryText(e) {
    const u  = escape(publicName(e.displayName || e.username));
    const bk = e.bookId ? `<a class="fb" href="${SITE}/book/${e.bookId}">${escape(e.bookName)}</a>` : `<span class="fb">${escape(e.bookName)}</span>`;
    if (e.type === 'run_completed') {
      const verb = e.result === 'success' ? 'won' : e.result === 'battle' ? 'died' : 'lost';
      return `<span class="fu">${u}</span> <span class="fv fv-${verb}">${verb}</span> in ${bk} run ${e.runIndex + 1}`;
    }
    if (e.type === 'book_created')   return `<span class="fu">${u}</span> added book ${bk}`;
    if (e.type === 'run_started')    return `<span class="fu">${u}</span> began run ${e.runIndex + 1} of ${bk}`;
    if (e.type === 'series_run_started') {
      const sr = e.seriesName ? `<span class="feed-series-tag">${escape(e.seriesName)}</span>` : 'a series';
      return `<span class="fu">${u}</span> began series run ${e.runIndex + 1} in ${sr}`;
    }
    if (e.type === 'level_up') {
      const tmpl = db.getRandomLevelUpTemplate();
      return tmpl
        .replace('{name}',  `<span class="fu">${u}</span>`)
        .replace('{title}', `<span class="ft">${escape(e.levelTitle)}</span>`)
        .replace('{level}', `<span class="fl">level ${e.level}</span>`);
    }
    if (e.type === 'all_visited')    return `<span class="fu">${u}</span> visited every section of ${bk}`;
    if (e.type === 'all_discovered') return `<span class="fu">${u}</span> discovered every section of ${bk}`;
    if (e.type === 'announcement')   return `<div class="ann"><span class="ann-title">${escape(e.title)}</span><div class="ann-body">${fmtAnnBody(e.body)}</div></div>`;
    return '';
  }

  let feedHtml = '';
  if (pinned) {
    feedHtml += `<div class="pinned-card"><div class="pinned-legend">Pinned</div><div class="pinned-title">${escape(pinned.title)}</div><div class="pinned-body">${fmtAnnBody(pinned.body)}</div></div>`;
  }
  if (groups.length === 0 && !pinned) {
    feedHtml += `<p class="empty">No activity in the last 30 days.</p>`;
  }
  for (const g of groups) {
    feedHtml += `<div class="day-card"><div class="day-header">${escape(g.label)}</div>`;
    for (const e of g.items) {
      const body = renderEntryText(e);
      if (body) feedHtml += `<div class="entry">${body}</div>`;
    }
    feedHtml += `</div>`;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Activity Feed - Gamebook Tracker</title>
  <meta name="description" content="Live activity feed for Gamebook Tracker - see what players have been reading, completing, and discovering across hundreds of gamebooks in the last 30 days.">
  <link rel="canonical" href="${SITE}/feed">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <meta name="robots" content="index, follow">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #111827; color: #e5e7eb; font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace; font-size: 15px; line-height: 1.5; padding: 1.5rem 1rem 3rem; }
    a { color: #60a5fa; text-decoration: none; }
    a:hover { text-decoration: underline; }
    a:visited { color: #60a5fa; }
    .site-header { max-width: 680px; margin: 0 auto 1.5rem; border-bottom: 1px solid #374151; padding-bottom: 0.9rem; display: flex; align-items: baseline; gap: 1rem; flex-wrap: wrap; }
    .site-header h1 { font-size: 1.1rem; color: #f3f4f6; }
    .site-header .sub { font-size: 0.8rem; color: #9ca3af; }
    .back { font-size: 0.8rem; margin-left: auto; }
    .feed { max-width: 680px; margin: 0 auto; display: flex; flex-direction: column; gap: 0.6rem; }
    .pinned-card { border: 1.5px solid #f59e0b; border-radius: 7px; padding: 0.7rem 0.85rem 0.65rem; }
    .pinned-legend { font-size: 0.72rem; font-weight: 700; color: #f59e0b; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 0.35rem; }
    .pinned-title { font-size: 0.85rem; font-weight: 700; color: #f3f4f6; margin-bottom: 0.3rem; }
    .pinned-body { font-size: 0.85rem; color: #d1d5db; white-space: pre-wrap; word-break: break-word; line-height: 1.45; }
    .day-card { background: #1f2937; border-radius: 8px; overflow: hidden; }
    .day-header { background: #374151; padding: 0.35rem 0.75rem; font-size: 0.75rem; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.06em; }
    .entry { padding: 0.42rem 0.75rem; font-size: 0.82rem; border-top: 1px solid #374151; }
    .entry:first-of-type { border-top: none; }
    .fu { color: #60a5fa; font-weight: 600; }
    .fb { color: #34d399; }
    .fl { color: #a78bfa; font-weight: 600; }
    .ft { color: #a78bfa; }
    .fv { font-weight: 600; }
    .fv-won  { color: #34d399; }
    .fv-died { color: #f87171; }
    .fv-lost { color: #f87171; }
    .ann { }
    .ann-title { font-size: 0.75rem; font-weight: 700; color: #f59e0b; text-transform: uppercase; letter-spacing: 0.04em; display: block; margin-bottom: 0.2rem; }
    .ann-body { font-size: 0.82rem; color: #e5e7eb; white-space: pre-wrap; word-break: break-word; line-height: 1.45; }
    .empty { color: #6b7280; font-size: 0.85rem; }
  </style>
</head>
<body>
  <header class="site-header">
    <h1>Gamebook Tracker</h1>
    <span class="sub">Activity - last 30 days</span>
    <a class="back" href="${SITE}/">&#8592; Open app</a>
  </header>
  <main class="feed">
    ${feedHtml}
  </main>
</body>
</html>`;

  addSecurityHeaders(res);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' });
  res.end(html);
}

module.exports = {
  servePublicCataloguePage,
  handlePublicUser, handlePublicRun, handlePublicSeriesRun,
  servePublicBookPage,
  servePublicAnthologyPage,
  servePublicSeriesPage,
  servePublicProfilePage,
  servePublicFeedPage,
};
