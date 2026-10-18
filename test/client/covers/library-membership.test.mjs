import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source = readFileSync(new URL('../../../public/js/covers/grid.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replaceAll('export function ', 'function ');

function setup(filtered, lazy = true) {
  const items = [{id: 1}, {id: 2}, {isSeries: true, entityId: 3}, {id: 4}];
  const thumbs = items.slice(0, 3).map(item => ({
    dataset: item.isSeries ? {seriesId: '3'} : {bookId: String(item.id)},
    remove() { this.removed = true; },
  }));
  const unobserved = [], frames = [], total = {}, count = {};
  const state = {_coversNotMineOnly: filtered, _allBooks: items.filter(item => !item.isSeries),
    _allSeriesCovers: items.filter(item => item.isSeries), _lazyItems: lazy ? items : null, _lazyOffset: 3,
    _thumbVisibilityObserver: {unobserve: thumb => unobserved.push(thumb)}};
  runInNewContext(source + '\n_syncCoverLibraryMembership();', {
    coversState: state, requestAnimationFrame: callback => frames.push(callback),
    _isNotInMyBooks: item => item.id !== 2 && !item.isSeries,
    _visibleCoverItems: () => [items[0], items[3]],
    document: {getElementById: id => ({'covers-grid': {querySelectorAll: () => thumbs},
      'covers-count': count, 'covers-total': total})[id]},
  });
  return {state, thumbs, unobserved, frames, total};
}

test('library additions leave an unfiltered cover grid untouched', () => {
  const result = setup(false);
  assert.equal(result.state._lazyOffset, 3);
  assert.equal(result.state._lazyItems.length, 4);
  assert.ok(result.thumbs.every(thumb => !thumb.removed));
  assert.equal(result.frames.length, 0);
});

test('not-owned filter removes owned books and series without replacing surviving thumbs', () => {
  const {state, thumbs, unobserved, frames, total} = setup(true);
  assert.deepEqual(Array.from(state._lazyItems, item => item.id), [1, 4]);
  assert.equal(state._lazyOffset, 1);
  assert.equal(thumbs[0].removed, undefined);
  assert.equal(thumbs[1].removed, true);
  assert.equal(thumbs[2].removed, true);
  assert.deepEqual(unobserved, [thumbs[1], thumbs[2]]);
  assert.equal(frames.length, 1);
  assert.equal(total.textContent, ' (2 total)');
});

test('random covers keep surviving order instead of reshuffling on ownership changes', () => {
  const {thumbs, frames, total} = setup(true, false);
  assert.equal(thumbs[0].removed, undefined);
  assert.equal(thumbs[1].removed, true);
  assert.equal(thumbs[2].removed, true);
  assert.equal(frames.length, 1);
  assert.equal(total.textContent, ' (2 total)');
});
