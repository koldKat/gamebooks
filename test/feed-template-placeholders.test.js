'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function renderer() {
  const source = fs.readFileSync(require.resolve('../public/js/feed/entries.js'), 'utf8')
    .replace(/^import .*;\n/gm, '').replaceAll('export function ', 'function ');
  const context = vm.createContext({
    _hooks: {}, publicName: value => value, t: () => '',
    escapeHtml: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;').replaceAll('"', '&quot;'),
  });
  vm.runInContext(source, context);
  return context.renderEntry;
}

test('both names in the tracker welcome template render', () => {
  const { html } = renderer()({ type: 'user_joined', username: 'mawacate',
    joinTemplate: '{name} found the tracker. The tracker found {name}.' });
  assert.equal((html.match(/>mawacate<\/span>/g) || []).length, 2);
  assert.ok(!html.includes('{name}'));
});

test('replacement values stay literal and HTML-escaped', () => {
  const { html } = renderer()({ type: 'user_joined', username: '$&<reader>',
    joinTemplate: '{name} meets {name}.' });
  assert.equal((html.match(/\$&amp;&lt;reader&gt;/g) || []).length, 2);
  assert.ok(!html.includes('<reader>'));
});

test('repeated level-up placeholders render in a single pass', () => {
  const { html } = renderer()({ type: 'level_up', username: 'Reader', level: 3,
    levelTitle: 'Scout', levelUpTemplate: '{name}: {title} {level}. {name}: {title} {level}.' });
  assert.ok(!/\{(?:name|title|level)\}/.test(html));
  assert.equal((html.match(/>Scout<\/span>/g) || []).length, 2);
  assert.equal((html.match(/>3<\/span>/g) || []).length, 2);
});
