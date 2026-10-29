import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const markup = readFileSync(new URL('../../../public/js/books/markup.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
const actions = readFileSync(new URL('../../../public/js/books/actions.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');

function setup(rating, response = { ok: true, avgRating: 1, voteCount: 99 }) {
  const book = { id: 42, name: 'Shared', total_sections: 100, visited: 0,
    userRating: rating, avgRating: 1, voteCount: 99 };
  const label = { innerHTML: '' }, requests = [], errors = [], handlers = {};
  const stars = Array.from({ length: 5 }, (_, i) => ({ dataset: { pos: String(i + 1) }, offsetWidth: 20,
    addEventListener(type, callback) { this[type] = callback; } }));
  const row = { dataset: { bookId: '42', userRating: rating ?? '' },
    querySelectorAll: () => stars, querySelector: () => label,
    addEventListener(type, callback) { handlers[type] = callback; } };
  const context = { booksState: { _cachedBooks: [book], _activeSeriesRuns: [], _hooks: {}, _currentUserId: 7 },
    _isMobile: () => false, escapeHtml: String, t: key => key,
    refreshCoinsDisplay() {},
    apiFetch: async (url, options) => {
      requests.push([url, JSON.parse(options.body)]);
      if (response.network) throw Error('offline');
      return { ok: response.ok, status: response.status,
        json: async () => response };
    } };
  runInNewContext(markup, context);
  context._flashRatingGate = (_row, text) => errors.push(text);
  runInNewContext(actions, context);
  context._wireRenderedContent({ querySelectorAll: selector => selector === '.book-rating-row' ? [row] : [] });
  return { context, book, row, label, stars, handlers, requests, errors };
}

test('library cards show only the personal rating for books and anthologies, including unrated players', () => {
  for (const userRating of [null, 0.5, 4.5]) for (const is_container of [0, 1]) {
    const app = setup(userRating);
    const html = app.context._bookItemHtml({ ...app.book, is_container }, false, false, 0, null, false);
    assert.doesNotMatch(html, /99 votes|star-votes/);
    assert.equal((html.match(/class="star on"/g) || []).length, Math.floor(userRating || 0));
    assert.equal((html.match(/class="star half"/g) || []).length, userRating % 1 ? 1 : 0);
    assert.ok(html.includes(userRating == null ? 'books.rate' : userRating.toFixed(1)));
    assert.match(app.context._starLabelHtml(1, 99), /99 votes/, 'public aggregate helper remains available');
  }
});

test('hover, save, clear and mouseleave use the player vote despite the returned community average', async () => {
  const app = setup(4.5);
  app.stars[1].mousemove({ offsetX: 15 });
  assert.match(app.label.innerHTML, /2.0/);
  app.handlers.mouseleave();
  assert.match(app.label.innerHTML, /4.5/);
  await app.stars[1].click({ offsetX: 15 });
  assert.equal(app.book.userRating, 2);
  assert.match(app.label.innerHTML, /2.0/);
  assert.equal(app.book.avgRating, 1, 'community data remains recorded');
  await app.stars[1].click({ offsetX: 15 });
  assert.equal(app.book.userRating, null);
  assert.match(app.label.innerHTML, /books.rate/);
  assert.deepEqual(app.requests, [['/api/books/42/rating', { rating: 2 }], ['/api/books/42/rating', { rating: null }]]);
});

for (const response of [{ ok: false, status: 403 }, { ok: false, status: 500 }, { network: true }]) {
  test(`failed personal rating save restores its previous value: ${response.status || 'network'}`, async () => {
    const app = setup(4.5, response);
    await app.stars[1].click({ offsetX: 15 });
    assert.equal(app.row.dataset.userRating, 4.5);
    assert.equal(app.book.userRating, 4.5);
    assert.match(app.label.innerHTML, /4.5/);
    assert.equal(app.errors.length, 1);
  });
}
