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
  if (!data.length) throw new Error('Empty reading image');
  if (format !== 'png' || data.length > MAX_BYTES) {
    let converted;
    for (const size of [null, 1800, 1500, 1200, 1000, 800, 600]) {
      for (const colors of [null, 256]) {
        const args = ['-n', '10', 'convert', '-[0]', '-auto-orient', '-strip'];
        if (size) args.push('-resize', `${size}x${size}>`);
        if (colors) args.push('-colors', String(colors));
        args.push('-define', 'png:compression-level=9', 'png:-');
        const result = spawnSync('nice', args, {
          input: data, maxBuffer: 32 * 1024 * 1024, timeout: 30000,
          env: { ...process.env, MAGICK_THREAD_LIMIT: '1' },
        });
        if (result.error || result.status !== 0) throw new Error(`Image conversion failed: ${result.error || result.stderr}`);
        if (result.stdout.length && result.stdout.length <= MAX_BYTES) { converted = result.stdout; break; }
      }
      if (converted) break;
    }
    if (!converted) throw new Error('Cannot fit reading image within 256 KB');
    data = converted;
  }
  const filename = `${crypto.createHash('sha256').update(data).digest('hex')}.png`;
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
