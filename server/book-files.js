'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { BOOKS_DIR } = require('./paths');

// Keep saved download links working after files move into format folders.
// Static serving applies the same access rules to the resolved file.
function legacyBookDownload(urlPath, directory = BOOKS_DIR) {
  const match = /^\/books\/([^/\\]+\.(pdf))$/i.exec(urlPath);
  if (!match) return null;
  const target = path.join(directory, match[2].toLowerCase() + 's', match[1]);
  return fs.existsSync(target) ? target : null;
}

module.exports = { legacyBookDownload };
