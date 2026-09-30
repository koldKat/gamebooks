import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openEditor } from '../../../admin/js/editor.js';

// Minimal DOM fixture for lifecycle tests; layout is checked separately in Firefox.
class Element extends EventTarget {
  constructor(tag, document) {
    super();
    this.tagName = tag;
    this.document = document;
    this.children = [];
    this.style = {};
    this.attributes = new Map();
    this.disabled = false;
  }
  get isConnected() { return this === this.document.body || !!this.parentNode?.isConnected; }
  append(...children) {
    for (const child of children) {
      child.remove();
      child.parentNode = this;
      this.children.push(child);
    }
  }
  before(child) {
    const parent = this.parentNode;
    child.remove();
    parent.children.splice(parent.children.indexOf(this), 0, child);
    child.parentNode = parent;
  }
  replaceWith(child) {
    const parent = this.parentNode;
    child.remove();
    parent.children.splice(parent.children.indexOf(this), 1, child);
    child.parentNode = parent;
    this.parentNode = null;
  }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1);
    this.parentNode = null;
  }
  setAttribute(key, value) { this.attributes.set(key, value); }
  getAttribute(key) { return this.attributes.get(key); }
  querySelectorAll() {
    return this.children.flatMap(child => [child, ...child.querySelectorAll()])
      .filter(child => ['button', 'input', 'select', 'textarea'].includes(child.tagName));
  }
  querySelector() { return this.querySelectorAll().find(child => child.tagName === 'input'); }
  focus() { this.document.activeElement = this; }
  showModal() { this.open = true; }
  close() { this.open = false; queueMicrotask(() => this.dispatchEvent(new Event('close'))); }
}

function fixture() {
  const document = {};
  document.createElement = tag => new Element(tag, document);
  document.createComment = () => new Element('comment', document);
  document.body = document.createElement('body');
  const opener = document.createElement('button');
  const form = document.createElement('form');
  form.style.display = 'none';
  const input = document.createElement('input');
  const disabled = document.createElement('button');
  disabled.disabled = true;
  form.append(input, disabled);
  document.body.append(opener, form);
  opener.focus();
  return { document, opener, form, input, disabled };
}

test('editor blocks dismissal while busy and restores the form exactly once', async () => {
  const f = fixture();
  const previous = globalThis.document;
  globalThis.document = f.document;
  try {
    let closes = 0;
    const editor = openEditor({ title: 'Edit', content: f.form, onClose: () => { closes++; } });
    assert.equal(f.document.activeElement, f.input);
    editor.setBusy(true);
    editor.setBusy(true);
    editor.close();
    editor.dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    assert.equal(editor.dialog.open, true);
    assert.equal(f.input.disabled, true);
    editor.setBusy(false);
    assert.equal(f.input.disabled, false);
    assert.equal(f.disabled.disabled, true);
    editor.close();
    assert.equal(f.form.parentNode, f.document.body);
    assert.equal(f.form.style.display, 'none');
    assert.equal(f.document.activeElement, f.opener);
    assert.equal(closes, 1);
    await Promise.resolve();
    assert.equal(closes, 1);
  } finally { globalThis.document = previous; }
});

test('simultaneous editors have unique accessible titles', async () => {
  const f = fixture();
  const previous = globalThis.document;
  globalThis.document = f.document;
  try {
    const first = openEditor({ title: 'First', content: f.form });
    const second = openEditor({ title: 'Second', content: f.document.createElement('form') });
    const firstId = first.dialog.getAttribute('aria-labelledby');
    const secondId = second.dialog.getAttribute('aria-labelledby');
    assert.notEqual(firstId, secondId);
    assert.equal(first.dialog.children[0].children[0].id, firstId);
    assert.equal(second.dialog.children[0].children[0].id, secondId);
    second.close();
    first.close();
    await Promise.resolve();
  } finally { globalThis.document = previous; }
});
