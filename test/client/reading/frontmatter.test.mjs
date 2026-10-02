import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatFrontmatter } from '../../../public/js/reading/frontmatter.js';

const element = tag => ({ tag, className: 'reading-frontmatter', children: [],
  append(...nodes) { this.children.push(...nodes); } });
const document = { createElement: element, createTextNode: textContent => ({ textContent }) };
const content = node => node.textContent ?? node.children.map(content).join(' ');

test('book 263 frontmatter gets headings, paragraphs and semantic combat steps without rewriting prose', () => {
  const text = 'Opening. YOU have been on the island for two days. A wager brought you to the island.\n\nBATTLES\nCombat sequence:\n1. Roll dice.\n2. Compare scores.\n3. Apply damage.\n4. Repeat.\n\nUsing Luck in Battles: Test your luck.\n\nLUCK\nLuck rules.';
  const mount = element('div');
  assert.equal(formatFrontmatter(mount, 263, text, document), true);
  assert.equal(mount.children.filter(node => node.tag === 'h3').length, 2);
  assert.equal(mount.children.filter(node => node.tag === 'p').length, 6);
  const list = mount.children.find(node => node.tag === 'ol');
  assert.equal(list.children.length, 4);
  assert.ok(mount.children.some(node => node.children.some(child => child.tag === 'strong')));
  const normalize = value => value.replace(/\b\d+\.\s/g, '').replace(/\s+/g, ' ').trim();
  assert.equal(normalize(content(mount)), normalize(text));
});

test('other books are untouched; book-specific formatting never injects imported HTML', () => {
  const mount = element('div');
  assert.equal(formatFrontmatter(mount, 202, 'Text', document), false);
  assert.equal(mount.children.length, 0);
  formatFrontmatter(mount, 263, '<script>unsafe()</script>', document);
  assert.equal(mount.children[0].textContent, '<script>unsafe()</script>');
  assert.equal(mount.children[0].innerHTML, undefined);
});

test('setup, changing scores and potion instructions begin new paragraphs without changing text', () => {
  const text = 'Equipment. Before setting off on your adventure, record scores.\n\nSkills explained. SKILL, STAMINA and LUCK scores change constantly during play.\n\nMore equipment. You may also take one magic potion for the quest.';
  const mount = element('div');
  formatFrontmatter(mount, 263, text, document);
  assert.equal(mount.children.length, 6);
  assert.equal(content(mount).replace(/\s+/g, ' '), text.replace(/\s+/g, ' '));
});
