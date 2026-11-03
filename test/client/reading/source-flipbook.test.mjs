import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindReadingSourceFlipbooks, copySourceFlipbook } from '../../../public/js/reading/source-flipbook.js';

function setup(frames) {
  const document = { createElement(tag) {
    return { tag, ownerDocument: document, attrs: {}, childNodes: [], listeners: {},
      get attributes() { return Object.entries(this.attrs).map(([name, value]) => ({ name, value })); },
      getAttribute(name) { return this.attrs[name] ?? null; },
      setAttribute(name, value) { this.attrs[name] = value; },
      append(...nodes) { this.childNodes.push(...nodes); },
      replaceChildren(...nodes) { this.childNodes = nodes; },
      addEventListener(name, listener) { this.listeners[name] = listener; },
    };
  } };
  const node = document.createElement('figure');
  node.attrs = { class: 'reading-source-flipbook', 'data-reading-frames': JSON.stringify(frames) };
  const root = { ownerDocument: document, querySelectorAll: () => [node] };
  return { node, root, document };
}
const frames = ['a', 'b', 'c'].map((v, i) => ({ src: `/api/books/1525/reading-images/${v.repeat(64)}.png`, label: `Page ${315 + i}` }));

test('manual frames reuse one image and stay bounded without creating navigation', () => {
  const { node, root } = setup(frames);
  bindReadingSourceFlipbooks(root, 1525);
  const [image, controls] = node.childNodes;
  const [previous, position, next, label] = controls.childNodes;
  assert.equal(image.src, frames[2].src);
  assert.equal(next.disabled, true);
  previous.listeners.click({ stopPropagation() {} });
  assert.equal(image.src, frames[1].src);
  assert.equal(label.textContent, '2 / 3');
  position.value = '0'; position.listeners.input();
  assert.equal(previous.disabled, true);
  assert.equal(image.src, frames[0].src);
  assert.equal(node.childNodes[0], image);
  assert.equal(node.childNodes.length, 2);
  bindReadingSourceFlipbooks(root, 1525);
  assert.equal(node.childNodes[0], image);
  assert.equal(image.src, frames[0].src);
  assert.ok(controls.childNodes.every(n => n.tag !== 'a' && !n.attrs.href));
});

test('only this book’s protected frame URLs can be loaded', () => {
  for (const src of ['https://example.com/a.png', 'javascript:alert(1)', frames[0].src.replace('/1525/', '/1/')]) {
    const { node, root, document } = setup([{ ...frames[0], src }, frames[1]]);
    assert.throws(() => copySourceFlipbook(node, document, 1525));
    bindReadingSourceFlipbooks(root, 1525);
    assert.equal(node.childNodes.length, 0);
  }
  const { node, document } = setup(frames);
  node.attrs.onclick = 'bad()';
  assert.throws(() => copySourceFlipbook(node, document, 1525));
});
