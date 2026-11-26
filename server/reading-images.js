'use strict';

const fs = require('fs');
const path = require('path');
const { db } = require('./db/connection');
const books = require('./db');
const { authenticate, tokenFromReq, send, isLocalhostReal } = require('./request-helpers');

const { DIRECTORY, MAX_BYTES } = require('./reading-image-storage');
const FILE_PATTERN = /^[a-f0-9]{64}\.(png|jpg|gif|webp)$/;

function setReadingImageCookie(req, res) {
  const secure = req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `reading_image_session=${encodeURIComponent(tokenFromReq(req))}; Path=/api/books/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`);
}

function resolveReadingImageAlias(html, bookId, filename) {
  const prefix = `/api/books/${bookId}/reading-images/`;
  for (const [image] of String(html || '').matchAll(/<img\b[^>]*>/gi)) {
    const alias = /\sdata-reading-image-alias=["']([^"']+)["']/i.exec(image);
    if (alias?.[1] !== prefix + filename) continue;
    const source = /\ssrc=["']([^"']+)["']/i.exec(image)?.[1];
    if (!source?.startsWith(prefix)) return null;
    const target = source.slice(prefix.length);
    return FILE_PATTERN.test(target) && target !== filename ? target : null;
  }
  return null;
}

async function handleReadingImage(req, res, bookId, filename) {
  if (!Number.isSafeInteger(bookId) || bookId <= 0 || !FILE_PATTERN.test(filename)) return send(res, 404, { error: 'not found' });
  const authenticatedRequest = Object.create(req);
  authenticatedRequest.headers = { ...req.headers };
  if (!tokenFromReq(req)) {
    const cookie = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('reading_image_session='));
    try {
      if (cookie) authenticatedRequest.headers.authorization = `Bearer ${decodeURIComponent(cookie.slice(22))}`;
    } catch (_) { return send(res, 401, { error: 'Unauthorized' }); }
  }
  let locked = false;
  if (!isLocalhostReal(req) || !books.readingAccess.canRead(null, bookId)) {
    const userId = await authenticate(authenticatedRequest, res);
    if (userId === null) return;
    if (!books._canLiveRead(userId)) return send(res, 403, { error: 'forbidden' });
    const access = books.readingAccess.getAccess(userId, bookId, false);
    if (!access) return send(res, 404, { error: 'not found' });
    locked = access.locked;
  }
  const source = `/api/books/${bookId}/reading-images/${filename}`;
  const inMatter = db.prepare(`SELECT 1 FROM book_frontmatter WHERE book_id = ?
    AND (instr(intro_text, ?) > 0 OR instr(rules_text, ?) > 0)`).get(bookId, source, source);
  // Locked previews may show player matter, never section-only artwork.
  if (locked && !inMatter) return send(res, 403, { error: 'reading_locked' });
  if (!inMatter && !db.prepare('SELECT 1 FROM book_sections WHERE book_id = ? AND instr(html, ?) > 0 LIMIT 1').get(bookId, source)) {
    return send(res, 404, { error: 'not found' });
  }
  let data, resolvedFilename = filename;
  try {
    try { data = await fs.promises.readFile(path.join(DIRECTORY, String(bookId), filename)); }
    catch (error) {
      // Legacy fallback permits a staged migration without changing protected URLs.
      if (error.code !== 'ENOENT') throw error;
      const document = db.prepare(`SELECT COALESCE(intro_text, '') || COALESCE(rules_text, '') AS html
        FROM book_frontmatter WHERE book_id = ? AND (instr(intro_text, ?) > 0 OR instr(rules_text, ?) > 0)
        UNION ALL SELECT html FROM book_sections WHERE book_id = ? AND instr(html, ?) > 0 LIMIT 1`)
        .get(bookId, source, source, bookId, source);
      const alias = resolveReadingImageAlias(document?.html, bookId, filename);
      if (alias) {
        resolvedFilename = alias;
        data = await fs.promises.readFile(path.join(DIRECTORY, String(bookId), alias));
      } else {
        data = await fs.promises.readFile(path.join(DIRECTORY, filename));
      }
    }
  }
  catch (_) { return send(res, 404, { error: 'not found' }); }
  if (data.length > MAX_BYTES) return send(res, 500, { error: 'image exceeds size limit' });
  const extension = path.extname(resolvedFilename).slice(1);
  res.writeHead(200, {
    'Content-Type': `image/${extension === 'jpg' ? 'jpeg' : extension}`,
    'Content-Length': data.length,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(data);
}

module.exports = { DIRECTORY, MAX_BYTES, FILE_PATTERN, setReadingImageCookie, resolveReadingImageAlias, handleReadingImage };
