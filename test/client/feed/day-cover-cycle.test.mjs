import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function moduleSource(name) {
  return readFileSync(new URL(`../../../public/js/feed/${name}.js`, import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/export /g, '');
}

test('day cover ranking combines anthology children sharing the same artwork', () => {
  const context = { escapeHtml: String, t: String, createDayRenderer: () => () => '', formatAnnBody: String, isHiddenNsfwCover: () => false };
  runInNewContext(moduleSource('render') + '\nthis.render = renderFeedContents;', context);
  const entry = (bookId, coverUrl, bookIsPublic = true) => ({ bookId, coverUrl, bookIsPublic, completedAt: 1700000000000 });
  const result = context.render([
    entry(1, 'book-a'), entry(1, 'book-a'), entry(2, 'anthology'),
    entry(3, 'anthology'), entry(4, 'anthology'), entry(5, 'book-b'), entry(6, 'private', false),
  ], null, '');
  assert.deepEqual(Array.from(result.dayCoverLists[0]), ['anthology', 'book-a', 'book-b']);
});

test('expanded cards cycle distinct covers evenly while short cards prioritize the busiest', async () => {
  const stack = { innerHTML: '' };
  const card = { dataset: { dayIndex: '0' }, offsetWidth: 100, offsetHeight: 1350,
    querySelector: () => stack };
  class Image {
    constructor() { this.naturalWidth = 100; this.naturalHeight = 150; }
    set src(url) { queueMicrotask(() => url === 'broken' ? this.onerror() : this.onload()); }
  }
  const context = { Image, queueMicrotask, setTimeout, clearTimeout, escapeHtml: String, isHiddenNsfwCover: () => false,
    window: { addEventListener() {} },
    document: { addEventListener() {}, body: { classList: { contains: () => false } } } };
  runInNewContext(moduleSource('day-covers') + '\nthis.apply = _applyDayCoverFlows;', context);
  const root = { querySelectorAll: () => [card] };
  const covers = [['busiest', 'book-b', 'anthology', 'anthology', 'broken']];
  await context.apply(root, covers);
  const tiles = [...stack.innerHTML.matchAll(/top:(-?\d+)px[^>]*background-image:url\('([^']+)'\)/g)]
    .map(match => ({ top: Number(match[1]), cover: match[2] })).sort((a, b) => a.top - b.top);
  assert.equal(tiles.length, 9);
  for (let i = 1; i < tiles.length; i++) {
    const order = ['busiest', 'book-b', 'anthology'];
    assert.equal(tiles[i].cover, order[(order.indexOf(tiles[i - 1].cover) + 1) % 3]);
  }
  for (const cover of ['busiest', 'book-b', 'anthology']) assert.equal(tiles.filter(tile => tile.cover === cover).length, 3);
  card.offsetHeight = 100;
  await context.apply(root, covers);
  assert.match(stack.innerHTML, /url\('busiest'\)/);
  assert.equal((stack.innerHTML.match(/feed-day-cover-tile/g) || []).length, 1);
  card.offsetHeight = 900;
  await context.apply(root, [['only-book']]);
  assert.equal((stack.innerHTML.match(/url\('only-book'\)/g) || []).length, 7);
});
