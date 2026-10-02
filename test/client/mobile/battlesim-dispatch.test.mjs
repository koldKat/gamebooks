import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { hasSim } from '../../../public/mobile/js/battlesim-dispatch.js';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

describe('hasSim', () => {
  test('true for a book with a battle sim', () => {
    assert.equal(hasSim(214), true);
    assert.equal(hasSim(8), true);
    assert.equal(hasSim(829), true);
    assert.equal(hasSim(882), true);
  });

  test('false for a book with no battle sim', () => {
    assert.equal(hasSim(1), false);
    assert.equal(hasSim(999), false);
  });

  test('accepts a numeric-string bookId the same as a number (object key coercion)', () => {
    assert.equal(hasSim('214'), true);
    assert.equal(hasSim('1'), false);
  });
});

test('mobile lazy simulator initialization waits for translations and can retry failures', () => {
  const fixture = readFileSync(new URL('./battlesim-runtime.fixture', import.meta.url), 'utf8');
  const path = fileURLToPath(new URL('../../../public/mobile/js/battlesim-dispatch.js', import.meta.url));
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '--eval', fixture, path],
    { encoding: 'utf8', timeout: 15000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('mobile simulator click handler reports load failure without an unhandled rejection', async () => {
  const source = readFileSync(new URL('../../../public/mobile/js/reader.js', import.meta.url), 'utf8');
  const callback = source.match(/battlesimBtn\.addEventListener\('click', (async \(\) => \{[\s\S]*?\n    \})\);/)[1];
  const alerts = [], warnings = [];
  let failing = true, calls = 0;
  const handler = vm.runInNewContext('(' + callback + ')', {
    book: { id: 214 },
    openSimForBook: async id => { assert.equal(id, 214); calls++; if (failing) throw Error('Offline'); },
    console: { warn: (...args) => warnings.push(args) },
    showAlert: message => alerts.push(message), t: key => key,
  });
  await handler();
  assert.deepEqual(alerts, ['auth.network_error']);
  assert.equal(warnings.length, 1);
  failing = false;
  await handler();
  assert.equal(calls, 2);
  assert.equal(alerts.length, 1, 'successful retry does not show another error');
});
