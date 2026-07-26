'use strict';

// Shared filesystem path constants used by server.js and every route module.

const path = require('path');

const ROOT            = path.join(__dirname, '..', 'public');
const AVATARS_DIR      = path.join(ROOT, 'avatars');
const COVERS_DIR       = path.join(ROOT, 'covers');
const BOOKS_DIR        = path.join(ROOT, 'books');
const ATTACHMENTS_DIR  = path.join(ROOT, 'attachments');

module.exports = { ROOT, AVATARS_DIR, COVERS_DIR, BOOKS_DIR, ATTACHMENTS_DIR };
