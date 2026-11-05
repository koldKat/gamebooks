import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../../../public/js/covers/grid.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replaceAll('export function ', 'function ');

function setup(size = 2000) {
  const items = Array.from({ length: size }, (_, i) => ({ id: i + 1, coverUrl: `/covers/${i + 1}.jpg` }));
  let thumbs = [];
  const frames = [], requests = [], built = [];
  const panel = { clientHeight: 360, classList: { add() {}, remove() {}, contains: () => false } };
  const count = {}, total = {};
  const thumb = id => ({
    dataset: { bookId: String(id) }, img: {}, bar: {},
    getBoundingClientRect: () => ({ height: 100 }),
    querySelector(selector) { return selector === 'img' ? this.img : this.bar; },
    remove() { thumbs.splice(thumbs.indexOf(this), 1); },
  });
  const grid = {
    set innerHTML(html) { thumbs = [...html.matchAll(/<thumb (\d+)>/g)].map(match => thumb(Number(match[1]))); },
    querySelectorAll: () => thumbs.slice(),
    insertAdjacentHTML(position, html) { thumbs.push(thumb(Number(html.match(/\d+/)[0]))); },
  };
  const state = { _coversPanelGen: 0, _coversSortMode: 'random' };
  const context = {
    coversState: state,
    document: { getElementById: id => ({ 'covers-panel': panel, 'covers-grid': grid, 'covers-count': count, 'covers-total': total })[id] },
    requestAnimationFrame: fn => frames.push(fn),
    getComputedStyle: () => ({ paddingTop: '0', paddingBottom: '0', gap: '8' }),
    _makeCoverThumbHTML: item => { built.push(item.id); return `<thumb ${item.id}>`; },
    _enqueueCoverLoad: (url, img) => { img._coverLoadVersion = 1; requests.push(url); },
    _visibleCoverItems: () => items,
    _randomizedCoverItems: () => items,
    _isNotInMyBooks: item => item.id !== 2,
  };
  runInNewContext(source + '\nglobalThis.api = { _refreshCoversDisplay, _trimCoversToFit, _stopLazy, _syncCoverLibraryMembership };', context);
  return { api: context.api, state, items, panel, frames, requests, built, count, total, thumbs: () => thumbs,
    flush() { while (frames.length) frames.shift()(); } };
}

test('random mode builds and fetches only the visible sample of a large catalog', () => {
  const view = setup();
  view.api._refreshCoversDisplay();
  assert.equal(view.built.length, 4, 'only one row is built to measure the layout');
  assert.equal(view.requests.length, 0, 'no image is queued before measuring');
  view.flush();
  assert.equal(view.thumbs().length, 12);
  assert.equal(view.built.length, 12);
  assert.equal(view.requests.length, 12, 'hidden catalog covers are never fetched');
  assert.equal(view.count.textContent, '12 ');
  assert.equal(view.total.textContent, ' (2000 total)');
  view.api._trimCoversToFit();
  view.flush();
  assert.equal(view.requests.length, 12, 'measuring again does not enqueue duplicates');
  view.panel.clientHeight = 580;
  view.api._trimCoversToFit();
  view.flush();
  assert.equal(view.thumbs().length, 20);
  assert.equal(view.requests.length, 20);
});

test('stale layout callbacks cannot populate a replacement grid', () => {
  const view = setup();
  view.api._refreshCoversDisplay();
  view.api._stopLazy();
  view.flush();
  assert.equal(view.requests.length, 0);
});

test('removing an owned random cover preserves order and fills its vacant slot', () => {
  const view = setup();
  view.api._refreshCoversDisplay();
  view.flush();
  view.state._coversNotMineOnly = true;
  view.state._allBooks = view.items;
  view.state._allSeriesCovers = [];
  view.api._syncCoverLibraryMembership();
  view.flush();
  assert.deepEqual(view.thumbs().map(item => Number(item.dataset.bookId)), [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  assert.equal(view.requests.length, 13);
  assert.equal(view.total.textContent, ' (1999 total)');
});

test('empty and short random results do not fabricate extra cards', () => {
  for (const size of [0, 2]) {
    const view = setup(size);
    view.api._refreshCoversDisplay();
    view.flush();
    assert.equal(view.thumbs().length, size);
    assert.equal(view.requests.length, size);
    assert.equal(view.total.textContent, ` (${size} total)`);
  }
});
