'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const DIRECTORY = path.join(__dirname, '..', 'reading-images');
const MAX_BYTES = 256 * 1024;
const DATA_IMAGE = /data:image\/(png|jpeg|jpg|gif|webp);base64,([A-Za-z0-9+/=\r\n]+)/g;

function storeImage(format, base64, directory = DIRECTORY) {
  let data = Buffer.from(base64, 'base64');
  let extension = format === 'jpeg' ? 'jpg' : format;
  if (!data.length) throw new Error('Empty reading image');
  if (data.length > MAX_BYTES) {
    let converted;
    for (const size of [1800, 1500, 1200, 1000, 800]) {
      for (const quality of [90, 80, 70]) {
        const result = spawnSync('convert', ['-', '-auto-orient', '-strip', '-resize', `${size}x${size}>`, '-quality', String(quality), 'webp:-'], {
          input: data, maxBuffer: 32 * 1024 * 1024, timeout: 30000,
        });
        if (result.status !== 0) throw new Error(`Image conversion failed: ${result.stderr}`);
        if (result.stdout.length <= MAX_BYTES) { converted = result.stdout; break; }
      }
      if (converted) break;
    }
    if (!converted) throw new Error('Cannot fit reading image within 256 KB');
    data = converted;
    extension = 'webp';
  }
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
  return html.replace(DATA_IMAGE, (_, format, base64) =>
    `/api/books/${bookId}/reading-images/${storeImage(format, base64, directory)}`);
}

module.exports = { DIRECTORY, MAX_BYTES, DATA_IMAGE, storeImage, externalizeImages };
