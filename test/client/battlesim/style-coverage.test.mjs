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
