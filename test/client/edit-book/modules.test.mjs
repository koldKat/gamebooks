import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('../../../public/js/edit-book/', import.meta.url);

test('edit dialog modules remain acyclic and never back-import their facade', () => {
  const modules = new Map(readdirSync(dir).filter(n => n.endsWith('.js')).map(n => [n, readFileSync(new URL(n, dir), 'utf8')]));
  const visiting = new Set(), visited = new Set();
  function visit(name) {
    assert.ok(!visiting.has(name), `cycle through ${name}`);
    if (visited.has(name)) return;
    visiting.add(name);
    for (const match of modules.get(name).matchAll(/(?:import|export) .* from '([^']+)';/g)) {
      assert.notEqual(match[1], '../edit-book.js');
      if (!match[1].startsWith('./')) continue;
      const dependency = match[1].slice(2);
      assert.ok(modules.has(dependency), `${name} imports an existing module`);
      visit(dependency);
    }
    visiting.delete(name);
    visited.add(name);
  }
  for (const name of modules.keys()) visit(name);
});

test('edit-book facade preserves the original public API', () => {
  const source = readFileSync(new URL('../../../public/js/edit-book.js', import.meta.url), 'utf8');
  const names = [...source.matchAll(/^export \{([^}]+)\}/gm)].flatMap(m => m[1].split(',').map(n => n.trim()));
  assert.deepEqual(names.sort(), [
    'setEditBookHooks', 'formatFileSize', '_acceptPdfSelection', '_setPdfInlineLabel',
    '_setPdfCurrentLink', '_setModalUploadProgress', '_setButtonsDisabled', '_uploadPdfWithProgress',
    '_adminPdfHref', '_populateParentBookSelect', '_populateSeriesSelect',
    'validateIsbn', 'validateIssn', 'validateAsin', '_openEditStash', '_closeEditStash', '_closeAddStash',
    'openEditBookModal', 'closeEditBookModal', 'openEditCompModal', 'openEditSeriesModal', 'initEditBook', 'maxSectionInUse',
  ].sort());
});
