const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const checkBrowser = require('../battlesim/browser-harness.cjs');

test('Escape dismisses the top interactive layer without discarding underlying dialogs', { skip: !process.env.CHROMIUM }, async () => {
  const root = process.env.TMPDIR;
  assert.ok(root && root.startsWith('/media/'), 'Use the designated MediaDrive scratch directory');
  const scratch = fs.mkdtempSync(path.join(root, 'dialog-escape-'));
  try {
    const autocomplete = fs.readFileSync('public/js/books/autocomplete.js', 'utf8').replace(/^import .*;\n/gm, '');
    const source = 'const {apiFetch,getCachedBooks,naturalCompare,naturalCompareByName,matchesSearch,escapeHtml,_fetchPublic,t}=window.autocompleteDependencies;\n' + autocomplete;
    const html = fs.readFileSync(path.join(__dirname, 'dialog-escape.fixture'), 'utf8')
      .replaceAll('ESCAPE_MODULE', 'file://' + path.resolve('public/js/ui-helpers/dialog-escape.js'))
      .replaceAll('EDITOR_MODULE', 'file://' + path.resolve('admin/js/editor.js'))
      .replace('AUTOCOMPLETE_MODULE', 'data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
    const file = path.join(scratch, 'check.html');
    fs.writeFileSync(file, html);
    const result = await checkBrowser({ file, profile: path.join(scratch, 'profile'), root: scratch,
      width: 390, chromium: process.env.CHROMIUM });
    assert.ok(result.checks >= 25);
    assert.equal(result.legacyDialogHandlers, 0);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
