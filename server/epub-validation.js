'use strict';

const { inflateRawSync } = require('node:zlib');
const fs = require('node:fs');

// Inspect the ZIP directory rather than searching compressed file bytes.
// Some readable EPUBs compress their mimetype entry or add a trailing newline.
function validateEpub(read, length) {
  try {
    if (length < 22 || read(0, 4).readUInt32LE(0) !== 0x04034b50) return false;
    const tailStart = Math.max(0, length - 65557);
    const tail = read(tailStart, length - tailStart);
    let end = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50 && i + 22 + tail.readUInt16LE(i + 20) === tail.length) {
        end = i;
        break;
      }
    }
    if (end < 0 || tail.readUInt16LE(end + 4) || tail.readUInt16LE(end + 6)) return false;
    const count = tail.readUInt16LE(end + 10);
    if (!count || count === 65535 || count !== tail.readUInt16LE(end + 8)) return false;
    const directorySize = tail.readUInt32LE(end + 12);
    const directoryStart = tail.readUInt32LE(end + 16);
    end += tailStart;
    if (directoryStart + directorySize !== end) return false;
    let cursor = directoryStart;
    const required = new Map();
    for (let i = 0; i < count; i++) {
      if (cursor + 46 > end) return false;
      const row = read(cursor, 46);
      if (row.readUInt32LE(0) !== 0x02014b50) return false;
      const flags = row.readUInt16LE(8);
      const method = row.readUInt16LE(10);
      const packed = row.readUInt32LE(20);
      const size = row.readUInt32LE(24);
      const nameLen = row.readUInt16LE(28);
      const next = cursor + 46 + nameLen + row.readUInt16LE(30) + row.readUInt16LE(32);
      if (next > end || row.readUInt16LE(34)) return false;
      const name = read(cursor + 46, nameLen).toString('utf8');
      if (name === 'mimetype' || name === 'META-INF/container.xml') {
        if (required.has(name) || (flags & 1) || ![0, 8].includes(method)) return false;
        const local = row.readUInt32LE(42);
        if (local + 30 > directoryStart) return false;
        const header = read(local, 30);
        if (header.readUInt32LE(0) !== 0x04034b50) return false;
        const localNameLen = header.readUInt16LE(26);
        const start = local + 30 + localNameLen + header.readUInt16LE(28);
        if (start + packed > directoryStart || read(local + 30, localNameLen).toString('utf8') !== name ||
            header.readUInt16LE(8) !== method || header.readUInt16LE(6) !== flags) return false;
        // Bound decompression of metadata; never unpack the book's full contents.
        const limit = name === 'mimetype' ? 256 : 65536;
        if (!size || size > limit || packed > limit) return false;
        const payload = read(start, packed);
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

function isEpub(buf) {
  return validateEpub((offset, length) => {
    if (offset < 0 || offset + length > buf.length) throw new Error('Invalid ZIP offset');
    return buf.subarray(offset, offset + length);
  }, buf.length);
}

function isEpubFile(filename) {
  let fd;
  try {
    fd = fs.openSync(filename, 'r');
    const size = fs.fstatSync(fd).size;
    return validateEpub((offset, length) => {
      if (offset < 0 || offset + length > size || length > 65557) throw new Error('Invalid ZIP offset');
      const data = Buffer.alloc(length);
      if (fs.readSync(fd, data, 0, length, offset) !== length) throw new Error('Truncated ZIP');
      return data;
    }, size);
  } catch {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

module.exports = { isEpub, isEpubFile };
