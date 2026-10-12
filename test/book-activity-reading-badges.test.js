'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function activity(primary, secondary = []) {
  const book = { id: 448, name: 'Anthology', is_container: 1, is_public: 1, has_live_reading: 0 };
  const dependencies = {
    './connection': { db: { prepare: sql => ({
      get: () => sql.includes('SELECT 1 FROM books') ? { visible: 1 } : book,
      all: () => {
        if (!sql.includes('WHERE parent_book_id = ?')) return [];
        assert.match(sql, /has_live_reading/);
        assert.match(sql, /has_battle_sim/);
        assert.match(sql, /is_public = 1/);
        return primary;
      },
    }) } },
    './xp': {}, './content': {},
    './books': {
      getAnthologyExtraMembers: (id, publicOnly) => {
        assert.equal(id, 448);
        assert.equal(publicOnly, true);
        return secondary;
      },
      _getAggregateRating: () => ({}), _getAuthorRatings: () => [],
    },
  };
  const context = vm.createContext({ module: { exports: {} }, require: name => dependencies[name] });
  vm.runInContext(fs.readFileSync(require.resolve('../server/db/feed'), 'utf8'), context);
  return context.module.exports.getBookActivity(448).book;
}

test('reading badges belong to individual anthology children', () => {
  const book = activity([
    { id: 101, name: 'Readable', book_order: 1, has_live_reading: 1, has_battle_sim: 0 },
    { id: 424, name: 'Unavailable', book_order: 2, has_live_reading: 0, has_battle_sim: 1 },
  ]);
  assert.equal(book.hasLiveReading, true);
  assert.equal(book.children[0].hasLiveReading, true);
  assert.equal(book.children[0].hasBattleSim, false);
  assert.equal(book.children[1].hasLiveReading, false);
  assert.equal(book.children[1].hasBattleSim, true);
});

test('secondary membership badges are included without duplicating primary children', () => {
  const book = activity([
    { id: 101, name: 'Unreadable', book_order: 2, has_live_reading: 0 },
  ], [
    { id: 101, name: 'Duplicate', book_order: 2, has_live_reading: 1 },
    { id: 424, name: 'Secondary', book_order: 1, has_live_reading: 1, has_battle_sim: 1 },
  ]);
  assert.equal(book.children.length, 2);
  assert.equal(book.children[0].id, 424);
  assert.equal(book.children[0].hasLiveReading, true);
  assert.equal(book.children[1].hasLiveReading, false);
  assert.equal(book.hasLiveReading, true);
  assert.equal(activity([{ id: 101, name: 'Unavailable', has_live_reading: 0 }]).hasLiveReading, false);
});
