'use strict';

const { inflateRawSync } = require('node:zlib');

// Inspect the ZIP directory rather than searching compressed file bytes.
// Some readable EPUBs compress their mimetype entry or add a trailing newline.
function isEpub(buf) {
  try {
    if (buf.length < 22 || buf.readUInt32LE(0) !== 0x04034b50) return false;
    let end = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
      if (buf.readUInt32LE(i) === 0x06054b50 && i + 22 + buf.readUInt16LE(i + 20) === buf.length) {
        end = i;
        break;
      }
    }
    if (end < 0 || buf.readUInt16LE(end + 4) || buf.readUInt16LE(end + 6)) return false;
    const count = buf.readUInt16LE(end + 10);
    if (!count || count === 65535 || count !== buf.readUInt16LE(end + 8)) return false;
    const directorySize = buf.readUInt32LE(end + 12);
    const directoryStart = buf.readUInt32LE(end + 16);
    if (directoryStart + directorySize !== end) return false;
    let cursor = directoryStart;
    const required = new Map();
    for (let i = 0; i < count; i++) {
      if (cursor + 46 > end || buf.readUInt32LE(cursor) !== 0x02014b50) return false;
      const flags = buf.readUInt16LE(cursor + 8);
      const method = buf.readUInt16LE(cursor + 10);
      const packed = buf.readUInt32LE(cursor + 20);
      const size = buf.readUInt32LE(cursor + 24);
      const nameLen = buf.readUInt16LE(cursor + 28);
      const next = cursor + 46 + nameLen + buf.readUInt16LE(cursor + 30) + buf.readUInt16LE(cursor + 32);
      if (next > end || buf.readUInt16LE(cursor + 34)) return false;
      const name = buf.toString('utf8', cursor + 46, cursor + 46 + nameLen);
      if (name === 'mimetype' || name === 'META-INF/container.xml') {
        if (required.has(name) || (flags & 1) || ![0, 8].includes(method)) return false;
        const local = buf.readUInt32LE(cursor + 42);
        if (local + 30 > directoryStart || buf.readUInt32LE(local) !== 0x04034b50) return false;
        const localNameLen = buf.readUInt16LE(local + 26);
        const start = local + 30 + localNameLen + buf.readUInt16LE(local + 28);
        if (start + packed > directoryStart || buf.toString('utf8', local + 30, local + 30 + localNameLen) !== name ||
            buf.readUInt16LE(local + 8) !== method || buf.readUInt16LE(local + 6) !== flags) return false;
        // Bound decompression of metadata; never unpack the book's full contents.
        const limit = name === 'mimetype' ? 256 : 65536;
        if (!size || size > limit || packed > limit) return false;
        const payload = buf.subarray(start, start + packed);
        const data = method === 8 ? inflateRawSync(payload, { maxOutputLength: limit }) : payload;
        if (data.length !== size) return false;
        required.set(name, data.toString('utf8'));
      }
      cursor = next;
    }
    return cursor === end && required.get('mimetype')?.trim() === 'application/epub+zip' &&
      /<(?:(?:[\w.-]+):)?container\b/.test(required.get('META-INF/container.xml') || '') &&
      /<(?:(?:[\w.-]+):)?rootfile\b[^>]*\bfull-path\s*=\s*["'][^"']+["']/.test(required.get('META-INF/container.xml') || '');
  } catch {
    return false;
  }
}

module.exports = { isEpub };
