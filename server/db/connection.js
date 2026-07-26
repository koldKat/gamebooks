'use strict';

// Shared SQLite connection + small string/search utilities used across every
// server/db/* domain module. Every other file in this directory requires this
// one for `db` rather than opening its own connection.

const fs       = require('fs');
const path     = require('path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, '..', '..', 'database.sqlite'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function hasColumn(tableName, columnName) {
  try {
    return db.prepare(`PRAGMA table_info(${tableName})`).all().some(column => column.name === columnName);
  } catch {
    return false;
  }
}

const _naturalCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

function _toSortableString(value) {
  return value == null ? '' : String(value);
}

function _foldForSearch(value) {
  return _toSortableString(value).normalize('NFC').toLocaleLowerCase();
}

function _naturalCompare(a, b) {
  return _naturalCollator.compare(_toSortableString(a), _toSortableString(b));
}

function _naturalCompareByName(a, b) {
  return _naturalCompare(a?.name, b?.name);
}

function _getPdfSize(pdfPath) {
  if (!pdfPath) return null;
  try {
    const size = fs.statSync(path.join(__dirname, '..', '..', 'public', 'books', pdfPath)).size;
    return Number.isFinite(size) ? size : null;
  } catch {
    return null;
  }
}

module.exports = {
  db, hasColumn,
  _toSortableString, _foldForSearch, _naturalCompare, _naturalCompareByName,
  _getPdfSize,
};
