'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIRECTORY = path.join(__dirname, '..', 'reading-images');
const TARGET_BYTES = 512000;
// Allow rare lossless originals above the target, with a bounded delivery size.
const MAX_BYTES = 8 * 1024 * 1024;
const DATA_IMAGE = /data:image\/(png|jpeg|jpg|gif|webp);base64,([A-Za-z0-9+/=\r\n]+)/g;

function bookImageDirectory(bookId, directory = DIRECTORY) {
  if (!Number.isSafeInteger(Number(bookId)) || Number(bookId) <= 0 || !/^\d+$/.test(String(bookId))) {
    throw new Error('Invalid reading image book ID');
  }
  return path.join(directory, String(Number(bookId)));
}

function storeImage(format, base64, bookId, directory = DIRECTORY) {
  directory = bookImageDirectory(bookId, directory);
  const data = Buffer.from(base64, 'base64');
  if (!data.length) throw new Error('Empty reading image');
  if (!/^(png|jpeg|jpg|gif|webp)$/.test(format)) throw new Error('Invalid reading image format');
  if (data.length > MAX_BYTES) throw new Error('Reading image exceeds the 8 MiB delivery limit');
  const extension = format === 'jpeg' ? 'jpg' : format;
  const filename = `${crypto.createHash('sha256').update(data).digest('hex')}.${extension}`;
  fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, filename);
  try { fs.writeFileSync(destination, data, { flag: 'wx' }); }
  catch (error) {
    if (error.code !== 'EEXIST' || !fs.readFileSync(destination).equals(data)) throw error;
  }
  return filename;
}

function externalizeImages(html, bookId, directory) {
  bookImageDirectory(bookId, directory);
  return html.replace(DATA_IMAGE, (_, format, base64) =>
    `/api/books/${Number(bookId)}/reading-images/${storeImage(format, base64, bookId, directory)}`);
}

module.exports = { DIRECTORY, TARGET_BYTES, MAX_BYTES, DATA_IMAGE, bookImageDirectory, storeImage, externalizeImages };
