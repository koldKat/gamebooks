'use strict';

const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { aton4, aton6 } = require('geoip-lite/lib/utils');

function createGeoLookup({ dataDir = path.join(path.dirname(require.resolve('geoip-lite/package.json')), 'data'),
  maxEntries = 512, refreshMs = 60_000 } = {}) {
  const files = new Map();
  const cache = new Map();
  let refreshedAt = 0;

  function reloadDataSync() {
    for (const file of files.values()) fs.closeSync(file.fd);
    files.clear();
    cache.clear();
    refreshedAt = Date.now();
  }

  function open(name, recordSize) {
    if (files.has(name)) return files.get(name);
    const fd = fs.openSync(path.join(dataDir, name), 'r');
    const size = fs.fstatSync(fd).size;
    if (!size || size % recordSize) {
      fs.closeSync(fd);
      throw new Error('Invalid GeoIP record file');
    }
    const file = { fd, size, recordSize, buffer: Buffer.alloc(recordSize) };
    files.set(name, file);
    return file;
  }

  function read(file, position) {
    if (position < 0 || position + file.recordSize > file.size ||
        fs.readSync(file.fd, file.buffer, 0, file.recordSize, position) !== file.recordSize) {
      throw new Error('Incomplete GeoIP record');
    }
    return file.buffer;
  }

  function find(ip, ipv6) {
    let file;
    try {
      open('geoip-city-names.dat', 88);
      file = open(ipv6 ? 'geoip-city6.dat' : 'geoip-city.dat', ipv6 ? 48 : 24);
    } catch {
      file = open(ipv6 ? 'geoip-country6.dat' : 'geoip-country.dat', ipv6 ? 34 : 10);
    }
    let low = 0, high = file.size / file.recordSize - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const row = read(file, mid * file.recordSize);
      // GeoIP city ranges index IPv6 by its first 64 bits, with 128-bit range slots.
      const first = ipv6 ? row.readBigUInt64BE(0) : row.readUInt32BE(0);
      const last = ipv6 ? row.readBigUInt64BE(16) : row.readUInt32BE(4);
      if (ip < first) { high = mid - 1; continue; }
      if (ip > last) { low = mid + 1; continue; }
      const offset = ipv6 ? 32 : 8;
      if (file.recordSize === (ipv6 ? 34 : 10)) {
        return Object.freeze({ country: row.toString('utf8', offset, offset + 2), city: '' });
      }
      const location = row.readUInt32BE(offset);
      if (location === 0xffffffff) return Object.freeze({ country: '', city: '' });
      const names = read(open('geoip-city-names.dat', 88), location * 88);
      const city = names.subarray(42, 88);
      const end = city.indexOf(0);
      return Object.freeze({ country: names.toString('utf8', 0, 2),
        city: city.toString('utf8', 0, end < 0 ? city.length : end) });
    }
    return null;
  }

  function lookup(address) {
    if (typeof address !== 'string') return null;
    address = address.replace(/^(?:::ffff:|0:0:0:0:0:ffff:)(?=\d+\.)/i, '');
    const version = net.isIP(address);
    if (!version) return null;
    if (Date.now() - refreshedAt >= refreshMs) reloadDataSync();
    if (cache.has(address)) {
      const value = cache.get(address);
      cache.delete(address);
      cache.set(address, value);
      return value;
    }
    let value = null;
    try {
      if (version === 4) {
        const ip = aton4(address);
        const privateIP = (ip >>> 24) === 10 || (ip >>> 20) === 0xac1 || (ip >>> 16) === 0xc0a8;
        if (!privateIP) value = find(ip, false);
      } else {
        const words = aton6(address);
        value = find((BigInt(words[0]) << 32n) | BigInt(words[1]), true);
      }
    } catch {
      // Location enrichment must never prevent authentication if data is unavailable/updating.
      value = null;
    }
    if (maxEntries > 0) {
      cache.set(address, value);
      if (cache.size > maxEntries) cache.delete(cache.keys().next().value);
    }
    return value;
  }

  return { lookup, reloadDataSync };
}

module.exports = { ...createGeoLookup(), createGeoLookup };
