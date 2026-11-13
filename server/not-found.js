'use strict';

// Friendly HTML for missing browser destinations; APIs and embedded assets keep their failure responses.
const messages = require('./not-found-messages');
const { escapeHtml } = require('./html-escape');

function isDocumentNavigation(req) {
  const headers = req.headers || {}, destination = headers['sec-fetch-dest'];
  return ['document', 'iframe', 'frame'].includes(destination)
    || !destination && /\btext\/html\b/i.test(headers.accept || '');
}

function renderNotFoundPage(message = messages[Math.floor(Math.random() * messages.length)]) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Off the map | Gamebook Tracker</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/css/pages/not-found.css"></head><body><main>
<img src="/images/lost-adventurer.svg" width="280" height="184" alt="A puzzled adventurer studying a map beside signposts pointing in opposite directions">
<div class="code">404 · PAGE NOT FOUND</div><h1>You’ve wandered off the map.</h1>
<p>${escapeHtml(message)}</p><a href="/">&#8592; Back to the adventure</a>
</main></body></html>`;
}

function serveNotFoundPage(req, res, getMessage = () => require('./db').getRandomNotFoundTemplate()) {
  res.writeHead(404, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex',
    'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'self'; base-uri 'none'; frame-ancestors 'self'",
  });
  res.end(req.method === 'HEAD' ? undefined : renderNotFoundPage(getMessage()));
}

module.exports = { renderNotFoundPage, serveNotFoundPage, isDocumentNavigation };
