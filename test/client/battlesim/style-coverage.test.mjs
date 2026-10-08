import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../../../' + path, import.meta.url), 'utf8');
const registered = source => [...source.match(/SUPPORTED_BATTLE_SIM_BOOKS = new Set\(\[([\s\S]*?)\]\)/)[1].matchAll(/\d+/g)].map(match => Number(match[0]));
const desktop = registered(read('public/js/battlesim/loader.js'));
const mobile = registered(read('public/mobile/js/battlesim-dispatch.js'));
const css = read('public/css/battlesim.css');

test('every registered simulator launch button has normal and hover styles', () => {
  assert.deepEqual(desktop, mobile);
  const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  for (const id of desktop) {
    const button = id === 829 ? 'battlesim-btn' : 'sim' + id + '-btn';
    for (const suffix of ['', ':hover']) {
      assert.ok(rules.some(([, selectors, declarations]) =>
        selectors.split(',').map(value => value.trim()).includes('#' + button + suffix) && /background\s*:/.test(declarations)), button + suffix + ' lacks theme styling');
    }
  }
});

test('standalone simulator actions do not inherit inventory footer flex growth', () => {
  assert.match(css, /\.bsim-col-left\s*>\s*\.inv-add-btn\s*\{\s*flex:\s*0\s+0\s+auto\s*;/);
  assert.match(css, /#sim521-overlay\s+\.bsim-col-left\s*>\s*\*\s*\{\s*flex-shrink:\s*0/);
});

test('new simulator forms opt into compact labels and rule notes', () => {
  for (const id of [521, 522, 523, 524, 534, 535, 536, 537, 548, 555, 557]) {
    assert.match(read(`public/js/battlesim/battlesim${id}.js`), /class="inv-modal bsim-modal bsim-compact-form"/, `sim${id} lacks compact typography`);
  }
  assert.match(css, /\.bsim-compact-form \.inv-edit-row\s*\{\s*font-size:\s*0\.7rem;/);
  assert.match(css, /\.bsim-compact-form \.bsim-col-left p\s*\{\s*font-size:\s*0\.68rem;/);
  assert.match(css, /\.bsim-compact-form select\.inv-edit-input\s*\{\s*height:\s*22px;/);
  assert.match(css, /\.bsim-compact-form \.inv-edit-label\s*\{\s*width:\s*9rem;/);
});
