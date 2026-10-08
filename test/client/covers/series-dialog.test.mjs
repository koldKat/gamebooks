import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source = readFileSync(new URL('../../../public/js/covers/series-dialog.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace('export function ', 'function ');
function render({ moderator = true, admin = false, isPublic = true, loggedIn = true } = {}) {
  let click, args;
  const body = { style: {}, html: '', set innerHTML(html) { this.html = html; },
    querySelector(selector) {
      if (selector === '#edit-public-series-btn' && this.html.includes('id="edit-public-series-btn"')) {
        return { addEventListener: (_type, handler) => { click = handler; } };
      }
      return null;
    }, querySelectorAll: () => [],
  };
  runInNewContext(source + '\nrenderSeriesActivity(data);', {
    data: { id: 12, name: 'Series', description: 'Blurb', isPublic, isOpenWorld: true, books: [] },
    document: { getElementById: id => id === 'pub-modal-body' ? body : { style: {} } },
    getToken: () => loggedIn ? 'token' : null, escapeHtml: String, t: key => key,
    coversState: { _hooks: { getIsModerator: () => moderator, getIsAdmin: () => admin,
      getCachedAllSeries: () => [], openEditSeriesModal: (...values) => { args = values; } } },
  });
  return { body, click, get args() { return args; } };
}
test('catalog series editor is available to moderators without library membership and preserves open-world mode', () => {
  const dialog = render();
  assert.equal(typeof dialog.click, 'function'); dialog.click();
  assert.deepEqual(Array.from(dialog.args), [12, 'Series', 'Blurb', true, true]);
  for (const options of [{ moderator: false }, { isPublic: false }, { loggedIn: false }]) {
    assert.equal(render(options).click, undefined);
  }
  assert.equal(typeof render({ moderator: false, admin: true }).click, 'function');
});
