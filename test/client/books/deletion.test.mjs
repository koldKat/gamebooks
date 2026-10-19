import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../../../public/js/books/actions.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');

function setup({ failure = null } = {}) {
  const owned = new Set(['1', '2', '3']);
  const requests = [], confirmations = [], errors = [];
  let refreshes = 0;
  let confirm;
  let choices;
  const context = {
    booksState: { _cachedBooks: [1, 2, 3].map(id => ({ id, series_id: 7 })), _hooks: {} },
    t: key => key,
    showAlert: message => errors.push(message),
    showConfirm: (message, callback) => { confirmations.push(message); confirm = callback; },
    showTwoChoice: (_message, _label1, first, _label2, second) => { choices = [first, second]; },
    apiFetch: async (url, options) => {
      requests.push([url, options.method]);
      if (failure === 'network') throw new Error('Disconnected');
      if (failure) return { ok: false, json: async () => ({ error: failure }) };
      const match = url.match(/^\/api\/books\/(\d+)\?cascade=[01]$/);
      assert.equal(options.method, 'DELETE', 'removing a library book must not edit shared metadata');
      if (match) owned.delete(match[1]);
      return { ok: true };
    },
    _refreshBooksListOnly: async () => { refreshes++; },
  };
  runInNewContext(source, context);
  function click(id, { inSeries = true, container = false } = {}) {
    let handler;
    const button = { dataset: { id: String(id), name: `OWT ${id}`, container: container ? '1' : '0' },
      closest: () => inSeries ? {} : null,
      addEventListener: (_event, callback) => { handler = callback; } };
    context._wireRenderedContent({ querySelectorAll: selector => selector === '.book-del-btn' ? [button] : [] });
    handler();
  }
  function removeSeries() {
    let handler;
    const button = { dataset: { seriesId: '7', seriesName: 'OWT' },
      addEventListener: (_event, callback) => { handler = callback; } };
    context._wireRenderedContent({ querySelectorAll: selector => selector === '.series-del-btn' ? [button] : [] });
    handler({ stopPropagation() {} });
    return choices[0]();
  }
  return { owned, requests, confirmations, errors, click, removeSeries, confirm: () => confirm(),
    choose: index => choices[index](), refreshes: () => refreshes };
}

for (const failure of ['Permission denied', 'network']) {
  test(`failed library deletion shows an error instead of silently refreshing: ${failure}`, async () => {
    const app = setup({ failure });
    app.click(1);
    await app.confirm();
    assert.deepEqual([...app.owned], ['1', '2', '3']);
    assert.deepEqual(app.errors, [failure === 'network' ? 'err.remove_book' : failure]);
    assert.equal(app.refreshes(), 0);
  });
}

test('OWT deletions survive removing the series; the remaining standalone book can be deleted', async () => {
  const app = setup();
  app.click(3);
  await app.confirm();
  app.click(2);
  await app.confirm();
  assert.deepEqual([...app.owned], ['1']);
  await app.removeSeries();
  assert.deepEqual([...app.owned], ['1'], 'removing just the series cannot resurrect deleted books');
  app.click(1, { inSeries: false });
  await app.confirm();
  assert.deepEqual([...app.owned], []);
  assert.deepEqual(app.requests, [
    ['/api/books/3?cascade=1', 'DELETE'], ['/api/books/2?cascade=1', 'DELETE'],
    ['/api/series/7?cascade=0', 'DELETE'], ['/api/books/1?cascade=1', 'DELETE'],
  ]);
  assert.ok(app.confirmations.every(message => message === 'confirm.delete_book'));
  assert.equal(app.refreshes(), 4);
});

for (const cascade of [false, true]) {
  test(`anthologies inside a series retain the contents choice, cascade=${cascade}`, async () => {
    const app = setup();
    app.click(1, { container: true });
    assert.equal(app.requests.length, 0, 'show choices before deleting');
    await app.choose(cascade ? 1 : 0);
    assert.deepEqual(app.requests, [[`/api/books/1?cascade=${cascade ? 1 : 0}`, 'DELETE']]);
  });
}
