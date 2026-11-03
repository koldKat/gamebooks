'use strict';

// Render public catalogue content and search metadata from public-only records.
const path = require('node:path');
const {escapeHtml: esc} = require('./html-escape');
const SITE = 'https://pathmap.net';
const bookPath = book => `/${book.isContainer ? 'anthology' : 'book'}/${book.id}`;
const json = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const links = books => '<ul class="public-book-links">' + books.map(book => `<li><a href="${bookPath(book)}">${esc(book.name)}</a></li>`).join('') + '</ul>';
const navigation = '<nav class="public-catalogue-nav" aria-label="Public catalogue"><a href="/catalogue">Browse gamebooks</a><a href="/catalogue?type=series">Browse series</a><a href="/">Open app</a></nav>';

function pageDescription(meta, kind) {
  const text = meta.description || (kind === 'series'
    ? `Explore ${meta.name}, a gamebook series with ${meta.books.length} entries. Track your adventures on Gamebook Tracker.`
    : kind === 'anthology'
      ? `Explore ${meta.name}, an anthology of ${(meta.children || []).length} gamebooks. Track each story on Gamebook Tracker.`
      : `Explore ${meta.name}${meta.authors ? ' by ' + meta.authors : ''}. Map branching paths and track your playthroughs on Gamebook Tracker.`);
  return text.replace(/\s+/g, ' ').trim().slice(0, 200);
}

function structuredData(meta, kind, url) {
  const data = {'@context': 'https://schema.org', '@type': kind === 'series' ? 'BookSeries' : 'Book', name: meta.name, url};
  if (meta.description) data.description = meta.description;
  if (meta.coverUrl) data.image = SITE + meta.coverUrl;
  if (meta.authors) data.author = meta.authors.split(/[,;]+/).map(name => name.trim()).filter(Boolean).map(name => ({'@type': 'Person', name}));
  if (meta.isbn) data.isbn = meta.isbn;
  if (meta.pages) data.numberOfPages = meta.pages;
  if (meta.seriesId) data.isPartOf = {'@type': 'BookSeries', name: meta.seriesName, url: `${SITE}/series/${meta.seriesId}`};
  const children = kind === 'series' ? meta.books : meta.children;
  if (children?.length) data.hasPart = children.map(book => ({'@type': 'Book', name: book.name, url: SITE + bookPath(book)}));
  return data;
}

function summary(meta, kind) {
  const related = kind === 'series' ? meta.books : meta.children;
  const facts = [meta.totalSections ? `${meta.totalSections} sections` : '', meta.pages ? `${meta.pages} pages` : '', meta.isbn ? `ISBN ${meta.isbn}` : ''].filter(Boolean);
  return `<article class="public-book-summary">${navigation}<div class="book-modal-header">` +
    (meta.coverUrl ? `<img class="book-modal-cover" src="${esc(meta.coverUrl)}" alt="${esc(meta.name)} cover">` : '') +
    `<div class="book-modal-meta">${meta.authors ? `<p>${esc(meta.authors)}</p>` : ''}` +
    (facts.length ? `<p>${esc(facts.join(' · '))}</p>` : '') +
    (meta.description ? `<div class="book-modal-description">${esc(meta.description)}</div>` : `<p>${esc(pageDescription(meta, kind))}</p>`) +
    (meta.seriesId ? `<p>Series: <a href="/series/${meta.seriesId}">${esc(meta.seriesName)}</a></p>` : '') +
    (meta.parentId ? `<p>Anthology: <a href="/anthology/${meta.parentId}">${esc(meta.parentName)}</a></p>` : '') + '</div></div>' +
    (related?.length ? `<h2>${kind === 'series' ? 'Books in this series' : 'Stories in this anthology'}</h2>${links(related)}` : '') + '</article>';
}

function renderPublicPage(html, meta, kind) {
  const route = `/${kind === 'series' ? 'series' : kind === 'anthology' ? 'anthology' : 'book'}/${meta.id}`;
  const url = SITE + route, title = `${meta.name}${kind === 'series' ? ' - Series' : ''} - Gamebook Tracker`, description = pageDescription(meta, kind);
  const image = SITE + (meta.coverUrl || '/og-image.png');
  const imageType = ({'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif'})[path.extname(image).toLowerCase()];
  const head = `<meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${esc(url)}">
  <meta property="og:type" content="${kind === 'series' ? 'website' : 'book'}">
  <meta property="og:url" content="${esc(url)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:image" content="${esc(image)}">
  ${imageType ? `<meta property="og:image:type" content="${imageType}">` : ''}
  <meta property="og:site_name" content="Gamebook Tracker">
  <meta property="og:locale" content="en_US">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${esc(image)}">
  <script type="application/ld+json">${json(structuredData(meta, kind, url))}</script>
  <link rel="stylesheet" href="/css/public-catalogue.css">`;
  return html.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${esc(title)}</title>`)
    .replace(/<meta (?:name="(?:description|twitter:[^"]+)"|property="og:[^"]+")[^>]*>/g, '')
    .replace(/<link rel="canonical"[^>]*>/g, '')
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '')
    .replace(/<noscript>[\s\S]*?<\/noscript>/g, '')
    .replace('</head>', () => head + '\n</head>')
    .replace('id="app-startup"', 'id="app-startup" hidden')
    .replace('id="public-modal-overlay" class="pub-overlay"', 'id="public-modal-overlay" class="pub-overlay active"')
    .replace('<h1 id="pub-modal-title"></h1>', () => `<h1 id="pub-modal-title">${esc(meta.name)}</h1>`)
    .replace('<button id="pub-back-btn"', '<button style="display:none" id="pub-back-btn"')
    .replace(/<div id="pub-modal-body" class="pub-modal-body">[\s\S]*?<\/div>/, () => `<div id="pub-modal-body" class="pub-modal-body" data-server-entry="${kind === 'series' ? 'series' : 'book'}:${meta.id}">${summary(meta, kind)}</div>`);
}

function renderCatalogue(items, {type = 'books', page = 1, pageSize = 60} = {}) {
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  if (page > pages) return null;
  const pageUrl = number => '/catalogue' + (type === 'series' || number > 1 ? '?' + [type === 'series' ? 'type=series' : '', number > 1 ? `page=${number}` : ''].filter(Boolean).join('&') : '');
  const title = `${type === 'series' ? 'Gamebook series' : 'Gamebook catalogue'}${page > 1 ? ` - Page ${page}` : ''} - Gamebook Tracker`;
  const description = `Browse ${items.length} public ${type === 'series' ? 'gamebook series' : 'gamebooks and anthologies'} on Gamebook Tracker. Find your next adventure${page > 1 ? ` on page ${page}` : ''}.`;
  const selected = items.slice((page - 1) * pageSize, page * pageSize);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${esc(SITE + pageUrl(page))}"><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/css/public-catalogue.css"></head><body class="public-catalogue"><header>${navigation}<h1>${type === 'series' ? 'Gamebook series' : 'Gamebook catalogue'}</h1><p>${esc(description)}</p></header><main><ul class="public-book-links">${selected.map(item => `<li><a href="${type === 'series' ? '/series/' + item.id : bookPath(item)}">${esc(item.name)}</a>${item.authors ? `<span>${esc(item.authors)}</span>` : ''}</li>`).join('')}</ul><nav class="public-catalogue-nav" aria-label="Catalogue pages">${page > 1 ? `<a rel="prev" href="${esc(pageUrl(page - 1))}">Previous</a>` : ''}<span>Page ${page} of ${pages}</span>${page < pages ? `<a rel="next" href="${esc(pageUrl(page + 1))}">Next</a>` : ''}</nav></main></body></html>`;
}

module.exports = {renderPublicPage, renderCatalogue};
