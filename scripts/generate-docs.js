#!/usr/bin/env node
// Regenerates the HTML mirror of every docs/*.md file from its markdown
// source, so the two never hand-drift apart again. Run `npm run docs:build`
// after editing any docs/*.md file; `npm run docs:check` (also run by
// `npm test`) fails if the committed HTML is stale relative to its source.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT  = path.resolve(__dirname, '..');
const documentationStyles = fs.readFileSync(path.join(ROOT, 'docs/styles/documentation.css'), 'utf8');
const CHECK = process.argv.includes('--check');

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
function methodClass(word) {
  if (word === 'GET') return 'method';
  if (word === 'DELETE') return 'method method-del';
  if (word === 'POST') return 'method method-post';
  if (word === 'PATCH') return 'method method-patch';
  if (word === 'PUT') return 'method method-put';
  return null;
}

const documents = [
  {
    source: 'docs/user-guide.md',
    output: 'public/guide.html',
    title: 'Gamebook Tracker - Guide',
    subtitle: 'Guide',
    extraHead: fs.readFileSync(path.join(ROOT, 'scripts/docs-head/guide-seo.html'), 'utf8'),
    header: false,
    backLink: null,
    crossLinks: [],
  },
  {
    source: 'docs/admin.md',
    output: 'admin/admin-guide.html',
    title: 'Admin Panel Guide - Gamebook Tracker',
    subtitle: 'Admin Panel Guide',
    extraHead: '  <link rel="icon" type="image/svg+xml" href="/favicon.svg">\n',
    header: false,
    backLink: null,
    crossLinks: [],
  },
  {
    source: 'docs/technical.md',
    output: 'admin/technical.html',
    title: 'Technical Reference - Gamebook Tracker',
    subtitle: 'Technical Reference',
    extraHead: '  <link rel="icon" type="image/svg+xml" href="/favicon.svg">\n',
    header: false,
    backLink: null,
    crossLinks: [],
  },
];

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Inline spans: code, links, bold, italic. Code spans are pulled out first so
// their contents never get mangled by the bold/italic/link passes, then
// restored last (matching how every markdown renderer avoids re-parsing
// inside `code`).
function inline(value) {
  let text = escapeHtml(value);
  const code = [];
  text = text.replace(/`([^`]+)`/g, (_, content) => `\u0000${code.push(`<code>${content}</code>`) - 1}\u0000`);
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(?<![a-zA-Z0-9*])\*([^*\n]+)\*(?![a-zA-Z0-9*])/g, '<em>$1</em>');
  return text.replace(/\u0000(\d+)\u0000/g, (_, index) => code[Number(index)]);
}

function slugify(value, used) {
  const base = value.toLowerCase().replace(/`/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';
  let slug = base, suffix = 2;
  while (used.has(slug)) slug = `${base}-${suffix++}`;
  used.add(slug);
  return slug;
}

// A table cell that's exactly one HTTP method verb gets the same coloured
// pill styling admin/technical.html's REST API tables have always had by
// hand - the markdown source just has the plain word, since there's no
// markdown syntax for "style this cell specially".
function tableCell(raw) {
  const trimmed = raw.trim();
  if (HTTP_METHODS.includes(trimmed)) return `<span class="${methodClass(trimmed)}">${trimmed}</span>`;
  return inline(raw);
}

function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const output = [];
  const toc = [];
  const usedSlugs = new Set();
  let paragraph = [];
  let listType = '';
  let codeFence = false;
  let codeLines = [];

  const flushParagraph = () => {
    if (paragraph.length) output.push(`<p>${inline(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (listType) output.push(`</${listType}>`);
    listType = '';
  };
  const flushAll = () => { flushParagraph(); closeList(); };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line.startsWith('```')) {
      flushAll();
      if (!codeFence) { codeFence = true; codeLines = []; }
      else { output.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`); codeFence = false; }
      continue;
    }
    if (codeFence) { codeLines.push(line); continue; }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushAll();
      const level = heading[1].length;
      const slug = slugify(heading[2], usedSlugs);
      if (level >= 2 && level <= 3) toc.push({ level, title: heading[2].replace(/`/g, ''), slug });
      output.push(`<h${level} id="${slug}">${inline(heading[2])}<a class="anchor" href="#${slug}" aria-label="Link to section">#</a></h${level}>`);
      continue;
    }
    if (/^---+$/.test(line.trim())) { flushAll(); output.push('<hr>'); continue; }
    if (line.startsWith('> ')) { flushAll(); output.push(`<blockquote>${inline(line.slice(2))}</blockquote>`); continue; }
    const next = lines[index + 1] || '';
    if (line.includes('|') && /^\s*\|?\s*:?-{3,}/.test(next)) {
      flushAll();
      const tableRows = [line];
      index += 2;
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) { tableRows.push(lines[index]); index++; }
      index--;
      // Split on unescaped pipes only - a `\|` inside a cell (e.g. a code
      // span showing `a | b`, matching standard markdown table escaping) is
      // a literal character, not a column separator.
      const cells = row => row.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, '|'));
      output.push(`<div class="table-wrap"><table><thead><tr>${cells(tableRows[0]).map(cell => `<th>${inline(cell)}</th>`).join('')}</tr></thead><tbody>${tableRows.slice(1).map(row => `<tr>${cells(row).map(cell => `<td>${tableCell(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    const unordered = line.match(/^\s*[-*]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const wanted = ordered ? 'ol' : 'ul';
      if (listType && listType !== wanted) closeList();
      if (!listType) { listType = wanted; output.push(`<${listType}>`); }
      output.push(`<li>${inline((unordered || ordered)[1])}</li>`);
      continue;
    }
    if (!line.trim()) { flushAll(); continue; }
    if (listType) closeList();
    paragraph.push(line.trim());
  }
  flushAll();
  if (codeFence) output.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
  return { body: output.join('\n'), toc };
}

function pageTemplate(doc, markdown) {
  const { body, toc } = markdownToHtml(markdown);
  const tocHtml = toc.map(item => `<a class="toc-${item.level}" href="#${item.slug}">${escapeHtml(item.title)}</a>`).join('\n        ');
  const navLinks = [...(doc.backLink ? [{ ...doc.backLink, cls: 'doc-back' }] : []), ...doc.crossLinks].map(l => `<a href="${l.href}"${l.cls ? ` class="${l.cls}"` : ''}>${escapeHtml(l.label)}</a>`).join('');
  return `<!DOCTYPE html>
<html lang="en"${doc.header === false ? ' class="no-chrome"' : ''}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(doc.title)}</title>
${doc.extraHead}  <style>${documentationStyles}</style>
</head>
<body>
${doc.header === false ? '' : `  <header>
    <div>
      <div class="page-title">Gamebook Tracker</div>
      <div class="page-sub">${escapeHtml(doc.subtitle)}</div>
    </div>
    <nav>${navLinks}</nav>
  </header>
`}  <div class="layout">
    <aside class="toc">
      <b>Contents</b>
      ${tocHtml}
    </aside>
    <article class="content">
${body}
      <p class="source">Generated from <code>${escapeHtml(doc.source)}</code>. Do not edit this HTML directly.</p>
    </article>
  </div>
  <script src="/docs-toc.js"></script>
</body>
</html>
`;
}

const files = documents.map(doc => ({
  path: path.join(ROOT, doc.output),
  content: pageTemplate(doc, fs.readFileSync(path.join(ROOT, doc.source), 'utf8')),
}));

let stale = false;
for (const file of files) {
  if (CHECK) {
    if (!fs.existsSync(file.path) || fs.readFileSync(file.path, 'utf8') !== file.content) {
      console.error(`stale documentation: ${path.relative(ROOT, file.path)}`);
      stale = true;
    }
  } else {
    fs.writeFileSync(file.path, file.content, 'utf8');
    console.log(`generated ${path.relative(ROOT, file.path)}`);
  }
}
if (stale) process.exit(1);
if (CHECK) console.log(`documentation is current (${files.length} HTML files)`);
