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
