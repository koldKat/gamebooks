import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as groups from '../../../public/js/books/groups.js';

function setup({ moderator = false, expanded = false } = {}) {
  const list = { innerHTML: '' };
  const context = {
    ...groups,
    booksState: { _currentUserId: 2, _cachedBooks: [], _activeSeriesRuns: [], _hooks: { getIsModerator: () => moderator } },
    lazyState: { builders: new Map(), sequence: 0 },
    document: { getElementById: () => list },
    localStorage: { setItem() {} },
    _BOOKS_LS_KEY: 'books', _SERIES_LS_KEY: 'series', _STASHES_LS_KEY: 'stashes',
    _getExpandedPref: () => expanded, _effectiveLandingCoverSource: () => 'all',
    _isMobile: () => false, t: key => key, escapeHtml: value => String(value ?? ''),
    naturalCompare: (a, b) => a.localeCompare(b), _sortedByName: items => items,
    _wireRenderedContent() {}, _applyBooksSearchFilter() {},
    _scheduleAnthologyCardCoverFlows() {}, _queueBookCovers() {},
  };
  for (const file of ['markup', 'render']) {
    const source = readFileSync(new URL(`../../../public/js/books/${file}.js`, import.meta.url), 'utf8');
    runInNewContext(source.replace(/^import .*;\n/gm, '').replace(/^export /gm, ''), context);
  }
  return { context, list };
}

test('Lorekeeper delete buttons are enabled only for their own books and anthologies', () => {
  const { context } = setup({ moderator: true });
  for (const is_container of [0, 1]) {
    for (const created_by of [2, 1, null]) {
      const book = { id: 9, name: 'Example', total_sections: 10, visited: 0, is_public: 1, is_container, created_by };
      const html = context._bookItemHtml(book, false, false, 0, null, false);
      const button = html.match(/<button class="book-del-btn"[^>]*>/)[0];
      assert.equal(button.includes(' disabled'), created_by !== 2);
      assert.ok(!context._bookItemHtml(book, false, false, 0, null, true).match(/<button class="book-del-btn"[^>]*>/)[0].includes(' disabled'));
    }
  }
});

for (const expanded of [true, false]) {
  test(`empty stashes remain visible and editable, expanded=${expanded}`, () => {
    const { context, list } = setup({ expanded });
    const stash = { id: 7, name: 'Fill me later', bookIds: [], seriesIds: [] };
    context.renderBooksList([], [], [stash]);
    assert.ok(list.innerHTML.includes('Fill me later'));
    assert.ok(list.innerHTML.includes('0 items'));
    assert.ok(list.innerHTML.includes('stash-edit-btn'));
    assert.ok(list.innerHTML.includes('stash-del-btn'));
    assert.ok(!list.innerHTML.includes('books-empty'));
    assert.ok(context.lazyState.builders.has('stash:7'));
    context.renderBooksList([{ id: 1, name: 'A book', total_sections: 10, visited: 0, created_by: 2 }], [], [stash]);
    assert.ok(list.innerHTML.includes('Fill me later'), 'other library contents do not hide an empty stash');
    assert.ok(list.innerHTML.includes('A book'));
  });
}
