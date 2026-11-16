import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('home restores the library after lazy rebuilding without overriding user scrolling or another account', () => {
  let token = 'one';
  const frames = [], settled = [], handlers = new Map();
  const panel = { scrollTop: 840, getClientRects: () => [1],
    addEventListener(type, fn, options) { handlers.set(type, { fn, signal: options.signal }); } };
  const context = { document: { getElementById: () => panel }, getToken: () => token,
    AbortController, requestAnimationFrame: fn => frames.push(fn), afterLazyGroupsSettled: fn => settled.push(fn) };
  runInNewContext(readFileSync(new URL('../../../public/js/boot/library-scroll.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export /gm, ''), context);
  const flush = () => { while (frames.length) frames.shift()(); while (settled.length) settled.shift()(); };
  context.captureLibraryScroll();
  panel.scrollTop = 0;
  const restore = context.beginLibraryScrollRestore();
  restore();
  assert.equal(panel.scrollTop, 840);
  panel.scrollTop = 20; // Lazy placeholder shrinks the list while chunks load.
  flush();
  assert.equal(panel.scrollTop, 840);
  restore(true); flush();
  assert.equal(handlers.get('wheel').signal.aborted, true, 'temporary listeners are removed');
  context.captureLibraryScroll();
  panel.scrollTop = 0;
  const next = context.beginLibraryScrollRestore(); next();
  handlers.get('wheel').fn(); panel.scrollTop = 250;
  flush(); next(true); flush();
  assert.equal(panel.scrollTop, 250, 'real user scrolling cancels restoration');
  token = 'two'; panel.scrollTop = 0;
  context.beginLibraryScrollRestore()(true); flush();
  assert.equal(panel.scrollTop, 0, 'a saved position cannot cross accounts');
});
