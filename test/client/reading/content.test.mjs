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
  const { mount, document } = setup([
    source('P', [textNode('Abbot—A man who is head of a monastery.')], { class: 'reading-hanging' }),
  ]);
  assert.equal(renderReadingMatter(mount, 1031, '<p class="reading-hanging">Abbot</p>', document), true);
  assert.equal(mount.children[0].attrs.class, 'reading-hanging');
  for (const bad of [
    source('P', [], { class: 'reading-hanging hidden' }),
    source('P', [], { class: 'hidden' }),
    source('P', [], { class: 'reading-hanging', style: 'position:fixed' }),
    source('P', [], { class: 'reading-hanging', onclick: 'bad()' }),
    source('IMG', [], { class: 'reading-hanging' }),
  ]) {
    const { mount, document } = setup([source('P', [textNode('Safe prefix')]), bad]);
    assert.equal(renderReadingMatter(mount, 1031, '<p>Safe prefix</p>', document), false);
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
