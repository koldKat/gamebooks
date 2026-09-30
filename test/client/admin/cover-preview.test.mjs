import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('out-of-order file reads cannot replace the latest cover preview', () => {
  const source = readFileSync(new URL('../../../admin/js/users-books.js', import.meta.url), 'utf8');
  const start = source.indexOf("document.getElementById('bef-cover-file').addEventListener('change'");
  const end = source.indexOf("document.getElementById('bef-cover-remove').addEventListener", start);
  const nodes = new Map();
  let change;
  const readers = [];
  const context = {
    _bookEditGeneration: 1,
    _bookEditor: {},
    _pendingAdminCover: null,
    document: {
      getElementById(id) {
        if (!nodes.has(id)) nodes.set(id, { style: {}, addEventListener: (_event, fn) => { change = fn; } });
        return nodes.get(id);
      },
    },
    FileReader: class {
      constructor() { readers.push(this); }
      readAsDataURL() {}
    },
  };
  runInNewContext(source.slice(start, end), context);
  const first = { name: 'first.png' };
  const second = { name: 'second.png' };
  change({ target: { files: [first] } });
  change({ target: { files: [second] } });
  readers[1].onload({ target: { result: 'second-preview' } });
  readers[0].onload({ target: { result: 'first-preview' } });
  assert.equal(nodes.get('bef-cover-img').src, 'second-preview');
  assert.equal(context._pendingAdminCover, second);
  context._bookEditor = null;
  readers[1].onload({ target: { result: 'late-preview' } });
  assert.equal(nodes.get('bef-cover-img').src, 'second-preview');
});
