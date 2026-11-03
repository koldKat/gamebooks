'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Database = require('better-sqlite3');
const {renderPublicPage, renderCatalogue} = require('../server/public-seo');
const template = fs.readFileSync('public/index.html', 'utf8');
const book = {id: 7, name: 'The Test Adventure', description: 'A voyage into danger.', authors: 'A. Writer', coverUrl: '/covers/book.png', isbn: '123', totalSections: 100, seriesId: 3, seriesName: 'Adventures'};
const data = html => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
function load(filename, dependencies) {
  const context = {module: {exports: {}}, require: name => name in dependencies ? dependencies[name] : require(name), URL, Date, Intl};
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context);
  return context.module.exports;
}

test('book responses contain unique search/social metadata, actual cover type and visible source content', () => {
  const html = renderPublicPage(template, book, 'book');
  assert.equal((html.match(/name="description"/g) || []).length, 1);
  assert.match(html, /name="description" content="A voyage into danger\."/);
  assert.match(html, /og:image" content="https:\/\/pathmap.net\/covers\/book.png"/);
  assert.match(html, /og:image:type" content="image\/png"/);
  assert.match(html, /<h1 id="pub-modal-title">The Test Adventure<\/h1>/);
  assert.match(html, /id="public-modal-overlay" class="pub-overlay active"/);
  assert.match(html, /data-server-entry="book:7"/);
  assert.match(html, /<a href="\/series\/3">Adventures<\/a>/);
  assert.equal(data(html).image, 'https://pathmap.net/covers/book.png');
  assert.equal(data(html).publisher, undefined);
  assert.equal(data(html).author[0].name, 'A. Writer');
});

test('series and anthologies expose crawlable book links and truthful structured relationships', () => {
  const books = [{id: 8, name: 'First'}, {id: 9, name: 'Collection', isContainer: true}];
  const html = renderPublicPage(template, {id: 3, name: 'Adventures', books}, 'series');
  assert.match(html, /<a href="\/book\/8">First<\/a>/);
  assert.match(html, /<a href="\/anthology\/9">Collection<\/a>/);
  assert.equal(data(html)['@type'], 'BookSeries');
  assert.equal(data(html).hasPart[1].url, 'https://pathmap.net/anthology/9');
  const anthology = renderPublicPage(template, {...book, isContainer: true, children: books}, 'anthology');
  assert.match(anthology, /rel="canonical" href="https:\/\/pathmap.net\/anthology\/7"/);
  assert.equal(data(anthology).hasPart.length, 2);
});

test('metadata is escaped safely for HTML, scripts and replacement strings', () => {
  const malicious = '</script><script>alert(1)</script> $& $` $\' <img src=x onerror=alert(2)>';
  const html = renderPublicPage(template, {...book, name: malicious, description: malicious}, 'book');
  assert.equal(data(html).description, malicious);
  assert.equal(data(html).name, malicious);
  assert.doesNotMatch(html, /<script>alert|<img src=x/);
  assert.equal((html.match(/<body>/g) || []).length, 1);
  assert.equal((html.match(/id="login-form"/g) || []).length, 1);
});

test('SSR preserves registration, login, password recovery and application entry markup exactly', () => {
  const authForm = html => html.match(/<form class="auth-form"[\s\S]*?<\/form>/)[0];
  for (const [kind, meta] of [['book', book], ['anthology', {...book, children: []}], ['series', {id: 3, name: 'Adventures', books: []}]]) {
    const html = renderPublicPage(template, meta, kind);
    assert.equal(authForm(html), authForm(template));
    for (const id of ['register-btn', 'register-password-confirm', 'register-email', 'forgot-pw-btn', 'reset-submit-btn', 'pub-close-btn']) {
      assert.equal((html.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1, id);
    }
    assert.match(html, /<script type="module" src="\/js\/main.js"><\/script>/);
    assert.match(html, /<a href="\/">Open app<\/a>/);
  }
});

test('catalogue pagination provides distinct canonicals, next/previous links and no duplicate book pages', () => {
  const items = Array.from({length: 61}, (_, index) => ({id: index + 1, name: 'Book ' + (index + 1)}));
  const first = renderCatalogue(items), second = renderCatalogue(items, {page: 2});
  assert.match(first, /rel="next" href="\/catalogue\?page=2"/);
  assert.doesNotMatch(first, /href="\/book\/61"/);
  assert.match(second, /href="\/book\/61"/);
  assert.match(second, /rel="prev" href="\/catalogue"/);
  assert.match(second, /rel="canonical" href="https:\/\/pathmap.net\/catalogue\?page=2"/);
  assert.equal(renderCatalogue(items, {page: 3}), null);
});

test('catalogue route accepts ordinary page numbers and rejects invalid or missing pages', () => {
  const routes = load('server/routes/public.js', {fs, path, '../db': {getAllPublicBooks: () => [{id: 7, name: 'Public book'}]},
    '../paths': {ROOT: path.resolve('public')}, '../request-helpers': {addSecurityHeaders() {}},
    '../html-escape': require('../server/html-escape'), '../public-name': require('../server/public-name'), '../public-seo': require('../server/public-seo')});
  let status, body;
  const res = {writeHead(value) {status = value;}, end(value) {body = value;}};
  for (const url of ['/catalogue', '/catalogue?page=1']) {
    routes.servePublicCataloguePage({url}, res);
    assert.equal(status, 200); assert.match(body, /href="\/book\/7"/);
  }
  for (const url of ['/catalogue?page=0', '/catalogue?page=2', '/catalogue?page=no', '/catalogue?type=private']) {
    routes.servePublicCataloguePage({url}, res); assert.equal(status, 404);
  }
});

test('public metadata, cover crawl permissions and sitemap entries exclude private records', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`CREATE TABLE books(id INTEGER PRIMARY KEY, name TEXT, description TEXT, authors TEXT, cover_path TEXT, total_sections INTEGER, max_section_number INTEGER, isbn TEXT, issn TEXT, asin TEXT, pages INTEGER, is_container INTEGER DEFAULT 0, parent_book_id INTEGER, is_public INTEGER DEFAULT 0, series_id INTEGER, updated_at INTEGER);
      CREATE TABLE series(id INTEGER PRIMARY KEY, name TEXT, is_public INTEGER);
      INSERT INTO series VALUES(3,'Public series',1),(4,'Private series',0);
      INSERT INTO books(id,name,is_public,series_id,cover_path) VALUES(1,'Public',1,3,'public.png'),(2,'Private',0,4,'private.png'),(3,'Public child',1,4,'child.png');
      UPDATE books SET parent_book_id=1 WHERE id=3;`);
    const feed = load('server/db/feed.js', {'./connection': {db}, './xp': {}, './job-xp': {}, './content': {}, './books': {}, './rating-stats': {}});
    assert.equal(feed.getPublicBookMeta(2), null);
    assert.equal(feed.getPublicBookMeta(1).seriesName, 'Public series');
    assert.equal(feed.getPublicBookMeta(3).seriesName, null);
    assert.deepEqual(Array.from(feed.getPublicCoverPaths()), ['child.png', 'public.png']);
    assert.deepEqual(Array.from(feed.getBooksForSitemap(), row => row.id), [1, 3]);
  } finally {db.close();}
});

test('sitemap omits invented modification dates and robots allows only named public covers', () => {
  const db = {getBooksForSitemap: () => [{id: 7, updated_at: 1700000000}], getAnthologiesForSitemap: () => [],
    getSeriesForSitemap: () => [{id: 3, created_at: 1600000000}], getPublicProfilesForSitemap: () => [{username: 'Reader'}],
    forumGetThreadsForSitemap: () => [], forumGetCategories: () => [{slug: 'general'}], getPublicCoverPaths: () => ['public book.png']};
  const helpers = load('server/static.js', {fs, path, './db': db, './paths': {ROOT: path.resolve('public')},
    './request-helpers': {addSecurityHeaders() {}}, './runtime-state': {}, './file-transfer': {}, './book-files': {}, './html-escape': require('../server/html-escape')});
  let output;
  const res = {writeHead() {}, end(value) {output = value;}};
  helpers.serveSitemap({}, res);
  assert.match(output, /\?>\n<urlset/);
  assert.match(output, /<loc>https:\/\/pathmap.net\/catalogue\?type=series<\/loc>/);
  assert.match(output, /<loc>https:\/\/pathmap.net\/book\/7<\/loc><lastmod>2023-11-14<\/lastmod>/);
  assert.match(output, /<loc>https:\/\/pathmap.net\/series\/3<\/loc><\/url>/);
  assert.match(output, /<loc>https:\/\/pathmap.net\/user\/Reader<\/loc><\/url>/);
  helpers.serveRobots({}, res);
  assert.ok(output.startsWith('User-agent: *\nAllow: /\n'));
  assert.match(output, /Disallow: \/covers\//);
  assert.match(output, /Allow: \/covers\/public%20book.png\$/);
  assert.doesNotMatch(output, /private.png/);
});
