import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const dir = new URL('../../../public/js/', import.meta.url);
test('play-area feature relocation preserves implementations and removes root modules', () => {
  // Source baseline excludes imports; comment cleanup verified against unchanged executable ASTs.
  const digests = {
    "dice": "fd6b7d336ddfd227e995f60446adf91ec142f4c4748531ea5f26a8bf9b9e4f6e",
    "notes": "68ed0f4e8822186db2f2a3cf77c6c2868e1a09b4687b195b37ed0cf3c55046db",
    "charsheet": "1f14bca5fdfc339160598da0794ffda059dd5d632e36021c1d727a9dc208e569",
    "open-world": "81cfec1e03755016cc03e35e918e0fa559a16f76b3acc4f4969051d686dae4ef",
    "party": "13f2a607dfb521f00424f696568e3b10601d8aff696987521e34dc6b4c812f16",
    "bg": "ffb3a5b4d327041ef9c1e337194935580fb40c4e7224c6658491f8be7c8b4051"
  };
  for (const [name, digest] of Object.entries(digests)) {
    assert.equal(existsSync(new URL(name + '.js', dir)), false);
    const source = readFileSync(new URL('play/' + name + '.js', dir), 'utf8');
    assert.equal(createHash('sha256').update(source.replace(/^import[\s\S]*?;$/gm, '')).digest('hex'), digest);
  }
  assert.ok(existsSync(new URL('play.js', dir)), 'existing controller facade remains');
  assert.ok(existsSync(new URL('../mobile/js/notebook.js', dir)), 'mobile notebook remains independent');
});

test('relocated play features retain their original dependency identities and order', () => {
  const expected = {
    dice: ['core/state.js', 'ui-helpers/prefs.js', 'play.js'],
    notes: ['core/state.js', 'play.js', 'i18n.js'],
    charsheet: ['core/state.js', 'i18n.js', 'core/util.js'],
    'open-world': ['core/state.js', 'graph.js', 'play.js', 'i18n.js', 'play/charsheet.js', 'equipment.js', 'books.js'],
    party: ['core/state.js', 'play.js', 'core/util.js', 'i18n.js'],
    bg: ['core/state.js', 'i18n.js'],
  };
  for (const [name, dependencies] of Object.entries(expected)) {
    const moduleUrl = new URL('play/' + name + '.js', dir);
    const source = readFileSync(moduleUrl, 'utf8');
    const actual = [...source.matchAll(/^import[\s\S]*?from '([^']+)';$/gm)]
      .map(match => new URL(match[1], moduleUrl).href);
    assert.deepEqual(actual, dependencies.map(path => new URL(path, dir).href));
  }
});
