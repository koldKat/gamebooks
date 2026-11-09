import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import strings from '../../../public/js/i18n/en/equipment.js';

function setup(name = 'Health') {
  const handlers = new Map(), confirmations = [];
  const field = { id: 'health', name, type: 'text', value: '12', visible: true };
  const draft = { fields: [field, { id: 'other', name: 'Gold' }] };
  const row = {
    querySelector: selector => ({
      type: 'text', tagName: 'INPUT',
      addEventListener: (event, fn) => handlers.set(`${selector}:${event}`, fn),
    }),
    querySelectorAll: () => [], addEventListener() {},
  };
  const context = {
    draft, field, row, renders: 0,
    t: (key, values = {}) => strings[key].replace('{name}', values.name ?? ''),
    showConfirm: (message, confirm) => confirmations.push({ message, confirm }),
  };
  const source = readFileSync(new URL('../../../public/js/play/charsheet.js', import.meta.url), 'utf8');
  runInNewContext(source.replace(/^import .*;\n/gm, '').replace(/^export /gm, '') +
    '\n_draft = draft; renderModal = () => renders++; wireRow(row, field);', context);
  return { context, draft, confirmations, click: () => handlers.get('.cs-del-btn:click')(),
    run: code => runInNewContext(code, context) };
}

test('character item deletion waits for confirmation; cancel keeps the item and confirm removes only it', () => {
  const f = setup();
  f.click();
  assert.equal(f.confirmations[0].message, 'Delete "Health" from your character sheet?');
  assert.equal(f.draft.fields.length, 2);
  assert.equal(f.context.renders, 0);
  // Cancel does not invoke the confirmation callback.
  f.click();
  assert.equal(f.draft.fields.length, 2);
  f.confirmations[1].confirm();
  assert.deepEqual(Array.from(f.draft.fields, item => item.id), ['other']);
  assert.equal(f.context.renders, 1);
});

test('unnamed items get a readable confirmation and stale confirmations cannot change another sheet', () => {
  const f = setup('  ');
  f.click();
  assert.equal(f.confirmations[0].message, 'Delete this item from your character sheet?');
  f.run('_draft = { fields: [field] };');
  f.confirmations[0].confirm();
  assert.equal(f.run('_draft.fields.length'), 1);
  assert.equal(f.draft.fields.length, 2);
  assert.equal(f.context.renders, 0);
});

test('read-only sheets cannot delete items or open deletion confirmations', () => {
  const f = setup();
  f.run('_readOnly = true;');
  f.click();
  assert.equal(f.confirmations.length, 0);
  assert.equal(f.draft.fields.length, 2);
});
