'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Transform, pipeline } = require('node:stream');
const { pipeline: pipelineAsync } = require('node:stream/promises');
const { createGzip } = require('node:zlib');

const tooLarge = () => Object.assign(new Error('Payload too large'), { code: 'PAYLOAD_TOO_LARGE' });

async function receiveUpload(req, destination, { maxBytes, validateFile }) {
  if (req.aborted || req.destroyed) throw Object.assign(new Error('Upload aborted'), { code: 'UPLOAD_ABORTED' });
  if (Number(req.headers['content-length']) > maxBytes) {
    req.resume();
    throw tooLarge();
  }
  const temporary = path.join(path.dirname(destination), `.upload-${randomUUID()}`);
  let bytes = 0;
  const limiter = new Transform({ transform(chunk, encoding, callback) {
    bytes += chunk.length;
    callback(bytes > maxBytes ? tooLarge() : null, chunk);
  } });
  const abort = () => limiter.destroy(Object.assign(new Error('Upload aborted'), { code: 'UPLOAD_ABORTED' }));
  const fail = error => limiter.destroy(error);
  req.once('aborted', abort);
  req.once('error', fail);
  try {
    const output = fs.createWriteStream(temporary, { flags: 'wx', mode: 0o600 });
    const finished = pipelineAsync(limiter, output);
    req.pipe(limiter);
    await finished;
    if (!bytes) throw Object.assign(new Error('Empty body'), { code: 'EMPTY_BODY' });
    if (!await validateFile(temporary)) throw Object.assign(new Error('Invalid file'), { code: 'INVALID_FILE' });
    await fs.promises.rename(temporary, destination);
    return bytes;
  } catch (error) {
    req.unpipe(limiter);
    if (!req.destroyed) req.resume();
    await fs.promises.rm(temporary, { force: true });
    throw error;
  } finally {
    req.removeListener('aborted', abort);
    req.removeListener('error', fail);
  }
}

function readFileHeader(filename, size = 512) {
  const fd = fs.openSync(filename, 'r');
  try {
    const header = Buffer.alloc(size);
    return header.subarray(0, fs.readSync(fd, header, 0, size, 0));
  } finally { fs.closeSync(fd); }
}

function isPdfFile(filename) {
  return readFileHeader(filename, 4).toString('ascii') === '%PDF';
}

function serveFile(req, res, filename, { headers, gzip = false, etagCache }) {
  fs.stat(filename, (error, stat) => {
    if (res.destroyed) return;
    if (error || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    const etag = `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}-${stat.ctimeMs.toString(16)}"`;
    if (etagCache) {
      etagCache.set(filename, { size: stat.size, etag });
      if (etagCache.size > 1024) etagCache.delete(etagCache.keys().next().value);
    }
    const responseHeaders = { ...headers, ETag: etag };
    if (gzip) responseHeaders.Vary = 'Accept-Encoding';
    if ((req.headers['if-none-match'] || '').split(/\s*,\s*/).some(tag => tag === '*' || tag.replace(/^W\//, '') === etag.replace(/^W\//, ''))) {
      res.writeHead(304, responseHeaders);
      return res.end();
    }
    const compress = gzip && stat.size > 1024 && acceptsGzip(req.headers['accept-encoding']);
    if (compress) responseHeaders['Content-Encoding'] = 'gzip';
    else responseHeaders['Content-Length'] = stat.size;
    if (req.method === 'HEAD') {
      res.writeHead(200, responseHeaders);
      return res.end();
    }
    const input = fs.createReadStream(filename);
    const closed = () => input.destroy();
    res.once('close', closed);
    input.once('error', () => {
      if (!res.headersSent && !res.destroyed) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
      }
    });
    input.once('open', () => {
      if (res.destroyed) return input.destroy();
      res.writeHead(200, responseHeaders);
      pipeline(input, ...(compress ? [createGzip()] : []), res, () => res.removeListener('close', closed));
    });
  });
}

function acceptsGzip(value = '') {
  const encodings = value.split(',').map(entry => {
    const [name, ...parameters] = entry.trim().toLowerCase().split(';');
    const quality = parameters.find(parameter => parameter.trim().startsWith('q='));
    return { name, quality: quality ? Number(quality.trim().slice(2)) : 1 };
  });
  return (encodings.find(entry => entry.name === 'gzip') || encodings.find(entry => entry.name === '*'))?.quality > 0;
}

module.exports = { receiveUpload, readFileHeader, isPdfFile, serveFile };
