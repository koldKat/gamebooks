import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  _containerIdsFor, _orderForContainer, _sortChildrenMap,
  _sortBooks, _sortSeriesBooks, _aggregateProgress,
} from '../../../public/js/books/groups.js';

test('anthology memberships retain both parents without duplicates', () => {
  assert.deepEqual(_containerIdsFor({ parent_book_id: 10, extra_anthology_ids: [10, 20] }), [10, 20]);
  assert.deepEqual(_containerIdsFor({ extra_anthology_ids: [20] }), [20]);
  assert.deepEqual(_containerIdsFor({}), []);
});

test('anthology child order is scoped to each membership', () => {
  const shared = { name: 'Shared', parent_book_id: 10, book_order: 1, extra_anthology_orders: { 20: 3 } };
  const other = { name: 'Other', parent_book_id: 20, book_order: 2, extra_anthology_orders: { 10: 2 } };
  assert.equal(_orderForContainer(shared, 10), 1);
  assert.equal(_orderForContainer(shared, 20), 3);
  assert.equal(_orderForContainer(shared, 30), null);
  const map = { 10: [other, shared], 20: [shared, other] };
  _sortChildrenMap(map);
  assert.deepEqual(map[10], [shared, other]);
  assert.deepEqual(map[20], [other, shared]);
  assert.equal(shared.book_order, 1);
});

test('library sorting keeps recent books first, demos last, and leaves input unchanged', () => {
  const books = [
    { name: 'Book 10' }, { name: 'Book 2' },
    { name: 'Recent', last_run_at: 10 },
    { name: 'Demo', is_demo: true, last_run_at: 100 },
  ];
  const original = [...books];
  assert.deepEqual(_sortBooks(books).map(b => b.name), ['Recent', 'Book 2', 'Book 10', 'Demo']);
  assert.deepEqual(books, original);
});

test('series sorting prefers recent play over series number', () => {
  const books = [
    { name: 'Unnumbered' }, { name: 'Second', series_number: 2 },
    { name: 'First', series_number: 1 }, { name: 'Recent', series_number: 9, last_run_at: 10 },
  ];
  assert.deepEqual(_sortSeriesBooks(books).map(b => b.name), ['Recent', 'First', 'Second', 'Unnumbered']);
  assert.equal(books[0].name, 'Unnumbered');
});

test('progress uses anthology children rather than stale container sections or duplicate child rows', () => {
  const anthology = { id: 10, is_container: 1, visited: 99, total_sections: 99 };
  const child = { id: 11, parent_book_id: 10, visited: 4, total_sections: 20, discoverable_sections: 10 };
  const standalone = { id: 12, visited: 3, total_sections: 5 };
  assert.deepEqual(_aggregateProgress([anthology, child, standalone], { 10: [child] }), {
    visited: 7, totalSections: 15,
  });
  assert.deepEqual(_aggregateProgress([{ ...child, parent_book_id: null, extra_anthology_ids: [10] }, anthology], { 10: [child] }), {
    visited: 4, totalSections: 10,
  });
});
