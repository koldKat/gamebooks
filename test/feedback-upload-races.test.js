'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function deferred() {
  let resolve, reject;
  const promise = new Promise((r, j) => { resolve = r; reject = j; });
  return { promise, resolve, reject };
}

function harness(moduleName) {
  const nodes = new Map();
  function element(id) {
    const classes = new Set();
    const el = {
      id, value: '', style: {}, disabled: false, isConnected: true, files: [], children: [], handlers: {},
      classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c), replace: (a, b) => { classes.delete(a); classes.add(b); } },
      addEventListener: (event, fn) => { el.handlers[event] = fn; },
      fire: (event) => el.handlers[event]?.call(el, {}),
      focus() {}, closest: () => ({ style: {} }),
      querySelector: selector => el.children.find(child => child.classList.contains(selector.slice(1))) || null,
      querySelectorAll: () => [],
      remove: () => { for (const parent of nodes.values()) parent.children = parent.children.filter(child => child !== el); },
      cloneNode: () => element(id),
      parentNode: { replaceChild: (next, old) => { old.isConnected = false; nodes.set(id, next); } },
    };
    Object.defineProperty(el, 'innerHTML', { set() { el.children = []; }, get() { return ''; } });
    return el;
  }
  const get = id => { if (!nodes.has(id)) nodes.set(id, element(id)); return nodes.get(id); };
  const uploads = [], posts = [], alerts = [];
  const pending = deferred();
  const context = vm.createContext({
    document: { getElementById: get }, requestAnimationFrame: fn => fn(),
    getUsername: () => 'User', getToken: () => null, t: key => key,
    escapeHtml: value => String(value), isImageFilename: () => false,
    refreshInboxBadge() {}, openImageLightbox() {}, showConfirm() {}, showAlert: message => alerts.push(message),
    uploadAttachment: file => { uploads.push(file.name); return pending.promise; },
    addAttachmentItem: (parent, name) => {
      const item = element(name), remove = element('remove'), label = element('label');
      item.classList.add('att-uploading');
      item.querySelector = selector => selector === '.att-item-rm' ? remove : label;
      parent.children.push(item);
      return item;
    },
    apiFetch: async (url, options) => { if (options?.body) posts.push({ url, body: JSON.parse(options.body) }); return { ok: true, json: async () => [] }; },
  });
  const source = fs.readFileSync(`public/js/community/${moduleName}.js`, 'utf8').replace(/^import .*;$/gm, '').replace(/export function /g, 'function ');
  vm.runInContext(source, context);
  if (moduleName === 'feedback') { context.initFeedback(); get('feedback-btn').fire('click'); }
  else { context.initInbox(() => null); vm.runInContext('_currentThreadId = 1', context); }
  return { get, uploads, posts, alerts, pending, context };
}

for (const moduleName of ['feedback', 'inbox']) {
  test(`${moduleName}: failed attachments block sending until removed`, async () => {
    const h = harness(moduleName);
    const input = h.get(`${moduleName}-file-input`);
    input.files = [{ name: 'broken.png' }];
    const uploading = input.fire('change');
    h.pending.reject(new Error('Upload failed'));
    await uploading;
    h.get(moduleName === 'feedback' ? 'feedback-message-input' : 'inbox-reply-input').value = 'Message';
    const send = h.get(moduleName === 'feedback' ? 'feedback-submit-btn' : 'inbox-reply-send-btn');
    await send.fire('click');
    assert.equal(h.posts.length, 0);
    const item = h.get(`${moduleName}-att-list`).children[0];
    item.querySelector('.att-item-rm').fire('click');
    await send.fire('click');
    assert.equal(h.posts.length, 1);
  });
  test(`${moduleName}: sending waits for all selected attachments, including queued files`, async () => {
    const h = harness(moduleName);
    const input = h.get(`${moduleName}-file-input`);
    input.files = [{ name: 'one.png' }, { name: 'two.png' }];
    const uploading = input.fire('change');
    h.get(moduleName === 'feedback' ? 'feedback-message-input' : 'inbox-reply-input').value = 'Message';
    const send = h.get(moduleName === 'feedback' ? 'feedback-submit-btn' : 'inbox-reply-send-btn');
    await send.fire('click');
    assert.equal(h.posts.length, 0);
    h.pending.resolve({ id: 9 });
    await uploading;
    await send.fire('click');
    assert.equal(h.posts.length, 1);
    assert.deepEqual(h.posts[0].body.attachment_ids, [9, 9]);
  });

  test(`${moduleName}: queued files cannot follow a switch to a new compose session`, async () => {
    const h = harness(moduleName);
    const input = h.get(`${moduleName}-file-input`);
    input.files = [{ name: 'one.png' }, { name: 'two.png' }];
    const uploading = input.fire('change');
    if (moduleName === 'feedback') h.get('feedback-btn').fire('click');
    else vm.runInContext('_currentThreadId = 2; _clearAttachments()', h.context);
    h.pending.resolve({ id: 9 });
    await uploading;
    assert.deepEqual(h.uploads, ['one.png']);
    h.get(moduleName === 'feedback' ? 'feedback-message-input' : 'inbox-reply-input').value = 'New message';
    await h.get(moduleName === 'feedback' ? 'feedback-submit-btn' : 'inbox-reply-send-btn').fire('click');
    assert.deepEqual(h.posts[0].body.attachment_ids, []);
  });
}

test('reply completion preserves the draft in another conversation', async () => {
  const h = harness('inbox'), reply = deferred();
  h.context.apiFetch = () => reply.promise;
  h.get('inbox-reply-input').value = 'Old reply';
  const sending = h.get('inbox-reply-send-btn').fire('click');
  vm.runInContext('_currentThreadId = 2; _clearAttachments()', h.context);
  h.get('inbox-reply-input').value = 'New draft';
  reply.resolve({ ok: true });
  await sending;
  assert.equal(h.get('inbox-reply-input').value, 'New draft');
});
