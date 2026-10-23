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
  serveFile(req, res, filePath, { headers, gzip: gzipExts.has(ext), etagCache: getEtagCache() });
}

function serveSitemap(req, res) {
  const SITE = 'https://pathmap.net';
  const today = new Date().toISOString().slice(0, 10);
  let guideLastmod = today;
  try { guideLastmod = fs.statSync(path.join(ROOT, 'guide.html')).mtime.toISOString().slice(0, 10); } catch (_) {}
  const books       = db.getBooksForSitemap();
  const anthologies = db.getAnthologiesForSitemap();
  const series      = db.getSeriesForSitemap();
  const profiles    = db.getPublicProfilesForSitemap();
  const threads     = db.forumGetThreadsForSitemap();
  const categories  = db.forumGetCategories();

  const profileEntries = profiles.map(p =>
    `  <url>\n    <loc>${SITE}/user/${encodeURIComponent(p.username)}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>`
  ).join('\n');

  const bookEntries = books.map(b => {
    const lastmod = b.updated_at
      ? new Date(b.updated_at * 1000).toISOString().slice(0, 10)
      : today;
    return `  <url>\n    <loc>${SITE}/book/${b.id}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>`;
  }).join('\n');

  const anthologyEntries = anthologies.map(b => {
    const lastmod = b.updated_at
      ? new Date(b.updated_at * 1000).toISOString().slice(0, 10)
      : today;
    return `  <url>\n    <loc>${SITE}/anthology/${b.id}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.75</priority>\n  </url>`;
  }).join('\n');

  const seriesEntries = series.map(s => {
    const lastmod = s.created_at
      ? new Date(s.created_at * 1000).toISOString().slice(0, 10)
      : today;
    return `  <url>\n    <loc>${SITE}/series/${s.id}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.75</priority>\n  </url>`;
  }).join('\n');

  const categoryEntries = categories.map(c =>
    `  <url>\n    <loc>${SITE}/forum/c/${c.slug}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.65</priority>\n  </url>`
  ).join('\n');

  const threadEntries = threads.map(t => {
    const lastmod = t.last_post_at
      ? new Date(t.last_post_at * 1000).toISOString().slice(0, 10)
      : today;
    return `  <url>\n    <loc>${SITE}/forum/thread/${t.id}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${SITE}/guide.html</loc>
    <lastmod>${guideLastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>${SITE}/feed</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${SITE}/forum</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>
${profileEntries}
${bookEntries}
${anthologyEntries}
${seriesEntries}
${categoryEntries}
${threadEntries}
</urlset>`;

  addSecurityHeaders(res);
  res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
  res.end(xml);
}

module.exports = { serveStatic, serveSitemap };
