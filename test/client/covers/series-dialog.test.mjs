import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source = readFileSync(new URL('../../../public/js/covers/series-dialog.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace('export function ', 'function ');
function render({ moderator = true, admin = false, isPublic = true, loggedIn = true, isOwner = false } = {}) {
  let click, args;
  const refreshes = [];
  const editButton = { addEventListener: (_type, handler) => { click = handler; } };
  const body = { style: {}, html: '', set innerHTML(html) { this.html = html; },
    querySelector(selector) {
      if (selector === '#edit-public-series-btn' && this.html.includes('id="edit-public-series-btn"')) {
        return editButton;
      }
      return null;
    }, querySelectorAll: () => [],
  };
  runInNewContext(source + '\nrenderSeriesActivity(data);', {
    data: { id: 12, name: 'Series', description: 'Blurb', isPublic, isOwner, isOpenWorld: true, books: [] },
    document: { getElementById: id => id === 'pub-modal-body' ? body : { style: {} } },
    getToken: () => loggedIn ? 'token' : null, escapeHtml: String, t: key => key, publicEntryLinks: () => '',
    openSeriesActivity: (...values) => refreshes.push(values),
    coversState: { _hooks: { getIsModerator: () => moderator, getIsAdmin: () => admin,
      getCachedAllSeries: () => [], openEditSeriesModal: (...values) => { args = values; } } },
  });
  return { body, click, refreshes, get args() { return args; } };
}
test('series show role labels only when editing another owner\'s series', () => {
  for (const role of ['admin', 'moderator']) {
    const options = { moderator: false, [role]: true };
    assert.match(render(options).body.html, new RegExp((role === 'admin' ? 'Gamemaster' : 'Lorekeeper') + ' Edit'));
    const own = render({ ...options, isOwner: true });
    assert.doesNotMatch(own.body.html, /Gamemaster Edit|Lorekeeper Edit|color:#f5a623/);
    assert.match(own.body.html, /✎ covers.edit_series/);
  }
  assert.equal(typeof render({ moderator: false, isOwner: true }).click, 'function');
});
test('catalog series editor is available to moderators without library membership and preserves open-world mode', () => {
  const dialog = render();
  assert.equal(typeof dialog.click, 'function'); dialog.click();
  assert.deepEqual(Array.from(dialog.args).slice(0, 5), [12, 'Series', 'Blurb', true, true]);
  assert.equal(typeof dialog.args[5], 'function');
  for (const options of [{ moderator: false }, { isPublic: false }, { loggedIn: false }]) {
    assert.equal(render(options).click, undefined);
  }
  assert.equal(typeof render({ moderator: false, admin: true }).click, 'function');
});

test('saving from public series info reloads the same open dialog with its saved name', async () => {
  const d = render(); d.click();
  await d.args[5]('Renamed series');
  assert.deepEqual(d.refreshes, [[12, 'Renamed series']]);
});

test('a delayed save cannot reopen a closed or replaced public series dialog', async () => {
  const d = render(); d.click();
  d.body.innerHTML = 'Different public dialog';
  await d.args[5]('Renamed series');
  assert.deepEqual(d.refreshes, []);
});
