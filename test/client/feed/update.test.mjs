import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

class Node {
  constructor(className = '', children = []) {
    this.className = className;
    this.dataset = {};
    this.children = [];
    this.parentNode = null;
    this.innerHTML = '';
    this.rectTop = 130;
    this.classList = { contains: name => this.className.split(' ').includes(name) };
    for (const child of children) this.insertBefore(child, null);
  }
  get firstElementChild() { return this.children[0] || null; }
  get nextElementSibling() { return this.parentNode?.children[this.parentNode.children.indexOf(this) + 1] || null; }
  get isConnected() { return this.parentNode ? this.parentNode.isConnected : !!this.connected; }
  insertBefore(child, before) {
    child.remove();
    const i = before ? this.children.indexOf(before) : this.children.length;
    assert.ok(i >= 0);
    this.children.splice(i, 0, child);
    child.parentNode = this;
  }
  prepend(child) { this.insertBefore(child, this.firstElementChild); }
  remove() {
    if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1);
    this.parentNode = null;
  }
  replaceWith(child) {
    const parent = this.parentNode, next = this.nextElementSibling;
    this.remove();
    parent.insertBefore(child, next);
  }
  replaceChildren(...children) {
    for (const child of [...this.children]) child.remove();
    this.innerHTML = '';
    for (const child of children) this.insertBefore(child, null);
  }
  hasAttribute(name) { return name === 'data-day-index' && this.dataset.dayIndex !== undefined; }
  removeAttribute(name) { if (name === 'data-day-index') delete this.dataset.dayIndex; }
  querySelectorAll(selector) {
    const classes = selector.split(', ').map(s => s.slice(1));
    return this.children.flatMap(child => [
      ...(classes.some(name => child.classList.contains(name)) ? [child] : []),
      ...child.querySelectorAll(selector),
    ]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) {
    if (this.classList.contains(selector.slice(1))) return this;
    return this.parentNode?.closest(selector) || null;
  }
  getClientRects() { return this.hidden ? [] : [this.getBoundingClientRect()]; }
  getBoundingClientRect() { return { top: this.rectTop, bottom: this.rectTop + 20 }; }
}

function setup() {
  const factories = new Map();
  const scroller = { scrollTop: 0, getBoundingClientRect: () => ({ top: 0 }) };
  const context = vm.createContext({
    document: {
      getElementById: () => scroller,
      createElement: name => {
        assert.equal(name, 'template');
        return { set innerHTML(html) { this.content = { firstElementChild: factories.get(html)() }; } };
      },
    },
  });
  const source = readFileSync(new URL('../../../public/js/feed/update.js', import.meta.url), 'utf8');
  vm.runInContext(source.replace('export function', 'function') + '\nthis.update = updateFeedContents;', context);
  const root = new Node();
  root.connected = true;
  function block(key, revision = 1, covers = ['/cover.jpg']) {
    const html = key + ':' + revision;
    factories.set(html, () => {
      if (!key.startsWith('day:')) return new Node(key);
      const entry = new Node('feed-entry'); entry.innerHTML = 'Retained event';
      entry.rectTop = revision === 1 ? 130 : 170;
      const content = new Node('feed-day-content', [entry]);
      const card = new Node('feed-day-card', [new Node('feed-day-cover-stack'), content]);
      card.dataset.dayIndex = '0';
      return card;
    });
    return { key, html, covers };
  }
  return { root, block, scroller, update: context.update };
}

test('duplicate feed snapshots leave all nodes and bindings untouched', () => {
  const s = setup(), blocks = [s.block('header'), s.block('day:today'), s.block('day:yesterday')];
  s.update(s.root, blocks);
  const nodes = [...s.root.children];
  const result = s.update(s.root, blocks);
  assert.equal(result.changed, false);
  assert.equal(result.changedRoots.length, 0);
  assert.deepEqual(s.root.children, nodes);
});

test('new activity updates only its day content, retaining other cards and cover stacks', () => {
  const s = setup();
  s.update(s.root, [s.block('header'), s.block('day:today'), s.block('day:yesterday')]);
  const [header, today, yesterday] = s.root.children;
  const stack = today.querySelector('.feed-day-cover-stack'); stack.innerHTML = 'Loaded cover tiles';
  const oldContent = today.querySelector('.feed-day-content');
  const result = s.update(s.root, [s.block('header'), s.block('day:today', 2), s.block('day:yesterday')]);
  assert.deepEqual(s.root.children, [header, today, yesterday]);
  assert.equal(today.querySelector('.feed-day-cover-stack'), stack);
  assert.equal(stack.innerHTML, 'Loaded cover tiles');
  assert.notEqual(today.querySelector('.feed-day-content'), oldContent);
  assert.equal(result.changedRoots.length, 1);
  assert.equal(result.changedRoots[0], today.querySelector('.feed-day-content'));
});

test('insertion, expiration and account changes do not leave stale cards', () => {
  const s = setup();
  s.update(s.root, [s.block('header'), s.block('day:yesterday')]);
  const oldDay = s.root.children[1];
  s.update(s.root, [s.block('pinned'), s.block('header'), s.block('day:today'), s.block('day:yesterday')]);
  assert.equal(s.root.children[3], oldDay);
  s.update(s.root, [s.block('header'), s.block('day:today')]);
  assert.equal(oldDay.parentNode, null);
  assert.equal(s.root.children.length, 2);
  const previous = [...s.root.children];
  s.update(s.root, [s.block('header'), s.block('day:today')], true);
  assert.ok(previous.every(node => node.parentNode === null));
  assert.ok(s.root.children.every(node => !previous.includes(node)));
});

test('refresh preserves the visible event offset; removed covers are cleared', () => {
  const s = setup();
  s.update(s.root, [s.block('day:today')]);
  s.scroller.scrollTop = 100;
  const stack = s.root.children[0].querySelector('.feed-day-cover-stack');
  stack.innerHTML = 'Now-private cover';
  const result = s.update(s.root, [s.block('day:today', 2, ['/other.jpg'])]);
  assert.equal(stack.innerHTML, '');
  result.restoreScroll();
  assert.equal(s.scroller.scrollTop, 140);
});

test('cover-only changes refresh covers without replacing or rebinding day content', () => {
  const s = setup();
  s.update(s.root, [s.block('day:today')]);
  const day = s.root.children[0], content = day.querySelector('.feed-day-content');
  const stack = day.querySelector('.feed-day-cover-stack'); stack.innerHTML = 'Old tiles';
  const result = s.update(s.root, [s.block('day:today', 1, ['/replacement.jpg'])]);
  assert.equal(result.changed, true);
  assert.equal(result.changedRoots.length, 0);
  assert.equal(day.querySelector('.feed-day-content'), content);
  assert.equal(stack.innerHTML, '');
});

test('scroll anchoring ignores a hidden duplicate of the visible event', () => {
  const s = setup();
  s.update(s.root, [s.block('day:today')]);
  s.scroller.scrollTop = 100;
  const result = s.update(s.root, [s.block('day:today', 2)]);
  const hidden = new Node('feed-entry');
  hidden.innerHTML = 'Retained event'; hidden.hidden = true; hidden.rectTop = 999;
  s.root.children[0].querySelector('.feed-day-content').prepend(hidden);
  result.restoreScroll();
  assert.equal(s.scroller.scrollTop, 140);
});
