import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderReadingMatter } from '../../../public/js/reading/content.js';

const textNode = textContent => ({ nodeType: 3, textContent });
const source = (tagName, children = [], attrs = {}) => ({ nodeType: 1, tagName,
  childNodes: children, attributes: Object.entries(attrs).map(([name, value]) => ({ name, value })),
  getAttribute: name => attrs[name] ?? null });
function setup(nodes) {
  const element = tag => ({ tag, children: [], attrs: {},
    append(...children) { this.children.push(...children); },
    getAttribute(name) { return this.attrs[name] ?? null; },
    setAttribute(name, value) { this.attrs[name] = value; } });
  const document = { createTextNode: textNode, createElement: tag => tag === 'template' ? { content: { childNodes: nodes } } : element(tag) };
  return { mount: { ...element('div'), className: 'reading-frontmatter' }, document };
}

test('database markup defines headings, paragraphs, emphasis and list numbering for any book', () => {
  const nodes = [source('H3', [textNode('Rules')]), source('P', [source('STRONG', [textNode('Luck:')]), textNode(' Roll dice.'), source('BR')]),
    source('OL', [source('LI', [textNode('Repeat.')], { value: '7' })], { start: '6' })];
  for (const id of [1, 202, 263, 267, 999]) {
    const { mount, document } = setup(nodes);
    assert.equal(renderReadingMatter(mount, id, '<h3>Rules</h3>', document), true);
    assert.deepEqual(mount.children.map(n => n.tag), ['h3', 'p', 'ol']);
    assert.equal(mount.children[2].attrs.start, '6');
    assert.equal(mount.children[2].children[0].attrs.value, '7');
  }
});

test('plain text retains legacy rendering without heading or sentence guessing', () => {
  const { mount, document } = setup([]);
  for (const text of ['BACKGROUND\n\nText', 'Opening. YOU have been on the island.', '<script>bad()</script>']) {
    assert.equal(renderReadingMatter(mount, 263, text, document), false);
    assert.equal(mount.children.length, 0);
  }
});

test('named section links remain inert fragments and can be disabled in access previews', () => {
  for (const sectionLinks of [true, false]) {
    const { mount, document } = setup([source('P', [source('A', [textNode('Prologue')], { href: '#section-prologue' })])]);
    assert.equal(renderReadingMatter(mount, 1495, '<p>Prologue</p>', document, { sectionLinks }), true);
    const link = mount.children[0].children[0];
    assert.equal(link.tag, sectionLinks ? 'a' : 'span');
    assert.equal(link.attrs.href, sectionLinks ? '#section-prologue' : undefined);
  }
  for (const href of ['#section-0', '#section--1', '#section-prologue extra', '#section-' + 'a'.repeat(65), 'javascript:alert(1)', 'https://example.com/#section-prologue']) {
    const { mount, document } = setup([source('P', [source('A', [], { href })])]);
    assert.equal(renderReadingMatter(mount, 1495, '<p></p>', document), false, href);
    assert.equal(mount.children.length, 0);
  }
});

test('printed previous-entry instructions retain only the exact local fragment and become inert in previews', () => {
  for (const sectionLinks of [true, false]) {
    const { mount, document } = setup([source('P', [source('A', [textNode('Go back and try again!')], { href: '#reading-previous-entry' })])]);
    assert.equal(renderReadingMatter(mount, 1501, '<p>Go back</p>', document, { sectionLinks }), true);
    const link = mount.children[0].children[0];
    assert.equal(link.tag, sectionLinks ? 'a' : 'span');
    assert.equal(link.attrs.href, sectionLinks ? '#reading-previous-entry' : undefined);
  }
  for (const attrs of [{ href: '#reading-previous-entry/extra' }, { href: '#reading-previous-entry extra' },
    { href: '#reading-previous-entry', onclick: 'bad()' }, { href: '#reading-previous-entry', target: '_blank' }]) {
    const { mount, document } = setup([source('P', [source('A', [], attrs)])]);
    assert.equal(renderReadingMatter(mount, 1501, '<p>Go back</p>', document), false);
    assert.equal(mount.children.length, 0);
  }
});

test('printed number-and-letter map references remain safe section fragments', () => {
  for (const marker of ['1A', '6D', '105b']) {
    for (const sectionLinks of [true, false]) {
      const href = '#section-' + marker;
      const { mount, document } = setup([source('P', [source('A', [textNode(marker)], { href })])]);
      assert.equal(renderReadingMatter(mount, 1496, '<p>Location</p>', document, { sectionLinks }), true);
      assert.equal(mount.children[0].children[0].attrs.href, sectionLinks ? href : undefined);
    }
  }
  for (const marker of ['0A', '1A extra', '1A/../../other', '1234567A']) {
    const { mount, document } = setup([source('P', [source('A', [], { href: '#section-' + marker })])]);
    assert.equal(renderReadingMatter(mount, 1496, '<p>Location</p>', document), false);
    assert.equal(mount.children.length, 0);
  }
});

test('left-aligned native illustration bands retain only their canonical bounded width', () => {
  const attrs = { class: 'reading-art-stack', 'data-source-width-percent': '94.14414414414415', style: 'width:94.14414414414415%;margin:0' };
  const image = source('IMG', [], { src: `/api/books/1496/reading-images/${'a'.repeat(64)}.png` });
  const { mount, document } = setup([source('FIGURE', [image], attrs)]);
  assert.equal(renderReadingMatter(mount, 1496, '<figure>Original tail</figure>', document), true);
  assert.equal(mount.children[0].attrs.style, attrs.style);
  for (const style of ['width:95%', attrs.style + ';position:fixed', attrs.style + ';margin-left:10em']) {
    const { mount, document } = setup([source('FIGURE', [image], { ...attrs, style })]);
    assert.equal(renderReadingMatter(mount, 1496, '<figure>Original tail</figure>', document), false);
    assert.equal(mount.children.length, 0);
  }
});

test('illustrated prose retains both text and this book’s protected artwork without accepting arbitrary styles', () => {
  const content = [source('FIGURE', [source('P', [textNode('Original prose')])]),
    source('FIGURE', [source('IMG', [], { src: `/api/books/1495/reading-images/${'a'.repeat(64)}.png` })])];
  const attrs = { class: 'reading-illustrated-prose' };
  const { mount, document } = setup([source('FIGURE', content, attrs)]);
  assert.equal(renderReadingMatter(mount, 1495, '<figure></figure>', document), true);
  assert.deepEqual(mount.children[0].attrs, attrs);
  assert.equal(mount.children[0].children[0].children[0].children[0].textContent, 'Original prose');
  for (const invalid of [{ class: 'reading-illustrated-prose hidden' }, { style: 'position:fixed' }, { onclick: 'bad()' }]) {
    const { mount, document } = setup([source('FIGURE', content, { ...attrs, ...invalid })]);
    assert.equal(renderReadingMatter(mount, 1495, '<figure></figure>', document), false);
    assert.equal(mount.children.length, 0);
  }
});

test('original price lists preserve their source rows with only the permitted table class', () => {
  const row = source('TR', [source('TD', [textNode('Book … ')]), source('TD', [textNode('$2.95')])]);
  const { mount, document } = setup([source('TABLE', [source('TBODY', [row])], { class: 'reading-source-prices' })]);
  assert.equal(renderReadingMatter(mount, 1495, '<table></table>', document), true);
  assert.equal(mount.children[0].attrs.class, 'reading-source-prices');
  assert.equal(mount.children[0].children[0].children[0].children.length, 2);
  const invalid = setup([source('TABLE', [row], { class: 'reading-source-prices hidden' })]);
  assert.equal(renderReadingMatter(invalid.mount, 1495, '<table></table>', invalid.document), false);
});

test('source word lists preserve their columns without allowing arbitrary table attributes', () => {
  const row = source('TR', ['TWEETER', 'PARA-GOOMBA', 'PHANTO'].map(word => source('TD', [source('STRONG', [textNode(word)])])));
  const { mount, document } = setup([source('TABLE', [source('TBODY', [row])], { class: 'reading-word-list' })]);
  assert.equal(renderReadingMatter(mount, 1501, '<table></table>', document), true);
  assert.equal(mount.children[0].attrs.class, 'reading-word-list');
  assert.equal(mount.children[0].children[0].children[0].children.length, 3);
  const rejected = setup([source('TABLE', [row], { class: 'reading-word-list hidden' })]);
  assert.equal(renderReadingMatter(rejected.mount, 1501, '<table></table>', rejected.document), false);
});

test('wide source tables retain a keyboard-accessible scroll container with strict attributes', () => {
  const attrs = { class: 'reading-table-scroll', tabindex: '0', 'aria-label': 'Wide table: scroll horizontally' };
  const table = source('TABLE', [source('TR', [source('TD', [textNode('101+')])])], { class: 'reading-wide-table' });
  const { mount, document } = setup([source('FIGURE', [table], attrs)]);
  assert.equal(renderReadingMatter(mount, 1470, '<figure></figure>', document), true);
  assert.deepEqual(mount.children[0].attrs, attrs);
  assert.equal(mount.children[0].children[0].attrs.class, 'reading-wide-table');
  for (const invalid of [{ tabindex: '-1' }, { onclick: 'bad()' }, { class: 'arbitrary' }, { style: 'position:fixed' }]) {
    const { mount, document } = setup([source('FIGURE', [table], { ...attrs, ...invalid })]);
    assert.equal(renderReadingMatter(mount, 1470, '<figure></figure>', document), false);
    assert.equal(mount.children.length, 0);
  }
});

test('native illustration bands align right without accepting arbitrary layout or image URLs', () => {
  const image = letter => source('IMG', [], { src: `/api/books/1494/reading-images/${letter.repeat(64)}.png` });
  const band = { class: 'reading-art-stack', 'data-source-right-width-percent': '72.66666666666667',
    style: 'width:72.66666666666667%;margin:0 0 0 auto' };
  const { mount, document } = setup([
    source('FIGURE', [source('FIGURE', [image('a')], band), image('b')], { class: 'reading-art-stack' }),
  ]);
  assert.equal(renderReadingMatter(mount, 1494, '<figure></figure>', document), true);
  assert.equal(mount.children[0].children[0].attrs.style, 'width:72.66666666666667%;margin:0 0 0 auto');
  assert.equal(mount.children[0].children[1].src, `/api/books/1494/reading-images/${'b'.repeat(64)}.png`);
  for (const attrs of [
    { ...band, 'data-source-right-width-percent': '0' },
    { ...band, 'data-source-right-width-percent': '100.1' },
    { ...band, 'data-source-right-width-percent': '50%;position:fixed' },
    { ...band, 'data-source-width-percent': '80' },
    { ...band, class: 'reading-art-parts' },
    { ...band, style: 'position:fixed' },
    { ...band, style: 'width:50%;margin:0 0 0 auto' },
  ]) {
    const { mount, document } = setup([source('P', [textNode('Prefix')]), source('FIGURE', [image('a')], attrs)]);
    assert.equal(renderReadingMatter(mount, 1494, '<p>Prefix</p>', document), false);
    assert.equal(mount.children.length, 0);
  }
  const foreign = setup([source('FIGURE', [source('IMG', [], { src: '/api/books/1/reading-images/' + 'a'.repeat(64) + '.png' })], band)]);
  assert.equal(renderReadingMatter(foreign.mount, 1494, '<figure></figure>', foreign.document), false);
});

test('source-centered matter and underlined headings render with canonical alignment', () => {
  const { mount, document } = setup([
    source('H2', [source('U', [textNode('WARNING!')])], { style: ' text-align : center; ' }),
    source('P', [textNode('Choose carefully.'), source('BR'), textNode('Your adventure begins.')], { style: 'text-align:center' }),
  ]);
  assert.equal(renderReadingMatter(mount, 991, '<h2>WARNING!</h2>', document), true);
  assert.equal(mount.children[0].attrs.style, 'text-align:center');
  assert.equal(mount.children[0].children[0].tag, 'u');
  assert.equal(mount.children[1].attrs.style, 'text-align:center');
  assert.equal(mount.children[1].children[1].tag, 'br');
});

test('imported paragraph spacing, indentation and type sizes render without raw HTML fallback', () => {
  const { mount, document } = setup([
    source('H2', [textNode('BEWARE and WARNING!')], { style: 'text-align:center;margin-bottom:0' }),
    source('HR', [], { style: 'border:0;border-top:1px solid currentColor;margin:0 0 1em' }),
    source('P', [textNode('This book is different from other books.')], {
      style: 'text-align:justify;text-indent:0;margin:0;font-size:0.8em',
    }),
    source('P', [textNode('Your adventure begins.')], {
      style: 'text-align:justify;text-indent:1.25em;margin:0;margin-top:1em',
    }),
    source('P', [textNode('A hanging entry.')], {
      style: 'text-align:justify;text-indent:-1.25em;margin:0 0 0 1.25em',
    }),
  ]);
  assert.equal(renderReadingMatter(mount, 1143, '<h2>BEWARE and WARNING!</h2>', document), true);
  assert.equal(mount.children[1].attrs.style, 'border:0;border-top:1px solid currentColor;margin:0 0 1em');
  assert.equal(mount.children[2].attrs.style, 'text-align:justify;text-indent:0;margin:0;font-size:0.8em');
  assert.equal(mount.children[3].attrs.style, 'text-align:justify;text-indent:1.25em;margin:0;margin-top:1em');
  assert.equal(mount.children[4].attrs.style, 'text-align:justify;text-indent:-1.25em;margin:0 0 0 1.25em');
});

test('import formatting rejects unsafe, ambiguous and unbounded CSS atomically', () => {
  for (const style of [
    'font-size:99em', 'font-size:0', 'font-size:1em!important', 'margin:-1em',
    'margin:999em', 'margin:calc(1em + 1px)', 'margin:var(--external)', 'text-indent:-999em',
    'text-align:justify;position:fixed', 'text-align:center;text-align:right',
    'background:url(https://example.com)', 'font-family:external', 'color:transparent',
    'text-align:/**/center', 'margin:0;display:none', 'border-top:1px solid red',
  ]) {
    const { mount, document } = setup([source('P', [textNode('Safe prefix')]), source('P', [], { style })]);
    assert.equal(renderReadingMatter(mount, 1143, '<p>Original text.</p>', document), false, style);
    assert.equal(mount.children.length, 0, style);
    assert.equal(mount.className, 'reading-frontmatter');
  }
});

test('source rules render between matter blocks without accepting attributes', () => {
  const { mount, document } = setup([
    source('H2', [textNode('Warning')]), source('HR'), source('P', [textNode('Choose carefully.')]),
  ]);
  assert.equal(renderReadingMatter(mount, 1029, '<h2>Warning</h2><hr><p>Choose carefully.</p>', document), true);
  assert.deepEqual(mount.children.map(n => n.tag), ['h2', 'hr', 'p']);
  for (const attrs of [{ onclick: 'bad()' }, { style: 'position:fixed' }]) {
    const { mount, document } = setup([source('H2', [textNode('Warning')]), source('HR', [], attrs)]);
    assert.equal(renderReadingMatter(mount, 1029, '<h2>Warning</h2><hr>', document), false);
    assert.equal(mount.children.length, 0);
  }
});

test('source hanging paragraphs retain their layout without allowing arbitrary classes', () => {
  for (const className of ['reading-hanging', 'reading-hanging-wide', 'reading-verse-line']) {
    const { mount, document } = setup([
      source('P', [textNode('Abbot—A man who is head of a monastery.')], { class: className }),
    ]);
    assert.equal(renderReadingMatter(mount, 1031, `<p class="${className}">Abbot</p>`, document), true);
    assert.equal(mount.children[0].attrs.class, className);
    for (const bad of [
      source('P', [], { class: `${className} hidden` }),
      source('P', [], { class: 'hidden' }),
      source('P', [], { class: className, style: 'position:fixed' }),
      source('P', [], { class: className, onclick: 'bad()' }),
      source('IMG', [], { class: className }),
    ]) {
      const { mount, document } = setup([source('P', [textNode('Safe prefix')]), bad]);
      assert.equal(renderReadingMatter(mount, 1031, '<p>Safe prefix</p>', document), false);
      assert.equal(mount.children.length, 0);
    }
  }
});

test('indented glossary entries retain source italics and reject unrelated attributes', () => {
  const { mount, document } = setup([
    source('P', [source('EM', [textNode('Grind')]), textNode('—skating on the '), source('EM', [textNode('trucks')])], { class: 'reading-indented' }),
  ]);
  assert.equal(renderReadingMatter(mount, 1050, '<p class="reading-indented">Grind</p>', document), true);
  assert.equal(mount.children[0].attrs.class, 'reading-indented');
  assert.deepEqual(mount.children[0].children.filter(n => n.tag === 'em').map(n => n.children[0].textContent), ['Grind', 'trucks']);
  for (const bad of [
    source('P', [], { class: 'reading-indented hidden' }),
    source('P', [], { class: 'reading-indented', style: 'position:fixed' }),
    source('P', [], { class: 'reading-indented', onclick: 'bad()' }),
    source('IMG', [], { class: 'reading-indented' }),
  ]) {
    const { mount, document } = setup([source('P', [textNode('Safe prefix')]), bad]);
    assert.equal(renderReadingMatter(mount, 1050, '<p>Safe prefix</p>', document), false);
    assert.equal(mount.children.length, 0);
  }
});

test('original image pieces retain their figure layout while foreign classes and attributes are rejected', () => {
  const src = '/api/books/1032/reading-images/' + 'a'.repeat(64) + '.png';
  const { mount, document } = setup([
    source('FIGURE', [source('IMG', [], { src, alt: 'Original illustration' })], { class: 'reading-art-parts' }),
  ]);
  assert.equal(renderReadingMatter(mount, 1032, '<figure>Picture</figure>', document), true);
  assert.equal(mount.children[0].attrs.class, 'reading-art-parts');
  assert.equal(mount.children[0].children[0].src, src);
  for (const bad of [
    source('FIGURE', [], { class: 'reading-art-parts hidden' }),
    source('FIGURE', [], { class: 'hidden' }),
    source('FIGURE', [], { class: 'reading-art-parts', style: 'position:fixed' }),
    source('FIGURE', [], { class: 'reading-art-parts', onclick: 'bad()' }),
    source('P', [], { class: 'reading-art-parts' }),
    source('FIGURE', [source('IMG', [], { src: '/public/picture.png' })], { class: 'reading-art-parts' }),
  ]) {
    const { mount, document } = setup([source('P', [textNode('Safe prefix')]), bad]);
    assert.equal(renderReadingMatter(mount, 1032, '<p>Safe prefix</p>', document), false);
    assert.equal(mount.children.length, 0);
  }
});

test('stacked original image strips retain their order and bounded source width', () => {
  const image = letter => source('IMG', [], { src: `/api/books/1285/reading-images/${letter.repeat(64)}.png` });
  const { mount, document } = setup([
    source('FIGURE', [image('a'), image('b')], { class: 'reading-art-stack', 'data-source-width-percent': '62.5' }),
  ]);
  assert.equal(renderReadingMatter(mount, 1285, '<figure>Map</figure>', document), true);
  assert.equal(mount.children[0].attrs.class, 'reading-art-stack');
  assert.equal(mount.children[0].attrs.style, 'width:62.5%');
  assert.deepEqual(mount.children[0].children.map(n => n.src), [
    `/api/books/1285/reading-images/${'a'.repeat(64)}.png`,
    `/api/books/1285/reading-images/${'b'.repeat(64)}.png`,
  ]);
  for (const width of ['0', '-1', '100.1', 'Infinity', '50%;position:fixed', 'calc(100% + 1px)']) {
    const { mount, document } = setup([
      source('P', [textNode('Prefix')]),
      source('FIGURE', [image('a')], { class: 'reading-art-stack', 'data-source-width-percent': width }),
    ]);
    assert.equal(renderReadingMatter(mount, 1285, '<p>Prefix</p>', document), false, width);
    assert.equal(mount.children.length, 0);
  }
  const { mount: wrongClass, document: wrongDocument } = setup([
    source('FIGURE', [image('a')], { class: 'reading-art-parts', 'data-source-width-percent': '50' }),
  ]);
  assert.equal(renderReadingMatter(wrongClass, 1285, '<figure>Map</figure>', wrongDocument), false);
});

test('inline source symbols remain protected images within their sentence', () => {
  const src = `/api/books/1285/reading-images/${'a'.repeat(64)}.png`;
  const { mount, document } = setup([
    source('P', [textNode('Roll '), source('IMG', [], { src, alt: 'Die showing six.', class: 'reading-inline-symbol' }), textNode(' to recover.')]),
  ]);
  assert.equal(renderReadingMatter(mount, 1285, '<p>Roll</p>', document), true);
  assert.equal(mount.children[0].children[1].attrs.class, 'reading-inline-symbol');
  assert.equal(mount.children[0].children[1].src, src);
  for (const attrs of [
    { src, class: 'reading-inline-symbol hidden' },
    { src: src.replace('/1285/', '/1284/'), class: 'reading-inline-symbol' },
    { src, class: 'reading-inline-symbol', onload: 'bad()' },
  ]) {
    const { mount, document } = setup([source('P', [source('IMG', [], attrs)])]);
    assert.equal(renderReadingMatter(mount, 1285, '<p>Roll</p>', document), false);
    assert.equal(mount.children.length, 0);
  }
});

test('native opening initials and words retain their protected inline class without accepting extra attributes', () => {
  const src = `/api/books/1501/reading-images/${'a'.repeat(64)}.png`;
  for (const className of ['reading-inline-initial', 'reading-inline-word']) {
    const { mount, document } = setup([source('P', [source('IMG', [], { src, alt: 'M', class: className }), textNode('ario')])]);
    assert.equal(renderReadingMatter(mount, 1501, '<p>Mario</p>', document), true);
    assert.equal(mount.children[0].children[0].attrs.class, className);
    for (const attrs of [{ src, class: className + ' hidden' }, { src, class: className, style: 'height:99em' },
      { src: src.replace('/1501/', '/1502/'), class: className }]) {
      const rejected = setup([source('P', [source('IMG', [], attrs)])]);
      assert.equal(renderReadingMatter(rejected.mount, 1501, '<p>Mario</p>', rejected.document), false);
      assert.equal(rejected.mount.children.length, 0);
    }
  }
});

test('matter section references accept only local numeric destinations', () => {
  const { mount, document } = setup([
    source('P', [textNode('Start at '), source('A', [source('STRONG', [textNode('11')])], { href: '#section-11' })]),
  ]);
  assert.equal(renderReadingMatter(mount, 1285, '<p>Start at 11</p>', document), true);
  assert.equal(mount.children[0].children[1].attrs.href, '#section-11');
  const gate = setup([source('P', [source('A', [textNode('11')], { href: '#section-11' })])]);
  assert.equal(renderReadingMatter(gate.mount, 1285, '<p>Start at 11</p>', gate.document, { sectionLinks: false }), true);
  assert.equal(gate.mount.children[0].children[0].tag, 'span');
  assert.equal(gate.mount.children[0].children[0].attrs.href, undefined);
  assert.equal(gate.mount.children[0].children[0].children[0].textContent, '11');
  for (const attrs of [
    { href: 'https://example.com' }, { href: 'javascript:bad()' }, { href: '#section-0' },
    { href: '#section-11', onclick: 'bad()' }, { href: '#section-11', target: '_blank' },
    { href: '#section-11/../../' }, { href: '#other-aside' },
  ]) {
    const { mount, document } = setup([source('P', [textNode('Prefix')]), source('A', [], attrs)]);
    assert.equal(renderReadingMatter(mount, 1285, '<p>Prefix</p>', document), false);
    assert.equal(mount.children.length, 0);
  }
});

test('source left and right alignment override inherited justification without allowing other CSS', () => {
  for (const alignment of ['left', 'right']) {
    const { mount, document } = setup([
      source('P', [textNode('Original layout.')], { style: ` TEXT-ALIGN : ${alignment.toUpperCase()}; ` }),
    ]);
    assert.equal(renderReadingMatter(mount, 1025, '<p>Original layout.</p>', document), true);
    assert.equal(mount.children[0].attrs.style, `text-align:${alignment}`);
  }
  for (const value of ['text-align:left;position:fixed', 'text-align:right!important', 'text-align:inherit']) {
    const { mount, document } = setup([source('P', [], { style: value })]);
    assert.equal(renderReadingMatter(mount, 1025, '<p>Original layout.</p>', document), false);
    assert.equal(mount.children.length, 0);
  }
});

test('alignment support rejects other CSS and attributes without inserting a partial result', () => {
  for (const bad of [
    source('P', [], { style: 'text-align:center;position:fixed' }),
    source('P', [], { style: 'background:url(https://example.com)' }),
    source('P', [], { style: 'text-align:center!important' }),
    source('IMG', [], { style: 'text-align:center' }),
    source('U', [], { onclick: 'bad()' }),
  ]) {
    const { mount, document } = setup([source('P', [textNode('Safe prefix')]), bad]);
    assert.equal(renderReadingMatter(mount, 991, '<p>Safe prefix</p>', document), false);
    assert.equal(mount.children.length, 0);
  }
});

test('player spell tables render as inert structured matter with accessible headers', () => {
  const nodes = [source('TABLE', [source('CAPTION', [textNode('Spells')]),
    source('THEAD', [source('TR', [source('TH', [textNode('Code')], { scope: 'col' }), source('TH', [textNode('Cost')])])]),
    source('TBODY', [source('TR', [source('TH', [textNode('ZAP')], { scope: 'row' }), source('TD', [textNode('4')])])])])];
  const { mount, document } = setup(nodes);
  assert.equal(renderReadingMatter(mount, 671, '<table>Spells</table>', document), true);
  const table = mount.children[0];
  assert.equal(table.tag, 'table');
  assert.equal(table.children[1].children[0].children[0].attrs.scope, 'col');
  assert.equal(table.children[2].children[0].children[0].attrs.scope, 'row');
  assert.equal(table.children[2].children[0].children[1].children[0].textContent, '4');
});

test('table support never allows script, event, style or arbitrary attributes', () => {
  for (const bad of [source('TD', [], { onclick: 'bad()' }), source('TABLE', [], { style: 'position:fixed' }),
    source('TH', [], { scope: 'invalid' }), source('TD', [source('SCRIPT')]), source('TD', [], { colspan: '999' })]) {
    const { mount, document } = setup([source('P', [textNode('Safe prefix')]), source('TABLE', [bad])]);
    assert.equal(renderReadingMatter(mount, 671, '<p>Safe prefix</p><table></table>', document), false);
    assert.equal(mount.children.length, 0);
  }
});

test('protected image ownership is generic, with no title or book whitelist', () => {
  const src = `/api/books/999/reading-images/${'a'.repeat(64)}.png`;
  const { mount, document } = setup([source('FIGURE', [source('IMG', [], { src, alt: 'A player map', loading: 'lazy' })])]);
  assert.equal(renderReadingMatter(mount, 999, '<figure>map</figure>', document), true);
  assert.equal(mount.children[0].children[0].src, src);
  assert.equal(mount.children[0].children[0].loading, 'lazy');
});

test('unsafe markup falls back atomically without inserting images or executable attributes', () => {
  for (const bad of [source('SCRIPT', [textNode('bad()')]), source('P', [], { onclick: 'bad()' }),
    source('IMG', [], { src: 'https://example.com/a.png' }), source('IMG', [], { src: `/api/books/2/reading-images/${'a'.repeat(64)}.png` }),
    source('IMG', [], { src: `/api/books/1/reading-images/${'a'.repeat(64)}.png`, onerror: 'bad()' }), source('IFRAME')]) {
    const { mount, document } = setup([source('P', [textNode('Safe prefix')]), bad]);
    assert.equal(renderReadingMatter(mount, 1, '<p>Safe prefix</p>', document), false);
    assert.equal(mount.children.length, 0);
    assert.equal(mount.className, 'reading-frontmatter');
  }
});

function framedMatter(overrides = {}, imageOverrides = {}, captionChildren = null) {
  return source('FIGURE', [
    source('IMG', [], { src: '/api/books/1209/reading-images/' + 'a'.repeat(64) + '.png', alt: 'Original frame', ...imageOverrides }),
    source('FIGCAPTION', captionChildren || [source('H3', [textNode('READ THIS FIRST!!!')]), source('P', [textNode('Choose your adventure.')])]),
  ], { class: 'reading-source-frame', 'data-source-width': '412', 'data-source-height': '641',
    'data-heading-box': '45,155,305,179', 'data-body-box': '35,207,315,495', 'data-font-size': '14', 'data-line-height': '18', ...overrides });
}

function originalSheet(overrides = {}, imageOverrides = {}, textOverrides = {}, textChildren = [textNode('Fighting')]) {
  const label = source('P', textChildren, { 'data-source-box': '100,170,240,205', 'data-source-font': '30',
    'data-source-baseline': '196', 'data-source-weight': 'normal', ...textOverrides });
  label.textContent = 'Fighting';
  return source('FIGURE', [source('IMG', [], { src: '/api/books/1497/reading-images/' + 'a'.repeat(64) + '.png',
    'data-source-box': '20,20,650,1200', ...imageOverrides }), label],
  { class: 'reading-source-sheet', 'data-source-width': '800', 'data-source-height': '1400', ...overrides });
}

test('original sheets preserve independent protected artwork and native text labels responsively', () => {
  const { mount, document } = setup([originalSheet()]);
  assert.equal(renderReadingMatter(mount, 1497, '<figure></figure>', document), true);
  const sheet = mount.children[0];
  assert.match(sheet.attrs.style, /width:100%;max-width:800px;aspect-ratio:800\/1400;container-type:inline-size;overflow:hidden/);
  assert.equal(sheet.children[0].src, '/api/books/1497/reading-images/' + 'a'.repeat(64) + '.png');
  assert.match(sheet.children[0].attrs.style, /left:2.5%;/);
  assert.equal(sheet.children[1].children[0].textContent, 'Fighting');
  assert.match(sheet.children[1].attrs.style, /font-size:3.75cqw/);
});

test('original sheet layers reject unsafe content, invalid geometry and cross-book assets atomically', () => {
  const rejected = [originalSheet({ onclick: 'bad()' }), originalSheet({ 'data-source-width': '9000' }),
    originalSheet({}, { src: '/api/books/1496/reading-images/' + 'a'.repeat(64) + '.png' }),
    originalSheet({}, { onload: 'bad()' }), originalSheet({}, { 'data-source-box': '-1,0,20,20' }),
    originalSheet({}, {}, { 'data-source-font': '101' }), originalSheet({}, {}, { 'data-source-weight': 'bold;position:fixed' }),
    originalSheet({}, {}, { 'data-source-box': '0,0,900,20' }), originalSheet({}, {}, { 'data-source-baseline': '1401' }),
    originalSheet({}, {}, { style: 'position:fixed' }), originalSheet({}, {}, {}, [source('SCRIPT')]),
  ];
  for (const sheet of rejected) {
    const { mount, document } = setup([source('P', [textNode('Prefix')]), sheet]);
    assert.equal(renderReadingMatter(mount, 1497, '<p>Prefix</p><figure></figure>', document), false);
    assert.equal(mount.children.length, 0);
  }
});
test('source-framed instructions retain protected art and prose in validated source coordinates', () => {
  const {mount, document} = setup([framedMatter()]);
  assert.equal(renderReadingMatter(mount, 1209, '<figure class="reading-source-frame"></figure>', document), true);
  const canvas = mount.children[0].children[0];
  assert.match(canvas.attrs.style, /width:412px;height:641px/);
  assert.deepEqual(canvas.children.map(n => n.tag), ['img', 'h3', 'div']);
  assert.match(canvas.children[1].attrs.style, /left:45px;top:155px;width:260px/);
  assert.match(canvas.children[2].attrs.style, /left:35px;top:207px;width:280px/);
  assert.equal(canvas.children[2].children[0].children[0].textContent, 'Choose your adventure.');
});
test('framed instructions reject invalid geometry and unsafe or cross-book content atomically', () => {
  const rejected = [
    framedMatter({'data-source-width': '4001'}), framedMatter({'data-body-box': '0,0,500,900'}),
    framedMatter({'data-heading-box': '-1,0,100,20'}), framedMatter({'data-font-size': '999'}),
    framedMatter({'data-line-height': '1'}), framedMatter({'data-body-box': '0,0,100,100;position:fixed'}),
    framedMatter({onclick: 'alert(1)'}), framedMatter({style: 'position:fixed'}),
    framedMatter({}, {src: '/api/books/1208/reading-images/' + 'a'.repeat(64) + '.png'}),
    framedMatter({}, {onload: 'alert(1)'}),
    framedMatter({}, {}, [source('H3', [textNode('Title')]), source('SCRIPT', [textNode('alert(1)')])]),
  ];
  for (const frame of rejected) {
    const {mount, document} = setup([source('P', [textNode('Safe prefix')]), frame]);
    assert.equal(renderReadingMatter(mount, 1209, '<p>Safe prefix</p><figure></figure>', document), false);
    assert.equal(mount.children.length, 0);
  }
});
