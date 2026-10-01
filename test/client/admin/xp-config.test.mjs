import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../../../admin/js/dashboard.js', import.meta.url), 'utf8');
const start = source.indexOf("document.getElementById('xp-config-save').addEventListener");
const end = source.indexOf("document.getElementById('tools-notepad-save').addEventListener", start);

function fixture(values) {
  let save;
  const button = { disabled: false, addEventListener: (_event, callback) => { save = callback; } };
  const inputs = values.map(([event, value]) => ({ value, dataset: { event }, disabled: false, focus() {} }));
  const requests = [];
  const alerts = [];
  const context = {
    _xpConfigData: [{ event: 'first', amount: 1 }, { event: 'second', amount: 2 }],
    document: {
      getElementById: () => button,
      querySelectorAll: () => inputs,
    },
    api: async (_method, _path, body) => { requests.push(body); },
    showAlert: message => alerts.push(message),
    flashSaved() {},
  };
  runInNewContext(source.slice(start, end), context);
  return { save, context, button, inputs, requests, alerts };
}

test('XP configuration saves only changes, including decimal amounts', async () => {
  const f = fixture([['first', '1'], ['second', '2.1']]);
  await f.save();
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].event, 'second');
  assert.equal(f.requests[0].amount, 2.1);
  await f.save();
  assert.equal(f.requests.length, 1);
  assert.equal(f.button.disabled, false);
  assert.ok(f.inputs.every(input => !input.disabled));
});

test('XP configuration validates all values before making any writes', async () => {
  for (const invalid of ['', '-1', '3junk', 'Infinity']) {
    const f = fixture([['first', '5'], ['second', invalid]]);
    await f.save();
    assert.equal(f.requests.length, 0);
    assert.equal(f.alerts.length, 1);
  }
});

test('retry after partial XP save failure does not repeat completed writes', async () => {
  const f = fixture([['first', '5'], ['second', '6']]);
  let failed = false;
  f.context.api = async (_method, _path, body) => {
    f.requests.push(body.event);
    if (body.event === 'second' && !failed) { failed = true; throw Error('Offline'); }
  };
  await f.save();
  assert.equal(f.alerts.length, 1);
  assert.equal(f.button.disabled, false);
  await f.save();
  assert.deepEqual(f.requests, ['first', 'second', 'second']);
});
