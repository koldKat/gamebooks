import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';

const root = new URL('../../../', import.meta.url);
test('retired choice helpers have no implementation, translations or client registrations', () => {
  for (const id of [758, 2116]) {
    for (const file of [`public/js/battlesim/battlesim${id}.js`,
      `public/js/battlesim/books/${id}/panel.js`, `public/js/battlesim/books/${id}/combat.js`,
      `public/js/i18n/en/battlesim/battlesim${id}.js`, `public/js/i18n/bg/battlesim/battlesim${id}.js`]) {
      assert.equal(existsSync(new URL(file, root)), false, file);
    }
    for (const file of ['public/js/battlesim/loader.js', 'public/mobile/js/battlesim-dispatch.js']) {
      const source = readFileSync(new URL(file, root), 'utf8');
      const registry = source.match(/new Set\(\[([\s\S]*?)\]\)/)?.[1];
      assert.ok(registry);
      assert.equal(registry.split(',').map(Number).includes(id), false, file);
    }
  }
});
