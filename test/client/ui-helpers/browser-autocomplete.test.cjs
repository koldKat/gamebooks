const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const checkBrowser = require('../battlesim/browser-harness.cjs');

test('ordinary fields stay separate from account autofill without disrupting login or custom inputs', { skip: !process.env.CHROMIUM }, async () => {
  const root = process.env.TMPDIR;
  assert.ok(root && root.startsWith('/media/'), 'Use the designated MediaDrive scratch directory');
  const scratch = fs.mkdtempSync(path.join(root, 'browser-autocomplete-'));
  try {
    const html = fs.readFileSync(path.join(__dirname, 'browser-autocomplete.fixture'), 'utf8')
      .replace('AUTOCOMPLETE_MODULE', 'file://' + path.resolve('public/js/ui-helpers/browser-autocomplete.js'));
    const file = path.join(scratch, 'check.html');
    fs.writeFileSync(file, html);
    const result = await checkBrowser({ file, profile: path.join(scratch, 'profile'), root: scratch,
      width: 390, chromium: process.env.CHROMIUM });
    assert.ok(result.checks >= 35);
    assert.equal(result.loginAutofillPreserved, true);
    assert.equal(result.dynamicFieldsCovered, true);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
