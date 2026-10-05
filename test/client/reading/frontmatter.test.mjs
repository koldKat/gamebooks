import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatFrontmatter } from '../../../public/js/reading/frontmatter.js';

const element = tag => ({ tag, className: 'reading-frontmatter', children: [],
  append(...nodes) { this.children.push(...nodes); } });
const document = { createElement: element, createTextNode: textContent => ({ textContent }) };
const content = node => node.textContent ?? node.children.map(content).join(' ');

test('Blood Island renders its own map safely and preserves printed duplicate combat steps', () => {
  const src = `/api/books/267/reading-images/${'e'.repeat(64)}.png`;
  const markup = `<figure><img src="${src}" alt="Original map of Allansia" loading="lazy"></figure>`;
  const mount = element('div');
  const text = 'ALLANSIA\n\n' + markup + '\n\n6. Until death.\n\n7. Until death.\n\nESCAPING';
  assert.equal(formatFrontmatter(mount, '267', text, document), true);
  assert.equal(mount.children[1].children[0].src, src);
  assert.equal(mount.children[2].textContent, '6. Until death.');
  assert.equal(mount.children[3].textContent, '7. Until death.');
  assert.equal(mount.children[4].tag, 'h3');
  for (const value of [markup.replace('/267/', '/263/'), markup.replace('Allansia', 'elsewhere'), '<script>unsafe()</script>']) {
    const rejected = element('div');
    formatFrontmatter(rejected, 267, value, document);
    assert.equal(rejected.children[0].textContent, value);
    assert.equal(rejected.children[0].innerHTML, undefined);
  }
});

test('Assassins renders its exact protected map and sheet headings without accepting foreign HTML', () => {
  const src = `/api/books/263/reading-images/${'d'.repeat(64)}.png`;
  const markup = `<figure><img src="${src}" alt="Original map of Allansia" loading="lazy"></figure>`;
  const mount = element('div');
  formatFrontmatter(mount, 263, 'ALLANSIA\n\n' + markup + '\n\nADVENTURE SHEET', document);
  assert.equal(mount.children[0].tag, 'h3');
  assert.equal(mount.children[1].children[0].src, src);
  assert.equal(mount.children[2].tag, 'h3');
  for (const text of [markup.replace('/263/', '/252/'), markup.replace('Allansia', 'elsewhere'), '<script>unsafe()</script>']) {
    const rejected = element('div');
    formatFrontmatter(rejected, 263, text, document);
    assert.equal(rejected.children[0].textContent, text);
    assert.equal(rejected.children[0].innerHTML, undefined);
  }
});

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

test('Knights of Doom renders only its exact protected original map markup', () => {
  const src = '/api/books/252/reading-images/' + 'a'.repeat(64) + '.png';
  const mount = element('div');
  const markup = `<figure><img src="${src}" alt="Original map of Ruddlestone" loading="lazy"></figure>`;
  assert.equal(formatFrontmatter(mount, 252, 'RUDDLESTONE\n\n' + markup + '\n\nKeep track of meals.', document), true);
  assert.equal(mount.children[0].tag, 'h3');
  const image = mount.children[1].children[0];
  assert.equal(image.tag, 'img');
  assert.equal(image.src, src);
  assert.equal(image.loading, 'lazy');
  assert.equal(mount.children[2].textContent, 'Keep track of meals.');
});

test('Knights of Doom rejects foreign images and never injects arbitrary imported HTML', () => {
  for (const text of ['<script>unsafe()</script>', '<img src="https://example.com/a.png">',
    `<figure><img src="/api/books/253/reading-images/${'a'.repeat(64)}.png" alt="Original map of Ruddlestone" loading="lazy"></figure>`]) {
    const mount = element('div');
    formatFrontmatter(mount, 252, text, document);
    assert.equal(mount.children[0].tag, 'p');
    assert.equal(mount.children[0].textContent, text);
    assert.equal(mount.children[0].innerHTML, undefined);
  }
});

test('Curse of the Mummy renders its protected regional map, not foreign markup', () => {
  const src = `/api/books/255/reading-images/${'b'.repeat(64)}.png`;
  const markup = `<figure><img src="${src}" alt="Original regional map of the Pirate Coast" loading="lazy"></figure>`;
  const mount = element('div');
  assert.equal(formatFrontmatter(mount, 255, 'REGIONAL MAP\n\n' + markup, document), true);
  assert.equal(mount.children[0].tag, 'h3');
  assert.equal(mount.children[1].children[0].src, src);
  for (const text of [markup.replace('/255/', '/252/'), markup.replace('Pirate Coast', 'elsewhere'), '<script>unsafe()</script>']) {
    const rejected = element('div');
    formatFrontmatter(rejected, 255, text, document);
    assert.equal(rejected.children[0].textContent, text);
    assert.equal(rejected.children[0].innerHTML, undefined);
  }
});

test('Bloodbones renders its protected Port of Crabs map and sheet headings safely', () => {
  const src = `/api/books/256/reading-images/${'c'.repeat(64)}.png`;
  const markup = `<figure><img src="${src}" alt="Original map of the Port of Crabs" loading="lazy"></figure>`;
  const mount = element('div');
  assert.equal(formatFrontmatter(mount, '256', 'PORT OF CRABS\n\n' + markup + '\n\nMONSTER ENCOUNTER BOXES', document), true);
  assert.equal(mount.children[0].tag, 'h3');
  assert.equal(mount.children[1].children[0].src, src);
  assert.equal(mount.children[2].tag, 'h3');
  for (const text of [markup.replace('/256/', '/255/'), markup.replace('Port of Crabs', 'elsewhere'), '<script>unsafe()</script>']) {
    const rejected = element('div');
    formatFrontmatter(rejected, 256, text, document);
    assert.equal(rejected.children[0].textContent, text);
    assert.equal(rejected.children[0].innerHTML, undefined);
  }
});
