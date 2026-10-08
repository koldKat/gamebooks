import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../../../public/js/covers/book-dialog.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace('export function ', 'function ');

function dialog({ loggedIn = false, owned = false, mobile = true, admin = false, meta = {} } = {}) {
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
    _refreshCoversDisplay() {},
    closePublicModal: () => events.push('close'),
    escapeHtml: value => String(value),
    t: key => key,
    coversState: { _hooks: {
      getIsAdmin: () => admin,
      openEditBookModal: options => { editOptions = options; },
      showLogin: () => events.push('login'),
      navigateToBook: id => events.push(id),
    } },
    apiFetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true };
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


test('cover-panel Edit Book reloads and saves the highest section independently of the total', async () => {
  const d = dialog({ loggedIn: true, admin: true, meta: { totalSections: 420, maxSectionNumber: 1003 } });
  d.buttons.get('.catalog-admin-edit-btn').click();
  assert.equal(d.editOptions.initialSections, 420);
  assert.equal(d.editOptions.initialMaxSectionNumber, 1003);
  await d.editOptions.onSave('Sparse book', 420, '', '', '', null, null, null, null, true, null, null, false, null, null, 1100);
  const payload = JSON.parse(d.requests[0].options.body);
  assert.equal(payload.total_sections, 420);
  assert.equal(payload.max_section_number, 1100);
  assert.deepEqual(d.events, ['refresh']);
  const legacy = dialog({ loggedIn: true, admin: true, meta: { totalSections: 420 } });
  legacy.buttons.get('.catalog-admin-edit-btn').click();
  assert.equal(legacy.editOptions.initialMaxSectionNumber, 420, 'legacy blank defaults to total sections');
});
