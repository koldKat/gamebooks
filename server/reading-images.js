'use strict';

const fs = require('fs');
const path = require('path');
const { db } = require('./db/connection');
const books = require('./db');
const { authenticate, tokenFromReq, send, isLocalhostReal } = require('./request-helpers');

const DIRECTORY = path.join(__dirname, '..', 'reading-images');
const FILE_PATTERN = /^[a-f0-9]{64}\.(png|jpg|gif|webp)$/;
const MAX_BYTES = 256 * 1024;

function setReadingImageCookie(req, res) {
  const secure = req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `reading_image_session=${encodeURIComponent(tokenFromReq(req))}; Path=/api/books/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`);
}

async function handleReadingImage(req, res, bookId, filename) {
  if (!FILE_PATTERN.test(filename)) return send(res, 404, { error: 'not found' });
  const authenticatedRequest = Object.create(req);
  authenticatedRequest.headers = { ...req.headers };
  if (!tokenFromReq(req)) {
    const cookie = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('reading_image_session='));
    try {
      if (cookie) authenticatedRequest.headers.authorization = `Bearer ${decodeURIComponent(cookie.slice(22))}`;
    } catch (_) { return send(res, 401, { error: 'Unauthorized' }); }
  }
  if (!isLocalhostReal(req)) {
    const userId = await authenticate(authenticatedRequest, res);
    if (userId === null) return;
    if (!books._canLiveRead(userId)) return send(res, 403, { error: 'forbidden' });
    const access = books.readingAccess.getAccess(userId, bookId, false);
    if (!access) return send(res, 404, { error: 'not found' });
    if (access.locked) return send(res, 403, { error: 'reading_locked' });
  }
  const source = `/api/books/${bookId}/reading-images/${filename}`;
  if (!db.prepare('SELECT 1 FROM book_sections WHERE book_id = ? AND instr(html, ?) > 0 LIMIT 1').get(bookId, source)) {
    return send(res, 404, { error: 'not found' });
  }
  let data;
  try { data = await fs.promises.readFile(path.join(DIRECTORY, filename)); }
  catch (_) { return send(res, 404, { error: 'not found' }); }
  if (data.length > MAX_BYTES) return send(res, 500, { error: 'image exceeds size limit' });
  const extension = path.extname(filename).slice(1);
  res.writeHead(200, {
    'Content-Type': `image/${extension === 'jpg' ? 'jpeg' : extension}`,
    'Content-Length': data.length,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(data);
}

module.exports = { DIRECTORY, MAX_BYTES, FILE_PATTERN, setReadingImageCookie, handleReadingImage };
