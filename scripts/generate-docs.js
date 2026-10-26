#!/usr/bin/env node
// Regenerates the HTML mirror of every docs/*.md file from its markdown
// source, so the two never hand-drift apart again. Run `npm run docs:build`
// after editing any docs/*.md file; `npm run docs:check` (also run by
// `npm test`) fails if the committed HTML is stale relative to its source.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT  = path.resolve(__dirname, '..');
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
${doc.extraHead}  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    * { scrollbar-width: thin; scrollbar-color: #374151 transparent; }
    *::-webkit-scrollbar { width: 5px; height: 5px; }
    *::-webkit-scrollbar-track { background: transparent; }
    *::-webkit-scrollbar-thumb { background: #374151; border-radius: 3px; }
    *::-webkit-scrollbar-thumb:hover { background: #4b5563; }
    html { scroll-behavior: smooth; }
    body { background: #111827; color: #d1d5db; font-family: 'Segoe UI', system-ui, sans-serif; font-size: 0.92rem; line-height: 1.7; }
    a { color: #93c5fd; }

    header {
      position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 0.75rem;
      padding: 0.7rem 1.2rem; border-bottom: 1px solid #374151; background: #111827ee; backdrop-filter: blur(8px);
      flex-wrap: wrap;
    }
    .page-title { font-size: 1.1rem; font-weight: 700; color: #f5a623; }
    .page-sub   { font-size: 0.78rem; color: #6b7280; }
    header nav { margin-left: auto; display: flex; gap: 0.4rem; }
    header nav a {
      color: #9ca3af; text-decoration: none; font-size: 0.78rem;
      border: 1px solid #374151; border-radius: 6px; padding: 0.28rem 0.65rem;
      transition: color 0.12s, background 0.12s;
    }
    header nav a:hover { color: #f5a623; background: #1f2937; }
    /* Hidden when embedded in the in-app viewer (docs-toc.js adds .in-app to
       <html>): the host page already provides its own dialog header. */
    html.in-app header { display: none; }
    /* Embedded in the dialog: the sticky header is gone, so the layout needs
       its own tighter padding and the TOC no longer needs clearance for the
       header (its 4.2rem top offset / 5.5rem max-height are header-relative). */
    html.in-app .layout, html.no-chrome .layout { padding: 0.75rem 1rem 2rem; gap: 0.75rem; }
    html.in-app .toc, html.no-chrome .toc { top: 0.75rem; max-height: calc(100vh - 1.5rem); }

    .layout { width: min(1180px, 100%); margin: 0 auto; display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 1.5rem; padding: 1.5rem 1rem 4rem; align-items: start; }
    .toc {
      position: sticky; top: 4.2rem; max-height: calc(100vh - 5.5rem); overflow: auto;
      background: #1f2937; border: 1px solid #374151; border-radius: 8px; padding: 1rem 1.1rem;
    }
    .toc b { display: block; font-size: 0.68rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 0.6rem; }
    .toc a { display: block; padding: 0.18rem 0; color: #9ca3af; text-decoration: none; font-size: 0.8rem; border-left: 2px solid transparent; padding-left: 0.5rem; }
    .toc a.toc-3 { padding-left: 1.2rem; color: #6b7280; font-size: 0.76rem; }
    .toc a:hover { color: #f5a623; }
    .toc a.active { color: #f5a623; border-left-color: #f5a623; font-weight: 600; }

    .content { min-width: 0; background: #1f2937; border: 1px solid #374151; border-radius: 8px; padding: clamp(1rem, 3vw, 2rem); }
    h1, h2, h3, h4 { line-height: 1.25; scroll-margin-top: 4.5rem; }
    h1 { font-size: 1.5rem; color: #f9fafb; margin-bottom: 1.5rem; }
    h2 { font-size: 1.05rem; font-weight: 700; color: #f9fafb; margin: 1.8rem 0 0.8rem; padding-bottom: 0.4rem; border-bottom: 1px solid #374151; }
    h2:first-child { margin-top: 0; }
    h3 { font-size: 0.9rem; font-weight: 600; color: #e2e8f0; margin: 1.1rem 0 0.4rem; }
    h4 { font-size: 0.85rem; font-weight: 600; color: #d1d5db; margin: 0.9rem 0 0.35rem; }
    .anchor { opacity: 0; text-decoration: none; margin-left: 0.4rem; font-size: 0.75em; color: #6b7280; }
    h2:hover .anchor, h3:hover .anchor { opacity: 1; }

    p { margin-bottom: 0.6rem; color: #d1d5db; text-align: justify; text-justify: inter-word; -webkit-hyphens: auto; -ms-hyphens: auto; hyphens: auto; }
    p:last-child { margin-bottom: 0; }
    ul, ol { padding-left: 1.4rem; margin-bottom: 0.6rem; }
    li { margin-bottom: 0.2rem; }

    code { font-family: 'Consolas', 'Courier New', monospace; font-size: 0.83em; background: #374151; color: #93c5fd; padding: 0.15em 0.4em; border-radius: 3px; }
    pre { background: #0d1117; border: 1px solid #374151; border-radius: 6px; padding: 0.85rem 1rem; overflow-x: auto; margin: 0.65rem 0; }
    pre code { background: none; padding: 0; font-size: 0.82rem; line-height: 1.55; color: #93c5fd; }

    .table-wrap { overflow-x: auto; margin: 0.65rem 0; }
    table { width: 100%; border-collapse: collapse; font-size: 0.84rem; }
    th { background: #111827; color: #9ca3af; font-weight: 600; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid #374151; }
    td { padding: 0.45rem 0.75rem; border-bottom: 1px solid #1e2736; vertical-align: top; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: rgba(255,255,255,0.02); }

    strong { color: #f9fafb; font-weight: 600; }
    em { color: #9ca3af; font-style: italic; }
    blockquote { margin: 0.65rem 0; padding: 0.5rem 0.85rem; border-left: 3px solid #f5a623; background: #17150e; color: #d3c594; }
    hr { border: none; border-top: 1px solid #374151; margin: 1rem 0; }

    .method { font-family: 'Consolas', monospace; font-size: 0.78rem; font-weight: 700; color: #4ade80; background: rgba(74,222,128,0.08); padding: 0.1em 0.4em; border-radius: 3px; }
    .method-del   { color: #f87171; background: rgba(248,113,113,0.08); }
    .method-post  { color: #60a5fa; background: rgba(96,165,250,0.08); }
    .method-patch { color: #a78bfa; background: rgba(167,139,250,0.08); }
    .method-put   { color: #fcd34d; background: rgba(252,211,77,0.08); }

    .source { margin-top: 2.2rem; padding-top: 0.8rem; border-top: 1px solid #374151; color: #4b5563; font-size: 0.72rem; }

    @media (max-width: 760px) {
      .layout { display: block; padding: 0.75rem; }
      .toc { display: none; }
      header { padding: 0.6rem 0.8rem; }
      .content { padding: 1rem; }
    }
  </style>
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
