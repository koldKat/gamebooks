import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../../../public/js/covers/book-dialog.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace('export function ', 'function ');

function dialog({ loggedIn = false, owned = false, mobile = true, admin = false, ok = true, meta = {} } = {}) {
  let editOptions;
  const events = [], requests = [], panels = new Set(['mobile-addbook-open']);
  const buttons = new Map();
  const body = {
    style: {},
    set innerHTML(html) {
      this.html = html;
      buttons.clear();
      for (const match of html.matchAll(/<button class="([^"]+)"([^>]*)>([^<]*)<\/button>/g)) {
        const button = {
          dataset: { bookId: match[2].match(/data-book-id="([^"]+)"/)?.[1] },
          textContent: match[3],
          addEventListener: (type, handler) => { button[type] = handler; },
        };
        for (const name of match[1].split(' ')) buttons.set('.' + name, button);
      }
    },
    querySelector: selector => buttons.get(selector) || null,
    querySelectorAll: () => [],
  };
  const window = { location: {} };
  const context = {
    document: {
      body: { classList: { remove: (...names) => names.forEach(name => panels.delete(name)) } },
      getElementById: id => id === 'pub-modal-body' ? body : { style: {}, classList: { remove() {} } },
    },
    window,
    _destroyPubNetworks() {},
    openCoverActivity: () => events.push('refresh'),
    _isMobile: () => mobile,
    _syncCoverLibraryMembership: () => events.push('membership'),
    closePublicModal: () => events.push('close'),
    escapeHtml: value => String(value),
    t: (key, params) => key === 'covers.author_rating_votes' ? `${params.n} vote${params.s}` : key,
    _seriesRowBadges: book => book.hasLiveReading ? '<span class="reading-badge">Reading</span>' : '',
    coversState: { _hooks: {
      getIsAdmin: () => admin,
      refreshBooksListOnly: async options => { if (options) assert.equal(options.afterMutation, true); events.push('library'); },
      applySavedBookResponse: async response => { assert.ok(response.ok); events.push('library'); },
      openEditBookModal: options => { editOptions = options; },
      openEditCompModal: options => { editOptions = options; },
      showLogin: () => events.push('login'),
      navigateToBook: id => events.push(id),
    } },
    apiFetch: async (url, options) => {
      requests.push({ url, options });
      return { ok, json: async () => ({ error: "Save rejected" }) };
    },
  };
  runInNewContext(source + '\nrenderCoverActivity(42, "Book", [], null, bookMeta, loggedIn, owned);', {
    ...context, bookMeta: { isPublic: true, ...meta }, loggedIn, owned,
  });
  return { body, buttons, events, requests, panels, window, get editOptions() { return editOptions; } };
}

test('signed-out public book action opens authentication without adding a book', async () => {
  const d = dialog();
  const button = d.buttons.get('.login-to-add-book-btn');
  assert.equal(button.textContent, 'covers.login_to_add_book');
  assert.equal(d.buttons.has('.add-public-book-btn'), false);
  assert.equal(d.buttons.has('.open-owned-book-btn'), false);
  await button.click();
  assert.deepEqual(d.events, ['close', 'login']);
  assert.equal(d.panels.size, 0, 'catalog panel must not cover the login screen');
  assert.deepEqual(d.requests, []);
});

test('signed-in players can add a public book and then open it in the mobile reader', async () => {
  const d = dialog({ loggedIn: true });
  assert.equal(d.buttons.has('.login-to-add-book-btn'), false);
  await d.buttons.get('.add-public-book-btn').click();
  assert.deepEqual(d.events, ['library', 'membership'], 'library additions only reconcile ownership, never rebuild the cover grid');
  assert.equal(d.requests.length, 1);
  assert.equal(d.requests[0].url, '/api/books/42/add');
  assert.equal(d.requests[0].options.method, 'POST');
  assert.equal(d.buttons.has('.add-public-book-btn'), false);
  await d.buttons.get('.open-owned-book-btn').click({ preventDefault() {}, stopPropagation() {} });
  assert.equal(d.window.location.href, '/mobile?book=42');
});

test('owned books keep desktop navigation and anthologies open through their children', async () => {
  const d = dialog({ loggedIn: true, owned: true, mobile: false });
  await d.buttons.get('.open-owned-book-btn').click({ preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(d.events, [42, 'close']);
  const anthology = dialog({ loggedIn: true, owned: true, meta: { isContainer: true } });
  assert.equal(anthology.buttons.has('.open-owned-book-btn'), false);
  assert.equal(anthology.buttons.has('.add-public-book-btn'), false);
});

test('private metadata does not offer guests a library action', () => {
  const d = dialog({ meta: { isPublic: false } });
  assert.equal(d.buttons.has('.login-to-add-book-btn'), false);
  assert.equal(d.buttons.has('.add-public-book-btn'), false);
});

test('anthology child inherits missing display metadata without copying it into edit fields', async () => {
  const d = dialog({loggedIn: true, admin: true, meta: {parentId: 7, parentName: 'Anthology',
    parentCoverUrl: '/covers/anthology.jpg', parentDescription: 'Anthology description'}});
  assert.match(d.body.html, /src="\/covers\/anthology.jpg"/);
  assert.match(d.body.html, /book-modal-description">Anthology description/);
  await d.buttons.get('.catalog-admin-edit-btn').click();
  assert.equal(d.editOptions.initialDescription, '');
  assert.equal(d.editOptions.initialCoverUrl, null);
  const own = dialog({meta: {coverUrl: '/covers/own.jpg', description: 'Own description',
    parentCoverUrl: '/covers/anthology.jpg', parentDescription: 'Anthology description'}});
  assert.match(own.body.html, /src="\/covers\/own.jpg"/);
  assert.match(own.body.html, /book-modal-description">Own description/);
  assert.doesNotMatch(own.body.html, /anthology.jpg|Anthology description/);
});

test('authors visibly show pooled book vote counts individually, not only in a tooltip', () => {
  const d = dialog({ meta: { authors: 'First Author, Second Author, Unrated Author', voteCount: 3,
    authorRatings: [
      { name: 'First Author', avgRating: 4, voteCount: 17 },
      { name: 'Second Author', avgRating: 3.5, voteCount: 1 },
      { name: 'Unrated Author', avgRating: null, voteCount: 0 },
    ] } });
  assert.match(d.body.html, /book-modal-author-rating">★4\.0<span class="star-votes"> \(17 votes\)<\/span>/);
  assert.match(d.body.html, /book-modal-author-rating">★3\.5<span class="star-votes"> \(1 vote\)<\/span>/);
  assert.equal((d.body.html.match(/class="book-modal-author-rating"/g) || []).length, 2);
  assert.doesNotMatch(d.body.html, /\(0 votes\)|NaN|data-tooltip="17 votes"/);
});

test('anthology children show their own reading availability, even without covers', () => {
  const d = dialog({ meta: { isContainer: true, hasLiveReading: true, children: [
    { id: 101, name: 'Readable child', total_sections: 215, hasLiveReading: true },
    { id: 424, name: 'Unavailable child', hasLiveReading: false },
  ] } });
  const rows = [...d.body.html.matchAll(/<button class="book-modal-child-row"[^>]*>([\s\S]*?)<\/button>/g)];
  assert.equal(rows.length, 2);
  assert.match(rows[0][1], /reading-badge/);
  assert.doesNotMatch(rows[1][1], /reading-badge/);
});

test('cover-panel Edit Book reloads and saves the highest section independently of the total', async () => {
  const d = dialog({ loggedIn: true, admin: true, meta: { totalSections: 420, maxSectionNumber: 1003 } });
  d.buttons.get('.catalog-admin-edit-btn').click();
  assert.equal(d.editOptions.initialSections, 420);
  assert.equal(d.editOptions.initialMaxSectionNumber, 1003);
  await d.editOptions.onSave('Sparse book', 420, '', '', '', null, null, null, null, true, null, null, false, null, null, 1100);
  const payload = JSON.parse(d.requests[0].options.body);
  assert.equal(payload.total_sections, 420);
  assert.equal(payload.max_section_number, 1100);
  assert.deepEqual(d.events, ['library', 'refresh']);
  const legacy = dialog({ loggedIn: true, admin: true, meta: { totalSections: 420 } });
  legacy.buttons.get('.catalog-admin-edit-btn').click();
  assert.equal(legacy.editOptions.initialMaxSectionNumber, 420, 'legacy blank defaults to total sections');
});

test('catalog anthology save reports a server rejection without refreshing the dialog', async () => {
  const d = dialog({ loggedIn: true, admin: true, ok: false, meta: { isContainer: true } });
  d.buttons.get('.catalog-admin-edit-btn').click();
  await assert.rejects(d.editOptions.onSave('Anthology', '', '', '', null, null, null, true, '', ''), /Save rejected/);
  assert.deepEqual(d.events, []);
});

test('public anthology info refreshes immediately after saving metadata', async () => {
  const d = dialog({ loggedIn: true, admin: true, meta: { isContainer: true } });
  d.buttons.get('.catalog-admin-edit-btn').click();
  await d.editOptions.onSave('Renamed anthology', '', '', '', null, null, null, true, '', '');
  assert.deepEqual(d.events, ['library', 'refresh']);
  assert.equal(JSON.parse(d.requests[0].options.body).name, 'Renamed anthology');
});

test('a completed book or anthology save cannot replace another open public dialog', async () => {
  for (const isContainer of [false, true]) {
    const d = dialog({ loggedIn: true, admin: true, meta: { isContainer } });
    d.buttons.get('.catalog-admin-edit-btn').click();
    d.buttons.clear();
    if (isContainer) await d.editOptions.onSave('Renamed anthology', '', '', '', null, null, null, true, '', '');
    else await d.editOptions.onSave('Renamed book', 100, '', '', '', null, null, null, null, true, null, null, false, null, null, 100);
    assert.deepEqual(d.events, ['library'], 'refresh the library even when the original info dialog has closed');
  }
});
