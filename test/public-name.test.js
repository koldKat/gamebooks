'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { publicName } = require('../server/public-name');
const { escapeHtml, escapeJsonString } = require('../server/html-escape');

const clientFormatter = import('data:text/javascript;base64,' + Buffer.from(
  fs.readFileSync('public/js/core/public-name.js', 'utf8')).toString('base64'));

function clientModule(file, globals) {
  const context = vm.createContext(globals);
  vm.runInContext(fs.readFileSync(file, 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/\bexport /g, ''), context);
  return context;
}

test('server and browser strip only the domain of a complete email-shaped name', async () => {
  const browser = (await clientFormatter).publicName;
  for (const [input, expected] of [
    ['reader@example.com', 'reader'], ['reader+books@sub.example.co.uk', 'reader+books'],
    ['Reader@EXAMPLE.BG', 'Reader'], ['читател@example.bg', 'читател'],
    ['a&b@example.com', 'a&b'], [' reader@example.com ', 'reader'],
    ['Reader', 'Reader'], ['  Reader  ', '  Reader  '],
    ['reader@home', 'reader@home'], ['reader@@example.com', 'reader@@example.com'],
    ['Reader @ example.com', 'Reader @ example.com'],
    ['Reader <reader@example.com>', 'Reader <reader@example.com>'],
    ['reader@example..com', 'reader@example..com'], [null, ''],
  ]) {
    assert.equal(publicName(input), expected);
    assert.equal(browser(input), expected);
  }
});

test('feed masks solo and party names while retaining distinct profile identities', async () => {
  const browser = (await clientFormatter).publicName;
  const context = clientModule('public/js/feed/entries.js', {
    publicName: browser, escapeHtml, _hooks: {},
    t: (key, params = {}) => params.user || key,
  });
  const entry = { type: 'book_created', username: 'reader@one.example', userPublicProfile: true };
  let html = context.renderEntry(entry).html;
  assert.match(html, /data-username="reader@one\.example"[^>]*>reader<\/button>/);
  html = context.renderEntry({ ...entry, usernames: [
    { username: 'reader@one.example', userPublicProfile: true },
    { username: 'reader@two.example', userPublicProfile: true },
  ] }).html;
  assert.match(html, /data-username="reader@one\.example"[^>]*>reader<\/button>/);
  assert.match(html, /data-username="reader@two\.example"[^>]*>reader<\/button>/);
  context._hooks.displayFor = () => 'An Author';
  assert.match(context.renderEntry(entry).html, />An Author<\/button>/);
  context._hooks.displayFor = () => 'pen@example.com';
  assert.match(context.renderEntry(entry).html, />pen<\/button>/);
});

test('public profile titles and headers mask email names without changing lookup', async () => {
  const nodes = new Map();
  const document = { getElementById(id) {
    if (!nodes.has(id)) nodes.set(id, { innerHTML: '', style: {}, classList: { add() {}, remove() {} } });
    return nodes.get(id);
  } };
  const context = clientModule('public/js/account/public-profile.js', {
    document, escapeHtml, publicName: (await clientFormatter).publicName, t: key => key,
  });
  const profile = { username: 'reader@example.com', books: [], totalBooks: 0 };
  context.renderPublicProfile(profile);
  assert.equal(nodes.get('pub-modal-title').innerHTML, 'reader');
  assert.match(nodes.get('pub-modal-body').innerHTML, /pub-profile-username">reader</);
  assert.doesNotMatch(nodes.get('pub-modal-body').innerHTML, /@example/);
  assert.equal(profile.username, 'reader@example.com');
  let lookup;
  context.setPublicProfileHooks({ publicFetch: async url => { lookup = url; return { ok: false }; } });
  await context.openPublicProfile(profile.username);
  assert.equal(lookup, '/api/public/user/reader%40example.com');
  assert.equal(nodes.get('pub-modal-title').innerHTML, 'reader');
  context.renderPublicProfile({ ...profile, displayName: 'An Author' });
  assert.equal(nodes.get('pub-modal-title').innerHTML, 'An Author');
});

test('server-rendered profile, feed and forum labels mask email domains', () => {
  const profile = { username: 'reader@example.com', level: 1, totalBooks: 2 };
  const deps = {
    fs: { readFile: (file, encoding, callback) => callback(null,
      '<html><head><title>App</title><meta property="og:type"><meta property="og:locale"></head></html>') },
    path: require('node:path'), '../db': {
      getPublicProfile: () => profile, getPinnedAnnouncement: () => null,
      getFeed: () => [{ type: 'book_created', username: profile.username, bookName: 'Book', completedAt: Date.now() }],
    },
    '../paths': { ROOT: '/unused' }, '../request-helpers': { addSecurityHeaders() {} },
    '../html-escape': { escapeHtml, escapeJsonString }, '../public-name': { publicName },
  };
  const context = vm.createContext({ module: { exports: {} }, require: key => {
    assert.ok(Object.hasOwn(deps, key), key); return deps[key];
  } });
  vm.runInContext(fs.readFileSync('server/routes/public.js', 'utf8'), context);
  let html;
  const response = { writeHead() {}, end(value) { html = value; } };
  context.module.exports.servePublicProfilePage({}, response, 'reader%40example.com');
  assert.match(html, /<title>reader - Gamebook Tracker<\/title>/);
  assert.match(html, /"name":"reader"/);
  assert.match(html, /profile:username" content="reader"/);
  assert.match(html, /\/user\/reader%40example.com/); // The full name still resolves the account.
  context.module.exports.servePublicFeedPage({}, response);
  assert.match(html, /class="fu">reader<\/span>/);
  assert.doesNotMatch(html, /reader@example\.com/);
  const forum = require('../server/forum');
  html = forum.renderForumCategory({ name: 'Books' }, [
    { id: 1, title: 'Hello', username: profile.username, reply_count: 0 },
  ]);
  assert.match(html, /class="author">reader<\/span>/);
  html = forum.renderForumThread({ id: 1, title: 'Hello', body: 'Welcome', username: profile.username }, [
    { id: 2, username: 'reply@example.com', body: 'Hi' },
  ]);
  assert.match(html, /class="pu-name">reader<\/span>/);
  assert.match(html, /class="pu-name">reply<\/span>/);
  assert.doesNotMatch(html, /@example\.com/);
});
