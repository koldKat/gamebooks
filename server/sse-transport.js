'use strict';

const MAX_QUEUED_BYTES = 256 * 1024;

function writeEvent(res, data) {
  if (res.destroyed || res.writableEnded) return false;
  if (res.writableLength + Buffer.byteLength(data) > MAX_QUEUED_BYTES) {
    res.destroy();
    return false;
  }
  try {
    res.write(data);
    return true;
  } catch {
    res.destroy();
    return false;
  }
}

function maintainStream(res, unregister, pingMs) {
  let closed = false;
  const ping = setInterval(() => writeEvent(res, ': ping\n\n'), pingMs);
  ping.unref();
  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(ping);
    unregister();
  };
  res.once('close', cleanup);
  res.once('error', () => { cleanup(); res.destroy(); });
  if (res.destroyed || res.writableEnded) cleanup();
}

module.exports = { writeEvent, maintainStream, MAX_QUEUED_BYTES };
