'use strict';

// Static file server (with etag/cache-control) + XML sitemap generation.

const fs   = require('fs');
const path = require('path');
const db   = require('./db');
const { ROOT } = require('./paths');
const { addSecurityHeaders } = require('./request-helpers');
const { getEtagCache, MIME } = require('./runtime-state');
const { serveFile } = require('./file-transfer');
const { legacyBookDownload } = require('./book-files');
const { escapeHtml } = require('./html-escape');
const { serveNotFoundPage, isDocumentNavigation } = require('./not-found');

function serveStatic(req, res) {
  const _spath  = req.url.split('?')[0];
  const urlPath = _spath === '/' ? '/index.html' : _spath;
  let filePath = path.join(ROOT, urlPath);
  if (!filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403); return res.end('Forbidden');
  }
  filePath = legacyBookDownload(urlPath) || filePath;
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  const cacheControl = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg', '.ico'].includes(ext)
    ? 'public, max-age=31536000, immutable' : 'no-cache';
  if (ext !== '.pdf') addSecurityHeaders(res);
  const headers = { 'Content-Type': mime, 'Cache-Control': cacheControl };
  if (ext === '.pdf') {
    headers['Content-Disposition'] = 'inline';
  } else if (urlPath.startsWith('/attachments/') && ['.zip', '.7z', '.rar', '.gz', '.tar'].includes(ext)) {
    headers['Content-Disposition'] = 'attachment';
  }
  const gzipExts = new Set(['.html', '.js', '.css', '.json', '.svg', '.xml', '.txt']);
  const isPage = !urlPath.startsWith('/api/') &&
    (isDocumentNavigation(req) || ext === '.html' || (!ext && !/^\/(?:covers|avatars|images|books|attachments|css|js|fonts)\//.test(urlPath)));
  serveFile(req, res, filePath, { headers, gzip: gzipExts.has(ext), etagCache: getEtagCache(),
    onNotFound: isPage ? serveNotFoundPage : undefined });
}

function serveRobots(req, res) {
  const covers = db.getPublicCoverPaths().map(name => 'Allow: /covers/' + name.split('/').map(encodeURIComponent).join('/') + '$');
  const text = ['User-agent: *', 'Allow: /', 'Disallow: /avatars/', 'Disallow: /covers/', 'Disallow: /api/', ...covers, '', 'Sitemap: https://pathmap.net/sitemap.xml', ''].join('\n');
  addSecurityHeaders(res);
  res.writeHead(200, {'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=300'});
  res.end(text);
}

function serveSitemap(req, res) {
  const SITE = 'https://pathmap.net';
  const entries = [];
  const add = (url, seconds) => {
    const date = Number(seconds) > 0 && Number(seconds) <= Date.now() / 1000 ? new Date(Number(seconds) * 1000) : null;
    const lastmod = date && Number.isFinite(date.getTime()) ? '<lastmod>' + date.toISOString().slice(0, 10) + '</lastmod>' : '';
    entries.push('  <url><loc>' + escapeHtml(SITE + url) + '</loc>' + lastmod + '</url>');
  };
  const modified = name => {try {return fs.statSync(path.join(ROOT, name)).mtimeMs / 1000;} catch {return null;}};
  add('/', modified('index.html'));
  add('/guide.html', modified('guide.html'));
  add('/catalogue');
  add('/catalogue?type=series');
  add('/feed');
  add('/forum');
  for (const profile of db.getPublicProfilesForSitemap()) add('/user/' + encodeURIComponent(profile.username));
  for (const book of db.getBooksForSitemap()) add('/book/' + book.id, book.updated_at);
  for (const book of db.getAnthologiesForSitemap()) add('/anthology/' + book.id, book.updated_at);
  // There is no reliable series/profile/category modification timestamp. Omit it.
  for (const series of db.getSeriesForSitemap()) add('/series/' + series.id);
  for (const category of db.forumGetCategories()) add('/forum/c/' + encodeURIComponent(category.slug));
  for (const thread of db.forumGetThreadsForSitemap()) add('/forum/thread/' + thread.id, thread.last_post_at);
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + entries.join('\n') + '\n</urlset>';
  addSecurityHeaders(res);
  res.writeHead(200, {'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600'});
  res.end(xml);
}

module.exports = { serveStatic, serveSitemap, serveRobots };
