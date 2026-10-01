import { test } from 'node:test';
import assert from 'node:assert/strict';
import { _buildSeriesCoverEntries } from '../../../public/js/covers/series.js';
import { _shuffle } from '../../../public/js/covers/helpers.js';

test('series composites retain all searchable children and use at most four covers', () => {
  const books = Array.from({ length: 6 }, (_, i) => ({
    id: i + 1, name: `Book ${i + 1}`, seriesId: 10,
    coverUrl: i === 5 ? null : `/covers/${i}.jpg`, totalSections: 20, createdAt: i,
  }));
  const original = structuredClone(books);
  const [entry] = _buildSeriesCoverEntries([{ id: 10, name: 'Series', is_open_world: true }], books);
  assert.equal(entry.id, 'series_10');
  assert.equal(entry.entityId, 10);
  assert.equal(entry.isOpenWorld, true);
  assert.equal(entry.coverSources.length, 4);
  assert.equal(new Set(entry.coverSources).size, 4);
  assert.deepEqual(entry.bookIds, books.map(b => b.id));
  assert.deepEqual(entry.childNames, books.map(b => b.name));
  assert.equal(entry.totalSections, 120);
  assert.equal(entry.createdAt, 5);
  assert.equal(entry.bookCount, 6);
  assert.deepEqual(books, original);
});

test('series totals use server aggregates and accept snake-case membership', () => {
  const entries = _buildSeriesCoverEntries([
    { id: 2, name: 'Series 10', book_count: 9, total_sections: 100, library_count: 3 },
    { id: 1, name: 'Series 2' },
  ], [{ id: 10, name: 'Child', series_id: 2, totalSections: 20 }]);
  assert.deepEqual(entries.map(e => e.name), ['Series 2', 'Series 10']);
  assert.equal(entries[0].bookCount, 0);
  assert.deepEqual(entries[0].coverSources, []);
  assert.equal(entries[1].bookCount, 9);
  assert.equal(entries[1].totalSections, 100);
  assert.equal(entries[1].libraryCount, 3);
  assert.deepEqual(entries[1].bookIds, [10]);
});

test('shuffle returns a permutation without mutating the input', () => {
  const input = [1, 2, 3, 4];
  const result = _shuffle(input);
  assert.notEqual(result, input);
  assert.deepEqual(input, [1, 2, 3, 4]);
  assert.deepEqual([...result].sort(), input);
});
