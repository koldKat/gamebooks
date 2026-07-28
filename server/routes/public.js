'use strict';

// Public (unauthenticated) route handlers: public profile/run lookups, plus
// (appended separately) the public SSR pages for book/anthology/series/profile/feed.

const fs   = require('fs');
const path = require('path');
const db   = require('../db');
const { ROOT } = require('../paths');
const { send, addSecurityHeaders } = require('../request-helpers');
const { escapeHtml, escapeJsonString } = require('../html-escape');

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

function servePublicBookPage(req, res, bookId) {
  const meta = db.getPublicBookMeta(bookId);
  const indexPath = path.join(ROOT, 'index.html');
  fs.readFile(indexPath, 'utf8', (err, html) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    if (!meta) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found');
    }

    const SITE = 'https://koldkat.net';
    const bookUrl  = `${SITE}/book/${bookId}`;
    const title    = `${meta.name} - Gamebook Tracker`;
    const desc     = meta.description
      ? meta.description.slice(0, 200)
      : `Track and map every branch of ${meta.name} across all your playthroughs on Gamebook Tracker.`;
    const imageUrl = meta.coverPath ? `${SITE}${meta.coverPath}` : `${SITE}/og-image.png`;
    const imageType = meta.coverPath ? 'image/jpeg' : 'image/png';

    const escape  = escapeHtml;
    const jsonEsc = escapeJsonString;

    // Build JSON-LD structured data
    const ldAuthors = meta.authors
      ? meta.authors.split(/[,;]+/).map(a => a.trim()).filter(Boolean)
          .map(a => `{"@type":"Person","name":"${jsonEsc(a)}"}`)
          .join(',')
      : null;
    const ldParts = [
      `"@context":"https://schema.org"`,
      `"@type":"Book"`,
      `"name":"${jsonEsc(meta.name)}"`,
      `"url":"${jsonEsc(bookUrl)}"`,
      meta.description ? `"description":"${jsonEsc(meta.description.slice(0, 500))}"` : null,
      ldAuthors        ? `"author":[${ldAuthors}]`                                     : null,
      meta.isbn        ? `"isbn":"${jsonEsc(meta.isbn)}"`                              : null,
      meta.issn        ? `"issn":"${jsonEsc(meta.issn)}"`                              : null,
      meta.pages       ? `"numberOfPages":${meta.pages}`                               : null,
      meta.coverPath   ? `"image":"${jsonEsc(SITE + meta.coverPath)}"`                 : null,
      `"publisher":{"@type":"Organization","name":"Gamebook Tracker","url":"${SITE}"}`,
    ].filter(Boolean).join(',');
    const jsonLd = `<script type="application/ld+json">{${ldParts}}</script>`;

    // Replace the default OG/Twitter block with book-specific tags
    const injected = html
      .replace(
        /<meta property="og:type"[\s\S]*?<meta property="og:locale"[^>]*>/,
        `<meta property="og:type"        content="book">
  <meta property="og:url"         content="${escape(bookUrl)}">
  <meta property="og:title"       content="${escape(title)}">
  <meta property="og:description" content="${escape(desc)}">
  <meta property="og:image"       content="${escape(imageUrl)}">
  <meta property="og:image:type"  content="${imageType}">
  <meta property="og:site_name"   content="Gamebook Tracker">
  <meta property="og:locale"      content="en_US">`
      )
      .replace(
        /<meta name="twitter:card"[\s\S]*?<meta name="twitter:image"[^>]*>/,
        `<meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:url"         content="${escape(bookUrl)}">
  <meta name="twitter:title"       content="${escape(title)}">
  <meta name="twitter:description" content="${escape(desc)}">
  <meta name="twitter:image"       content="${escape(imageUrl)}">`
      )
      .replace(
        /<link rel="canonical"[^>]*>/,
        `<link rel="canonical" href="${escape(bookUrl)}">`
      )
      .replace(
        /<title>[^<]*<\/title>/,
        `<title>${escape(title)}</title>`
      )
      .replace('</head>', `${jsonLd}\n</head>`);

    addSecurityHeaders(res);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(injected);
  });
}

// ── Public anthology SSR page ─────────────────────────────────────────────────

function servePublicAnthologyPage(req, res, anthologyId) {
  const meta = db.getPublicBookMeta(anthologyId);
  const indexPath = path.join(ROOT, 'index.html');
  fs.readFile(indexPath, 'utf8', (err, html) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    if (!meta || !meta.isContainer) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found');
    }

    const SITE         = 'https://koldkat.net';
    const pageUrl      = `${SITE}/anthology/${anthologyId}`;
    const title        = `${meta.name} - Gamebook Tracker`;
    const childCount   = (meta.children || []).length;
    const desc         = meta.description
      ? meta.description.slice(0, 200)
      : `${meta.name} - an anthology containing ${childCount} gamebook${childCount !== 1 ? 's' : ''}. Track every story on Gamebook Tracker.`;
    const imageUrl     = meta.coverUrl ? `${SITE}${meta.coverUrl}` : `${SITE}/og-image.png`;
    const imageType    = meta.coverUrl ? 'image/jpeg' : 'image/png';

    const escape  = escapeHtml;
    const jsonEsc = escapeJsonString;

    const ldAuthors = meta.authors
      ? meta.authors.split(/[,;]+/).map(a => a.trim()).filter(Boolean)
          .map(a => `{"@type":"Person","name":"${jsonEsc(a)}"}`)
          .join(',')
      : null;
    const ldParts = [
      `"@context":"https://schema.org"`,
      `"@type":"Book"`,
      `"name":"${jsonEsc(meta.name)}"`,
      `"url":"${jsonEsc(pageUrl)}"`,
      meta.description ? `"description":"${jsonEsc(meta.description.slice(0, 500))}"` : null,
      ldAuthors        ? `"author":[${ldAuthors}]`                                     : null,
      meta.isbn        ? `"isbn":"${jsonEsc(meta.isbn)}"`                              : null,
      meta.issn        ? `"issn":"${jsonEsc(meta.issn)}"`                              : null,
      meta.pages       ? `"numberOfPages":${meta.pages}`                               : null,
      meta.coverUrl    ? `"image":"${jsonEsc(SITE + meta.coverUrl)}"`                  : null,
      `"publisher":{"@type":"Organization","name":"Gamebook Tracker","url":"${SITE}"}`,
    ].filter(Boolean).join(',');
    const jsonLd = `<script type="application/ld+json">{${ldParts}}</script>`;

    const injected = html
      .replace(
        /<meta property="og:type"[\s\S]*?<meta property="og:locale"[^>]*>/,
        `<meta property="og:type"        content="book">
  <meta property="og:url"         content="${escape(pageUrl)}">
  <meta property="og:title"       content="${escape(title)}">
  <meta property="og:description" content="${escape(desc)}">
  <meta property="og:image"       content="${escape(imageUrl)}">
  <meta property="og:image:type"  content="${imageType}">
  <meta property="og:site_name"   content="Gamebook Tracker">
  <meta property="og:locale"      content="en_US">`
      )
      .replace(
        /<meta name="twitter:card"[\s\S]*?<meta name="twitter:image"[^>]*>/,
        `<meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:url"         content="${escape(pageUrl)}">
  <meta name="twitter:title"       content="${escape(title)}">
  <meta name="twitter:description" content="${escape(desc)}">
  <meta name="twitter:image"       content="${escape(imageUrl)}">`
      )
      .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${escape(pageUrl)}">`)
      .replace(/<title>[^<]*<\/title>/, `<title>${escape(title)}</title>`)
      .replace('</head>', `${jsonLd}\n</head>`);

    addSecurityHeaders(res);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(injected);
  });
}

// ── Public series SSR page ────────────────────────────────────────────────────

function servePublicSeriesPage(req, res, seriesId) {
  const data = db.getPublicSeriesInfo(seriesId);
  const indexPath = path.join(ROOT, 'index.html');
  fs.readFile(indexPath, 'utf8', (err, html) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    if (!data || !data.isPublic) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found');
    }

    const SITE      = 'https://koldkat.net';
    const pageUrl   = `${SITE}/series/${seriesId}`;
    const title     = `${data.name} - Series - Gamebook Tracker`;
    const bookCount = data.books.length;
    const desc      = data.description
      ? data.description.slice(0, 200)
      : `${data.name} - a gamebook series with ${bookCount} entr${bookCount !== 1 ? 'ies' : 'y'}. Track every book on Gamebook Tracker.`;

    const escape  = escapeHtml;
    const jsonEsc = escapeJsonString;

    const ldParts = [
      `"@context":"https://schema.org"`,
      `"@type":"BookSeries"`,
      `"name":"${jsonEsc(data.name)}"`,
      `"url":"${jsonEsc(pageUrl)}"`,
      data.description ? `"description":"${jsonEsc(data.description.slice(0, 500))}"` : null,
      bookCount > 0
        ? `"hasPart":[${data.books.map(b => `{"@type":"Book","name":"${jsonEsc(b.name)}","url":"${SITE}/book/${b.id}"}`).join(',')}]`
        : null,
      `"publisher":{"@type":"Organization","name":"Gamebook Tracker","url":"${SITE}"}`,
    ].filter(Boolean).join(',');
    const jsonLd = `<script type="application/ld+json">{${ldParts}}</script>`;

    const injected = html
      .replace(
        /<meta property="og:type"[\s\S]*?<meta property="og:locale"[^>]*>/,
        `<meta property="og:type"        content="website">
  <meta property="og:url"         content="${escape(pageUrl)}">
  <meta property="og:title"       content="${escape(title)}">
  <meta property="og:description" content="${escape(desc)}">
  <meta property="og:image"       content="${escape(SITE + '/og-image.png')}">
  <meta property="og:image:type"  content="image/png">
  <meta property="og:site_name"   content="Gamebook Tracker">
  <meta property="og:locale"      content="en_US">`
      )
      .replace(
        /<meta name="twitter:card"[\s\S]*?<meta name="twitter:image"[^>]*>/,
        `<meta name="twitter:card"        content="summary">
  <meta name="twitter:url"         content="${escape(pageUrl)}">
  <meta name="twitter:title"       content="${escape(title)}">
  <meta name="twitter:description" content="${escape(desc)}">
  <meta name="twitter:image"       content="${escape(SITE + '/og-image.png')}">`
      )
      .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${escape(pageUrl)}">`)
      .replace(/<title>[^<]*<\/title>/, `<title>${escape(title)}</title>`)
      .replace('</head>', `${jsonLd}\n</head>`);

    addSecurityHeaders(res);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(injected);
  });
}

// ── Public profile SSR page ───────────────────────────────────────────────────

function servePublicProfilePage(req, res, username) {
  const profile = db.getPublicProfile(decodeURIComponent(username));
  const indexPath = path.join(ROOT, 'index.html');
  fs.readFile(indexPath, 'utf8', (err, html) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    if (!profile) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found');
    }

    const SITE      = 'https://koldkat.net';
    const dn        = profile.displayName || profile.username;
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
      `"identifier":"${jsonEsc(profile.username)}"`,
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
  <meta property="profile:username" content="${escape(profile.username)}">`
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
      .replace('</head>', `${jsonLd}\n</head>`);

    addSecurityHeaders(res);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(injected);
  });
}

// ── Public feed SSR page ──────────────────────────────────────────────────────

function servePublicFeedPage(req, res) {
  const SITE    = 'https://koldkat.net';
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
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+|\/book\/\d+)\)/g, (_, label, target) =>
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
    const u  = escape(e.username);
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
  handlePublicUser, handlePublicRun, handlePublicSeriesRun,
  servePublicBookPage,
  servePublicAnthologyPage,
  servePublicSeriesPage,
  servePublicProfilePage,
  servePublicFeedPage,
};
