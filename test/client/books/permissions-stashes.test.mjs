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

for (const expanded of [true, false]) {
  for (const anthology of [false, true]) {
    test(`series moves rebuild both groups immediately, expanded=${expanded}, anthology=${anthology}`, () => {
      const { context } = setup({ expanded });
      const series = [{ id: 1, name: 'Old series' }, { id: 2, name: 'New series' }];
      const book = { id: 42, name: 'Moved item', total_sections: anthology ? 0 : 100,
        series_id: 1, series_name: 'Old series', is_container: anthology ? 1 : 0 };
      const children = anthology ? [{ id: 43, name: 'Child', total_sections: 100, parent_book_id: 42 }] : [];
      const group = id => context.lazyState.builders.get(`series::${id}`)().join('');
      context.renderBooksList([book, ...children], series);
      assert.match(group(1), /Moved item/);
      assert.doesNotMatch(group(2), /Moved item/);
      context.renderBooksList([{ ...book, series_id: 2, series_name: 'New series' }, ...children], series);
      assert.doesNotMatch(group(1), /Moved item|Child/);
      assert.match(group(2), /Moved item/);
      if (anthology && expanded) assert.match(group(2), /Child/);
      assert.equal(context.booksState._cachedBooks[0].series_id, 2);
    });
  }
}

test('Lorekeepers can remove any owned book or anthology without metadata edit permission', () => {
  const { context } = setup({ moderator: true });
  for (const is_container of [0, 1]) {
    for (const created_by of [2, 1, null]) {
      const book = { id: 9, name: 'Example', total_sections: 10, visited: 0, is_public: 1, is_container, created_by };
      const html = context._bookItemHtml(book, false, false, 0, null, false);
      const button = html.match(/<button class="book-del-btn"[^>]*>/)[0];
      assert.equal(button.includes(' disabled'), false);
      assert.ok(!context._bookItemHtml(book, false, false, 0, null, true).match(/<button class="book-del-btn"[^>]*>/)[0].includes(' disabled'));
    }
  }
});

test('Lorekeepers can remove their library series regardless of creator', () => {
  const { context, list } = setup({ moderator: true });
  for (const is_owner of [true, false]) {
    context.renderBooksList([], [{ id: 9, name: 'A series', is_public: 1, is_owner }], []);
    const button = list.innerHTML.match(/<button class="series-del-btn"[^>]*>/)[0];
    assert.equal(button.includes(' disabled'), false);
  }
});

test('a player without metadata edit permission can still remove a book from their library', () => {
  const { context } = setup();
  const html = context._bookItemHtml({ id: 9, name: 'Shared book', created_by: 1,
    is_public: 1, total_sections: 199, visited: 0 }, false, false, 0, null, false);
  assert.ok(html.match(/<button class="book-edit-btn"[^>]*>/)[0].includes(' disabled'));
  assert.ok(!html.match(/<button class="book-del-btn"[^>]*>/)[0].includes(' disabled'));
});

test('a Lorekeeper can edit their own private books and anthologies beside public ones', () => {
  const { context, list } = setup({ moderator: true });
  for (const is_container of [0, 1]) {
    for (const is_public of [0, 1]) {
      const own = context._bookItemHtml({ id: 9, created_by: 2, name: 'Own', total_sections: 123, visited: 0,
        is_public, is_container }, false, false, 0, null, false);
      assert.ok(!own.match(/<button class="book-edit-btn[^>]*>/)[0].includes(' disabled'));
      const other = context._bookItemHtml({ id: 10, created_by: 1, name: 'Other', total_sections: 123, visited: 0,
        is_public, is_container }, false, false, 0, null, false);
      assert.equal(other.match(/<button class="book-edit-btn[^>]*>/)[0].includes(' disabled'), !is_public);
    }
  }
  context.renderBooksList([], [{ id: 9, name: 'Own private series', is_public: 0, is_owner: true }]);
  assert.ok(list.innerHTML.includes('series-edit-btn" data-series-id="9"'));
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
