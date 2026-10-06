import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../../../public/js/core/graph-library.js', import.meta.url), 'utf8');
function harness() {
  const scripts = [], window = {};
  vm.runInNewContext(source.replace('export function', 'function') + '\nwindow.load = ensureGraphLibrary;', {
    window, document: { head: { appendChild: script => scripts.push(script) }, createElement: () => ({ remove() { this.removed = true; } }) },
  });
  return { window, scripts };
}
test('graph vendor is deferred, shared by concurrent callers and reused after loading', async () => {
  const h = harness();
  assert.equal(h.scripts.length, 0);
  const first = h.window.load();
  assert.equal(h.window.load(), first);
  assert.equal(h.scripts.length, 1);
  assert.equal(h.scripts[0].src, '/vendor/vis-network/vis-network.min.js');
  h.window.vis = {};
  h.scripts[0].onload(); await first; await h.window.load();
  assert.equal(h.scripts.length, 1);
});
test('failed vendor loading can be retried, including a response without the global', async () => {
  const h = harness();
  const first = h.window.load();
  h.scripts[0].onerror();
  await assert.rejects(first, /Could not load/);
  assert.equal(h.scripts[0].removed, true);
  const retry = h.window.load();
  h.scripts[1].onload();
  await assert.rejects(retry, /Could not load/);
  const third = h.window.load();
  h.window.vis = {}; h.scripts[2].onload(); await third;
});
test('hidden desktop frames have no eager URL', () => {
  const html = readFileSync(new URL('../../../public/index.html', import.meta.url), 'utf8');
  for (const id of ['guide-modal-frame', 'forum-modal-frame']) {
    const tag = html.match(new RegExp('<iframe[^>]*id="' + id + '"[^>]*>'))[0];
    assert.ok(tag.includes('data-src='));
    assert.doesNotMatch(tag, /\ssrc=/);
  }
});
